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

async function webSearch(query) {
  const resp = await openai.responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: query,
  })
  return resp.output_text
}

// Step 1: Find matches
console.log(`Searching for IPL matches on ${todayIST} and ${tomorrowIST}...`)
const scheduleText = await webSearch(
  `IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. List each match with the two teams and start time in IST.`
)

const parseResp = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'Extract IPL match info. Use short team codes: MI, CSK, RCB, GT, SRH, KKR, DC, PBKS, RR, LSG.' },
    { role: 'user', content: `Extract IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${scheduleText}\n\nReturn JSON: { "matches": [{ "teams": "GT vs CSK", "team1": "GT", "team2": "CSK", "date": "today", "time_ist": "7:30 PM" }] }` },
  ],
})
const upcomingMatches = JSON.parse(parseResp.choices[0].message.content ?? '{}').matches ?? []

if (!upcomingMatches.length) {
  console.log('No IPL matches found. Exiting.')
  process.exit(0)
}

console.log('Matches:')
upcomingMatches.forEach(m => console.log(`  ${m.teams} — ${m.date} at ${m.time_ist} IST`))
console.log()

// Step 2: Fetch current squads in parallel
const teamCodes = [...new Set(upcomingMatches.flatMap(m => [m.team1, m.team2]))]
const squads = {}

console.log('Fetching current squads...')
await Promise.all(teamCodes.map(async (team) => {
  const squadText = await webSearch(`${team} IPL 2026 squad current players list with roles`)
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Extract ONLY the current confirmed IPL 2026 squad. Do not include players from previous seasons who are no longer with the team.' },
      { role: 'user', content: `Extract ${team} IPL 2026 squad from:\n\n${squadText}\n\nReturn JSON: { "team": "${team}", "batsmen": [], "bowlers": [], "allrounders": [], "wicketkeeper": [] }` },
    ],
  })
  squads[team] = JSON.parse(resp.choices[0].message.content ?? '{}')
  const total = Object.values(squads[team]).filter(Array.isArray).flat().length
  console.log(`  ${team}: ${total} players`)
}))
console.log()

// Step 3: Delete existing open questions
console.log('Clearing existing open questions...')
const { count, error: deleteError } = await supabase.from('questions').delete({ count: 'exact' }).eq('status', 'open')
if (deleteError) throw deleteError
console.log(`Deleted ${count} questions.\n`)

// Step 4: Generate questions
const matchList = upcomingMatches.map(m => {
  const formatSquad = (s) => s ? [
    s.batsmen?.length ? `Batsmen: ${s.batsmen.join(', ')}` : '',
    s.wicketkeeper?.length ? `Wicketkeeper: ${s.wicketkeeper.join(', ')}` : '',
    s.allrounders?.length ? `All-rounders: ${s.allrounders.join(', ')}` : '',
    s.bowlers?.length ? `Bowlers: ${s.bowlers.join(', ')}` : '',
  ].filter(Boolean).join(' | ') : 'squad unknown'
  return `Match: ${m.teams} (${m.date} at ${m.time_ist} IST)
  ${m.team1} squad — ${formatSquad(squads[m.team1])}
  ${m.team2} squad — ${formatSquad(squads[m.team2])}`
}).join('\n\n')

console.log('Generating questions...')
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: `You are a sports prediction question generator for IPL 2026.
Generate exactly 5 prediction questions per match. You MUST only use players from the squads provided.

Rules:
- question_type: one of match_winner, top_scorer, top_bowler, team_total, player_milestone, toss — use a different type for each of the 5 questions
- options: 2–4 choices using real player names from the squad or team names
- context: 2–3 sentences of recent form or head-to-head stats
- deadline_offset_hours: hours from NOW to 30 min before match start
- resolve_after_offset_hours: hours from NOW to match end (start + 4h)
- Respond with JSON: { "matches": [{ "match_tag": "...", "questions": [...] }] }`,
    },
    {
      role: 'user',
      content: `Current time: ${nowIST} (IST)\n\n${matchList}\n\nEach question JSON:\n{\n  "title": "...",\n  "category": "ipl",\n  "question_type": "match_winner",\n  "options": [...],\n  "deadline_offset_hours": 9,\n  "resolve_after_offset_hours": 13,\n  "context": "..."\n}`,
    },
  ],
})

const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
const generatedMatches = parsed.matches ?? []
console.log(`Generated ${generatedMatches.flatMap(m => m.questions ?? []).length} questions.\n`)

// Step 5: Validate — check every player-name option against the fetched squads
// match_winner and toss use team names; all others use player names
const PLAYER_QUESTION_TYPES = ['top_scorer', 'top_bowler', 'player_milestone']

console.log('Validating questions against squads...')
const validationResults = []

for (const match of generatedMatches) {
  const src = upcomingMatches.find(m => {
    const tag = match.match_tag?.toLowerCase() ?? ''
    return tag.includes(m.team1.toLowerCase()) || tag.includes(m.team2.toLowerCase())
  }) ?? upcomingMatches[0]

  const squad1 = squads[src.team1] ?? {}
  const squad2 = squads[src.team2] ?? {}
  const allPlayers = [
    ...(squad1.batsmen ?? []), ...(squad1.bowlers ?? []), ...(squad1.allrounders ?? []), ...(squad1.wicketkeeper ?? []),
    ...(squad2.batsmen ?? []), ...(squad2.bowlers ?? []), ...(squad2.allrounders ?? []), ...(squad2.wicketkeeper ?? []),
  ].map(p => p.toLowerCase())

  const questionsPayload = (match.questions ?? []).map(q => ({
    ...q,
    _match_tag: match.match_tag,
    _team1: src.team1,
    _team2: src.team2,
  }))

  // Ask the validator to fix any options that don't belong to either squad
  const validatorResp = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a cricket question validator for IPL 2026.
For questions of type top_scorer, top_bowler, or player_milestone: every option must be a player currently in one of the two squads listed. If an option is NOT in either squad, replace it with a valid player of the same role from the squads. If the question cannot be fixed with at least 2 valid options, mark it invalid.
For match_winner and toss: options should be team names only — mark invalid if they contain player names.
For team_total: options are run ranges — always valid.
Return the corrected questions. Mark unfixable ones with "valid": false.`,
      },
      {
        role: 'user',
        content: `Match: ${src.teams}
${src.team1} full squad: ${JSON.stringify(squads[src.team1])}
${src.team2} full squad: ${JSON.stringify(squads[src.team2])}

Questions to validate:
${JSON.stringify(questionsPayload, null, 2)}

Return JSON: { "questions": [ { ...original_fields, "valid": true/false } ] }`,
      },
    ],
  })

  const validated = JSON.parse(validatorResp.choices[0].message.content ?? '{}').questions ?? []
  const valid = validated.filter(q => q.valid !== false)
  const dropped = validated.length - valid.length

  if (dropped > 0) console.log(`  [${match.match_tag}] Fixed/dropped ${dropped} invalid question(s)`)
  else console.log(`  [${match.match_tag}] All questions valid ✓`)

  validationResults.push(...valid.map(({ valid: _v, _match_tag, _team1, _team2, ...q }) => q))
}

if (!validationResults.length) throw new Error('No valid questions after validation')
console.log(`\n${validationResults.length} questions passed validation.\n`)

// Step 6: Insert
const now = new Date()
const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

const rows = validationResults.map(q => ({
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
data.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`))
console.log('\nDone!')
