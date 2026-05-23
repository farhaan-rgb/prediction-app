import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

async function webSearch(query: string): Promise<string> {
  const resp = await (openai as any).responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: query,
  })
  return resp.output_text as string
}

async function jsonComplete(system: string, user: string): Promise<any> {
  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  return JSON.parse(resp.choices[0].message.content ?? '{}')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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

    // Phase 1: Search fixtures & events in parallel
    const [iplScheduleText, nbaScheduleText, caText] = await Promise.all([
      webSearch(`IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. Teams and start times IST.`),
      webSearch(`NBA 2026 basketball games scheduled for ${todayIST} and ${tomorrowIST}. Teams and tip-off times.`),
      webSearch(`India current affairs news ${todayIST} — upcoming events, political decisions, sports, economic announcements expected in the next 24 to 48 hours where the outcome will be publicly known.`),
    ])

    // Phase 2: Parse in parallel
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
        'Extract Indian current affairs events that have an outcome within 24-48 hours.',
        `From this news, extract 3-5 Indian current affairs events with outcomes knowable in the next 24-48 hours:\n\n${caText}\n\nReturn JSON: { "events": [{ "topic": "brief topic", "context": "2-3 sentence description", "expected_outcome_hours": 24 }] }`
      ),
    ])

    const iplMatches = iplParsed.matches ?? []
    const nbaGames = nbaParsed.games ?? []
    const caEvents = caParsed.events ?? []

    // Phase 3: Fetch IPL squads
    const squads: Record<string, any> = {}
    if (iplMatches.length) {
      const teamCodes = [...new Set(iplMatches.flatMap((m: any) => [m.team1, m.team2]))] as string[]
      await Promise.all(teamCodes.map(async (team) => {
        const squadText = await webSearch(`${team} IPL 2026 squad current players list`)
        const parsed = await jsonComplete(
          'Extract ONLY the current confirmed IPL 2026 squad.',
          `Extract ${team} IPL 2026 squad from:\n\n${squadText}\n\nReturn JSON: { "team": "${team}", "batsmen": [], "bowlers": [], "allrounders": [], "wicketkeeper": [] }`
        )
        squads[team] = parsed
      }))
    }

    // Phase 4: Generate questions
    const allGenerated: any[] = []

    // IPL
    if (iplMatches.length) {
      const matchList = iplMatches.map((m: any) => {
        const fmt = (s: any) => s ? [
          s.batsmen?.length ? `Batsmen: ${s.batsmen.join(', ')}` : '',
          s.wicketkeeper?.length ? `WK: ${s.wicketkeeper.join(', ')}` : '',
          s.allrounders?.length ? `All-rounders: ${s.allrounders.join(', ')}` : '',
          s.bowlers?.length ? `Bowlers: ${s.bowlers.join(', ')}` : '',
        ].filter(Boolean).join(' | ') : 'squad unknown'
        return `Match: ${m.teams} (${m.date} at ${m.time_ist} IST)\n  ${m.team1}: ${fmt(squads[m.team1])}\n  ${m.team2}: ${fmt(squads[m.team2])}`
      }).join('\n\n')

      const iplResp = await jsonComplete(
        `IPL 2026 question generator. 5 questions per match, only use players from provided squads.
question_type: match_winner|top_scorer|top_bowler|team_total|player_milestone|toss — different per question
options: 2-4 choices using real squad players or team names
context: 2-3 sentences recent form/head-to-head
deadline_offset_hours: hours to 30 min before match start
resolve_after_offset_hours: hours to match end (start+4h)
Respond with JSON: { "matches": [{ "match_tag": "...", "questions": [...] }] }`,
        `Current time: ${nowIST}\n\n${matchList}\n\nEach question: { "title":"...","category":"ipl","question_type":"...","options":[...],"deadline_offset_hours":9,"resolve_after_offset_hours":13,"context":"..." }`
      )

      for (const match of (iplResp.matches ?? [])) {
        const src = iplMatches.find((m: any) => (match.match_tag ?? '').toLowerCase().includes(m.team1.toLowerCase())) ?? iplMatches[0]
        const valResp = await jsonComplete(
          `Cricket question validator. Return JSON. For top_scorer/top_bowler/player_milestone: options must be players in the squads — fix or mark "valid":false. For match_winner/toss: team names only. For team_total: always valid.`,
          `Match: ${src.teams}\n${src.team1}: ${JSON.stringify(squads[src.team1])}\n${src.team2}: ${JSON.stringify(squads[src.team2])}\n\nValidate:\n${JSON.stringify(match.questions)}\n\nReturn: { "questions": [{...original, "valid": true}] }`
        )
        const valid = (valResp.questions ?? []).filter((q: any) => q.valid !== false).map(({ valid: _v, ...q }: any) => q)
        allGenerated.push(...valid)
      }
    }

    // NBA
    const nbaPrompt = nbaGames.length
      ? `Games today/tomorrow:\n${nbaGames.map((g: any) => `- ${g.teams} (${g.date} at ${g.time_ist} IST)`).join('\n')}\n\nGenerate 5 NBA prediction questions spread across these games.`
      : 'No games scheduled. Generate 5 general NBA 2026 prediction questions about upcoming matchups.'

    const nbaResp = await jsonComplete(
      `NBA 2026 question generator. Generate 5 prediction questions.
question_type: match_winner|top_scorer|player_milestone
options: 2-4 choices using real current NBA player names or teams
context: 2-3 sentences recent form/standings
deadline_offset_hours: hours to 30 min before tip-off (or 24 if general)
resolve_after_offset_hours: hours to game end (tip-off+3h) or 36 if general
Respond with JSON: { "questions": [...] }`,
      `Current time: ${nowIST}\n\n${nbaPrompt}\n\nEach: { "title":"...","category":"nba","question_type":"...","options":[...],"deadline_offset_hours":5,"resolve_after_offset_hours":8,"context":"..." }`
    )
    allGenerated.push(...(nbaResp.questions ?? []))

    // Current Affairs
    const caEventSummary = caEvents.length > 0
      ? caEvents.map((e: any) => `- ${e.topic}: ${e.context}`).join('\n')
      : 'Generate questions about upcoming Indian current affairs events'

    const caResp = await jsonComplete(
      `Indian current affairs prediction question generator. Generate exactly 5 questions about newsworthy events in India where outcomes are known in 24-48 hours.
Topics: politics, economy, sports (non-cricket), entertainment, technology
question_type: outcome|policy|market
options: 2-4 distinct plausible choices
context: 2-3 sentences background
deadline_offset_hours: before outcome is known
resolve_after_offset_hours: when outcome confirmed
Respond with JSON: { "questions": [...] }`,
      `Current time: ${nowIST}\n\nEvents:\n${caEventSummary}\n\nEach: { "title":"...","category":"current_events","question_type":"outcome","options":[...],"deadline_offset_hours":20,"resolve_after_offset_hours":30,"context":"..." }`
    )
    allGenerated.push(...(caResp.questions ?? []))

    if (!allGenerated.length) throw new Error('No questions generated')

    // Phase 5: Clear + insert
    await supabase.from('questions').delete().eq('status', 'open')

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

    const { error, data } = await supabase.from('questions').insert(rows).select('id')
    if (error) throw error

    // Phase 6: Seed bot opinions
    const { data: seedUsers } = await supabase.from('users').select('id').in('username', SEED_USERNAMES)
    if (seedUsers?.length && data) {
      const weightedRandom = (n: number) => {
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
    }

    const byCategory = rows.reduce((acc: Record<string, number>, q) => {
      acc[q.category] = (acc[q.category] || 0) + 1; return acc
    }, {})

    return NextResponse.json({ success: true, generated: rows.length, byCategory })
  } catch (err) {
    console.error('generate-questions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
