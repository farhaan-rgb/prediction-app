import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function resolveQuestion(questionId: string, correctOption: number) {
  await supabase.from('questions').update({ status: 'resolved', correct_option: correctOption }).eq('id', questionId)

  const { data: allPredictions } = await supabase
    .from('predictions').select('id, user_id, chosen_option').eq('question_id', questionId)

  if (!allPredictions?.length) return

  for (const pred of allPredictions) {
    const isCorrect = pred.chosen_option === correctOption
    if (isCorrect) await supabase.from('predictions').update({ points_awarded: 10 }).eq('id', pred.id)

    const { data: u } = await supabase
      .from('users').select('total_points, total_predictions, correct_predictions').eq('id', pred.user_id).single()
    if (u) {
      await supabase.from('users').update({
        total_predictions: (u.total_predictions ?? 0) + 1,
        correct_predictions: (u.correct_predictions ?? 0) + (isCorrect ? 1 : 0),
        total_points: (u.total_points ?? 0) + (isCorrect ? 10 : 0),
      }).eq('id', pred.user_id)
    }
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find questions where result should now be available (resolve_after has passed)
    // Falls back to deadline-only check for questions without resolve_after set
    const now = new Date().toISOString()
    const { data: expiredQuestions } = await supabase
      .from('questions')
      .select('id, title, options, category, resolve_after')
      .eq('status', 'open')
      .or(`resolve_after.lt.${now},and(resolve_after.is.null,deadline.lt.${now})`)

    if (!expiredQuestions?.length) {
      return NextResponse.json({ message: 'No expired questions to resolve', resolved: 0 })
    }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata',
    })

    const results: { title: string; resolved: boolean; answer?: string }[] = []

    for (const q of expiredQuestions) {
      const optionLabels = q.options.map((opt: string, i: number) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Today is ${today}. You are a sports results verifier. Given a prediction question and its options, determine which option is the correct answer based on the actual result. Only answer if you are highly confident (95%+). If unsure, answer UNKNOWN. Respond with ONLY the letter (A, B, C, D) or UNKNOWN.`,
          },
          {
            role: 'user',
            content: `Question: ${q.title}\n\nOptions:\n${optionLabels}`,
          },
        ],
        max_tokens: 10,
      })

      const answer = completion.choices[0].message.content?.trim().toUpperCase()

      if (answer && answer !== 'UNKNOWN' && /^[A-D]$/.test(answer)) {
        const correctIndex = answer.charCodeAt(0) - 65
        if (correctIndex < q.options.length) {
          await resolveQuestion(q.id, correctIndex)
          results.push({ title: q.title, resolved: true, answer: q.options[correctIndex] })
        }
      } else {
        results.push({ title: q.title, resolved: false })
      }
    }

    const resolved = results.filter(r => r.resolved).length
    return NextResponse.json({ resolved, skipped: results.length - resolved, results })
  } catch (err) {
    console.error('resolve-questions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
