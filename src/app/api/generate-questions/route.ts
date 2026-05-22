import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

type QuestionType = 'match_winner' | 'top_scorer' | 'top_bowler' | 'team_total' | 'player_milestone' | 'toss'

interface GeneratedQuestion {
  title: string
  category: 'ipl'
  question_type: QuestionType
  options: string[]
  deadline_offset_hours: number
  resolve_after_offset_hours: number
  context: string
  valid?: boolean
  [key: string]: unknown
}

interface GeneratedMatch {
  match_tag: string
  questions: GeneratedQuestion[]
}

interface UpcomingMatch {
  teams: string
  team1: string
  team2: string
  date: string
  time_ist: string
}

async function webSearch(query: string): Promise<string> {
  const resp = await (openai as any).responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: query,
  })
  return resp.output_text as string
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

    // Step 1: Find matches
    const scheduleText = await webSearch(
      `IPL 2026 cricket match schedule for ${todayIST} and ${tomorrowIST}. List each match with teams and start time IST.`
    )
    const parseResp = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extract IPL match info. Use short team codes: MI, CSK, RCB, GT, SRH, KKR, DC, PBKS, RR, LSG.' },
        { role: 'user', content: `Extract IPL matches for today (${todayIST}) and tomorrow (${tomorrowIST}) from:\n\n${scheduleText}\n\nReturn JSON: { "matches": [{ "teams": "GT vs CSK", "team1": "GT", "team2": "CSK", "date": "today", "time_ist": "7:30 PM" }] }` },
      ],
    })
    const upcomingMatches: UpcomingMatch[] = JSON.parse(parseResp.choices[0].message.content ?? '{}').matches ?? []

    if (!upcomingMatches.length) {
      return NextResponse.json({ message: 'No IPL matches found', generated: 0 })
    }

    // Step 2: Fetch current squads in parallel
    const teamCodes = [...new Set(upcomingMatches.flatMap(m => [m.team1, m.team2]))]
    const squads: Record<string, any> = {}

    await Promise.all(teamCodes.map(async (team) => {
      const squadText = await webSearch(`${team} IPL 2026 squad current players list with roles`)
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Extract ONLY the current confirmed IPL 2026 squad. Do not include players from previous seasons who are no longer with this team.' },
          { role: 'user', content: `Extract ${team} IPL 2026 squad from:\n\n${squadText}\n\nReturn JSON: { "team": "${team}", "batsmen": [], "bowlers": [], "allrounders": [], "wicketkeeper": [] }` },
        ],
      })
      squads[team] = JSON.parse(resp.choices[0].message.content ?? '{}')
    }))

    // Step 3: Clear existing open questions
    await supabase.from('questions').delete().eq('status', 'open')

    // Step 4: Generate questions
    const matchList = upcomingMatches.map(m => {
      const formatSquad = (s: any) => s ? [
        s.batsmen?.length ? `Batsmen: ${s.batsmen.join(', ')}` : '',
        s.wicketkeeper?.length ? `Wicketkeeper: ${s.wicketkeeper.join(', ')}` : '',
        s.allrounders?.length ? `All-rounders: ${s.allrounders.join(', ')}` : '',
        s.bowlers?.length ? `Bowlers: ${s.bowlers.join(', ')}` : '',
      ].filter(Boolean).join(' | ') : 'squad unknown'
      return `Match: ${m.teams} (${m.date} at ${m.time_ist} IST)
  ${m.team1} squad — ${formatSquad(squads[m.team1])}
  ${m.team2} squad — ${formatSquad(squads[m.team2])}`
    }).join('\n\n')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sports prediction question generator for IPL 2026.
Generate exactly 5 prediction questions per match. You MUST only use players from the squads provided.
- question_type: one of match_winner, top_scorer, top_bowler, team_total, player_milestone, toss — different type for each of the 5
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

    const generatedMatches: GeneratedMatch[] = JSON.parse(completion.choices[0].message.content ?? '{}').matches ?? []

    // Step 5: Validate each question's options against fetched squads
    const validatedQuestions: GeneratedQuestion[] = []

    for (const match of generatedMatches) {
      const src = upcomingMatches.find(m => {
        const tag = match.match_tag?.toLowerCase() ?? ''
        return tag.includes(m.team1.toLowerCase()) || tag.includes(m.team2.toLowerCase())
      }) ?? upcomingMatches[0]

      const validatorResp = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a cricket question validator for IPL 2026.
For top_scorer, top_bowler, player_milestone: every option must be a player currently in one of the two squads. If an option is NOT in either squad, replace it with a valid player of the same role. If a question cannot be fixed with at least 2 valid options, mark it invalid.
For match_winner and toss: options must be team names only.
For team_total: options are run ranges — always valid.
Return corrected questions. Mark unfixable ones with "valid": false.`,
          },
          {
            role: 'user',
            content: `Match: ${src.teams}
${src.team1} squad: ${JSON.stringify(squads[src.team1])}
${src.team2} squad: ${JSON.stringify(squads[src.team2])}

Questions to validate:
${JSON.stringify(match.questions, null, 2)}

Return JSON: { "questions": [ { ...original_fields, "valid": true } ] }`,
          },
        ],
      })

      const validated: GeneratedQuestion[] = JSON.parse(validatorResp.choices[0].message.content ?? '{}').questions ?? []
      validatedQuestions.push(...validated.filter(q => q.valid !== false).map(({ valid: _v, ...q }) => q as GeneratedQuestion))
    }

    if (!validatedQuestions.length) throw new Error('No valid questions after validation')

    const now = new Date()
    const rows = validatedQuestions.map(q => ({
      title: q.title,
      category: q.category,
      question_type: q.question_type,
      options: q.options,
      context: q.context,
      deadline: new Date(now.getTime() + q.deadline_offset_hours * 60 * 60 * 1000).toISOString(),
      resolve_after: new Date(now.getTime() + q.resolve_after_offset_hours * 60 * 60 * 1000).toISOString(),
      status: 'open',
    }))

    const { error, data } = await supabase.from('questions').insert(rows).select('id')
    if (error) throw error

    const { data: seedUsers } = await supabase.from('users').select('id').in('username', SEED_USERNAMES)
    if (seedUsers?.length && data) {
      const weightedRandom = (optCount: number) => {
        const weights = Array.from({ length: optCount }, () => Math.random())
        weights[0] += 0.3
        const total = weights.reduce((a, b) => a + b, 0)
        let rand = Math.random() * total
        for (let i = 0; i < weights.length; i++) { rand -= weights[i]; if (rand <= 0) return i }
        return optCount - 1
      }
      const opinionRows = seedUsers.flatMap(user =>
        rows.map((q, i) => ({ user_id: user.id, question_id: data[i].id, chosen_option: weightedRandom(q.options.length) }))
      )
      await supabase.from('predictions').insert(opinionRows)
    }

    return NextResponse.json({
      success: true,
      generated: rows.length,
      matches: upcomingMatches.map(m => m.teams),
    })
  } catch (err) {
    console.error('generate-questions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
