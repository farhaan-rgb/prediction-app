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
  category: 'ipl' | 'nba'
  question_type: QuestionType
  options: string[]
  deadline_offset_hours: number
  context: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: recentQuestions } = await supabase
      .from('questions')
      .select('title')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    const recentTitles = recentQuestions?.map(q => q.title) ?? []

    const nowIST = new Date().toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sports prediction question generator for IPL 2026 and NBA playoffs.
Generate questions about upcoming matches in the next 7 days.
Rules:
- Only ask about future events whose outcomes are not yet known
- Each question must have 2-4 plausible, distinct options
- question_type must be one of: match_winner, top_scorer, top_bowler, team_total, player_milestone, toss
- context: 2-3 sentences of relevant historical stats (recent form, head-to-head, player averages) that help users make an informed prediction
- deadline_offset_hours: hours from NOW until 30 minutes before the match starts
  Example: if a match starts at 7:30 PM IST and current time is 10:00 AM IST, that's 9.5h away, so deadline = 9h (30min before)
- For IPL evening matches: typically start at 7:30 PM IST. For afternoon: 3:30 PM IST
- Respond with JSON: { "questions": [...] }`,
        },
        {
          role: 'user',
          content: `Current time: ${nowIST} (IST)

${recentTitles.length > 0 ? `Do NOT repeat or closely paraphrase these recent questions:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n` : ''}
Generate 10 prediction questions: 7 about IPL 2026 and 3 about NBA playoffs.

JSON format for each:
{
  "title": "...",
  "category": "ipl",
  "question_type": "match_winner",
  "options": ["Team A", "Team B"],
  "deadline_offset_hours": 9,
  "context": "Team A have won 4 of their last 5 games..."
}`,
        },
      ],
    })

    const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')
    const questions: GeneratedQuestion[] = parsed.questions ?? []

    if (!questions.length) throw new Error('No questions returned')

    const now = new Date()
    const rows = questions.map(q => ({
      title: q.title,
      category: q.category,
      question_type: q.question_type,
      options: q.options,
      context: q.context,
      deadline: new Date(now.getTime() + q.deadline_offset_hours * 60 * 60 * 1000).toISOString(),
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

    return NextResponse.json({ success: true, generated: rows.length })
  } catch (err) {
    console.error('generate-questions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
