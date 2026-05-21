import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()] })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

const nowIST = new Date().toLocaleString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
})
const todayIST = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata',
})
const tomorrowIST = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata',
})

// Step 1: Web search for today's and tomorrow's IPL matches
console.log(`Searching for IPL matches on ${todayIST} and ${tomorrowIST}...`)

const searchResp = await openai.responses.create({
  model: 'gpt-4o',
  tools: [{ type: 'web_search_preview' }],
  input: `Search for the IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. List each match with the two teams and the start time in IST. If there is no match on a day, say so clearly.`,
})

console.log('Search result:', searchResp.output_text, '\n')

// Step 2: Extract structured match list from search result
const parseResp = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: 'Extract IPL match information from the provided text. Return only matches you are confident about. Use short team abbreviations (e.g. "MI", "CSK", "RCB", "GT", "SRH", "KKR", "DC", "PBKS", "RR", "LSG").',
    },
    {
      role: 'user',
      content: `From this text, extract the IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}):\n\n${searchResp.output_text}\n\nReturn JSON:\n{ "matches": [{ "teams": "GT vs CSK", "date": "today", "time_ist": "7:30 PM" }] }`,
    },
  ],
})

const matchData = JSON.parse(parseResp.choices[0].message.content ?? '{}')
const matches = matchData.matches ?? []

if (!matches.length) {
  console.log('No IPL matches found for today or tomorrow. Exiting.')
  process.exit(0)
}

console.log('Matches found:')
matches.forEach(m => console.log(`  ${m.teams} — ${m.date} at ${m.time_ist} IST`))
console.log()

// Step 3: Delete existing open questions
console.log('Deleting existing open questions...')
const { error: deleteError } = await supabase.from('questions').delete().eq('status', 'open')
if (deleteError) throw deleteError

// Step 4: Generate 5 questions per match
const matchList = matches.map(m => `- ${m.teams} (${m.date} at ${m.time_ist} IST)`).join('\n')

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: `You are a sports prediction question generator for IPL 2026.
Generate exactly 5 prediction questions for each match listed. Use the EXACT team names provided.

Rules:
- Only ask about things unknown before the match starts
- Each question must have 2-4 plausible, distinct options (use real player names where relevant)
- question_type must be one of: match_winner, top_scorer, top_bowler, team_total, player_milestone, toss
- Cover different types across the 5 questions per match (ideally one of each type)
- context: 2-3 sentences of recent form, head-to-head, or player stats that help users decide
- deadline_offset_hours: hours from NOW until 30 minutes before match start
  IPL evening matches start 7:30 PM IST; afternoon 3:30 PM IST
- resolve_after_offset_hours: hours from NOW until result is known (match start time + 4 hours)
- Respond with JSON: { "matches": [{ "match_tag": "...", "questions": [...] }] }`,
    },
    {
      role: 'user',
      content: `Current time: ${nowIST} (IST)

Generate 5 questions for each of these IPL 2026 matches:
${matchList}

Each question JSON:
{
  "title": "...",
  "category": "ipl",
  "question_type": "match_winner",
  "options": ["Team A", "Team B"],
  "deadline_offset_hours": 9,
  "resolve_after_offset_hours": 13,
  "context": "..."
}`,
    },
  ],
})

const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
const generatedMatches = parsed.matches ?? []
const allQuestions = generatedMatches.flatMap(m => m.questions ?? [])

if (!allQuestions.length) throw new Error('No questions generated')

const now = new Date()
const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

const rows = allQuestions.map(q => ({
  title: q.title,
  category: q.category,
  question_type: q.question_type,
  options: q.options,
  context: q.context,
  deadline: new Date(now.getTime() + q.deadline_offset_hours * 60 * 60 * 1000).toISOString(),
  resolve_after: new Date(now.getTime() + q.resolve_after_offset_hours * 60 * 60 * 1000).toISOString(),
  status: 'open',
}))

const { data, error } = await supabase.from('questions').insert(rows).select('id, title')
if (error) throw error

const { data: seedUsers } = await supabase.from('users').select('id').in('username', SEED_USERNAMES)
if (seedUsers?.length) {
  const weightedRandom = (n) => {
    const w = Array.from({ length: n }, () => Math.random())
    w[0] += 0.3
    const t = w.reduce((a, b) => a + b, 0)
    let r = Math.random() * t
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i }
    return n - 1
  }
  const opinions = seedUsers.flatMap(u => rows.map((q, i) => ({ user_id: u.id, question_id: data[i].id, chosen_option: weightedRandom(q.options.length) })))
  await supabase.from('predictions').insert(opinions)
  console.log(`Seeded ${opinions.length} bot opinions.`)
}

console.log(`\nInserted ${data.length} questions:`)
generatedMatches.forEach(match => {
  console.log(`\n  [${match.match_tag}]`)
  match.questions?.forEach((q, i) => console.log(`    ${i + 1}. [${q.question_type}] ${q.title}`))
})
console.log('\nDone!')
