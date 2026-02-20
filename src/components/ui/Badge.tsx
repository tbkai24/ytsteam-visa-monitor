import type { PropsWithChildren } from 'react'

type BadgeProps = PropsWithChildren<{
  tone?: 'neutral' | 'positive'
}>

function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export default Badge
