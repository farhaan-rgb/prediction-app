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

const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' })
const isWeekday = !['Saturday', 'Sunday'].includes(dayName)
const isFriday = dayName === 'Friday'

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

async function qualityCheck(questions) {
  if (!questions.length) return questions
  const results = []
  // Process in batches of 7 to keep prompt size manageable
  for (let i = 0; i < questions.length; i += 7) {
    const batch = questions.slice(i, i + 7)
    const resp = await jsonComplete(
      `You are a prediction question quality reviewer. Return JSON.
For each question, check ALL of these rules:
1. The title must be a specific, self-contained question ending with "?" — a user must know exactly what they are predicting from the title alone, without reading the context.
2. If options are "Yes" / "No", the title MUST ask a clear yes/no question (e.g. "Will X happen by [date]?"). A title like "Future of X" or "X Direction" with Yes/No options is invalid.
3. Options must directly and unambiguously answer the title question. Vague options like "Maybe" are invalid.
4. Titles must be specific: include the subject, what is being predicted, and a rough timeframe. No headlines, no topic labels.

Bad → Good rewrites:
- "Future of Indian Crypto Regulations" + ["Yes","No"] → "Will RBI ease crypto banking restrictions in India this week?" + ["Yes","No"]
- "NIFTY Direction Today" + ["Up","Down"] → "Will NIFTY50 close in the green today?" + ["Yes, closes up","No, closes down"]
- "Movie Collection This Weekend" + ["High","Low"] → "Will [Film] cross ₹50Cr in its opening weekend?" + ["Yes, above ₹50Cr","No, below ₹50Cr"]

Rewrite any failing question's title (and fix options if needed). Do NOT drop questions.
Return JSON: { "questions": [ ...same structure, corrected ] }`,
      `Review and fix these ${batch.length} prediction questions:\n${JSON.stringify(batch, null, 2)}`
    )
    results.push(...(resp.questions ?? batch))
  }
  return results
}

console.log(`\n=== PredictIt Question Generator ===`)
console.log(`Time: ${nowIST}`)
console.log(`Day: ${dayName} | Weekday: ${isWeekday} | Friday: ${isFriday}\n`)

// ─── PHASE 1: Discover fixtures & events in parallel ─────────────────────────
console.log('Phase 1: Searching for fixtures and events...')
const [iplScheduleText, nbaScheduleText, caText, cryptoText, stocksText, moviesText] = await Promise.all([
  webSearch(`IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. Teams and start times IST.`),
  webSearch(`NBA 2026 basketball games scheduled for ${todayIST} and ${tomorrowIST}. Teams and tip-off times.`),
  webSearch(`India current affairs ${todayIST} — upcoming events, political decisions, JEE NEET UPSC board exam results, sports, economic announcements in the next 24-48 hours where the outcome will be publicly known.`),
  webSearch(`Bitcoin Ethereum crypto price India ${todayIST}. BTC ETH price in INR, market trend, RBI SEBI crypto regulation news.`),
  isWeekday
    ? webSearch(`NIFTY50 SENSEX Indian stock market ${todayIST} — today's outlook, key levels, sectors to watch, major stocks moving.`)
    : Promise.resolve(''),
  isFriday
    ? webSearch(`Bollywood Indian movies releasing in cinemas this Friday ${todayIST} — box office predictions, budget, cast, expected collection.`)
    : Promise.resolve(''),
])

// ─── PHASE 2: Parse fixtures & events in parallel ────────────────────────────
console.log('Phase 2: Parsing fixtures...')
const parseJobs = [
  jsonComplete(
    'Extract IPL match info. Use short codes: MI, CSK, RCB, GT, SRH, KKR, DC, PBKS, RR, LSG.',
    `Extract IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${iplScheduleText}\n\nReturn JSON: { "matches": [{ "teams": "GT vs CSK", "team1": "GT", "team2": "CSK", "date": "today", "time_ist": "7:30 PM" }] }`
  ),
  jsonComplete(
    'Extract NBA game info with full team names.',
    `Extract NBA games for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${nbaScheduleText}\n\nReturn JSON: { "games": [{ "teams": "Lakers vs Warriors", "team1": "Lakers", "team2": "Warriors", "date": "today", "time_ist": "6:30 AM" }] }`
  ),
  jsonComplete(
    'Extract Indian current affairs and exam result events that have an outcome within 24-48 hours. Focus on verifiable, newsworthy events including public exam results.',
    `From this news, extract 3-5 Indian current affairs or exam result events with outcomes knowable in the next 24-48 hours:\n\n${caText}\n\nReturn JSON: { "events": [{ "topic": "brief topic", "context": "2-3 sentence description", "expected_outcome_hours": 24 }] }`
  ),
  jsonComplete(
    'Extract crypto market info for India. Return JSON.',
    `From this content, extract key data: current BTC and ETH prices, 24h trend, and any RBI/SEBI regulation news:\n\n${cryptoText}\n\nReturn JSON: { "btc_price_inr": "approx", "eth_price_inr": "approx", "trend_24h": "bullish|bearish|sideways", "regulation_news": "brief summary or none" }`
  ),
  isWeekday
    ? jsonComplete(
        'Extract Indian stock market outlook. Return JSON.',
        `From this content, extract today\'s NIFTY/SENSEX outlook:\n\n${stocksText}\n\nReturn JSON: { "nifty_last_close": "approx level", "sensex_last_close": "approx level", "outlook": "bullish|bearish|sideways", "key_sectors": ["sector1", "sector2"], "key_stocks": ["STOCK1", "STOCK2"], "context": "2-3 sentence summary" }`
      )
    : Promise.resolve({ outlook: 'weekend', context: '' }),
  isFriday
    ? jsonComplete(
        'Extract Bollywood movies releasing this Friday. Return JSON.',
        `From this content, extract movies releasing this Friday:\n\n${moviesText}\n\nReturn JSON: { "movies": [{ "title": "Movie Name", "language": "Hindi/Tamil/etc", "cast": "lead actors", "budget_cr": 100, "expected_oc_cr": 15, "context": "2-3 sentence background" }] }`
      )
    : Promise.resolve({ movies: [] }),
]

const [iplParsed, nbaParsed, caParsed, cryptoParsed, stocksParsed, moviesParsed] = await Promise.all(parseJobs)

const iplMatches = iplParsed.matches ?? []
const nbaGames = nbaParsed.games ?? []
const caEvents = caParsed.events ?? []
const moviesList = moviesParsed.movies ?? []

console.log(`  IPL: ${iplMatches.length} match(es) — ${iplMatches.map(m => m.teams).join(', ') || 'none'}`)
console.log(`  NBA: ${nbaGames.length} game(s) — ${nbaGames.map(g => g.teams).join(', ') || 'none'}`)
console.log(`  Current Affairs: ${caEvents.length} event(s)`)
console.log(`  Crypto: BTC ~${cryptoParsed.btc_price_inr}, trend ${cryptoParsed.trend_24h}`)
if (isWeekday) console.log(`  Stocks: NIFTY ~${stocksParsed.nifty_last_close}, outlook ${stocksParsed.outlook}`)
if (isFriday) console.log(`  Movies: ${moviesList.length} release(s) — ${moviesList.map(m => m.title).join(', ') || 'none'}`)
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
  const nbaResp = await jsonComplete(
    `You are an NBA 2026 prediction question generator. Generate 5 prediction questions about upcoming NBA games or season outcomes.
Rules:
- question_type: one of match_winner, top_scorer, player_milestone
- options: 2-4 plausible choices using real current NBA player names or teams
- context: 2-3 sentences of recent form or standings
- deadline_offset_hours: 24
- resolve_after_offset_hours: 36
- Respond with JSON: { "questions": [...] }`,
    `Current time: ${nowIST}\n\nGenerate 5 NBA 2026 prediction questions about upcoming matchups.\n\nEach: { "title":"...","category":"nba","question_type":"match_winner","options":[...],"deadline_offset_hours":24,"resolve_after_offset_hours":36,"context":"..." }`
  )
  const nbaQs = nbaResp.questions ?? []
  allGenerated.push(...nbaQs)
  console.log(`  NBA (general): ${nbaQs.length} questions`)
}

// --- Stocks (weekday only) ---
if (isWeekday) {
  const stocksResp = await jsonComplete(
    `You are an Indian stock market prediction question generator. Generate 3 prediction questions about today's trading session. Return JSON.
Rules:
- Focus on NIFTY50, SENSEX, key sectors (IT, Banking, Auto, Pharma), or top stocks
- question_type: one of market_direction, price_level, sector_call
- options: 2-4 clear choices (e.g. "Above 24,500" / "Below 24,500" / "Flat ±0.2%")
- context: 2-3 sentences on yesterday's close, global cues, key levels
- deadline_offset_hours: hours from NOW until 9:00 AM IST (market open — predictions close before open)
- resolve_after_offset_hours: hours from NOW until 3:45 PM IST (market close)
- Respond with JSON: { "questions": [...] }`,
    `Current time: ${nowIST}\n\nMarket context:\nNIFTY last close: ${stocksParsed.nifty_last_close}\nSENSEX last close: ${stocksParsed.sensex_last_close}\nOutlook: ${stocksParsed.outlook}\nKey sectors: ${(stocksParsed.key_sectors ?? []).join(', ')}\nKey stocks: ${(stocksParsed.key_stocks ?? []).join(', ')}\n${stocksParsed.context}\n\nGenerate 3 Indian stock market prediction questions.\n\nEach: { "title":"...","category":"stocks","question_type":"market_direction","options":[...],"deadline_offset_hours":14,"resolve_after_offset_hours":21,"context":"..." }`
  )
  const stocksQs = stocksResp.questions ?? []
  allGenerated.push(...stocksQs)
  console.log(`  Stocks: ${stocksQs.length} questions`)
}

// --- Crypto ---
const cryptoResp = await jsonComplete(
  `You are a crypto prediction question generator for Indian users. Generate 3 questions about Bitcoin, Ethereum, or major altcoins in the next 24-48 hours. Return JSON.
Rules:
- Include price movement questions (BTC/ETH in INR or USD) and any Indian regulatory news
- question_type: one of price_direction, regulation, market_cap
- options: 2-4 choices (e.g. price ranges "Above ₹80L" / "Below ₹80L", or "Yes" / "No" for regulation)
- context: 2-3 sentences of recent price action or regulatory backdrop
- deadline_offset_hours: 20
- resolve_after_offset_hours: 30
- Respond with JSON: { "questions": [...] }`,
  `Current time: ${nowIST}\n\nCrypto context:\nBTC price: ${cryptoParsed.btc_price_inr} INR\nETH price: ${cryptoParsed.eth_price_inr} INR\n24h trend: ${cryptoParsed.trend_24h}\nRegulation news: ${cryptoParsed.regulation_news || 'none'}\n\nGenerate 3 crypto prediction questions.\n\nEach: { "title":"...","category":"crypto","question_type":"price_direction","options":[...],"deadline_offset_hours":20,"resolve_after_offset_hours":30,"context":"..." }`
)
const cryptoQs = cryptoResp.questions ?? []
allGenerated.push(...cryptoQs)
console.log(`  Crypto: ${cryptoQs.length} questions`)

// --- Movies (Friday only) ---
if (isFriday && moviesList.length) {
  const movieSummary = moviesList.map(m =>
    `${m.title} (${m.language}): ${m.cast}. Budget: ₹${m.budget_cr}Cr. Expected OC: ₹${m.expected_oc_cr}Cr. ${m.context}`
  ).join('\n\n')

  const moviesResp = await jsonComplete(
    `You are a Bollywood box office prediction question generator. Generate 3 prediction questions about this Friday's new releases. Return JSON.
Rules:
- question_type: one of box_office, hit_or_flop, opening_day
- For box_office: ask about first-weekend collection range
- For hit_or_flop: ask if the film will be a Hit (>= 2× budget) / Average / Flop
- For opening_day: ask about Day 1 collection range
- options: 3-4 choices with specific INR crore ranges
- context: 2-3 sentences on the film's expectations
- deadline_offset_hours: hours until Friday 9:00 AM IST (first shows)
- resolve_after_offset_hours: 72 (Monday morning after first weekend declared)
- Respond with JSON: { "questions": [...] }`,
    `Current time: ${nowIST}\n\nReleasing this Friday:\n${movieSummary}\n\nGenerate 3 box office prediction questions.\n\nEach: { "title":"...","category":"movies","question_type":"box_office","options":[...],"deadline_offset_hours":12,"resolve_after_offset_hours":72,"context":"..." }`
  )
  const moviesQs = moviesResp.questions ?? []
  allGenerated.push(...moviesQs)
  console.log(`  Movies: ${moviesQs.length} questions`)
} else if (isFriday) {
  console.log(`  Movies: skipped (no releases found)`)
}

// --- Current Affairs ---
const caEventSummary = caEvents.length > 0
  ? caEvents.map(e => `- ${e.topic}: ${e.context} (outcome expected in ~${e.expected_outcome_hours}h)`).join('\n')
  : 'Search web for current Indian news events with outcomes in next 24-48 hours'

const caResp = await jsonComplete(
  `You are an Indian current affairs prediction question generator. Generate exactly 5 prediction questions about newsworthy events in India where the outcome will be publicly known in the next 24-48 hours.
Rules:
- Cover a variety of topics: politics, economy, sports (non-cricket/non-NBA), entertainment, technology, public exam results
- If exam results are mentioned, include a question about it
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
console.log(`\nTotal: ${allGenerated.length} questions generated.`)

if (!allGenerated.length) throw new Error('No questions generated')

// ─── PHASE 4b: Quality check ─────────────────────────────────────────────────
console.log('Phase 4b: Quality checking questions...')
allGenerated = await qualityCheck(allGenerated)
console.log(`  ${allGenerated.length} questions passed quality review.\n`)

// ─── PHASE 5: Clear existing + insert ────────────────────────────────────────
console.log('Phase 5: Clearing existing open questions...')
const { count, error: deleteError } = await supabase.from('questions').delete({ count: 'exact' }).eq('status', 'open')
if (deleteError) throw deleteError
console.log(`Deleted ${count} questions.`)

const VALID_CATEGORIES = new Set(['ipl', 'nba', 'current_events', 'stocks', 'crypto', 'movies'])
const CATEGORY_NORMALIZE = {
  index: 'stocks', stock: 'stocks', equity: 'stocks', indices: 'stocks',
  bitcoin: 'crypto', cryptocurrency: 'crypto', crypto_currency: 'crypto',
  movie: 'movies', box_office: 'movies', film: 'movies',
  news: 'current_events', current_affairs: 'current_events', world: 'current_events',
}
const normalizeCategory = c => CATEGORY_NORMALIZE[c] ?? (VALID_CATEGORIES.has(c) ? c : 'current_events')

const now = new Date()
const rows = allGenerated.map(q => ({
  title: q.title,
  category: normalizeCategory(q.category),
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
