'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Question, Prediction } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { ArrowLeft, Users, CheckCircle, XCircle, Zap, Trophy } from 'lucide-react'

const LEAGUE_CONFIG = {
  ipl: {
    label: 'IPL 2026',
    gradient: 'from-orange-500 to-yellow-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    text: 'text-orange-400',
    bar: 'bg-orange-400',
  },
  nba: {
    label: 'NBA',
    gradient: 'from-red-500 to-orange-600',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    bar: 'bg-red-400',
  },
  current_events: {
    label: 'World',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    bar: 'bg-blue-400',
  },
}

function LiveCountdown({ deadline }: { deadline: string }) {
  const { hours, minutes, seconds, isExpired, urgency } = useCountdown(deadline)
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(hours / 24)
  const h = hours % 24

  if (isExpired) return <span className="text-[#4a5568] font-mono font-bold text-2xl">Closed</span>

  const colorClass = urgency === 'critical' ? 'text-red-400' : urgency === 'soon' ? 'text-amber-400' : 'text-emerald-400'
  const display = days >= 1 ? `${days}d ${h}h remaining` : `${pad(h)}:${pad(minutes)}:${pad(seconds)}`

  return (
    <span className={`font-mono font-bold text-2xl ${colorClass}`}>{display}</span>
  )
}

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()

  const [question, setQuestion] = useState<Question | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [distribution, setDistribution] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('questions').select('*').eq('id', id).single(),
      supabase.from('predictions').select('question_id, chosen_option').eq('question_id', id),
    ]).then(([{ data: q }, { data: preds }]) => {
      if (q) setQuestion(q)
      if (preds) {
        const dist: Record<number, number> = {}
        preds.forEach(p => { dist[p.chosen_option] = (dist[p.chosen_option] ?? 0) + 1 })
        setDistribution(dist)
      }
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (!user || !id) return
    supabase.from('predictions').select('*').eq('question_id', id).eq('user_id', user.id).single()
      .then(({ data }) => { if (data) setPrediction(data) })
  }, [user, id])

  const handlePredict = async (optionIndex: number) => {
    if (!user || prediction || submitting || !question || question.status !== 'open') return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('predictions')
      .insert({ user_id: user.id, question_id: question.id, chosen_option: optionIndex })
      .select().single()
    if (!error && data) {
      setPrediction(data)
      setDistribution(prev => ({
        ...prev,
        [optionIndex]: (prev[optionIndex] ?? 0) + 1,
      }))
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 pt-4">
        <div className="h-8 w-24 rounded-lg skeleton mb-6" />
        <div className="h-64 rounded-2xl skeleton" />
      </main>
    )
  }

  if (!question) {
    return (
      <main className="max-w-2xl mx-auto px-4 pt-16 text-center">
        <p className="text-[#8892aa]">Question not found.</p>
        <button onClick={() => router.push('/')} className="mt-4 text-indigo-400 text-sm">← Back to home</button>
      </main>
    )
  }

  const league = LEAGUE_CONFIG[question.category as keyof typeof LEAGUE_CONFIG] ?? LEAGUE_CONFIG.current_events
  const isResolved = question.status === 'resolved'
  const totalVotes = Object.values(distribution).reduce((a, b) => a + b, 0)
  const maxCount = totalVotes > 0 ? Math.max(...question.options.map((_, i) => distribution[i] ?? 0)) : 0
  const canPredict = !!user && !prediction && question.status === 'open'

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-[#4a5568] hover:text-white transition-colors text-sm mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Card */}
      <div className="bg-[#0f1320] border border-[#1e2438] rounded-2xl overflow-hidden">
        <div className={`h-1.5 w-full bg-gradient-to-r ${league.gradient}`} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${league.bg} ${league.border} ${league.text}`}>
              {league.label}
            </span>
            {isResolved ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">Resolved</span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">Open</span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-white leading-snug mb-5">{question.title}</h1>

          {/* Countdown */}
          {!isResolved && (
            <div className="bg-[#080b14] rounded-xl p-4 mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider mb-1">Closes in</p>
                <LiveCountdown deadline={question.deadline} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider mb-1">Participants</p>
                <div className="flex items-center gap-1.5 justify-end">
                  <Users className="w-4 h-4 text-[#8892aa]" />
                  <span className="text-lg font-bold text-white">{totalVotes}</span>
                </div>
              </div>
            </div>
          )}

          {/* Public Opinion */}
          <div className="mb-6">
            <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider mb-3">
              Public Opinion {totalVotes > 0 && `· ${totalVotes} picks`}
            </p>
            <div className="space-y-3">
              {question.options.map((option, index) => {
                const count = distribution[index] ?? 0
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                const isLeading = totalVotes > 0 && count === maxCount && count > 0
                const isChosen = prediction?.chosen_option === index
                const isCorrect = question.correct_option === index

                const barColor = isResolved
                  ? isCorrect ? 'bg-emerald-500' : 'bg-[#2a3050]'
                  : isChosen ? 'bg-indigo-500'
                  : isLeading ? league.bar
                  : 'bg-[#2a3050]'

                const textColor = isResolved && isCorrect ? 'text-emerald-300' :
                  isChosen ? 'text-indigo-300' :
                  isLeading ? 'text-white' : 'text-[#8892aa]'

                return (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${textColor}`}>{option}</span>
                        {isChosen && <Zap className="w-3.5 h-3.5 text-indigo-400" />}
                        {isResolved && isCorrect && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                        {isLeading && !isResolved && (
                          <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Leading</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#4a5568]">{count} {count === 1 ? 'pick' : 'picks'}</span>
                        <span className={`text-base font-bold tabular-nums w-12 text-right ${isLeading || isChosen ? 'text-white' : 'text-[#4a5568]'}`}>
                          {totalVotes > 0 ? `${pct}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-[#1a1f35] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: totalVotes > 0 ? `${pct}%` : '0%' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Prediction section */}
          {isResolved ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-400">Correct answer</p>
              </div>
              <p className="text-white font-semibold">
                {question.correct_option !== null && question.options[question.correct_option!]}
              </p>
              {prediction && (
                <p className={`text-xs mt-2 font-medium ${prediction.chosen_option === question.correct_option ? 'text-emerald-400' : 'text-red-400'}`}>
                  {prediction.chosen_option === question.correct_option ? '✓ You got this right! +10 pts' : `✗ You picked: ${question.options[prediction.chosen_option]}`}
                </p>
              )}
            </div>
          ) : prediction ? (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider mb-1">Your pick</p>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <p className="text-white font-semibold">{question.options[prediction.chosen_option]}</p>
              </div>
            </div>
          ) : canPredict ? (
            <div>
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider mb-3">Make your pick</p>
              <div className="space-y-2">
                {question.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handlePredict(index)}
                    disabled={submitting}
                    className="w-full text-left px-4 py-3.5 rounded-xl border border-[#1e2438] bg-[#080b14] text-[#8892aa] hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-white transition-all text-sm font-medium disabled:opacity-40"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : !user ? (
            <p className="text-center text-sm text-indigo-400 font-medium py-3">Sign in to make a prediction</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
