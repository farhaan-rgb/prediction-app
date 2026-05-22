'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Question, Prediction } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { CheckCircle, XCircle, Zap, ChevronRight, Flame } from 'lucide-react'

interface Props {
  question: Question
  prediction?: Prediction
  onPredicted: (prediction: Prediction) => void
  onExpired?: (questionId: string) => void
  distribution?: Record<number, number>
}

const LEAGUE_CONFIG = {
  ipl: {
    label: 'IPL 2026',
    icon: '🏏',
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    fill: 'bg-orange-500',
    dot: 'bg-orange-400',
  },
  nba: {
    label: 'NBA',
    icon: '🏀',
    gradient: 'from-red-500 to-orange-600',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    fill: 'bg-red-500',
    dot: 'bg-red-400',
  },
  current_events: {
    label: 'World',
    icon: '🌍',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    fill: 'bg-blue-500',
    dot: 'bg-blue-400',
  },
}

function CountdownBadge({ deadline, onExpired }: { deadline: string; onExpired?: () => void }) {
  const { hours, minutes, seconds, isExpired, urgency } = useCountdown(deadline)

  if (isExpired) {
    onExpired?.()
    return <span className="text-xs font-semibold text-[#4a5568]">Closed</span>
  }

  const colorClass =
    urgency === 'critical' ? 'text-red-400' :
    urgency === 'soon' ? 'text-amber-400' :
    'text-emerald-400'

  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(hours / 24)
  const h = hours % 24
  const display = days >= 1 ? `${days}d ${h}h` : `${pad(h)}:${pad(minutes)}:${pad(seconds)}`

  return (
    <span className={`text-xs font-bold font-mono ${colorClass}`}>{display}</span>
  )
}

export default function QuestionCard({ question, prediction, onPredicted, onExpired, distribution }: Props) {
  const { user } = useUser()
  const { isExpired } = useCountdown(question.deadline)
  const [submitting, setSubmitting] = useState(false)
  const [localExpired, setLocalExpired] = useState(false)

  const league = LEAGUE_CONFIG[question.category] ?? LEAGUE_CONFIG.current_events
  const isResolved = question.status === 'resolved'
  const canPredict = user && !prediction && !isExpired && !localExpired && question.status === 'open'
  const wonPoints = isResolved && prediction && prediction.chosen_option === question.correct_option
  const totalVotes = Object.values(distribution ?? {}).reduce((a, b) => a + b, 0)
  const isHot = totalVotes >= 6

  const handlePredict = async (optionIndex: number) => {
    if (!canPredict) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('predictions')
      .insert({ user_id: user.id, question_id: question.id, chosen_option: optionIndex })
      .select()
      .single()
    if (!error && data) onPredicted(data)
    setSubmitting(false)
  }

  const getOptionStyle = (index: number) => {
    const isChosen = prediction?.chosen_option === index
    const isCorrect = question.correct_option === index

    if (isResolved) {
      if (isCorrect && isChosen) return 'border-emerald-500/50 text-emerald-300 font-semibold'
      if (isCorrect) return 'border-emerald-500/30 text-emerald-400'
      if (isChosen) return 'border-red-500/30 text-red-400 line-through'
      return 'border-[#1e2438] text-[#4a5568]'
    }
    if (isChosen) return 'border-indigo-500/50 text-indigo-300 font-semibold'
    if (!canPredict) return 'border-[#1e2438] text-[#4a5568] cursor-default'
    return 'border-[#1e2438] text-[#8892aa] hover:border-indigo-500/40 hover:text-white active:scale-[0.98] cursor-pointer'
  }

  return (
    <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-2xl overflow-hidden">
      {/* Top accent bar */}
      <div className={`h-0.5 w-full bg-gradient-to-r ${league.gradient}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${league.bg} ${league.border} ${league.text}`}>
              {league.icon} {league.label}
            </span>
            {isHot && !isResolved && (
              <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">
                <Flame className="w-3 h-3" /> HOT
              </span>
            )}
            {isResolved && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">
                Resolved
              </span>
            )}
            {wonPoints && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                ⚡ +10 pts
              </span>
            )}
          </div>
          <CountdownBadge
            deadline={question.deadline}
            onExpired={() => { setLocalExpired(true); onExpired?.(question.id) }}
          />
        </div>

        {/* Title */}
        <Link href={`/questions/${question.id}`} className="group flex items-start justify-between gap-2 mb-1">
          <h3 className="text-[15px] font-bold text-white leading-snug group-hover:text-indigo-300 transition-colors">
            {question.title}
          </h3>
          <ChevronRight className="w-4 h-4 text-[#2a3050] group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
        </Link>

        {/* Context snippet */}
        {question.context && (
          <p className="text-xs text-[#4a5568] leading-relaxed mb-3 line-clamp-2">
            {question.context}
          </p>
        )}

        {/* Options */}
        <div className="space-y-2 mt-3">
          {question.options.map((option, index) => {
            const count = distribution?.[index] ?? 0
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
            const isChosen = prediction?.chosen_option === index
            const isCorrect = question.correct_option === index
            const maxCount = totalVotes > 0 ? Math.max(...question.options.map((_, i) => distribution?.[i] ?? 0)) : 0
            const isLeading = totalVotes > 0 && count === maxCount && count > 0

            const fillColor = isResolved
              ? isCorrect ? 'bg-emerald-500' : isChosen ? 'bg-red-400' : 'bg-slate-600'
              : isChosen ? 'bg-indigo-500'
              : isLeading ? league.fill
              : 'bg-slate-700'

            return (
              <button
                key={index}
                onClick={() => handlePredict(index)}
                disabled={!canPredict || submitting}
                className={`relative overflow-hidden w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 bg-[#080b14] ${getOptionStyle(index)}`}
              >
                {totalVotes > 0 && (
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 opacity-[0.15] ${fillColor}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative z-10 flex-1 leading-snug font-medium">{option}</span>
                <span className="relative z-10 flex items-center gap-2 flex-shrink-0">
                  {totalVotes > 0 && (
                    <span className={`text-sm font-bold tabular-nums ${isLeading || isChosen ? 'opacity-100' : 'opacity-40'}`}>
                      {pct}%
                    </span>
                  )}
                  {isResolved && isCorrect && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                  {isResolved && isChosen && !isCorrect && <XCircle className="w-4 h-4 text-red-400" />}
                  {!isResolved && isChosen && <Zap className="w-4 h-4 text-indigo-400" />}
                </span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1a1f35]">
          <p className="text-xs text-[#4a5568]">
            {totalVotes > 0 ? `${totalVotes} ${totalVotes === 1 ? 'pick' : 'picks'} so far` : 'No picks yet'}
          </p>
          {canPredict && (
            <p className="text-xs font-semibold text-indigo-400">Tap to forecast →</p>
          )}
          {!user && !isExpired && (
            <p className="text-xs font-medium text-indigo-400">Sign in to predict →</p>
          )}
          {prediction && !isResolved && (
            <p className="text-xs text-[#4a5568]">Prediction locked in</p>
          )}
        </div>
      </div>
    </div>
  )
}
