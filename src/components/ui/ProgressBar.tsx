type ProgressBarProps = {
  value: number
}

function ProgressBar({ value }: ProgressBarProps) {
  const normalized = Math.max(0, Math.min(100, value))

  return (
    <div className="progress-root">
      <div className="progress-fill" style={{ width: `${normalized}%` }} />
    </div>
  )
}

export default ProgressBar
