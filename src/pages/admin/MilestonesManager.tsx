import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { CheckIcon, PencilIcon, TrashIcon, XIcon } from '../../components/ui/Icons'
import Input from '../../components/ui/Input'
import { supabase } from '../../lib/supabase'

type MilestoneRow = {
  id: string
  title: string
  target_count: number
  current_count: number
  sort_order: number
  is_active: boolean
}

function MilestonesManager() {
  const [rows, setRows] = useState<MilestoneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editTarget, setEditTarget] = useState('')

  const loadMilestones = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('milestones')
      .select('id,title,target_count,current_count,sort_order,is_active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setRows((data ?? []) as MilestoneRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMilestones()
  }, [loadMilestones])

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

  const handleAdd = async () => {
    if (!title.trim() || !target.trim()) return
    setSaving(true)
    setError(null)

    const maxSort = rows.length > 0 ? Math.max(...rows.map((row) => row.sort_order)) : -1
    const { error: insertError } = await supabase.from('milestones').insert({
      title: title.trim(),
      target_count: Number(target),
      current_count: 0,
      sort_order: maxSort + 1,
      is_active: true,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    setTitle('')
    setTarget('')
    setShowForm(false)
    setSaving(false)
    await loadMilestones()
  }

  const startEdit = (row: MilestoneRow) => {
    setEditingId(row.id)
    setEditTitle(row.title)
    setEditTarget(String(row.target_count))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditTarget('')
  }

  const saveEdit = async () => {
    if (!editingId || !editTitle.trim() || !editTarget.trim()) return
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('milestones')
      .update({
        title: editTitle.trim(),
        target_count: Number(editTarget),
      })
      .eq('id', editingId)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    cancelEdit()
    await loadMilestones()
  }

  const toggleActive = async (row: MilestoneRow) => {
    setSaving(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('milestones')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await loadMilestones()
  }

  const deleteMilestone = async (id: string) => {
    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase.from('milestones').delete().eq('id', id)
    if (deleteError) {
      setError(deleteError.message)
      setSaving(false)
      return
    }
    setSaving(false)
    await loadMilestones()
  }

  return (
    <div className="stack-md">
      <div className="admin-heading-row">
        <div>
          <h2>Milestones</h2>
          <p className="muted">Manage goal badges and progress targets</p>
        </div>
        <Button type="button" onClick={() => setShowForm((prev) => !prev)} className="add-btn">
          + Add Milestone
        </Button>
      </div>

      {error ? <p className="alert alert-error">{error}</p> : null}

      {showForm ? (
        <Card className="admin-glass-card">
          <div className="inline-form">
            <Input
              placeholder="Label"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              placeholder="Target Views"
              type="number"
              min="1"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            <Button type="button" onClick={handleAdd} disabled={saving}>
              Save
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="admin-glass-card table-wrap admin-milestones-wrap">
        <table className="table admin-table admin-milestones-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Label</th>
              <th>Target Views</th>
              <th>Active</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="muted">
                  Loading milestones...
                </td>
              </tr>
            ) : null}
            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No milestones yet.
                </td>
              </tr>
            ) : null}
            {!loading
              ? sortedRows.map((row, index) => {
                  const achieved = row.current_count >= row.target_count
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="order-cell">
                          <span className="drag-handle">:::</span>
                          <span className="order-pill">{index + 1}</span>
                        </div>
                      </td>
                      <td>
                        {editingId === row.id ? (
                          <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                        ) : (
                          <strong>{row.title}</strong>
                        )}
                      </td>
                      <td>
                        {editingId === row.id ? (
                          <Input
                            type="number"
                            min="1"
                            value={editTarget}
                            onChange={(event) => setEditTarget(event.target.value)}
                          />
                        ) : (
                          row.target_count.toLocaleString()
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`switch ${row.is_active ? 'on' : ''}`}
                          onClick={() => toggleActive(row)}
                          disabled={saving}
                          aria-label={`Toggle ${row.title}`}
                        >
                          <span />
                        </button>
                      </td>
                      <td>
                        <span className={`status-chip ${achieved ? 'achieved' : 'in-progress'}`}>
                          {achieved ? 'ACHIEVED' : 'IN PROGRESS'}
                        </span>
                      </td>
                      <td>
                        <div className="icon-actions">
                          {editingId === row.id ? (
                            <>
                              <button type="button" className="icon-btn" onClick={saveEdit} disabled={saving}>
                                <CheckIcon width={16} height={16} />
                              </button>
                              <button type="button" className="icon-btn" onClick={cancelEdit} disabled={saving}>
                                <XIcon width={16} height={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => startEdit(row)}
                                disabled={saving}
                              >
                                <PencilIcon width={16} height={16} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => deleteMilestone(row.id)}
                                disabled={saving}
                              >
                                <TrashIcon width={16} height={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              : null}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export default MilestonesManager
