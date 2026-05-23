'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Question, Prediction } from '@/lib/types'
import { useUser } from '@/context/UserContext'
import QuestionCard from '@/components/QuestionCard'
import UsernameModal from '@/components/UsernameModal'
import { isPast } from 'date-fns'
import { Flame, RefreshCw } from 'lucide-react'

type LeagueFilter = 'all' | 'ipl' | 'nba' | 'current_events'

const FILTER_TABS: { key: LeagueFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '🌐' },
  { key: 'ipl', label: 'IPL', icon: '🏏' },
  { key: 'nba', label: 'NBA', icon: '🏀' },
  { key: 'current_events', label: 'Current Affairs', icon: '📰' },
]

export default function HomePage() {
  const { user, loading: userLoading } = useUser()
  const [questions, setQuestions] = useState<Question[]>([])
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({})
  const [distribution, setDistribution] = useState<Record<string, Record<number, number>>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LeagueFilter>('all')

  useEffect(() => { fetchQuestions() }, [])
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
    setPredictions(prev => ({ ...prev, [prediction.question_id]: prediction }))
    setDistribution(prev => {
      const qDist = { ...(prev[prediction.question_id] ?? {}) }
      qDist[prediction.chosen_option] = (qDist[prediction.chosen_option] ?? 0) + 1
      return { ...prev, [prediction.question_id]: qDist }
    })
  }

  const handleExpired = (questionId: string) => {
    setQuestions(prev => prev.filter(q => q.id !== questionId))
  }

  const visibleQuestions = filter === 'all'
    ? questions
    : questions.filter(q => q.category === filter)

  const pendingCount = questions.filter(q => !predictions[q.id]).length

  return (
    <>
      {!userLoading && !user && <UsernameModal />}

      <main className="max-w-2xl mx-auto px-4 pt-4 pb-4">

        {/* User hero strip */}
        {user && (
          <div className="bg-gradient-to-r from-indigo-600/15 to-purple-600/15 border border-indigo-500/20 rounded-2xl p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold">@{user.username}</p>
              <p className="text-[#8892aa] text-xs mt-0.5">
                {pendingCount > 0
                  ? `${pendingCount} prediction${pendingCount > 1 ? 's' : ''} awaiting your call`
                  : '✓ All caught up!'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              <span className="text-lg">⚡</span>
              <div>
                <p className="text-amber-400 font-bold text-lg leading-none">{user.total_points}</p>
                <p className="text-amber-600 text-[10px]">pts</p>
              </div>
            </div>
          </div>
        )}

        {/* Filter tabs — horizontally scrollable */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-0.5 -mx-4 px-4">
          {FILTER_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full border transition-all whitespace-nowrap ${
                filter === key
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                  : 'bg-[#0c0f1d] border-[#1e2438] text-[#4a5568] hover:text-[#8892aa]'
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
            <span className="text-xs font-bold text-[#8892aa] uppercase tracking-wider">
              Prediction Deck
            </span>
            {!loading && (
              <span className="text-xs font-bold text-white bg-[#1e2438] px-2 py-0.5 rounded-full">
                {visibleQuestions.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchQuestions}
            className="p-1.5 rounded-lg text-[#4a5568] hover:text-[#8892aa] hover:bg-[#1e2438] transition-colors"
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
            <div className="w-16 h-16 rounded-2xl bg-[#0c0f1d] border border-[#1e2438] flex items-center justify-center mb-4 text-2xl">
              🏏
            </div>
            <p className="text-[#8892aa] font-medium">No open questions right now</p>
            <p className="text-[#4a5568] text-sm mt-1">Check back soon for new predictions</p>
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
