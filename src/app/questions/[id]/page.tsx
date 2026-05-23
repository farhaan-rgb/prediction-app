'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Question, Prediction } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import { useCountdown } from '@/hooks/useCountdown'
import { ArrowLeft, Users, CheckCircle, XCircle, Zap, Trophy } from 'lucide-react'

const TYPE_CONFIG = {
  match_winner:     { label: 'Match Prediction', icon: '🏆' },
  top_scorer:       { label: 'Top Scorer',        icon: '🏏' },
  top_bowler:       { label: 'Top Bowler',         icon: '🎯' },
  team_total:       { label: 'Team Total',         icon: '📊' },
  player_milestone: { label: 'Player Milestone',   icon: '⭐' },
  toss:             { label: 'Toss',               icon: '🪙' },
  outcome:          { label: 'Outcome',            icon: '🎯' },
  policy:           { label: 'Policy',             icon: '⚖️' },
  market:           { label: 'Market',             icon: '📈' },
  market_direction: { label: 'Market Direction',   icon: '📊' },
  price_level:      { label: 'Price Level',        icon: '💹' },
  sector_call:      { label: 'Sector Call',        icon: '🏭' },
  price_direction:  { label: 'Price Direction',    icon: '₿' },
  regulation:       { label: 'Regulation',         icon: '⚖️' },
  box_office:       { label: 'Box Office',         icon: '🎬' },
  hit_or_flop:      { label: 'Hit or Flop',        icon: '🎭' },
}

const LEAGUE_CONFIG = {
  ipl: { label: 'IPL 2026', gradient: 'from-orange-500 to-amber-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  nba: { label: 'NBA', gradient: 'from-red-500 to-orange-600', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  current_events: { label: 'Current Affairs', gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
  stocks:         { label: 'Stocks',          gradient: 'from-emerald-500 to-green-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  crypto:         { label: 'Crypto',          gradient: 'from-yellow-500 to-amber-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  text: 'text-yellow-400' },
  movies:         { label: 'Box Office',      gradient: 'from-pink-500 to-rose-500',     bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    text: 'text-pink-400' },
}

// One distinct color per option — consistent across chart + table
const OPTION_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e']

const INTERVALS = 12
const INTERVAL_MS = 30 * 60 * 1000

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

interface ChartProps {
  history: number[][]
  options: string[]
  totalVotes: number
}

function MultiLineChart({ history, options, totalVotes }: ChartProps) {
  const W = 420
  const H = 180
  const PAD = { top: 12, right: 52, bottom: 32, left: 12 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom

  if (totalVotes === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[#2a3050] text-sm">
        Waiting for picks…
      </div>
    )
  }

  const allVals = history.flat().filter(v => v > 0)
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 10
  const yMax = Math.min(100, Math.ceil((maxVal + 12) / 10) * 10)

  const sx = (i: number) => PAD.left + (i / (history.length - 1)) * cW
  const sy = (v: number) => PAD.top + cH - (v / yMax) * cH

  // Y-axis grid: pick a round step
  const gridStep = yMax <= 30 ? 10 : yMax <= 60 ? 20 : 25
  const gridLines = Array.from(
    { length: Math.floor(yMax / gridStep) + 1 },
    (_, i) => i * gridStep
  ).filter(v => v <= yMax)

  // X-axis: 5 evenly spaced time labels
  const xLabelIdx = [0, 3, 6, 9, 12]
  const now = Date.now()
  const xLabels = xLabelIdx.map(i => ({
    i,
    label: new Date(now - (INTERVALS - i) * INTERVAL_MS).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
    }),
  }))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
      {/* Horizontal grid lines */}
      {gridLines.map(v => (
        <g key={v}>
          <line
            x1={PAD.left} y1={sy(v)}
            x2={W - PAD.right} y2={sy(v)}
            stroke="#1e2438" strokeWidth="1" strokeDasharray="3 3"
          />
          <text x={W - PAD.right + 5} y={sy(v) + 4} fontSize="9" fill="#4a5568">
            {v}%
          </text>
        </g>
      ))}

      {/* Lines — rendered back-to-front so leading line is on top */}
      {[...options].reverse().map((_, ri) => {
        const oi = options.length - 1 - ri
        const color = OPTION_COLORS[oi] ?? '#475569'
        const pts = history.map((h, ti) => ({ x: sx(ti), y: sy(h[oi]) }))
        const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const currentY = pts[pts.length - 1].y
        const currentVal = history[history.length - 1][oi]

        return (
          <g key={oi}>
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            {/* Dot + value label at the current (rightmost) point */}
            <circle cx={sx(INTERVALS)} cy={currentY} r="3.5" fill={color} />
            <text
              x={W - PAD.right + 5}
              y={currentY + 4}
              fontSize="9"
              fill={color}
              fontWeight="bold"
            >
              {currentVal}%
            </text>
          </g>
        )
      })}

      {/* X-axis time labels */}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={sx(i)} y={H - 4} fontSize="9" fill="#4a5568" textAnchor="middle">
          {label}
        </text>
      ))}
    </svg>
  )
}

function LiveCountdown({ deadline }: { deadline: string }) {
  const { hours, minutes, seconds, isExpired, urgency } = useCountdown(deadline)
  const pad = (n: number) => String(n).padStart(2, '0')
  const days = Math.floor(hours / 24); const h = hours % 24
  if (isExpired) return <span className="text-[#4a5568] font-mono font-bold text-2xl">Closed</span>
  const c = urgency === 'critical' ? 'text-red-400' : urgency === 'soon' ? 'text-amber-400' : 'text-emerald-400'
  return <span className={`font-mono font-bold text-2xl ${c}`}>{days >= 1 ? `${days}d ${h}h` : `${pad(h)}:${pad(minutes)}:${pad(seconds)}`}</span>
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

  if (loading) return (
    <main className="max-w-2xl mx-auto px-4 pt-4">
      <div className="h-8 w-24 rounded-lg skeleton mb-6" />
      <div className="h-96 rounded-2xl skeleton" />
    </main>
  )

  if (!question) return (
    <main className="max-w-2xl mx-auto px-4 pt-16 text-center">
      <p className="text-[#8892aa]">Question not found.</p>
      <button onClick={() => router.push('/')} className="mt-4 text-indigo-400 text-sm">← Back</button>
    </main>
  )

  const league = LEAGUE_CONFIG[question.category as keyof typeof LEAGUE_CONFIG] ?? LEAGUE_CONFIG.current_events
  const typeConfig = question.question_type ? TYPE_CONFIG[question.question_type] : null
  const isResolved = question.status === 'resolved'
  const totalVotes = allPreds.length
  const canPredict = !!user && !prediction && question.status === 'open'
  const history = buildHistory(allPreds, question.options.length)
  const currentSnapshot = history[history.length - 1]
  const prevSnapshot = history[history.length - 2]

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-[#4a5568] hover:text-white transition-colors text-sm mb-5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-2xl overflow-hidden">
        <div className={`h-1 w-full bg-gradient-to-r ${league.gradient}`} />

        <div className="p-5">
          {/* Header badges */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${league.bg} ${league.border} ${league.text}`}>{league.label}</span>
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

          {/* Countdown / participants */}
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

          {/* ── Public Opinion ── */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider">Public Opinion</p>
              {totalVotes > 0 && <p className="text-[10px] text-[#2a3050]">Last 6 hours · IST</p>}
            </div>

            {/* Legend */}
            {totalVotes > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
                {question.options.map((option, oi) => {
                  const pct = currentSnapshot[oi] ?? 0
                  const color = OPTION_COLORS[oi] ?? '#475569'
                  return (
                    <div key={oi} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-xs text-[#8892aa] truncate max-w-[120px]">{option}</span>
                      <span className="text-xs font-bold text-white">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Shared multi-line chart */}
            <div className="bg-[#080b14] rounded-xl px-3 pt-3 pb-1 mb-4">
              <MultiLineChart history={history} options={question.options} totalVotes={totalVotes} />
            </div>

            {/* Options table — Kalshi style */}
            <div className="bg-[#080b14] rounded-xl overflow-hidden">
              {question.options.map((option, oi) => {
                const count = allPreds.filter(p => p.chosen_option === oi).length
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                const delta = totalVotes >= 5 ? pct - (prevSnapshot[oi] ?? 0) : null
                const color = OPTION_COLORS[oi] ?? '#475569'
                const isChosen = prediction?.chosen_option === oi
                const isCorrect = isResolved && question.correct_option === oi
                const isWrong = isResolved && isChosen && !isCorrect

                return (
                  <div
                    key={oi}
                    className={`flex items-center gap-3 px-4 py-3.5 border-b border-[#1a1f35] last:border-0 ${
                      isCorrect ? 'bg-emerald-500/5' : isChosen && !isResolved ? 'bg-indigo-500/5' : ''
                    }`}
                  >
                    {/* Color dot */}
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />

                    {/* Option name */}
                    <span className={`flex-1 text-sm font-medium truncate ${
                      isCorrect ? 'text-emerald-300' : isChosen ? 'text-indigo-300' : 'text-white'
                    }`}>
                      {option}
                    </span>

                    {/* % + delta */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-base font-black tabular-nums text-white">
                        {totalVotes > 0 ? `${pct}%` : '—'}
                      </span>
                      {delta !== null && delta !== 0 && (
                        <span className={`text-xs font-bold w-8 text-right ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                        </span>
                      )}
                      {(delta === null || delta === 0) && (
                        <span className="w-8" />
                      )}
                    </div>

                    {/* Picks */}
                    <span className="text-xs text-[#4a5568] w-14 text-right flex-shrink-0">
                      {count} {count === 1 ? 'pick' : 'picks'}
                    </span>

                    {/* Status icons */}
                    {isCorrect && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    {isWrong && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    {isChosen && !isResolved && <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
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
                {question.options.map((option, oi) => (
                  <button
                    key={oi}
                    onClick={() => handlePredict(oi)}
                    disabled={submitting}
                    className="w-full text-left px-4 py-3.5 rounded-xl border border-[#1e2438] bg-[#080b14] text-[#8892aa] hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-white transition-all text-sm font-medium disabled:opacity-40 flex items-center gap-3"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: OPTION_COLORS[oi] ?? '#475569' }} />
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ) : !user ? (
            <p className="text-center text-sm text-indigo-400 font-medium py-3 mb-5">Sign in to make a prediction</p>
          ) : null}

          {/* Context — bottom */}
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
