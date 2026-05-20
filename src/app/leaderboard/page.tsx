'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { Trophy } from 'lucide-react'

interface RankedUser extends User {
  accuracy: number
  rating: number
}

function computeRating(correct: number, total: number): number {
  if (total === 0) return 0
  const accuracy = correct / total
  // Rating rewards both accuracy and volume with diminishing returns on volume
  return Math.round(accuracy * Math.sqrt(total) * 100)
}

export default function LeaderboardPage() {
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<RankedUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('users')
      .select('*')
      .order('total_points', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) {
          const ranked: RankedUser[] = data.map(u => ({
            ...u,
            accuracy: u.total_predictions > 0 ? Math.round((u.correct_predictions / u.total_predictions) * 100) : 0,
            rating: computeRating(u.correct_predictions ?? 0, u.total_predictions ?? 0),
          }))
          ranked.sort((a, b) => b.rating - a.rating || b.total_points - a.total_points)
          setUsers(ranked)
        }
        setLoading(false)
      })
  }, [])

  const getMedal = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 mb-3 shadow-lg shadow-amber-900/30">
          <Trophy className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-[#8892aa] text-sm mt-1">Ranked by accuracy × volume</p>
      </div>

      {/* Score explanation */}
      <div className="bg-[#0f1320] border border-[#1e2438] rounded-xl p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <p className="text-sm font-bold text-white">How ratings work</p>
        </div>
        <p className="text-xs text-[#8892aa] leading-relaxed">
          Your rating rewards <span className="text-white font-semibold">both accuracy and volume</span> — being right matters, but so does making more predictions.
        </p>
        <div className="bg-[#080b14] rounded-lg p-3 space-y-1">
          <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider mb-2">Formula</p>
          <p className="text-sm font-mono text-indigo-300">rating = (correct ÷ total) × √total × 100</p>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Examples</p>
          {[
            { correct: 1, total: 1, note: 'lucky once' },
            { correct: 3, total: 5, note: 'getting started' },
            { correct: 5, total: 7, note: 'consistent' },
            { correct: 8, total: 10, note: 'sharp' },
          ].map(({ correct, total, note }) => {
            const rating = Math.round((correct / total) * Math.sqrt(total) * 100)
            const acc = Math.round((correct / total) * 100)
            return (
              <div key={note} className="flex items-center justify-between text-xs">
                <span className="text-[#4a5568]">{correct}/{total} correct <span className="text-[#2a3050]">·</span> {acc}% acc <span className="text-[#2a3050]">·</span> <span className="text-[#8892aa] italic">{note}</span></span>
                <span className="font-bold text-amber-400">{rating}</span>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-[#4a5568] leading-relaxed">
          Getting lucky on 1 prediction (rating: 100) ranks lower than someone who went 8/10 (rating: 253). Skill over luck.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl skeleton" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Trophy className="w-12 h-12 text-[#2a3050] mb-3" />
          <p className="text-[#8892aa]">No scores yet — be the first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u, index) => {
            const rank = index + 1
            const isCurrentUser = currentUser?.id === u.id
            const medal = getMedal(rank)

            return (
              <div
                key={u.id}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
                  isCurrentUser
                    ? 'bg-indigo-500/10 border-indigo-500/30'
                    : rank <= 3
                    ? 'bg-[#0f1320] border-[#2a3050]'
                    : 'bg-[#0f1320] border-[#1e2438]'
                }`}
              >
                {/* Rank */}
                <div className="w-7 flex items-center justify-center flex-shrink-0">
                  {medal ? (
                    <span className="text-lg">{medal}</span>
                  ) : (
                    <span className="text-sm font-bold text-[#4a5568]">{rank}</span>
                  )}
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold truncate ${isCurrentUser ? 'text-indigo-400' : 'text-white'}`}>
                      @{u.username}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">you</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[#4a5568]">
                      {u.correct_predictions ?? 0}/{u.total_predictions ?? 0} correct
                    </span>
                    {(u.total_predictions ?? 0) > 0 && (
                      <>
                        <span className="text-[#2a3050]">·</span>
                        <span className={`text-[11px] font-semibold ${u.accuracy >= 70 ? 'text-emerald-400' : u.accuracy >= 50 ? 'text-amber-400' : 'text-[#4a5568]'}`}>
                          {u.accuracy}% acc
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Rating */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-base font-bold text-amber-400">{u.rating}</span>
                  <span className="text-[10px] text-[#4a5568]">rating</span>
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
    </main>
  )
}
