'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Question, Prediction } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { CheckCircle, XCircle, Zap, ChevronRight } from 'lucide-react'

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
    gradient: 'from-orange-500 to-yellow-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    dot: 'bg-orange-400',
  },
  nba: {
    label: 'NBA',
    gradient: 'from-red-500 to-orange-600',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-400',
  },
  current_events: {
    label: 'World',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
  },
}

function CountdownBadge({ deadline, onExpired }: { deadline: string; onExpired?: () => void }) {
  const { hours, minutes, seconds, isExpired, urgency } = useCountdown(deadline)

  if (isExpired) {
    onExpired?.()
    return (
      <span className="text-xs font-semibold text-[#4a5568] flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4a5568]" />
        Closed
      </span>
    )
  }

  const colorClass =
    urgency === 'critical' ? 'text-red-400' :
    urgency === 'soon' ? 'text-amber-400' :
    'text-emerald-400'

  const dotClass =
    urgency === 'critical' ? 'bg-red-400' :
    urgency === 'soon' ? 'bg-amber-400' :
    'bg-emerald-400'

  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(hours / 24)
  const h = hours % 24

  const display = days >= 1
    ? `${days}d ${h}h`
    : `${pad(h)}:${pad(minutes)}:${pad(seconds)}`

  return (
    <span className={`text-xs font-bold font-mono flex items-center gap-1.5 ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass} ${urgency === 'critical' ? 'animate-pulse' : ''}`} />
      {display}
    </span>
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
      if (isCorrect && isChosen)
        return 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-semibold'
      if (isCorrect)
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      if (isChosen)
        return 'bg-red-500/10 border-red-500/30 text-red-400 line-through'
      return 'bg-[#080b14] border-[#1e2438] text-[#4a5568]'
    }

    if (isChosen)
      return 'bg-indigo-500/15 border-indigo-500/50 text-indigo-300 font-semibold'
    if (!canPredict)
      return 'bg-[#080b14] border-[#1e2438] text-[#4a5568] cursor-default'
    return 'bg-[#080b14] border-[#1e2438] text-[#8892aa] hover:border-indigo-500/40 hover:bg-indigo-500/5 hover:text-white active:scale-[0.98] cursor-pointer'
  }

  return (
    <div className="bg-[#0f1320] border border-[#1e2438] rounded-2xl overflow-hidden">
      {/* League accent bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${league.gradient}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${league.bg} ${league.border} ${league.text}`}>
              {league.label}
            </span>
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
            onExpired={() => {
              setLocalExpired(true)
              onExpired?.(question.id)
            }}
          />
        </div>

        {/* Question */}
        <Link href={`/questions/${question.id}`} className="group flex items-start justify-between gap-2 mb-4">
          <h3 className="text-base font-bold text-white leading-snug group-hover:text-indigo-300 transition-colors">{question.title}</h3>
          <ChevronRight className="w-4 h-4 text-[#2a3050] group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
        </Link>

        {/* Options */}
        <div className="space-y-2">
          {question.options.map((option, index) => {
            const count = distribution?.[index] ?? 0
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
            const isChosen = prediction?.chosen_option === index
            const isCorrect = question.correct_option === index
            const maxCount = totalVotes > 0 ? Math.max(...question.options.map((_, i) => distribution?.[i] ?? 0)) : 0
            const isLeading = totalVotes > 0 && count === maxCount && count > 0

            const fillColor = isResolved
              ? isCorrect ? 'bg-emerald-500' : isChosen ? 'bg-red-400' : 'bg-slate-500'
              : isChosen ? 'bg-indigo-500'
              : isLeading ? league.dot
              : 'bg-slate-600'

            return (
              <button
                key={index}
                onClick={() => handlePredict(index)}
                disabled={!canPredict || submitting}
                className={`relative overflow-hidden w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 ${getOptionStyle(index)}`}
              >
                {totalVotes > 0 && (
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 opacity-20 ${fillColor}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative z-10 flex-1 leading-snug font-medium">{option}</span>
                <span className="relative z-10 flex items-center gap-2 flex-shrink-0">
                  {totalVotes > 0 && (
                    <span className={`text-sm font-bold tabular-nums ${isLeading || isChosen ? 'opacity-100' : 'opacity-50'}`}>
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
        <div className="flex items-center justify-between mt-3">
          {totalVotes > 0 && (
            <p className="text-xs text-[#4a5568]">{totalVotes} {totalVotes === 1 ? 'pick' : 'picks'} so far</p>
          )}
          {canPredict && (
            <p className={`text-xs text-[#4a5568] ${totalVotes > 0 ? 'ml-auto' : 'w-full text-center'}`}>
              Tap an option to lock in your prediction
            </p>
          )}
          {!user && !isExpired && (
            <p className="text-xs text-indigo-400 font-medium w-full text-center">Sign in to predict</p>
          )}
        </div>
      </div>
    </div>
  )
}
