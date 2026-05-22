'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { Trophy, Search, Flame } from 'lucide-react'

interface RankedUser extends User {
  accuracy: number
  rating: number
  level: number
}

type SortMode = 'points' | 'wins' | 'accuracy'

function computeRating(correct: number, total: number) {
  if (total === 0) return 0
  return Math.round((correct / total) * Math.sqrt(total) * 100)
}

function getLevel(predictions: number) {
  if (predictions < 5) return 1
  if (predictions < 10) return 2
  if (predictions < 20) return 3
  if (predictions < 40) return 4
  if (predictions < 80) return 5
  if (predictions < 160) return 6
  if (predictions < 320) return 7
  return 8
}

const LEVEL_LABELS = ['', 'Rookie', 'Prospect', 'Analyst', 'Forecaster', 'Expert', 'Master', 'Oracle', 'Legend']
const LEVEL_COLORS = [
  '', 'text-slate-400', 'text-blue-400', 'text-cyan-400', 'text-teal-400',
  'text-emerald-400', 'text-violet-400', 'text-amber-400', 'text-orange-400',
]

function getInitials(username: string) {
  return username.slice(0, 2).toUpperCase()
}

const AVATAR_BG = [
  'bg-indigo-600', 'bg-violet-600', 'bg-blue-600', 'bg-cyan-600',
  'bg-teal-600', 'bg-emerald-600', 'bg-amber-600', 'bg-orange-600',
]

function avatarBg(username: string) {
  const code = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_BG[code % AVATAR_BG.length]
}

export default function LeaderboardPage() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<RankedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('points')
  const [search, setSearch] = useState('')
  const [streakClaimed, setStreakClaimed] = useState(false)
  const [streak, setStreak] = useState(1)

  useEffect(() => {
    // Load check-in streak from localStorage
    const lastCheckin = localStorage.getItem('checkin_date')
    const storedStreak = parseInt(localStorage.getItem('checkin_streak') ?? '0', 10)
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()

    if (lastCheckin === today) {
      setStreakClaimed(true)
      setStreak(storedStreak || 1)
    } else if (lastCheckin === yesterday) {
      setStreak(storedStreak || 1)
    } else if (!lastCheckin) {
      setStreak(0)
    } else {
      setStreak(0)
      localStorage.setItem('checkin_streak', '0')
    }

    supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) {
          const ranked: RankedUser[] = data.map(u => ({
            ...u,
            accuracy: (u.total_predictions ?? 0) > 0
              ? Math.round((u.correct_predictions / u.total_predictions) * 100)
              : 0,
            rating: computeRating(u.correct_predictions ?? 0, u.total_predictions ?? 0),
            level: getLevel(u.total_predictions ?? 0),
          }))
          setUsers(ranked)
        }
        setLoading(false)
      })
  }, [])

  const handleClaim = () => {
    const today = new Date().toDateString()
    const newStreak = streak + 1
    localStorage.setItem('checkin_date', today)
    localStorage.setItem('checkin_streak', String(newStreak))
    setStreak(newStreak)
    setStreakClaimed(true)
  }

  const sorted = [...users].sort((a, b) => {
    if (sortMode === 'wins') return (b.correct_predictions ?? 0) - (a.correct_predictions ?? 0)
    if (sortMode === 'accuracy') {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy
      return (b.total_predictions ?? 0) - (a.total_predictions ?? 0)
    }
    return b.rating - a.rating || b.total_points - a.total_points
  })

  const filtered = search
    ? sorted.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))
    : sorted

  const currentUserRank = sorted.findIndex(u => u.id === currentUser?.id) + 1

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4">

      {/* Tournament banner */}
      <div className="relative bg-gradient-to-br from-amber-600/20 via-orange-600/10 to-transparent border border-amber-500/20 rounded-2xl p-5 mb-4 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-amber-500/5 blur-2xl pointer-events-none" />
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-widest mb-1">Tournament Standing</p>
            <h1 className="text-2xl font-black text-white">IPL Oracle</h1>
            <p className="text-sm text-[#8892aa] mt-1 max-w-xs">
              Forecast IPL matches, climb the ranks, claim bragging rights.
            </p>
          </div>
          <Trophy className="w-10 h-10 text-amber-400 flex-shrink-0" />
        </div>
        {currentUser && currentUserRank > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
            <span className="text-xs text-[#8892aa]">Your rank</span>
            <span className="text-sm font-black text-white">#{currentUserRank}</span>
          </div>
        )}
      </div>

      {/* Daily check-in */}
      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">
            ⚡
          </div>
          <div>
            <p className="text-sm font-bold text-white">Daily Check-In</p>
            <p className="text-xs text-[#4a5568] mt-0.5">Keep your streak alive</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-sm font-bold text-orange-400">{streak}d</span>
            </div>
          )}
          <button
            onClick={handleClaim}
            disabled={streakClaimed}
            className={`text-sm font-bold px-4 py-2 rounded-xl transition-all ${
              streakClaimed
                ? 'bg-[#1e2438] text-[#4a5568] cursor-default'
                : 'bg-amber-500 text-black hover:bg-amber-400 active:scale-95'
            }`}
          >
            {streakClaimed ? '✓ Claimed' : 'Claim'}
          </button>
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex items-center gap-1 bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-1 mb-4">
        {(['points', 'wins', 'accuracy'] as SortMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg capitalize transition-all ${
              sortMode === mode
                ? 'bg-indigo-600 text-white'
                : 'text-[#4a5568] hover:text-[#8892aa]'
            }`}
          >
            {mode === 'points' ? 'Rating' : mode === 'wins' ? 'Wins' : 'Accuracy'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a5568]" />
        <input
          type="text"
          placeholder="Search forecasters..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#0c0f1d] border border-[#1e2438] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#4a5568] focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Trophy className="w-12 h-12 text-[#2a3050] mb-3" />
          <p className="text-[#8892aa]">{search ? 'No forecasters found' : 'No scores yet — be the first!'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u, index) => {
            const rank = sorted.indexOf(u) + 1
            const isCurrentUser = currentUser?.id === u.id
            const isTop3 = rank <= 3
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
            const primaryStat = sortMode === 'wins' ? u.correct_predictions ?? 0 : sortMode === 'accuracy' ? u.accuracy : u.rating
            const primaryLabel = sortMode === 'wins' ? 'wins' : sortMode === 'accuracy' ? '%' : 'rating'

            return (
              <div
                key={u.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                  isCurrentUser ? 'bg-indigo-500/10 border-indigo-500/30' :
                  isTop3 ? 'bg-[#0c0f1d] border-[#2a3050]' :
                  'bg-[#0c0f1d] border-[#1e2438]'
                }`}
              >
                {/* Rank */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                  {medal
                    ? <span className="text-base">{medal}</span>
                    : <span className="text-sm font-bold text-[#4a5568]">{rank}</span>
                  }
                </div>

                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${avatarBg(u.username)}`}>
                  {getInitials(u.username)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold text-sm truncate ${isCurrentUser ? 'text-indigo-400' : 'text-white'}`}>
                      @{u.username}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">you</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold ${LEVEL_COLORS[u.level]}`}>
                      LVL {u.level} {LEVEL_LABELS[u.level]}
                    </span>
                    {(u.total_predictions ?? 0) > 0 && (
                      <>
                        <span className="text-[#2a3050]">·</span>
                        <span className="text-[10px] text-[#4a5568]">{u.total_predictions} picks</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Stat */}
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-black text-amber-400">
                    {primaryStat}{sortMode === 'accuracy' ? '%' : ''}
                  </p>
                  <p className="text-[10px] text-[#4a5568]">{primaryLabel}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {currentUser && !users.find(u => u.id === currentUser.id) && (
        <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-center text-sm text-indigo-400">
          Make predictions to appear on the leaderboard!
        </div>
      )}

      <div className="h-4" />
    </main>
  )
}
