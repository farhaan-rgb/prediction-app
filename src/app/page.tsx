'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Question, Prediction } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import QuestionCard from '@/components/QuestionCard'
import UsernameModal from '@/components/UsernameModal'
import { isPast } from 'date-fns'
import { Flame, RefreshCw, Search, X, Zap } from 'lucide-react'

type LeagueFilter = 'all' | 'ipl' | 'nba' | 'current_events' | 'stocks' | 'crypto' | 'movies'

const FILTER_TABS: { key: LeagueFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '🌐' },
  { key: 'ipl', label: 'IPL', icon: '🏏' },
  { key: 'nba', label: 'NBA', icon: '🏀' },
  { key: 'stocks', label: 'Stocks', icon: '📈' },
  { key: 'crypto', label: 'Crypto', icon: '₿' },
  { key: 'movies', label: 'Movies', icon: '🎬' },
  { key: 'current_events', label: 'Current Affairs', icon: '📰' },
]

type BannerKey = 'chips_50' | 'streak_3'

function FirstPickModal({ username, onClose }: { username: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-[var(--c-card-alt)] border border-indigo-500/30 rounded-t-3xl sm:rounded-2xl px-8 pt-8 pb-10 overflow-hidden">
        <div className="w-10 h-1 bg-[var(--c-border-muted)] rounded-full mx-auto mb-6 sm:hidden" />

        {/* Glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative text-center mb-6">
          <div className="text-5xl mb-3">🎯</div>
          <h2 className="text-xl font-black text-white uppercase tracking-wide">First pick locked.</h2>
          <p className="text-sm text-[var(--c-secondary)] mt-1">You're officially in the game, @{username}.</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="flex flex-col items-center bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-5 py-3">
            <span className="text-2xl font-black text-indigo-400">+5</span>
            <span className="text-xs text-[var(--c-muted)] mt-0.5">🎰 chips</span>
          </div>
          <div className="text-[var(--c-border-muted)] text-lg">·</div>
          <div className="flex flex-col items-center bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3">
            <span className="text-2xl font-black text-amber-400">+2</span>
            <span className="text-xs text-[var(--c-muted)] mt-0.5">⚡ points</span>
          </div>
        </div>

        <div className="bg-[var(--c-base)] border border-[var(--c-border)] rounded-xl px-4 py-3.5 mb-6 text-center">
          <p className="text-xs text-[var(--c-secondary)] leading-relaxed">
            Come back <span className="text-white font-bold">tomorrow</span>. Predict daily, build your streak,
            and stack chips to unlock <span className="text-indigo-400 font-bold">exclusive markets</span>.
            The race to the top starts now.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base shadow-lg shadow-indigo-900/40"
        >
          <Zap className="w-4 h-4" />
          Let's go 🔥
        </button>
      </div>
    </div>
  )
}

function ContextualBanner({ bannerKey, onDismiss }: { bannerKey: BannerKey; onDismiss: () => void }) {
  const config = {
    chips_50: {
      icon: '🎰',
      text: '50 chips stacked. Exclusive markets are unlocking soon.',
      sub: 'Keep predicting to earn more.',
    },
    streak_3: {
      icon: '🔥',
      text: "3 picks in. Come back tomorrow to start a streak.",
      sub: 'Daily streaks compound your chips earnings.',
    },
  }[bannerKey]

  return (
    <div className="flex items-start gap-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-3 mb-3 animate-fade-up">
      <span className="text-lg flex-shrink-0 mt-0.5">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{config.text}</p>
        <p className="text-xs text-[var(--c-muted)] mt-0.5">{config.sub}</p>
      </div>
      <button onClick={onDismiss} className="text-[var(--c-muted)] hover:text-[var(--c-secondary)] flex-shrink-0 mt-0.5">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function HomePage() {
  const { user, loading: userLoading } = useUser()
  const [questions, setQuestions] = useState<Question[]>([])
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({})
  const [distribution, setDistribution] = useState<Record<string, Record<number, number>>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LeagueFilter>('all')
  const [search, setSearch] = useState('')
  const [showFirstPickModal, setShowFirstPickModal] = useState(false)
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(() =>
    typeof window !== 'undefined'
      ? new Set(['chips_50', 'streak_3'].filter(k => localStorage.getItem(`seen_banner_${k}`)))
      : new Set()
  )
  const isFirstPrediction = useRef(true)

  useEffect(() => { fetchQuestions() }, [])

  useEffect(() => {
    if (!loading && questions.length > 0) {
      const saved = sessionStorage.getItem('predictit_scroll')
      if (saved) {
        requestAnimationFrame(() => {
          window.scrollTo({ top: parseInt(saved), behavior: 'instant' })
          sessionStorage.removeItem('predictit_scroll')
        })
      }
    }
  }, [loading, questions.length])
  useEffect(() => {
    if (user) fetchUserPredictions()
    else setPredictions({})
  }, [user])

  const fetchQuestions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('status', 'open')
      .order('deadline', { ascending: true })
    if (data) {
      const open = data.filter(q => !isPast(new Date(q.deadline)))
      setQuestions(open)
      if (open.length > 0) fetchDistribution(open.map(q => q.id))
    }
    setLoading(false)
  }

  const fetchDistribution = async (ids: string[]) => {
    const { data } = await supabase
      .from('predictions')
      .select('question_id, chosen_option')
      .in('question_id', ids)
    if (data) {
      const dist: Record<string, Record<number, number>> = {}
      data.forEach(p => {
        if (!dist[p.question_id]) dist[p.question_id] = {}
        dist[p.question_id][p.chosen_option] = (dist[p.question_id][p.chosen_option] ?? 0) + 1
      })
      setDistribution(dist)
    }
  }

  const fetchUserPredictions = async () => {
    if (!user) return
    const { data } = await supabase.from('predictions').select('*').eq('user_id', user.id)
    if (data) {
      const map: Record<string, Prediction> = {}
      data.forEach(p => { map[p.question_id] = p })
      setPredictions(map)
    }
  }

  const handlePredicted = (prediction: Prediction) => {
    setPredictions(prev => {
      const updated = { ...prev, [prediction.question_id]: prediction }
      // First-ever prediction
      if (isFirstPrediction.current && Object.keys(prev).length === 0 && !localStorage.getItem('seen_first_pick')) {
        localStorage.setItem('seen_first_pick', '1')
        setShowFirstPickModal(true)
      }
      isFirstPrediction.current = false
      return updated
    })
    setDistribution(prev => {
      const qDist = { ...(prev[prediction.question_id] ?? {}) }
      qDist[prediction.chosen_option] = (qDist[prediction.chosen_option] ?? 0) + 1
      return { ...prev, [prediction.question_id]: qDist }
    })
  }

  const handleExpired = (questionId: string) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  // Once existing predictions load, the next prediction is no longer "first"
  useEffect(() => {
    if (Object.keys(predictions).length > 0) isFirstPrediction.current = false
  }, [predictions])

  const dismissBanner = (key: string) => {
    localStorage.setItem(`seen_banner_${key}`, '1')
    setDismissedBanners(prev => new Set([...prev, key]))
  }

  const activeBanner = useMemo((): BannerKey | null => {
    if (!user) return null
    if ((user.chips ?? 0) >= 50 && !dismissedBanners.has('chips_50')) return 'chips_50'
    if (Object.keys(predictions).length >= 3 && !dismissedBanners.has('streak_3')) return 'streak_3'
    return null
  }, [user, predictions, dismissedBanners])

  const searchTerm = search.trim().toLowerCase()
  const visibleQuestions = questions
    .filter(q => !user || !predictions[q.id])
    .filter(q => filter === 'all' || q.category === filter)
    .filter(q => !searchTerm || q.title.toLowerCase().includes(searchTerm))

  return (
    <>
      {!userLoading && !user && <UsernameModal />}
      {showFirstPickModal && user && (
        <FirstPickModal username={user.username} onClose={() => setShowFirstPickModal(false)} />
      )}

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-4">

        {/* Contextual banner — one at a time */}
        {activeBanner && (
          <ContextualBanner bannerKey={activeBanner} onDismiss={() => dismissBanner(activeBanner)} />
        )}

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="w-full bg-[var(--c-card)] border border-[var(--c-border)] rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-[var(--c-muted)] focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-muted)] hover:text-[var(--c-secondary)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter tabs — horizontally scrollable */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-0.5 -mx-4 px-4">
          {FILTER_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full border transition-all whitespace-nowrap ${
                filter === key
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                  : 'bg-[var(--c-card)] border-[var(--c-border)] text-[var(--c-muted)] hover:text-[var(--c-secondary)]'
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Deck header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold text-[var(--c-secondary)] uppercase tracking-wider">
              Prediction Deck
            </span>
            {!loading && (
              <span className="text-xs font-bold text-white bg-[var(--c-border)] px-2 py-0.5 rounded-full">
                {visibleQuestions.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchQuestions}
            className="p-1.5 rounded-lg text-[var(--c-muted)] hover:text-[var(--c-secondary)] hover:bg-[var(--c-border)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Questions */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-56 rounded-2xl skeleton" />)}
          </div>
        ) : visibleQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--c-card)] border border-[var(--c-border)] flex items-center justify-center mb-4 text-2xl">
              {searchTerm ? '🔍' : user && Object.keys(predictions).length > 0 ? '✅' : '🏏'}
            </div>
            <p className="text-[var(--c-secondary)] font-medium">
              {searchTerm
                ? `No questions matching "${search}"`
                : user && Object.keys(predictions).length > 0
                ? "You're all caught up!"
                : 'No open questions right now'}
            </p>
            <p className="text-[var(--c-muted)] text-sm mt-1">
              {searchTerm
                ? 'Try a different keyword or clear the search'
                : user && Object.keys(predictions).length > 0
                ? 'New questions drop daily — check back tomorrow'
                : 'Check back soon for new predictions'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleQuestions.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                prediction={predictions[q.id]}
                onPredicted={handlePredicted}
                onExpired={handleExpired}
                distribution={distribution[q.id]}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
