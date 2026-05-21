import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
}

interface GeneratedMatch {
  match_tag: string
  match_date: 'today' | 'tomorrow'
  questions: GeneratedQuestion[]
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

    // Delete all existing open questions before generating fresh ones
    await supabase.from('questions').delete().eq('status', 'open')

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
- Vary question types across the 5 questions per match (no repeated types within the same match)
- context: 2-3 sentences of relevant recent form, head-to-head stats, or player stats that help users predict
- deadline_offset_hours: hours from NOW until 30 minutes before that match starts
  IPL evening matches start 7:30 PM IST; afternoon matches start 3:30 PM IST
- resolve_after_offset_hours: hours from NOW until the match result will be known (match start + 4 hours)
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
    const matches: GeneratedMatch[] = parsed.matches ?? []
    const questions: GeneratedQuestion[] = matches.flatMap(m => m.questions ?? [])

    if (!questions.length) throw new Error('No questions returned')

    const now = new Date()
    const rows = questions.map(q => ({
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

    // Auto-seed opinions from bot users
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

    return NextResponse.json({ success: true, generated: rows.length, matches: matches.map(m => m.match_tag) })
  } catch (err) {
    console.error('generate-questions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
