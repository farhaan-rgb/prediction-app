import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lalbpthtwekaaahywewk.supabase.co',
  'sb_publishable_Vr3SjfmOguhcf16DwPWAkg_ejT7cpUv'
)

// Fetch current open questions in order
const { data: questions, error: qErr } = await supabase
  .from('questions')
  .select('id, title, options')
  .eq('status', 'open')
  .order('created_at', { ascending: true })

if (qErr || !questions?.length) {
  console.error('Could not fetch questions:', qErr?.message)
  process.exit(1)
}

console.log(`Found ${questions.length} open questions:`)
questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`))
console.log()

// 10 users with sports-themed names
const usernames = [
  'CricketGuru99',
  'HoopDreamer',
  'SixHitter',
  'ThreePointer7',
  'ViratFanatic',
  'NBATitan',
  'KKRLoyalist',
  'SpursNation',
  'IPLKing2026',
  'NBAOracle',
]

const { data: users, error: uErr } = await supabase
  .from('users')
  .insert(usernames.map(u => ({ username: u })))
  .select('id, username')

if (uErr) {
  console.error('Failed to insert users:', uErr.message)
  process.exit(1)
}
console.log(`Created ${users.length} users.`)

// For each question, define which option index each of the 10 users picks.
// Based on the 10 questions we seeded (in insert order):
//  0 - KKR vs GT winner            [KKR=0, GT=1]
//  1 - 180+ runs KKR vs GT         [KKR=0, GT=1, Both=2, Neither=3]
//  2 - Top scorer KKR vs GT        [Gill=0, Iyer=1, Buttler=2, Narine=3]
//  3 - CSK vs RCB winner           [CSK=0, RCB=1]
//  4 - Kohli 50+ in CSK vs RCB     [Yes=0, No=1]
//  5 - WCF Game 2 winner           [OKC=0, Spurs=1]
//  6 - WCF Game 2 OT?              [Yes=0, No=1]
//  7 - Top scorer WCF Game 2       [SGA=0, Wemby=1, Chet=2, Vassell=3]
//  8 - OKC level series 1-1?       [Yes=0, No=1]
//  9 - WCF series winner           [OKC=0, Spurs=1]
//
// Rows = users, Columns = question slots
// Spurs lead 1-0 so slight Spurs lean on Game 2 & series; Gill/SGA are stars → more votes
const pickMatrix = [
//  Q0  Q1  Q2  Q3  Q4  Q5  Q6  Q7  Q8  Q9
  [  0,  0,  0,  0,  0,  0,  1,  0,  0,  1 ],  // CricketGuru99
  [  1,  1,  0,  1,  0,  1,  1,  1,  1,  1 ],  // HoopDreamer
  [  0,  3,  2,  0,  0,  1,  0,  0,  0,  0 ],  // SixHitter
  [  1,  1,  0,  1,  1,  0,  1,  1,  0,  1 ],  // ThreePointer7
  [  0,  0,  3,  0,  0,  0,  1,  0,  1,  0 ],  // ViratFanatic
  [  1,  3,  1,  1,  1,  1,  1,  1,  1,  1 ],  // NBATitan
  [  0,  0,  0,  0,  0,  1,  0,  0,  0,  1 ],  // KKRLoyalist
  [  1,  2,  2,  1,  0,  1,  1,  1,  0,  1 ],  // SpursNation
  [  0,  0,  0,  0,  0,  0,  1,  0,  1,  0 ],  // IPLKing2026
  [  0,  1,  1,  0,  1,  1,  0,  1,  1,  1 ],  // NBAOracle
]

// Build predictions — each user answers questions based on their column in pickMatrix
// Some users skip 1-2 questions (realistic)
const skipMap = {
  1: [8, 9],  // HoopDreamer skips IPL questions (last 2 IPL = Q3,Q4; but skip NBA series)
  3: [0],     // ThreePointer7 skips first question
  5: [3, 4],  // NBATitan skips CSK vs RCB questions
}

const predictions = []

users.forEach((user, uIdx) => {
  const skips = skipMap[uIdx] ?? []
  questions.forEach((q, qIdx) => {
    if (skips.includes(qIdx)) return
    const optionCount = q.options.length
    const pick = pickMatrix[uIdx][qIdx] ?? 0
    predictions.push({
      user_id: user.id,
      question_id: q.id,
      chosen_option: Math.min(pick, optionCount - 1), // safety clamp
    })
  })
})

const { error: pErr } = await supabase.from('predictions').insert(predictions)
if (pErr) {
  console.error('Failed to insert predictions:', pErr.message)
  process.exit(1)
}

console.log(`Inserted ${predictions.length} predictions across ${users.length} users.\n`)

// Print distribution per question
questions.forEach((q, qIdx) => {
  const qPreds = predictions.filter(p => p.question_id === q.id)
  const counts = {}
  qPreds.forEach(p => { counts[p.chosen_option] = (counts[p.chosen_option] ?? 0) + 1 })
  const total = qPreds.length
  const bars = q.options.map((opt, i) => {
    const c = counts[i] ?? 0
    const pct = total > 0 ? Math.round((c / total) * 100) : 0
    return `    ${opt.padEnd(30)} ${c} picks (${pct}%)`
  }).join('\n')
  console.log(`Q${qIdx + 1}: ${q.title}\n${bars}\n`)
})

console.log('Done!')
