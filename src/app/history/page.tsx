'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PredictionWithQuestion } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { Clock, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import UsernameModal from '@/components/UsernameModal'
import { format } from 'date-fns'

const LEAGUE_LABELS: Record<string, string> = {
  ipl: 'IPL 2026',
  nba: 'NBA',
  current_events: 'World',
}

const LEAGUE_COLORS: Record<string, string> = {
  ipl: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  nba: 'text-red-400 bg-red-500/10 border-red-500/20',
  current_events: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
}

function PendingBadge({ deadline }: { deadline: string }) {
  const { isExpired, hours, minutes } = useCountdown(deadline)
  if (isExpired) return <span className="text-xs font-semibold text-[#8892aa]">Awaiting result</span>
  return (
    <span className="text-xs font-semibold text-amber-400">
      Closes in {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
    </span>
  )
}

export default function HistoryPage() {
  const { user, loading: userLoading } = useUser()
  const [items, setItems] = useState<PredictionWithQuestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase
      .from('predictions')
      .select('*, questions(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data as PredictionWithQuestion[])
        setLoading(false)
      })
  }, [user])

  if (!userLoading && !user) {
    return (
      <>
        <UsernameModal />
        <main className="max-w-2xl mx-auto px-4 pt-4" />
      </>
    )
  }

  const correct = items.filter(i => i.questions?.status === 'resolved' && i.chosen_option === i.questions?.correct_option).length
  const resolved = items.filter(i => i.questions?.status === 'resolved').length

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">My Predictions</h1>
          {items.length > 0 && (
            <p className="text-xs text-[#8892aa] mt-0.5">
              {items.length} total · {resolved > 0 ? `${correct}/${resolved} correct` : 'awaiting results'}
            </p>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {resolved > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-[#0f1320] border border-[#1e2438] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-white">{items.length}</p>
            <p className="text-[10px] text-[#4a5568] mt-0.5">Total Picks</p>
          </div>
          <div className="bg-[#0f1320] border border-[#1e2438] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-400">{correct}</p>
            <p className="text-[10px] text-[#4a5568] mt-0.5">Correct</p>
          </div>
          <div className="bg-[#0f1320] border border-[#1e2438] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-400">
              {resolved > 0 ? `${Math.round((correct / resolved) * 100)}%` : '—'}
            </p>
            <p className="text-[10px] text-[#4a5568] mt-0.5">Accuracy</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Clock className="w-12 h-12 text-[#2a3050] mb-3" />
          <p className="text-[#8892aa] font-medium">No predictions yet</p>
          <p className="text-[#4a5568] text-sm mt-1">Make your first pick on the home screen</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const q = item.questions
            if (!q) return null
            const isResolved = q.status === 'resolved'
            const isCorrect = isResolved && item.chosen_option === q.correct_option
            const isWrong = isResolved && item.chosen_option !== q.correct_option

            return (
              <div key={item.id} className="bg-[#0f1320] border border-[#1e2438] rounded-xl p-4">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${LEAGUE_COLORS[q.category] ?? LEAGUE_COLORS.current_events}`}>
                      {LEAGUE_LABELS[q.category] ?? q.category}
                    </span>
                    {isResolved && isCorrect && (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" /> Correct · +10 pts
                      </span>
                    )}
                    {isResolved && isWrong && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
                        <XCircle className="w-3.5 h-3.5" /> Wrong
                      </span>
                    )}
                    {!isResolved && (
                      <span className="flex items-center gap-1 text-xs text-[#4a5568]">
                        <HelpCircle className="w-3.5 h-3.5" /> Pending
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#4a5568] flex-shrink-0">
                    {format(new Date(item.created_at), 'MMM d')}
                  </span>
                </div>

                {/* Question */}
                <p className="text-sm font-semibold text-white mb-2 leading-snug">{q.title}</p>

                {/* Your pick */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                  isCorrect ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                  isWrong ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                  'bg-[#080b14] border-[#1e2438] text-[#8892aa]'
                }`}>
                  <span className="text-xs font-bold opacity-60">YOUR PICK</span>
                  <span className="font-semibold truncate">{q.options[item.chosen_option]}</span>
                </div>

                {/* Correct answer (if resolved and wrong) */}
                {isWrong && q.correct_option !== null && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-emerald-400 text-sm mt-1.5">
                    <span className="text-xs font-bold opacity-60">CORRECT</span>
                    <span className="font-semibold truncate">{q.options[q.correct_option]}</span>
                  </div>
                )}

                {/* Pending countdown */}
                {!isResolved && (
                  <div className="mt-2">
                    <PendingBadge deadline={q.deadline} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
