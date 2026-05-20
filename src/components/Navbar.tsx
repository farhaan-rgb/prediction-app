'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/context/UserContext'
import { Target, Trophy, Clock, Home, Settings } from 'lucide-react'

export default function Navbar() {
  const { user } = useUser()
  const pathname = usePathname()

  const tabs = [
    { href: '/', icon: Home, label: 'Predict' },
    { href: '/leaderboard', icon: Trophy, label: 'Rankings' },
    { href: '/history', icon: Clock, label: 'History' },
  ]

  return (
    <>
      {/* Top bar — logo + admin link */}
      <header className="sticky top-0 z-40 bg-[#080b14]/90 backdrop-blur-md border-b border-[#1e2438]">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-base tracking-tight">PredictIt</span>
          </Link>

          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                  <span className="text-amber-400 text-xs">⚡</span>
                  <span className="text-xs font-bold text-amber-400">{user.total_points} pts</span>
                </div>
                <Link
                  href="/admin"
                  className={`p-1.5 rounded-lg transition-colors ${pathname === '/admin' ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#4a5568] hover:text-[#8892aa]'}`}
                  title="Admin"
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#080b14]/95 backdrop-blur-md border-t border-[#1e2438]">
        <div className="max-w-2xl mx-auto flex">
          {tabs.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors"
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${active ? 'text-indigo-400' : 'text-[#4a5568]'}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className={`text-[10px] font-semibold tracking-wide transition-colors ${active ? 'text-indigo-400' : 'text-[#4a5568]'}`}>
                  {label}
                </span>
                {active && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-500 rounded-t-full" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
