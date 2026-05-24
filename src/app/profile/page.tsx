'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PredictionWithQuestion } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import UsernameModal from '@/components/UsernameModal'
import { CheckCircle, XCircle, HelpCircle, LogOut, Snowflake } from 'lucide-react'
import { format, subDays, startOfDay, isSameDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

const AVATARS = ['⚡', '🦊', '🔥', '🧠', '🐉', '🦄', '🎯', '🏆', '🦅', '🎪']
const AVATAR_KEY = 'profile_avatar'
const TZ = 'Asia/Kolkata'

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

const LEVEL_THRESHOLDS = [0, 5, 10, 20, 40, 80, 160, 320, Infinity]
const LEVEL_LABELS = ['', 'Rookie', 'Prospect', 'Analyst', 'Forecaster', 'Expert', 'Master', 'Oracle', 'Legend']
const LEVEL_COLORS = [
  '', 'text-slate-400', 'text-blue-400', 'text-cyan-400', 'text-teal-400',
  'text-emerald-400', 'text-violet-400', 'text-amber-400', 'text-orange-400',
]

function getTitle(accuracy: number, predictions: number) {
  if (predictions < 3) return 'New Forecaster'
  if (accuracy >= 80) return 'Oracle Forecaster'
  if (accuracy >= 70) return 'Prediction Pro'
  if (accuracy >= 60) return 'Odds Analyst'
  if (accuracy >= 50) return 'Getting Sharp'
  return 'Learning the Ropes'
}

function computeWinStreak(items: PredictionWithQuestion[]) {
  const resolved = items
    .filter(i => i.questions?.status === 'resolved')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  let streak = 0
  for (const item of resolved) {
    if (item.chosen_option === item.questions?.correct_option) streak++
    else break
  }
  return streak
}

function computeDailyStreak(items: PredictionWithQuestion[]): number {
  const activeDates = new Set(
    items.map(p => startOfDay(toZonedTime(new Date(p.created_at), TZ)).getTime())
  )
  const now = toZonedTime(new Date(), TZ)
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const day = startOfDay(subDays(now, i))
    if (activeDates.has(day.getTime())) {
      streak++
    } else if (i === 0) {
      // Today has no predictions yet — don't break, check yesterday
      continue
    } else {
      break
    }
  }
  return streak
}

function StreakCalendar({ items }: { items: PredictionWithQuestion[] }) {
  const DAYS = 21
  const now = toZonedTime(new Date(), TZ)

  const activeDates = new Set(
    items.map(p => startOfDay(toZonedTime(new Date(p.created_at), TZ)).getTime())
  )

  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = startOfDay(subDays(now, DAYS - 1 - i))
    const isToday = isSameDay(date, now)
    const hasActivity = activeDates.has(date.getTime())
    return { date, isToday, hasActivity }
  })

  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {days.map(({ date, isToday, hasActivity }, i) => (
          <div key={i} className="relative flex flex-col items-center gap-0.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all ${
              hasActivity
                ? isToday
                  ? 'bg-orange-500 text-white ring-2 ring-orange-400 ring-offset-1 ring-offset-[#0c0f1d]'
                  : 'bg-orange-500/80 text-white'
                : isToday
                  ? 'bg-[#1e2438] text-[#4a5568] ring-2 ring-[#2a3050] ring-offset-1 ring-offset-[#0c0f1d]'
                  : 'bg-[#1e2438] text-[#2a3050]'
            }`}>
              {format(date, 'd')}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-orange-500" />
          <span className="text-[10px] text-[#4a5568]">Active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#1e2438]" />
          <span className="text-[10px] text-[#4a5568]">Missed</span>
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, setUser } = useUser()
  const [items, setItems] = useState<PredictionWithQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [avatar, setAvatar] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem(AVATAR_KEY) ?? '⚡') : '⚡'
  )
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [usingFreeze, setUsingFreeze] = useState(false)
  const [buyingFreeze, setBuyingFreeze] = useState(false)

  const FREEZE_COST = 50

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase
      .from('predictions')
      .select('*, questions(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (data) setItems(data as PredictionWithQuestion[])
        setLoading(false)
      })
  }, [user])

  const handleAvatarSelect = (emoji: string) => {
    setAvatar(emoji)
    localStorage.setItem(AVATAR_KEY, emoji)
    setShowAvatarPicker(false)
  }

  const handleUseFreeze = async () => {
    if (!user || (user.streak_freezes ?? 0) <= 0) return
    setUsingFreeze(true)
    const newFreezes = (user.streak_freezes ?? 1) - 1
    await supabase.from('users').update({ streak_freezes: newFreezes }).eq('id', user.id)
    setUser({ ...user, streak_freezes: newFreezes })
    setUsingFreeze(false)
  }

  const handleBuyFreeze = async () => {
    if (!user || (user.chips ?? 0) < FREEZE_COST) return
    setBuyingFreeze(true)
    const newChips = (user.chips ?? 0) - FREEZE_COST
    const newFreezes = (user.streak_freezes ?? 0) + 1
    await supabase.from('users').update({ chips: newChips, streak_freezes: newFreezes }).eq('id', user.id)
    setUser({ ...user, chips: newChips, streak_freezes: newFreezes })
    setBuyingFreeze(false)
  }

  if (!user) return (
    <>
      <UsernameModal />
      <main className="max-w-2xl mx-auto px-4 pt-4" />
    </>
  )

  const totalPredictions = user.total_predictions ?? 0
  const correctPredictions = user.correct_predictions ?? 0
  const resolvedCount = items.filter(i => i.questions?.status === 'resolved').length
  const accuracy = resolvedCount > 0 ? Math.round((correctPredictions / resolvedCount) * 100) : 0
  const level = getLevel(totalPredictions)
  const levelStart = LEVEL_THRESHOLDS[level - 1]
  const levelEnd = LEVEL_THRESHOLDS[level]
  const xpProgress = levelEnd === Infinity ? 100 : Math.round(((totalPredictions - levelStart) / (levelEnd - levelStart)) * 100)
  const winStreak = computeWinStreak(items)
  const dailyStreak = computeDailyStreak(items)
  const freezes = user.streak_freezes ?? 0
  const chips = user.chips ?? 0

  // Streak at risk = no prediction today, last was yesterday or earlier
  const now = toZonedTime(new Date(), TZ)
  const todayHasPrediction = items.some(p =>
    isSameDay(toZonedTime(new Date(p.created_at), TZ), now)
  )
  const streakAtRisk = !todayHasPrediction && dailyStreak > 0 && freezes > 0

  return (
    <main className="max-w-2xl mx-auto px-4 pt-4 pb-6">

      {/* Profile header */}
      <div className="bg-gradient-to-br from-indigo-600/15 to-purple-600/10 border border-indigo-500/20 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-4">
          {/* Avatar — tap to toggle picker */}
          <button
            onClick={() => setShowAvatarPicker(v => !v)}
            className="relative w-16 h-16 rounded-2xl bg-[#0c0f1d] border border-[#1e2438] flex items-center justify-center text-3xl flex-shrink-0 hover:border-indigo-500/40 transition-colors group"
          >
            {avatar}
            <span className="absolute -bottom-1 -right-1 text-[10px] bg-indigo-600 rounded-full w-4 h-4 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white">@{user.username}</h1>
            <p className="text-sm text-[#8892aa] mt-0.5">{getTitle(accuracy, totalPredictions)}</p>
            <div className={`inline-flex items-center gap-1 mt-1 text-xs font-bold ${LEVEL_COLORS[level]}`}>
              <span>LVL {level}</span>
              <span className="text-[#4a5568]">·</span>
              <span>{LEVEL_LABELS[level]}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl flex-shrink-0">
            <span className="text-lg">⚡</span>
            <div>
              <p className="text-amber-400 font-bold text-lg leading-none">{user.total_points ?? 0}</p>
              <p className="text-amber-600 text-[10px]">pts</p>
            </div>
          </div>
        </div>

        {/* Avatar picker — only when open */}
        {showAvatarPicker && (
          <div className="mt-4 pt-4 border-t border-indigo-500/20">
            <p className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider mb-2">Choose Avatar</p>
            <div className="flex gap-2 flex-wrap">
              {AVATARS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleAvatarSelect(emoji)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                    avatar === emoji
                      ? 'bg-indigo-600 border-2 border-indigo-400 scale-110'
                      : 'bg-[#0c0f1d] border border-[#1e2438] hover:border-indigo-500/40 hover:scale-105'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Daily streak card */}
      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <div>
              <p className="text-xs font-bold text-[#4a5568] uppercase tracking-wider">Daily Streak</p>
              <p className="text-2xl font-black text-orange-400 leading-none">{dailyStreak} <span className="text-sm font-semibold text-[#4a5568]">{dailyStreak === 1 ? 'day' : 'days'}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-lg">
              <Snowflake className="w-3 h-3 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400">{freezes}</span>
            </div>
            {streakAtRisk && freezes > 0 && (
              <button
                onClick={handleUseFreeze}
                disabled={usingFreeze}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
              >
                {usingFreeze ? '...' : '❄️ Use Freeze'}
              </button>
            )}
          </div>
        </div>
        {!loading && items.length === 0 ? (
          <div className="py-3 text-center">
            <p className="text-sm font-semibold text-[#8892aa]">No streak yet.</p>
            <p className="text-xs text-[#4a5568] mt-1">Make your first prediction today to start one.</p>
            <a href="/" className="inline-block mt-3 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
              Go predict →
            </a>
          </div>
        ) : (
          !loading && <StreakCalendar items={items} />
        )}
        {streakAtRisk && (
          <p className="text-[11px] text-amber-400 mt-2">⚠️ Predict today to keep your streak alive!</p>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#1e2438]">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🎰</span>
            <span className="text-sm font-bold text-white">{chips} chips</span>
          </div>
          <button
            onClick={handleBuyFreeze}
            disabled={buyingFreeze || chips < FREEZE_COST}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              chips >= FREEZE_COST
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
                : 'bg-[#1e2438] border-[#2a3050] text-[#4a5568] cursor-not-allowed'
            }`}
          >
            <Snowflake className="w-3 h-3" />
            {buyingFreeze ? 'Buying...' : `Buy Freeze — ${FREEZE_COST} 🎰`}
          </button>
        </div>
      </div>

      {/* XP progress */}
      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-bold ${LEVEL_COLORS[level]}`}>Level {level} — {LEVEL_LABELS[level]}</span>
          {levelEnd !== Infinity
            ? <span className="text-xs text-[#4a5568]">{totalPredictions - levelStart} / {levelEnd - levelStart} XP</span>
            : <span className="text-xs text-amber-400">Max Level</span>
          }
        </div>
        <div className="w-full h-2 bg-[#1e2438] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-700"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
        {levelEnd !== Infinity && (
          <p className="text-[10px] text-[#4a5568] mt-1.5">
            {levelEnd - totalPredictions} more predictions to Level {level + 1} — {LEVEL_LABELS[level + 1]}
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🏆</span>
            <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Win Streak</span>
          </div>
          <p className="text-2xl font-black text-amber-400">{winStreak} <span className="text-sm font-semibold text-[#4a5568]">{winStreak === 1 ? 'win' : 'wins'}</span></p>
        </div>
        <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🎯</span>
            <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Predictions</span>
          </div>
          <p className="text-2xl font-black text-white">{totalPredictions}</p>
        </div>
        <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">📊</span>
            <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Accuracy</span>
          </div>
          <p className={`text-2xl font-black ${accuracy >= 70 ? 'text-emerald-400' : accuracy >= 50 ? 'text-amber-400' : 'text-white'}`}>
            {resolvedCount > 0 ? `${accuracy}%` : '—'}
          </p>
        </div>
        <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🎰</span>
            <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-wider">Chips</span>
          </div>
          <p className="text-2xl font-black text-indigo-400">{chips}</p>
        </div>
      </div>

      {/* Prediction log */}
      <div className="bg-[#0c0f1d] border border-[#1e2438] rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-[#1e2438] flex items-center justify-between">
          <p className="text-sm font-bold text-white">Prediction Log</p>
          <span className="text-xs text-[#4a5568]">{items.length} total</span>
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg skeleton" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center px-6">
            <p className="text-2xl mb-2">🎯</p>
            <p className="text-sm font-semibold text-[#8892aa]">No predictions yet</p>
            <p className="text-xs text-[#4a5568] mt-1 leading-relaxed">
              Every pick you make shows up here — wins, losses, and everything in between.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-full hover:bg-indigo-500/20 transition-colors"
            >
              Make your first pick →
            </a>
          </div>
        ) : (
          <div className="divide-y divide-[#1e2438]">
            {items.slice(0, 10).map(item => {
              const q = item.questions
              if (!q) return null
              const isResolved = q.status === 'resolved'
              const isCorrect = isResolved && item.chosen_option === q.correct_option
              const isWrong = isResolved && !isCorrect

              return (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCorrect ? 'bg-emerald-500/15' : isWrong ? 'bg-red-500/15' : 'bg-[#1e2438]'
                  }`}>
                    {isCorrect
                      ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                      : isWrong
                      ? <XCircle className="w-4 h-4 text-red-400" />
                      : <HelpCircle className="w-4 h-4 text-[#4a5568]" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{q.title}</p>
                    <p className="text-[11px] text-[#4a5568] truncate mt-0.5">
                      Picked: {q.options[item.chosen_option]}
                      {isCorrect && <span className="text-emerald-400 ml-1">+10 pts</span>}
                      <span className="text-indigo-400 ml-1">+5 🎰</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-[#4a5568] flex-shrink-0">
                    {format(new Date(item.created_at), 'MMM d')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={() => { localStorage.removeItem('prediction_user_id'); window.location.reload() }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-semibold"
      >
        <LogOut className="w-4 h-4" />
        Sign out of @{user.username}
      </button>
    </main>
  )
}
