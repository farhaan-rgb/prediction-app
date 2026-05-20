'use client'

import { useState, useEffect } from 'react'

interface TimeLeft {
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  totalSeconds: number
  urgency: 'normal' | 'soon' | 'critical'
}

export function useCountdown(deadline: string): TimeLeft {
  const calc = (): TimeLeft => {
    const diff = new Date(deadline).getTime() - Date.now()
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, isExpired: true, totalSeconds: 0, urgency: 'critical' }
    const totalSeconds = Math.floor(diff / 1000)
    const urgency = totalSeconds < 3600 ? 'critical' : totalSeconds < 86400 ? 'soon' : 'normal'
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      isExpired: false,
      totalSeconds,
      urgency,
    }
  }

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calc)

  useEffect(() => {
    const timer = setInterval(() => {
      const next = calc()
      setTimeLeft(next)
      if (next.isExpired) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  return timeLeft
}
