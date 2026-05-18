import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { api } from '@/lib/api'

interface Props {
  open: boolean
  disputeId: string
  onClose: () => void
  onSuccess: () => void
}

export function ResolveDisputeModal({ open, disputeId, onClose, onSuccess }: Props) {
  const [resolution, setResolution] = useState<'upheld' | 'overturned'>('upheld')
  const [resolverNote, setResolverNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.resolveDispute(disputeId, resolution, resolverNote)
      onSuccess()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setResolution('upheld')
    setResolverNote('')
    setError(null)
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-2xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-gray-900">Resolve Dispute</Dialog.Title>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resolution</label>
              <div className="flex gap-3">
                {(['upheld', 'overturned'] as const).map(r => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      value={r}
                      checked={resolution === r}
                      onChange={() => setResolution(r)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm capitalize text-gray-700">{r}</span>
                  </label>
                ))}
              </div>
              {resolution === 'overturned' && (
                <p className="mt-2 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                  Overturning will approve the full billed amount and update the claim status.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resolver Note</label>
              <textarea
                required
                value={resolverNote}
                onChange={e => setResolverNote(e.target.value)}
                rows={3}
                placeholder="Explain the decision…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {submitting ? 'Resolving…' : 'Resolve Dispute'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
