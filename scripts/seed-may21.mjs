import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://lalbpthtwekaaahywewk.supabase.co',
  'sb_publishable_Vr3SjfmOguhcf16DwPWAkg_ejT7cpUv'
)

const now = new Date()
const h = (hrs) => new Date(now.getTime() + hrs * 60 * 60 * 1000).toISOString()

// IPL: CSK vs RCB tonight at 7:30 PM IST (~6-8h from now)
// NBA ECF Game 2: Cavaliers at Knicks tonight at 8 PM ET (~10-12h from now)
// NBA WCF Game 3: OKC vs Spurs tomorrow May 22 at 8:30 PM ET (~34h from now)
// WCF series: OKC levelled 1-1 after winning Game 2

const questions = [
  // IPL — CSK vs RCB (May 21, 7:30 PM IST)
  {
    title: 'Who will win CSK vs RCB on May 21?',
    category: 'ipl',
    options: ['Chennai Super Kings', 'Royal Challengers Bengaluru'],
    deadline: h(6),
    status: 'open',
  },
  {
    title: 'Will Virat Kohli score a fifty against CSK?',
    category: 'ipl',
    options: ['Yes', 'No'],
    deadline: h(6),
    status: 'open',
  },
  {
    title: 'Who will take the most wickets in CSK vs RCB?',
    category: 'ipl',
    options: ['Ravindra Jadeja', 'Jasprit Bumrah', 'Mohammed Siraj', 'Matheesha Pathirana'],
    deadline: h(6),
    status: 'open',
  },
  {
    title: 'Who will be top run-scorer in CSK vs RCB?',
    category: 'ipl',
    options: ['Virat Kohli', 'MS Dhoni', 'Ruturaj Gaikwad', 'Faf du Plessis'],
    deadline: h(6),
    status: 'open',
  },
  {
    title: 'Will CSK vs RCB go down to the last over?',
    category: 'ipl',
    options: ['Yes', 'No'],
    deadline: h(6),
    status: 'open',
  },
  // NBA — ECF Game 2: Cavaliers at Knicks (May 21, 8 PM ET)
  {
    title: 'Who will win ECF Game 2: Cavaliers vs Knicks?',
    category: 'nba',
    options: ['Cleveland Cavaliers', 'New York Knicks'],
    deadline: h(11),
    status: 'open',
  },
  {
    title: 'Will Donovan Mitchell score 30+ points in ECF Game 2?',
    category: 'nba',
    options: ['Yes', 'No'],
    deadline: h(11),
    status: 'open',
  },
  {
    title: 'Who will be top scorer in ECF Game 2?',
    category: 'nba',
    options: ['Donovan Mitchell', 'Jalen Brunson', 'Karl-Anthony Towns', 'Evan Mobley'],
    deadline: h(11),
    status: 'open',
  },
  // NBA — WCF Game 3: OKC vs Spurs (May 22, 8:30 PM ET) — series tied 1-1
  {
    title: 'Who will win WCF Game 3: OKC Thunder vs Spurs?',
    category: 'nba',
    options: ['Oklahoma City Thunder', 'San Antonio Spurs'],
    deadline: h(34),
    status: 'open',
  },
  {
    title: 'Who will lead the WCF series 2-1 after Game 3?',
    category: 'nba',
    options: ['Oklahoma City Thunder', 'San Antonio Spurs'],
    deadline: h(34),
    status: 'open',
  },
]

const { data, error } = await supabase.from('questions').insert(questions).select('id, title')
if (error) { console.error(error.message); process.exit(1) }

console.log(`Inserted ${data.length} questions for May 21:\n`)
data.forEach((q, i) => console.log(`  ${i + 1}. ${q.title}`))
console.log('\nDone!')
