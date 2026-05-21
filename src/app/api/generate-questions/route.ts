import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface GeneratedQuestion {
  title: string
  category: 'ipl' | 'nba'
  options: string[]
  deadline_offset_hours: number
}

const SYSTEM_PROMPT = `You are a sports prediction question generator for a fan engagement app.
Generate engaging, factually grounded prediction questions about upcoming real sporting events.

Rules:
- Questions must be about events happening in the NEXT 7 DAYS from today
- Questions must have outcomes that are genuinely unknown/unpredictable right now
- Never ask about events that have already happened or whose results are known
- Each question must have 2-4 distinct answer options (no duplicates)
- Options must be plausible — no joke answers
- Keep question titles concise and engaging (under 100 characters)
- deadline_offset_hours: how many hours from now until predictions close (between 12 and 168)`

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch recent question titles to avoid duplicates
    const { data: recentQuestions } = await supabase
      .from('questions')
      .select('title')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    const recentTitles = recentQuestions?.map(q => q.title) ?? []

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Kolkata'
    })

    const userPrompt = `Today is ${today} (IST).

${recentTitles.length > 0 ? `Recently asked questions (do NOT repeat or closely paraphrase these):\n${recentTitles.map(t => `- ${t}`).join('\n')}\n` : ''}

Generate exactly 10 prediction questions as a JSON array:
- 5 questions about IPL 2026 (category: "ipl") — focus on matches, player performances, standings in the next 7 days
- 5 questions about NBA playoffs/games (category: "nba") — focus on game outcomes, player performances in the next 7 days

Return ONLY valid JSON in this exact format, no other text:
[
  {
    "title": "Question text here?",
    "category": "ipl",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "deadline_offset_hours": 24
  }
]`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text in Claude response')
    }

    // Extract JSON array from response (handle markdown code fences)
    const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')

    const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0])

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions array')
    }

    const now = new Date()
    const rows = questions.map(q => ({
      title: q.title,
      category: q.category,
      options: q.options,
      deadline: new Date(now.getTime() + q.deadline_offset_hours * 60 * 60 * 1000).toISOString(),
      status: 'open',
    }))

    const { error, data } = await supabase.from('questions').insert(rows).select('id')
    if (error) throw error

    // Auto-seed opinions from bot users so new questions feel active
    const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']
    const { data: seedUsers } = await supabase.from('users').select('id').in('username', SEED_USERNAMES)

    if (seedUsers && seedUsers.length > 0 && data) {
      const weightedRandom = (optCount: number) => {
        // Random weights with slight bias toward first option (the "favorite")
        const weights = Array.from({ length: optCount }, () => Math.random())
        weights[0] += 0.3
        const total = weights.reduce((a, b) => a + b, 0)
        let rand = Math.random() * total
        for (let i = 0; i < weights.length; i++) {
          rand -= weights[i]
          if (rand <= 0) return i
        }
        return optCount - 1
      }

      const opinionRows = seedUsers.flatMap(user =>
        rows.map((q, i) => ({
          user_id: user.id,
          question_id: data[i].id,
          chosen_option: weightedRandom(q.options.length),
        }))
      )
      await supabase.from('predictions').insert(opinionRows)
    }

    return NextResponse.json({
      success: true,
      generated: rows.length,
      ids: data?.map(r => r.id),
    })
  } catch (err) {
    console.error('generate-questions error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
