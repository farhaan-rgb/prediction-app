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

// Delete all existing open questions
console.log('Deleting all existing open questions...')
const { error: deleteError } = await supabase.from('questions').delete().eq('status', 'open')
if (deleteError) throw deleteError
console.log('Deleted existing open questions.\n')

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

console.log(`Generating questions for ${nowIST} (IST)...`)
console.log(`Today: ${todayIST}`)
console.log(`Tomorrow: ${tomorrowIST}\n`)

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: `You are a sports prediction question generator for IPL 2026.
Your task: find the IPL matches scheduled for today (${todayIST}) and tomorrow (${tomorrowIST}) and generate exactly 5 prediction questions per match.

Rules:
- Only ask about future events whose outcomes are not yet known
- Each question must have 2-4 plausible, distinct options
- question_type must be one of: match_winner, top_scorer, top_bowler, team_total, player_milestone, toss
- Vary question types across the 5 questions per match (don't repeat same type for same match)
- context: 2-3 sentences of relevant recent form, head-to-head stats, or player stats that help users predict
- deadline_offset_hours: hours from NOW until 30 minutes before that match starts
  IPL evening matches start 7:30 PM IST; afternoon matches start 3:30 PM IST
- resolve_after_offset_hours: hours from NOW until the match result will be known (match start + 4 hours)
- match_tag: a short identifier for which match (e.g. "MI vs CSK - May 21") so questions are grouped
- Respond with JSON: { "matches": [{ "match_tag": "...", "match_date": "today|tomorrow", "questions": [...] }] }`,
    },
    {
      role: 'user',
      content: `Current time: ${nowIST} (IST)

Generate 5 prediction questions for EACH IPL 2026 match scheduled today (${todayIST}) and tomorrow (${tomorrowIST}).

Each question JSON:
{
  "title": "...",
  "category": "ipl",
  "question_type": "match_winner",
  "options": ["Team A", "Team B"],
  "deadline_offset_hours": 9,
  "resolve_after_offset_hours": 13,
  "context": "Team A have won 4 of their last 5 games..."
}`,
    },
  ],
})

const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
const matches = parsed.matches ?? []

if (!matches.length) throw new Error('No matches returned')

let allQuestions = []
for (const match of matches) {
  console.log(`Match: ${match.match_tag} (${match.match_date})`)
  console.log(`  ${match.questions?.length ?? 0} questions`)
  allQuestions = allQuestions.concat(match.questions ?? [])
}
console.log(`\nTotal: ${allQuestions.length} questions across ${matches.length} match(es)\n`)

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

// Seed bot opinions
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
matches.forEach(match => {
  console.log(`\n  [${match.match_tag}]`)
  const matchTitles = match.questions?.map(q => q.title) ?? []
  matchTitles.forEach((t, i) => console.log(`    ${i + 1}. ${t}`))
})
console.log('\nDone!')
