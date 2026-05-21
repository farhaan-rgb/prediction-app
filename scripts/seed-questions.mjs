import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lalbpthtwekaaahywewk.supabase.co',
  'sb_publishable_Vr3SjfmOguhcf16DwPWAkg_ejT7cpUv'
)

// Mark all existing open questions as resolved so they disappear from the feed
const { error: closeErr } = await supabase
  .from('questions')
  .update({ status: 'resolved' })
  .eq('status', 'open')

if (closeErr) {
  console.error('Failed to close existing questions:', closeErr.message)
  process.exit(1)
}
console.log('Closed all existing open questions.')

const now = new Date()
const hoursFromNow = (h) => new Date(now.getTime() + h * 60 * 60 * 1000).toISOString()

// Today: KKR vs GT at 7:30 PM IST (~14h from ~5 AM IST)
// Today: NBA WCF Game 2 OKC vs Spurs at 8:30 PM ET (~20h from ~5 AM IST)
// Tomorrow: CSK vs RCB at 7:30 PM IST (~38h from now)

const questions = [
  // --- IPL ---
  {
    title: 'Who will win KKR vs GT on May 20?',
    category: 'ipl',
    options: ['Kolkata Knight Riders', 'Gujarat Titans'],
    deadline: hoursFromNow(12),
    status: 'open',
  },
  {
    title: 'Which team will score 180+ runs in KKR vs GT?',
    category: 'ipl',
    options: ['Kolkata Knight Riders', 'Gujarat Titans', 'Both', 'Neither'],
    deadline: hoursFromNow(12),
    status: 'open',
  },
  {
    title: 'Who will be the top run-scorer in KKR vs GT?',
    category: 'ipl',
    options: ['Shubman Gill', 'Venkatesh Iyer', 'Jos Buttler', 'Sunil Narine'],
    deadline: hoursFromNow(12),
    status: 'open',
  },
  {
    title: 'Who will win CSK vs RCB on May 21?',
    category: 'ipl',
    options: ['Chennai Super Kings', 'Royal Challengers Bengaluru'],
    deadline: hoursFromNow(36),
    status: 'open',
  },
  {
    title: 'Will Virat Kohli score a fifty in CSK vs RCB?',
    category: 'ipl',
    options: ['Yes', 'No'],
    deadline: hoursFromNow(36),
    status: 'open',
  },
  // --- NBA ---
  {
    title: 'Who will win WCF Game 2: OKC Thunder vs San Antonio Spurs?',
    category: 'nba',
    options: ['Oklahoma City Thunder', 'San Antonio Spurs'],
    deadline: hoursFromNow(20),
    status: 'open',
  },
  {
    title: 'Will WCF Game 2 (OKC vs Spurs) go to overtime?',
    category: 'nba',
    options: ['Yes', 'No'],
    deadline: hoursFromNow(20),
    status: 'open',
  },
  {
    title: 'Who will be the top scorer in WCF Game 2?',
    category: 'nba',
    options: ['Shai Gilgeous-Alexander', 'Victor Wembanyama', 'Chet Holmgren', 'Devin Vassell'],
    deadline: hoursFromNow(20),
    status: 'open',
  },
  {
    title: 'Will OKC Thunder level the WCF series 1-1 in Game 2?',
    category: 'nba',
    options: ['Yes — OKC wins', 'No — Spurs go 2-0'],
    deadline: hoursFromNow(20),
    status: 'open',
  },
  {
    title: 'Who will win the 2026 NBA Western Conference Finals?',
    category: 'nba',
    options: ['Oklahoma City Thunder', 'San Antonio Spurs'],
    deadline: hoursFromNow(168),
    status: 'open',
  },
]

const { error: insertErr, data } = await supabase
  .from('questions')
  .insert(questions)
  .select('id, title')

if (insertErr) {
  console.error('Failed to insert questions:', insertErr.message)
  process.exit(1)
}

console.log(`\nInserted ${data.length} questions:`)
data.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`))
console.log('\nDone!')
