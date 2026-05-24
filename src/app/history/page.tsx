'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PredictionWithQuestion } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { Clock, CheckCircle, XCircle, HelpCircle } from 'lucide-react'
import UsernameModal from '@/components/UsernameModal'
import { format } from 'date-fns'

const LEAGUE_CONFIG: Record<string, { label: string; color: string }> = {
  ipl:            { label: 'IPL 2026',       color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  nba:            { label: 'NBA',             color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  current_events: { label: 'Current Affairs', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  stocks:         { label: 'Stocks',          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  crypto:         { label: 'Crypto',          color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  movies:         { label: 'Box Office',      color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' },
}

function PendingBadge({ deadline }: { deadline: string }) {
  const { isExpired, hours, minutes } = useCountdown(deadline)
  if (isExpired) return <span className="text-xs font-semibold text-[var(--c-secondary)]">Awaiting result</span>
  return (
    <span className="text-xs font-semibold text-amber-400">
      Closes in {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
    </span>
  )
}

function PredictionCard({ item }: { item: PredictionWithQuestion }) {
  const q = item.questions
  if (!q) return null
  const isResolved = q.status === 'resolved'
  const isCorrect = isResolved && item.chosen_option === q.correct_option
  const isWrong = isResolved && !isCorrect
  const league = LEAGUE_CONFIG[q.category] ?? LEAGUE_CONFIG.current_events

  return (
    <div className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-xl p-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${league.color}`}>
            {league.label}
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
            <span className="flex items-center gap-1 text-xs text-[var(--c-muted)]">
              <HelpCircle className="w-3.5 h-3.5" /> Pending
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--c-muted)] flex-shrink-0">
          {format(new Date(item.created_at), 'MMM d')}
        </span>
      </div>

      <p className="text-sm font-semibold text-[var(--c-text)] mb-2 leading-snug">{q.title}</p>

      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
        isCorrect ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
        isWrong   ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    'bg-[var(--c-base)] border-[var(--c-border)] text-[var(--c-secondary)]'
      }`}>
        <span className="text-xs font-bold opacity-60">YOUR PICK</span>
        <span className="font-semibold truncate">{q.options[item.chosen_option]}</span>
      </div>

      {isWrong && q.correct_option !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-500/5 border-emerald-500/20 text-emerald-400 text-sm mt-1.5">
          <span className="text-xs font-bold opacity-60">CORRECT</span>
          <span className="font-semibold truncate">{q.options[q.correct_option]}</span>
        </div>
      )}

      {!isResolved && (
        <div className="mt-2">
          <PendingBadge deadline={q.deadline} />
        </div>
      )}
    </div>
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

  const awaiting = items.filter(i => i.questions?.status === 'open')
  const results  = items.filter(i => i.questions?.status === 'resolved')
  const correct  = results.filter(i => i.chosen_option === i.questions?.correct_option).length

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
          <Clock className="w-5 h-5 text-[var(--c-text)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--c-text)]">My Predictions</h1>
          {items.length > 0 && (
            <p className="text-xs text-[var(--c-secondary)] mt-0.5">
              {items.length} total
              {results.length > 0 && ` · ${correct}/${results.length} correct`}
            </p>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-[var(--c-text)]">{items.length}</p>
            <p className="text-[10px] text-[var(--c-muted)] mt-0.5">Total Picks</p>
          </div>
          <div className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-emerald-400">{correct}</p>
            <p className="text-[10px] text-[var(--c-muted)] mt-0.5">Correct</p>
          </div>
          <div className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-400">
              {Math.round((correct / results.length) * 100)}%
            </p>
            <p className="text-[10px] text-[var(--c-muted)] mt-0.5">Accuracy</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Clock className="w-12 h-12 text-[var(--c-border-muted)] mb-3" />
          <p className="text-[var(--c-secondary)] font-medium">No predictions yet</p>
          <p className="text-[var(--c-muted)] text-sm mt-1">Make your first pick on the Predict tab</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1 — Awaiting outcome */}
          {awaiting.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-amber-400">⏳ Awaiting Outcome</span>
                <span className="text-xs font-bold text-[var(--c-border-muted)] bg-[var(--c-border)] px-2 py-0.5 rounded-full">{awaiting.length}</span>
              </div>
              <div className="space-y-3">
                {awaiting.map(item => <PredictionCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {/* Section 2 — Results */}
          {results.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-[var(--c-secondary)]">✅ Results</span>
                <span className="text-xs font-bold text-[var(--c-border-muted)] bg-[var(--c-border)] px-2 py-0.5 rounded-full">{results.length}</span>
              </div>
              <div className="space-y-3">
                {results.map(item => <PredictionCard key={item.id} item={item} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
