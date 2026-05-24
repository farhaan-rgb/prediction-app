'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Question } from '@/lib/types'
import { PlusCircle, CheckCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { formatDistanceToNow, isPast } from 'date-fns'

const ADMIN_PASS = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123'

type Category = 'ipl' | 'nba' | 'current_events'

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('ipl')
  const [options, setOptions] = useState(['', '', '', ''])
  const [deadline, setDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    if (authed) fetchQuestions()
  }, [authed])

  const fetchQuestions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('questions')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setQuestions(data)
    setLoading(false)
  }

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === ADMIN_PASS) setAuthed(true)
    else setAuthError('Incorrect password')
  }

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    const filledOptions = options.filter(o => o.trim())
    if (!title.trim()) return setFormError('Title is required')
    if (filledOptions.length < 2) return setFormError('At least 2 options required')
    if (!deadline) return setFormError('Deadline is required')
    if (new Date(deadline) <= new Date()) return setFormError('Deadline must be in the future')
    setSubmitting(true)
    const { error } = await supabase.from('questions').insert({
      title: title.trim(),
      category,
      options: filledOptions,
      deadline: new Date(deadline).toISOString(),
      status: 'open',
    })
    setSubmitting(false)
    if (error) {
      setFormError('Failed to add question.')
    } else {
      setFormSuccess('Question added!')
      setTitle('')
      setOptions(['', '', '', ''])
      setDeadline('')
      fetchQuestions()
    }
  }

  const handleResolve = async (question: Question, correctOption: number) => {
    setResolving(question.id)

    await supabase.from('questions').update({
      status: 'resolved',
      correct_option: correctOption,
    }).eq('id', question.id)

    // Fetch ALL predictions for this question
    const { data: allPredictions } = await supabase
      .from('predictions')
      .select('id, user_id, chosen_option')
      .eq('question_id', question.id)

    if (allPredictions && allPredictions.length > 0) {
      for (const pred of allPredictions) {
        const isCorrect = pred.chosen_option === correctOption

        // Mark prediction result
        if (isCorrect) {
          await supabase.from('predictions').update({ points_awarded: 10 }).eq('id', pred.id)
        }

        // Update user stats: total_predictions + 1, correct_predictions + (1 if correct), total_points + (10 if correct)
        const { data: userData } = await supabase
          .from('users')
          .select('total_points, total_predictions, correct_predictions')
          .eq('id', pred.user_id)
          .single()

        if (userData) {
          await supabase.from('users').update({
            total_predictions: (userData.total_predictions ?? 0) + 1,
            correct_predictions: (userData.correct_predictions ?? 0) + (isCorrect ? 1 : 0),
            total_points: (userData.total_points ?? 0) + (isCorrect ? 10 : 0),
          }).eq('id', pred.user_id)
        }
      }
    }

    setResolving(null)
    setExpandedId(null)
    fetchQuestions()
  }

  const inputClass = "w-full bg-[var(--c-base)] border border-[var(--c-border)] rounded-xl px-4 py-2.5 text-white placeholder-[var(--c-muted)] focus:outline-none focus:border-indigo-500 text-sm"

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto px-4 py-16">
        <div className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-2xl p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-[var(--c-border)] rounded-2xl flex items-center justify-center mb-3">
              <Lock className="w-7 h-7 text-[var(--c-muted)]" />
            </div>
            <h1 className="text-xl font-bold text-white">Admin</h1>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAuthError('') }}
              placeholder="Password"
              className={inputClass}
            />
            {authError && <p className="text-red-400 text-sm">{authError}</p>}
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl">
              Enter
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-white">Admin Panel</h1>

      {/* Add Question */}
      <section className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-2xl p-5">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-indigo-400" /> Add Question
        </h2>
        <form onSubmit={handleAddQuestion} className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Question title" className={inputClass} />
          <select value={category} onChange={e => setCategory(e.target.value as Category)} className={inputClass}>
            <option value="ipl">IPL 2026</option>
            <option value="nba">NBA</option>
            <option value="current_events">Current Events</option>
          </select>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <input
                key={i}
                value={opt}
                onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n) }}
                placeholder={`Option ${i + 1}${i < 2 ? ' *' : ''}`}
                className={inputClass}
              />
            ))}
          </div>
          <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputClass} />
          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          {formSuccess && <p className="text-emerald-400 text-sm font-medium">{formSuccess}</p>}
          <button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-sm">
            {submitting ? 'Adding...' : 'Add Question'}
          </button>
        </form>
      </section>

      {/* Resolve */}
      <section className="bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-2xl p-5">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" /> Resolve Questions
        </h2>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl skeleton" />)}</div>
        ) : (
          <div className="space-y-2">
            {questions.map(q => (
              <div key={q.id} className="border border-[var(--c-border)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--c-card)]"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-white truncate">{q.title}</p>
                    <p className="text-xs text-[var(--c-muted)] mt-0.5">
                      {q.status === 'resolved' ? '✓ Resolved' :
                        isPast(new Date(q.deadline)) ? '⚠ Expired — needs resolution' :
                        `Open · closes ${formatDistanceToNow(new Date(q.deadline), { addSuffix: true })}`}
                    </p>
                  </div>
                  {q.status !== 'resolved' && (
                    expandedId === q.id
                      ? <ChevronUp className="w-4 h-4 text-[var(--c-muted)] flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-[var(--c-muted)] flex-shrink-0" />
                  )}
                </button>

                {expandedId === q.id && q.status !== 'resolved' && (
                  <div className="px-4 pb-4 pt-1 bg-[var(--c-base)] border-t border-[var(--c-border)]">
                    <p className="text-xs font-semibold text-[var(--c-secondary)] mb-2">Select correct answer:</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => handleResolve(q, i)}
                          disabled={resolving === q.id}
                          className="w-full text-left text-sm px-4 py-2.5 rounded-lg bg-[var(--c-card-alt)] border border-[var(--c-border)] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 text-[var(--c-secondary)] transition-colors disabled:opacity-40"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {resolving === q.id && (
                      <p className="text-xs text-indigo-400 mt-2 text-center">Resolving and updating scores...</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
