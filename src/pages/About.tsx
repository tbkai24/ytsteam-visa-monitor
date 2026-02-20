import Card from '../components/ui/Card'

function About() {
  return (
    <div className="stack-md">
      <h1>About</h1>
      <Card>
        <h3>Project</h3>
        <p className="muted">
          ytsteam-visa-monitor is a public tracking dashboard for placeholder engagement metrics and
          milestones.
        </p>
      </Card>
      <Card>
        <h3>Disclaimer</h3>
        <p className="muted">
          Stats shown in this frontend build are placeholders only. Final values will be connected to
          Supabase data in a later step.
        </p>
      </Card>
    </div>
  )
}

export default About
