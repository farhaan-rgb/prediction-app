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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

const { data: questions } = await supabase
  .from('questions')
  .select('id, title, category, options')
  .eq('status', 'open')
  .is('context', null)

if (!questions?.length) { console.log('All open questions already have context.'); process.exit(0) }
console.log(`Backfilling context for ${questions.length} questions...\n`)

for (const q of questions) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a sports analyst. Given a prediction question, classify it and write helpful context. question_type must be one of: match_winner, top_scorer, top_bowler, team_total, player_milestone, toss. context must be 2-3 sentences of relevant historical stats that help users predict. Respond with JSON: { "question_type": "...", "context": "..." }',
      },
      {
        role: 'user',
        content: `Question: ${q.title}\nOptions: ${q.options.join(', ')}\nCategory: ${q.category}`,
      },
    ],
  })

  const parsed = JSON.parse(completion.choices[0].message.content ?? '{}')

  await supabase.from('questions').update({
    question_type: parsed.question_type,
    context: parsed.context,
  }).eq('id', q.id)

  console.log(`✓ ${q.title.slice(0, 60)}`)
  console.log(`  Type: ${parsed.question_type}`)
  console.log(`  Context: ${parsed.context?.slice(0, 100)}...\n`)
}

console.log('Done!')
