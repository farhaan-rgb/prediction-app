'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Question, Prediction } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { ArrowLeft, Users, CheckCircle, XCircle, Zap, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const TYPE_CONFIG = {
  match_winner:     { label: 'Match Prediction', icon: '🏆' },
  top_scorer:       { label: 'Top Scorer',        icon: '🏏' },
  top_bowler:       { label: 'Top Bowler',         icon: '🎯' },
  team_total:       { label: 'Team Total',         icon: '📊' },
  player_milestone: { label: 'Player Milestone',   icon: '⭐' },
  toss:             { label: 'Toss',               icon: '🪙' },
}

const LEAGUE_CONFIG = {
  ipl: {
    label: 'IPL 2026', gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400',
    bar: 'bg-orange-400', hex: '#f97316',
  },
  nba: {
    label: 'NBA', gradient: 'from-red-500 to-orange-600',
    bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400',
    bar: 'bg-red-400', hex: '#ef4444',
  },
  current_events: {
    label: 'World', gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400',
    bar: 'bg-blue-400', hex: '#3b82f6',
  },
}

const INTERVALS = 12
const INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

function buildHistory(
  allPreds: { chosen_option: number; created_at: string }[],
  optionCount: number
): number[][] {
  const now = Date.now()
  return Array.from({ length: INTERVALS + 1 }, (_, i) => {
    const cutoff = new Date(now - (INTERVALS - i) * INTERVAL_MS)
    const before = allPreds.filter(p => new Date(p.created_at) <= cutoff)
    const total = before.length
    if (total === 0) return Array(optionCount).fill(0)
    return Array.from({ length: optionCount }, (_, oi) =>
      Math.round((before.filter(p => p.chosen_option === oi).length / total) * 100)
    )
  })
}

// history[timePoint][optionIndex] → returns [optionIndex] timeseries
function optionHistory(history: number[][], optionIndex: number): number[] {
  return history.map(h => h[optionIndex])
}

function Sparkline({ data, hex, hasVotes }: { data: number[]; hex: string; hasVotes: boolean }) {
  if (!hasVotes) return null

  const W = 100
  const H = 36
  const allZero = data.every(d => d === 0)

  // Normalise to 0-100 scale (% values)
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: allZero ? H : H - (v / 100) * H,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const fillPath = `${linePath} L${W},${H} L0,${H} Z`

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <path d={fillPath} fill={hex} opacity="0.12" />
        <path d={linePath} fill="none" stroke={hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* dot at current (rightmost) point */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={hex} />
      </svg>
    </div>
  )
}

function LiveCountdown({ deadline }: { deadline: string }) {
  const { hours, minutes, seconds, isExpired, urgency } = useCountdown(deadline)
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(hours / 24)
  const h = hours % 24

  if (isExpired) return <span className="text-[#4a5568] font-mono font-bold text-2xl">Closed</span>

  const colorClass = urgency === 'critical' ? 'text-red-400' : urgency === 'soon' ? 'text-amber-400' : 'text-emerald-400'
  const display = days >= 1 ? `${days}d ${h}h remaining` : `${pad(h)}:${pad(minutes)}:${pad(seconds)}`
  return <span className={`font-mono font-bold text-2xl ${colorClass}`}>{display}</span>
}

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()

  const [question, setQuestion] = useState<Question | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [allPreds, setAllPreds] = useState<{ chosen_option: number; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('questions').select('*').eq('id', id).single(),
      supabase.from('predictions').select('chosen_option, created_at').eq('question_id', id),
    ]).then(([{ data: q }, { data: preds }]) => {
      if (q) setQuestion(q)
      if (preds) setAllPreds(preds)
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
      setAllPreds(prev => [...prev, { chosen_option: optionIndex, created_at: new Date().toISOString() }])
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
        <button onClick={() => router.push('/')} className="mt-4 text-indigo-400 text-sm">← Back</button>
      </main>
    )
  }

  const league = LEAGUE_CONFIG[question.category as keyof typeof LEAGUE_CONFIG] ?? LEAGUE_CONFIG.current_events
  const typeConfig = question.question_type ? TYPE_CONFIG[question.question_type] : null
  const isResolved = question.status === 'resolved'
  const totalVotes = allPreds.length
  const maxCount = totalVotes > 0 ? Math.max(...question.options.map((_, i) => allPreds.filter(p => p.chosen_option === i).length)) : 0
  const canPredict = !!user && !prediction && question.status === 'open'
  const history = buildHistory(allPreds, question.options.length)

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-[#4a5568] hover:text-white transition-colors text-sm mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-2xl overflow-hidden">
        <div className={`h-1 w-full bg-gradient-to-r ${league.gradient}`} />

        <div className="p-5">
          {/* Header badges */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${league.bg} ${league.border} ${league.text}`}>
              {league.label}
            </span>
            {typeConfig && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1a1f35] border border-[#2a3050] text-[#8892aa]">
                {typeConfig.icon} {typeConfig.label}
              </span>
            )}
            {isResolved
              ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400">Resolved</span>
              : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">Open</span>
            }
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-white leading-snug mb-5">{question.title}</h1>

          {/* Countdown / stats */}
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

          {/* Public Opinion with sparklines */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider">
                Public Opinion {totalVotes > 0 && `· ${totalVotes} picks`}
              </p>
              {totalVotes > 0 && (
                <p className="text-[10px] text-[#2a3050]">Last 6 hours</p>
              )}
            </div>

            <div className="space-y-3">
              {question.options.map((option, index) => {
                const count = allPreds.filter(p => p.chosen_option === index).length
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                const isChosen = prediction?.chosen_option === index
                const isCorrect = question.correct_option === index
                const isLeading = totalVotes > 0 && count === maxCount && count > 0

                const sparkData = optionHistory(history, index)
                // Delta: current vs 30 minutes ago (second-to-last interval)
                const prevPct = sparkData[sparkData.length - 2] ?? 0
                const delta = totalVotes >= 5 ? pct - prevPct : null

                const hex = isResolved
                  ? isCorrect ? '#10b981' : '#475569'
                  : isChosen ? '#6366f1'
                  : isLeading ? league.hex
                  : '#475569'

                const barColor = isResolved
                  ? isCorrect ? 'bg-emerald-500' : 'bg-[#2a3050]'
                  : isChosen ? 'bg-indigo-500'
                  : isLeading ? league.bar
                  : 'bg-[#2a3050]'

                const nameColor = isResolved && isCorrect ? 'text-emerald-300'
                  : isChosen ? 'text-indigo-300'
                  : isLeading ? 'text-white'
                  : 'text-[#8892aa]'

                return (
                  <div key={index} className="bg-[#080b14] border border-[#1a1f35] rounded-xl p-3.5">
                    {/* Top row: name + % + delta */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${nameColor}`}>{option}</span>
                        {isChosen && <Zap className="w-3.5 h-3.5 text-indigo-400" />}
                        {isResolved && isCorrect && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                        {isResolved && isChosen && !isCorrect && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        {isLeading && !isResolved && (
                          <span className="text-[9px] font-bold text-[#4a5568] uppercase tracking-wider">Leading</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-xl font-black tabular-nums ${isLeading || isChosen ? 'text-white' : 'text-[#4a5568]'}`}>
                          {totalVotes > 0 ? `${pct}%` : '—'}
                        </span>
                        {delta !== null && (
                          <span className={`flex items-center gap-0.5 text-xs font-bold ${
                            delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-[#4a5568]'
                          }`}>
                            {delta > 0 ? <TrendingUp className="w-3 h-3" /> : delta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {delta !== 0 && `${delta > 0 ? '+' : ''}${delta}%`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sparkline */}
                    <Sparkline data={sparkData} hex={hex} hasVotes={totalVotes > 0} />

                    {/* Time axis labels */}
                    {totalVotes > 0 && (
                      <div className="flex justify-between mt-0.5 mb-2.5">
                        <span className="text-[9px] text-[#2a3050]">6h ago</span>
                        <span className="text-[9px] text-[#2a3050]">now</span>
                      </div>
                    )}

                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-[#1a1f35] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: totalVotes > 0 ? `${pct}%` : '0%' }}
                      />
                    </div>

                    <p className="text-[11px] text-[#4a5568] mt-1.5">
                      {count} {count === 1 ? 'pick' : 'picks'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Prediction section */}
          {isResolved ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-400">Correct answer</p>
              </div>
              <p className="text-white font-semibold">
                {question.correct_option !== null && question.options[question.correct_option!]}
              </p>
              {prediction && (
                <p className={`text-xs mt-2 font-medium ${prediction.chosen_option === question.correct_option ? 'text-emerald-400' : 'text-red-400'}`}>
                  {prediction.chosen_option === question.correct_option
                    ? '✓ You got this right! +10 pts'
                    : `✗ You picked: ${question.options[prediction.chosen_option]}`}
                </p>
              )}
            </div>
          ) : prediction ? (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider mb-1">Your pick</p>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <p className="text-white font-semibold">{question.options[prediction.chosen_option]}</p>
              </div>
            </div>
          ) : canPredict ? (
            <div className="mb-5">
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
            <p className="text-center text-sm text-indigo-400 font-medium py-3 mb-5">Sign in to make a prediction</p>
          ) : null}

          {/* Context — moved to bottom */}
          {question.context && (
            <div className="bg-[#080b14] border border-[#1a1f35] rounded-xl p-4">
              <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider mb-2">
                {typeConfig ? `${typeConfig.icon} ${typeConfig.label} — Context` : '📋 Context'}
              </p>
              <p className="text-sm text-[#8892aa] leading-relaxed">{question.context}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
