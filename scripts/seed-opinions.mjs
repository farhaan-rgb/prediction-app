import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lalbpthtwekaaahywewk.supabase.co',
  'sb_publishable_Vr3SjfmOguhcf16DwPWAkg_ejT7cpUv'
)

const SEED_USERNAMES = ['CricketGuru99', 'HoopDreamer', 'SixHitter', 'ThreePointer7', 'ViratFanatic', 'NBATitan', 'KKRLoyalist', 'SpursNation', 'IPLKing2026', 'NBAOracle']

const weightedRandom = (optCount) => {
  const weights = Array.from({ length: optCount }, () => Math.random())
  weights[0] += 0.3 // slight bias toward first option
  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return i
  }
  return optCount - 1
}

// Fetch seed users
const { data: seedUsers } = await supabase.from('users').select('id, username').in('username', SEED_USERNAMES)
if (!seedUsers?.length) { console.error('No seed users found'); process.exit(1) }
console.log(`Found ${seedUsers.length} seed users.`)

// Fetch open questions that have no predictions from seed users yet
const { data: questions } = await supabase.from('questions').select('id, title, options').eq('status', 'open')
if (!questions?.length) { console.error('No open questions found'); process.exit(1) }

// Find which (user, question) pairs already have predictions
const { data: existing } = await supabase
  .from('predictions')
  .select('user_id, question_id')
  .in('user_id', seedUsers.map(u => u.id))
  .in('question_id', questions.map(q => q.id))

const existingSet = new Set((existing ?? []).map(p => `${p.user_id}:${p.question_id}`))

const toInsert = []
for (const user of seedUsers) {
  for (const q of questions) {
    if (!existingSet.has(`${user.id}:${q.id}`)) {
      toInsert.push({
        user_id: user.id,
        question_id: q.id,
        chosen_option: weightedRandom(q.options.length),
      })
    }
  }
}

if (toInsert.length === 0) {
  console.log('All seed opinions already exist — nothing to do.')
  process.exit(0)
}

const { error } = await supabase.from('predictions').insert(toInsert)
if (error) { console.error('Insert error:', error.message); process.exit(1) }

console.log(`Seeded ${toInsert.length} opinions across ${questions.length} questions.\n`)
questions.forEach(q => {
  const votes = toInsert.filter(p => p.question_id === q.id)
  console.log(`  ${q.title.slice(0, 55)}`)
  q.options.forEach((opt, i) => {
    const c = votes.filter(p => p.chosen_option === i).length
    console.log(`    ${opt.padEnd(35)} ${c} picks`)
  })
})
console.log('\nDone!')
