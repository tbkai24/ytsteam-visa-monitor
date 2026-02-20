import { useEffect, useRef, useState } from 'react'

type AnimatedCounterProps = {
  value: number
  durationMs?: number
  className?: string
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

function AnimatedCounter({ value, durationMs = 1200, className = '' }: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [isRising, setIsRising] = useState(false)
  const [isFalling, setIsFalling] = useState(false)
  const displayRef = useRef(value)

  useEffect(() => {
    const from = displayRef.current
    const to = value
    if (from === to) return

    setIsRising(to > from)
    setIsFalling(to < from)
    const riseTimer = window.setTimeout(() => setIsRising(false), 350)
    const fallTimer = window.setTimeout(() => setIsFalling(false), 1600)

    const startedAt = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      const eased = easeOutCubic(progress)
      const next = Math.round(from + (to - from) * eased)
      displayRef.current = next
      setDisplayValue(next)
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(riseTimer)
      window.clearTimeout(fallTimer)
    }
  }, [durationMs, value])

  return (
    <span
      className={`animated-counter ${isRising ? 'is-rising' : ''} ${isFalling ? 'is-falling' : ''} ${className}`}
    >
      {displayValue.toLocaleString()}
    </span>
  )
}

export default AnimatedCounter
