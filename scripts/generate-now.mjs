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

const { data: recent } = await supabase
  .from('questions').select('title')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

const recentTitles = recent?.map(q => q.title) ?? []

const nowIST = new Date().toLocaleString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
})

console.log(`Generating questions for ${nowIST} (IST)...`)
if (recentTitles.length) console.log(`Avoiding ${recentTitles.length} recent questions.`)

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
- context: 2-3 sentences of relevant historical stats that help users predict
- deadline_offset_hours: hours from NOW until 30 minutes before match start
  IPL evening matches start 7:30 PM IST; afternoon 3:30 PM IST
- resolve_after_offset_hours: hours from NOW until the match result will be known
  IPL matches last ~3.5 hours; NBA ~2.5 hours
- Respond with JSON: { "questions": [...] }`,
    },
    {
      role: 'user',
      content: `Current time: ${nowIST} (IST)

${recentTitles.length > 0 ? `Do NOT repeat these recent questions:\n${recentTitles.map(t => `- ${t}`).join('\n')}\n` : ''}
Generate 10 prediction questions: 7 about IPL 2026 and 3 about NBA playoffs.

JSON format:
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
const questions = parsed.questions ?? []

if (!questions.length) throw new Error('No questions returned')
console.log(`\nGPT-4o generated ${questions.length} questions.`)

const now = new Date()
const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

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

const { data, error } = await supabase.from('questions').insert(rows).select('id, title')
if (error) throw error

// Seed bot opinions
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
