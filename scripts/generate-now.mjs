import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Read env vars from .env.local
const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  timeZone: 'Asia/Kolkata'
})

// Fetch recent questions to avoid duplicates
const { data: recent } = await supabase
  .from('questions')
  .select('title')
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

const recentTitles = recent?.map(q => q.title) ?? []

console.log(`Generating questions for ${today}...`)
if (recentTitles.length) {
  console.log(`Avoiding ${recentTitles.length} recent questions.`)
}

const response = await anthropic.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 2000,
  thinking: { type: 'disabled' },
  system: [
    {
      type: 'text',
      text: `You are a sports prediction question generator for a fan engagement app.
Generate engaging, factually grounded prediction questions about upcoming real sporting events.
Rules:
- Questions must be about events happening in the NEXT 7 DAYS from today
- Questions must have outcomes that are genuinely unknown/unpredictable right now
- Never ask about events that have already happened or whose results are known
- Each question must have 2-4 distinct answer options (no duplicates)
- Options must be plausible — no joke answers
- Keep question titles concise and engaging (under 100 characters)
- deadline_offset_hours: hours from now until predictions close (between 6 and 168)`,
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    {
      role: 'user',
      content: `Today is ${today} (IST).

${recentTitles.length > 0 ? `Recently asked questions (do NOT repeat or closely paraphrase these):\n${recentTitles.map(t => `- ${t}`).join('\n')}\n` : ''}

Generate exactly 10 prediction questions as a JSON array:
- 5 questions about IPL 2026 (category: "ipl") — focus on matches and player performances in the next 7 days
- 5 questions about NBA playoffs (category: "nba") — focus on game outcomes and player performances in the next 7 days

Return ONLY valid JSON, no other text:
[
  {
    "title": "Question text here?",
    "category": "ipl",
    "options": ["Option A", "Option B", "Option C"],
    "deadline_offset_hours": 24
  }
]`,
    },
  ],
})

const textBlock = response.content.find(b => b.type === 'text')
const jsonMatch = textBlock?.text.match(/\[[\s\S]*\]/)
if (!jsonMatch) throw new Error('No JSON found in response:\n' + textBlock?.text)

const questions = JSON.parse(jsonMatch[0])
console.log(`\nClaude generated ${questions.length} questions.`)

const now = new Date()
const rows = questions.map(q => ({
  title: q.title,
  category: q.category,
  options: q.options,
  deadline: new Date(now.getTime() + q.deadline_offset_hours * 60 * 60 * 1000).toISOString(),
  status: 'open',
}))

const { data, error } = await supabase.from('questions').insert(rows).select('id, title')
if (error) throw error

console.log(`\nInserted ${data.length} questions:`)
data.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`))
console.log('\nDone!')
