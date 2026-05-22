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

// Service role key bypasses RLS — used for admin writes/deletes
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
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

// Helper: web search via OpenAI Responses API
async function webSearch(query) {
  const resp = await openai.responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: query,
  })
  return resp.output_text
}

// Step 1: Find today's and tomorrow's IPL matches
console.log(`Searching for IPL matches on ${todayIST} and ${tomorrowIST}...`)
const scheduleText = await webSearch(
  `IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. List each match with the two teams and start time in IST.`
)
console.log('Schedule:\n' + scheduleText + '\n')

const parseResp = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Extract IPL match info. Use short team codes: MI, CSK, RCB, GT, SRH, KKR, DC, PBKS, RR, LSG.' },
    { role: 'user', content: `Extract IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}) from this text:\n\n${scheduleText}\n\nReturn JSON: { "matches": [{ "teams": "GT vs CSK", "team1": "GT", "team2": "CSK", "date": "today", "time_ist": "7:30 PM" }] }` },
  ],
})
const upcomingMatches = JSON.parse(parseResp.choices[0].message.content ?? '{}').matches ?? []

if (!upcomingMatches.length) {
  console.log('No IPL matches found for today or tomorrow. Exiting.')
  process.exit(0)
}

console.log('Matches found:')
upcomingMatches.forEach(m => console.log(`  ${m.teams} — ${m.date} at ${m.time_ist} IST`))
console.log()

// Step 2: Fetch current squad for each unique team
const teamCodes = [...new Set(upcomingMatches.flatMap(m => [m.team1, m.team2]))]
const squads = {}

console.log('Fetching current squads...')
await Promise.all(teamCodes.map(async (team) => {
  const squadText = await webSearch(`${team} IPL 2026 squad current players list with roles`)
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Extract the current IPL 2026 squad from the text. Include only players confirmed in the 2026 squad.' },
      { role: 'user', content: `Extract the ${team} IPL 2026 squad from this text:\n\n${squadText}\n\nReturn JSON: { "team": "${team}", "batsmen": ["name1"], "bowlers": ["name1"], "allrounders": ["name1"], "wicketkeeper": ["name1"] }` },
    ],
  })
  squads[team] = JSON.parse(resp.choices[0].message.content ?? '{}')
  const total = Object.values(squads[team]).filter(Array.isArray).flat().length
  console.log(`  ${team}: ${total} players fetched`)
}))
console.log()

// Step 3: Delete all existing open questions
console.log('Clearing existing open questions...')
const { error: deleteError, count } = await supabase.from('questions').delete({ count: 'exact' }).eq('status', 'open')
if (deleteError) throw deleteError
console.log(`Deleted ${count} questions.\n`)

// Step 4: Generate 5 questions per match using verified squads
const matchList = upcomingMatches.map(m => {
  const s1 = squads[m.team1]
  const s2 = squads[m.team2]
  const formatSquad = (s) => s ? [
    s.batsmen?.length ? `Batsmen: ${s.batsmen.join(', ')}` : '',
    s.wicketkeeper?.length ? `Wicketkeeper: ${s.wicketkeeper.join(', ')}` : '',
    s.allrounders?.length ? `All-rounders: ${s.allrounders.join(', ')}` : '',
    s.bowlers?.length ? `Bowlers: ${s.bowlers.join(', ')}` : '',
  ].filter(Boolean).join(' | ') : 'squad unknown'
  return `Match: ${m.teams} (${m.date} at ${m.time_ist} IST)
  ${m.team1} squad — ${formatSquad(s1)}
  ${m.team2} squad — ${formatSquad(s2)}`
}).join('\n\n')

console.log('Generating questions...')
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: `You are a sports prediction question generator for IPL 2026.
Generate exactly 5 prediction questions per match. You MUST only use players from the squads provided — do not invent or use players not listed.

Rules:
- question_type: one of match_winner, top_scorer, top_bowler, team_total, player_milestone, toss — use a different type for each of the 5 questions
- options: 2–4 choices using real player names from the squad or team names
- context: 2–3 sentences of recent form or head-to-head stats that help users decide
- deadline_offset_hours: hours from NOW to 30 min before match start (IPL evening = 7:30 PM IST)
- resolve_after_offset_hours: hours from NOW to match end (start + 4h)
- Respond with JSON: { "matches": [{ "match_tag": "...", "questions": [...] }] }`,
    },
    {
      role: 'user',
      content: `Current time: ${nowIST} (IST)

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
