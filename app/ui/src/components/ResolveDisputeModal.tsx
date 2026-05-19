import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  disputeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResolveDisputeModal({ open, disputeId, onClose, onSuccess }: Props) {
  const [resolution, setResolution] = useState<'upheld' | 'overturned'>('upheld');
  const [resolverNote, setResolverNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.resolveDispute(disputeId, resolution, resolverNote);
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setResolution('upheld');
    setResolverNote('');
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Resolve Dispute</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Resolution</label>
            <div className="flex gap-4">
              {(['upheld', 'overturned'] as const).map((r) => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="resolution"
                    value={r}
                    checked={resolution === r}
                    onChange={() => setResolution(r)}
                    className="accent-primary"
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
              onChange={(e) => setResolverNote(e.target.value)}
              rows={3}
              placeholder="Explain the decision…"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none bg-background"
            />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Resolving…' : 'Resolve Dispute'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
