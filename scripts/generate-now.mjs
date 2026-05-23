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

async function jsonComplete(systemPrompt, userPrompt) {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
  })
  return JSON.parse(resp.choices[0].message.content ?? '{}')
}

console.log(`\n=== PredictIt Question Generator ===`)
console.log(`Time: ${nowIST}\n`)

// ─── PHASE 1: Discover fixtures & events in parallel ─────────────────────────
console.log('Phase 1: Searching for fixtures and events...')
const [iplScheduleText, nbaScheduleText, caText] = await Promise.all([
  webSearch(`IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. Teams and start times IST.`),
  webSearch(`NBA 2026 basketball games scheduled for ${todayIST} and ${tomorrowIST}. Teams and tip-off times.`),
  webSearch(`India current affairs news ${todayIST} — upcoming events, political decisions, sports results, economic announcements expected in the next 24 to 48 hours where the outcome will be publicly known.`),
])

// ─── PHASE 2: Parse fixtures & events in parallel ────────────────────────────
console.log('Phase 2: Parsing fixtures...')
const [iplParsed, nbaParsed, caParsed] = await Promise.all([
  jsonComplete(
    'Extract IPL match info. Use short codes: MI, CSK, RCB, GT, SRH, KKR, DC, PBKS, RR, LSG.',
    `Extract IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${iplScheduleText}\n\nReturn JSON: { "matches": [{ "teams": "GT vs CSK", "team1": "GT", "team2": "CSK", "date": "today", "time_ist": "7:30 PM" }] }`
  ),
  jsonComplete(
    'Extract NBA game info with full team names.',
    `Extract NBA games for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${nbaScheduleText}\n\nReturn JSON: { "games": [{ "teams": "Lakers vs Warriors", "team1": "Lakers", "team2": "Warriors", "date": "today", "time_ist": "6:30 AM" }] }`
  ),
  jsonComplete(
    'Extract Indian current affairs events that have an outcome within 24-48 hours. Focus on verifiable, newsworthy events.',
    `From this news, extract 3-5 Indian current affairs events with outcomes knowable in the next 24-48 hours:\n\n${caText}\n\nReturn JSON: { "events": [{ "topic": "brief topic", "context": "2-3 sentence description", "expected_outcome_hours": 24 }] }`
  ),
])

const iplMatches = iplParsed.matches ?? []
const nbaGames = nbaParsed.games ?? []
const caEvents = caParsed.events ?? []

console.log(`  IPL: ${iplMatches.length} match(es) — ${iplMatches.map(m => m.teams).join(', ') || 'none'}`)
console.log(`  NBA: ${nbaGames.length} game(s) — ${nbaGames.map(g => g.teams).join(', ') || 'none'}`)
console.log(`  Current Affairs: ${caEvents.length} event(s)`)
console.log()

// ─── PHASE 3: Fetch IPL squads in parallel ───────────────────────────────────
let squads = {}
if (iplMatches.length) {
  console.log('Phase 3: Fetching IPL squads...')
  const teamCodes = [...new Set(iplMatches.flatMap(m => [m.team1, m.team2]))]
  await Promise.all(teamCodes.map(async (team) => {
    const squadText = await webSearch(`${team} IPL 2026 squad current players list with roles`)
    const parsed = await jsonComplete(
      'Extract ONLY the current confirmed IPL 2026 squad. Do not include players from previous seasons who left this team.',
      `Extract ${team} IPL 2026 squad from:\n\n${squadText}\n\nReturn JSON: { "team": "${team}", "batsmen": [], "bowlers": [], "allrounders": [], "wicketkeeper": [] }`
    )
    squads[team] = parsed
    const total = Object.values(parsed).filter(Array.isArray).flat().length
    console.log(`  ${team}: ${total} players`)
  }))
  console.log()
}

// ─── PHASE 4: Generate questions for all categories ──────────────────────────
console.log('Phase 4: Generating questions...')
let allGenerated = []

// --- IPL ---
if (iplMatches.length) {
  const matchList = iplMatches.map(m => {
    const fmt = (s) => s ? [
      s.batsmen?.length ? `Batsmen: ${s.batsmen.join(', ')}` : '',
      s.wicketkeeper?.length ? `WK: ${s.wicketkeeper.join(', ')}` : '',
      s.allrounders?.length ? `All-rounders: ${s.allrounders.join(', ')}` : '',
      s.bowlers?.length ? `Bowlers: ${s.bowlers.join(', ')}` : '',
    ].filter(Boolean).join(' | ') : 'squad unknown'
    return `Match: ${m.teams} (${m.date} at ${m.time_ist} IST)\n  ${m.team1}: ${fmt(squads[m.team1])}\n  ${m.team2}: ${fmt(squads[m.team2])}`
  }).join('\n\n')

  const iplResp = await jsonComplete(
    `You are an IPL 2026 prediction question generator. Generate exactly 5 questions per match. ONLY use players from the provided squads.
Rules:
- question_type: one of match_winner, top_scorer, top_bowler, team_total, player_milestone, toss — different type per question
- options: 2-4 choices using real squad player names or team names
- context: 2-3 sentences of recent form or head-to-head stats
- deadline_offset_hours: hours from NOW to 30 min before match start (IPL evening = 7:30 PM IST)
- resolve_after_offset_hours: hours from NOW to match end (start + 4h)
- Respond with JSON: { "matches": [{ "match_tag": "...", "questions": [...] }] }`,
    `Current time: ${nowIST}\n\n${matchList}\n\nEach question: { "title":"...","category":"ipl","question_type":"match_winner","options":[...],"deadline_offset_hours":9,"resolve_after_offset_hours":13,"context":"..." }`
  )

  // Validate IPL questions against squads
  for (const match of (iplResp.matches ?? [])) {
    const src = iplMatches.find(m => (match.match_tag ?? '').toLowerCase().includes(m.team1.toLowerCase())) ?? iplMatches[0]
    const valResp = await jsonComplete(
      `You are a cricket question validator for IPL 2026. Return JSON.
For top_scorer, top_bowler, player_milestone: every option must be a player in one of the two squads. If not, replace with a valid player of the same role. Mark unfixable questions "valid": false.
For match_winner and toss: options must be team names only.
For team_total: always valid.`,
      `Match: ${src.teams}\n${src.team1} squad: ${JSON.stringify(squads[src.team1])}\n${src.team2} squad: ${JSON.stringify(squads[src.team2])}\n\nValidate:\n${JSON.stringify(match.questions)}\n\nReturn: { "questions": [{...original, "valid": true}] }`
    )
    const valid = (valResp.questions ?? []).filter(q => q.valid !== false).map(({ valid: _v, ...q }) => q)
    const dropped = (match.questions?.length ?? 0) - valid.length
    if (dropped) console.log(`  [IPL ${src.teams}] Fixed/dropped ${dropped} invalid question(s)`)
    allGenerated.push(...valid)
  }
  console.log(`  IPL: ${allGenerated.length} questions`)
}

// --- NBA ---
if (nbaGames.length) {
  const gameList = nbaGames.map(g => `Game: ${g.teams} (${g.date} at ${g.time_ist} IST)`).join('\n')
  const countNeeded = Math.min(5, nbaGames.length * 3)

  const nbaResp = await jsonComplete(
    `You are an NBA 2026 prediction question generator. Generate exactly ${countNeeded} prediction questions spread across the games listed.
Rules:
- question_type: one of match_winner, top_scorer, player_milestone — different types
- options: 2-4 plausible choices using real current NBA player names
- context: 2-3 sentences of recent form or head-to-head stats
- deadline_offset_hours: hours from NOW to 30 min before tip-off
- resolve_after_offset_hours: hours from NOW to game end (tip-off + 3h)
- Respond with JSON: { "questions": [...] }`,
    `Current time: ${nowIST}\n\n${gameList}\n\nGenerate ${countNeeded} NBA questions.\n\nEach: { "title":"...","category":"nba","question_type":"match_winner","options":[...],"deadline_offset_hours":5,"resolve_after_offset_hours":8,"context":"..." }`
  )

  const nbaQs = nbaResp.questions ?? []
  allGenerated.push(...nbaQs)
  console.log(`  NBA: ${nbaQs.length} questions`)
} else {
  // No games today/tomorrow — generate 5 general NBA season questions
  const nbaResp = await jsonComplete(
    `You are an NBA 2026 prediction question generator. Generate 5 prediction questions about upcoming NBA games or season outcomes.
Rules:
- question_type: one of match_winner, top_scorer, player_milestone
- options: 2-4 plausible choices using real current NBA player names or teams
- context: 2-3 sentences of recent form or standings
- deadline_offset_hours: 24 (deadline is 24 hours from now)
- resolve_after_offset_hours: 36
- Respond with JSON: { "questions": [...] }`,
    `Current time: ${nowIST}\n\nGenerate 5 NBA 2026 prediction questions about the next game or upcoming matchups.\n\nEach: { "title":"...","category":"nba","question_type":"match_winner","options":[...],"deadline_offset_hours":24,"resolve_after_offset_hours":36,"context":"..." }`
  )
  const nbaQs = nbaResp.questions ?? []
  allGenerated.push(...nbaQs)
  console.log(`  NBA (general): ${nbaQs.length} questions`)
}

// --- Current Affairs ---
const caEventSummary = caEvents.length > 0
  ? caEvents.map(e => `- ${e.topic}: ${e.context} (outcome expected in ~${e.expected_outcome_hours}h)`).join('\n')
  : 'Search web for current Indian news events with outcomes in next 24-48 hours'

const caResp = await jsonComplete(
  `You are an Indian current affairs prediction question generator. Generate exactly 5 prediction questions about newsworthy events in India where the outcome will be publicly known in the next 24-48 hours.
Rules:
- Cover a variety of topics: politics, economy, sports (non-cricket), entertainment, technology
- Each question must have a clear verifiable outcome
- question_type: one of outcome, policy, market
- options: 2-4 distinct, plausible choices
- context: 2-3 sentences of background context
- deadline_offset_hours: hours from NOW until predictions should close (before outcome is known)
- resolve_after_offset_hours: hours from NOW until the outcome will be publicly confirmed
- Respond with JSON: { "questions": [...] }`,
  `Current time: ${nowIST}\n\nCurrent affairs context:\n${caEventSummary}\n\nGenerate 5 Indian current affairs prediction questions.\n\nEach: { "title":"...","category":"current_events","question_type":"outcome","options":[...],"deadline_offset_hours":20,"resolve_after_offset_hours":30,"context":"..." }`
)

const caQs = caResp.questions ?? []
allGenerated.push(...caQs)
console.log(`  Current Affairs: ${caQs.length} questions`)
console.log(`\nTotal: ${allGenerated.length} questions generated.\n`)

if (!allGenerated.length) throw new Error('No questions generated')

// ─── PHASE 5: Clear existing + insert ────────────────────────────────────────
console.log('Phase 5: Clearing existing open questions...')
const { count, error: deleteError } = await supabase.from('questions').delete({ count: 'exact' }).eq('status', 'open')
if (deleteError) throw deleteError
console.log(`Deleted ${count} questions.`)

const now = new Date()
const rows = allGenerated.map(q => ({
  title: q.title,
  category: q.category,
  question_type: q.question_type ?? null,
  options: q.options,
  context: q.context ?? null,
  deadline: new Date(now.getTime() + (q.deadline_offset_hours ?? 24) * 60 * 60 * 1000).toISOString(),
  resolve_after: new Date(now.getTime() + (q.resolve_after_offset_hours ?? 36) * 60 * 60 * 1000).toISOString(),
  status: 'open',
}))

const { data, error } = await supabase.from('questions').insert(rows).select('id, title, category')
if (error) throw error

// ─── PHASE 6: Seed bot opinions ──────────────────────────────────────────────
const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']
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
  const opinions = seedUsers.flatMap(u =>
    rows.map((q, i) => ({ user_id: u.id, question_id: data[i].id, chosen_option: weightedRandom(q.options.length) }))
  )
  await supabase.from('predictions').insert(opinions)
  console.log(`Seeded ${opinions.length} bot opinions (${seedUsers.length} users × ${rows.length} questions).`)
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const byCategory = data.reduce((acc, q) => { acc[q.category] = (acc[q.category] || 0) + 1; return acc }, {})
console.log(`\nInserted ${data.length} questions:`)
Object.entries(byCategory).forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))
console.log('\nDone!')
