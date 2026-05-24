'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/context/UserContext'
import { User } from '@/lib/types'
import { Target, Zap, ArrowRight } from 'lucide-react'

type Step = 'enter' | 'welcome'

export default function UsernameModal() {
  const { setUser } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('enter')
  const [pendingUser, setPendingUser] = useState<User | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = username.trim().toLowerCase()
    if (trimmed.length < 3) { setError('At least 3 characters'); return }
    if (!/^[a-z0-9_]+$/.test(trimmed)) { setError('Letters, numbers, underscores only'); return }
    setLoading(true)
    setError('')

    const { data: existing } = await supabase
      .from('users').select('*').eq('username', trimmed).single()

    if (existing) {
      // Returning user — skip welcome, redirect to home if not already there
      setUser(existing)
      setLoading(false)
      if (pathname !== '/') router.push('/')
      return
    }

    const { data, error: insertError } = await supabase
      .from('users').insert({ username: trimmed }).select().single()

    if (insertError) {
      setError('Could not create account. Try a different username.')
      setLoading(false)
      return
    }

    // New user — show welcome before entering the app
    setPendingUser(data)
    setStep('welcome')
    setLoading(false)
  }

  const handleStart = () => {
    if (!pendingUser) return
    localStorage.setItem('predictit_onboarded', '1')
    setUser(pendingUser)
    router.push('/')
  }

  if (step === 'welcome' && pendingUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div className="relative w-full sm:max-w-sm bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-t-3xl sm:rounded-2xl px-8 pt-8 pb-10 overflow-hidden">
          <div className="w-10 h-1 bg-[var(--c-border-muted)] rounded-full mx-auto mb-6 sm:hidden" />

          {/* Background glow */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-56 h-56 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <p className="text-center text-sm text-[var(--c-muted)] mb-1 font-medium">Welcome aboard,</p>
            <h2 className="text-2xl font-black text-[var(--c-text)] text-center mb-1">
              @{pendingUser.username} 🎯
            </h2>
            <p className="text-center text-xs text-[var(--c-muted)] mb-6">Here's how this works.</p>

            <div className="space-y-2 mb-7">
              {[
                { icon: '🔮', text: 'Pick outcomes on sports, markets & news' },
                { icon: '⚡', text: 'Right calls earn points — top the leaderboard' },
                { icon: '🎰', text: 'Every pick earns chips — unlock exclusive markets' },
              ].map(({ icon, text }) => (
                <div key={icon} className="flex items-center gap-3.5 bg-[var(--c-base)] border border-[var(--c-border)] rounded-xl px-4 py-3.5">
                  <span className="text-2xl flex-shrink-0">{icon}</span>
                  <p className="text-sm font-semibold text-[var(--c-text)] leading-snug">{text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleStart}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-[var(--c-text)] font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base shadow-lg shadow-indigo-900/40"
            >
              Start Predicting
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-sm bg-[var(--c-card-alt)] border border-[var(--c-border)] rounded-t-3xl sm:rounded-2xl p-8 pb-10">
        <div className="w-10 h-1 bg-[var(--c-border-muted)] rounded-full mx-auto mb-6 sm:hidden" />

        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-900/50">
            <Target className="w-8 h-8 text-[var(--c-text)]" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--c-text)]">Pick your name</h2>
          <p className="text-[var(--c-secondary)] text-sm mt-1.5 text-center">Choose a username to start predicting</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError('') }}
            placeholder="e.g. cricket_king"
            maxLength={20}
            className="w-full bg-[var(--c-base)] border border-[var(--c-border)] rounded-xl px-4 py-3.5 text-[var(--c-text)] placeholder-[var(--c-muted)] focus:outline-none focus:border-indigo-500 text-center text-lg font-medium tracking-wide"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || username.trim().length < 3}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 disabled:from-indigo-800 disabled:to-purple-800 disabled:opacity-50 text-[var(--c-text)] font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-base"
          >
            <Zap className="w-4 h-4" />
            {loading ? 'Joining...' : "Let's Play!"}
          </button>
        </form>

        <p className="text-xs text-[var(--c-muted)] text-center mt-5">
          Already have an account? Type your existing username above.
        </p>
      </div>
    </div>
  )
}
