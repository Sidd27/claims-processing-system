import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, type Member, type LineItemInput } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const SERVICE_TYPES = ['MEDICAL', 'DENTAL', 'VISION', 'MENTAL_HEALTH', 'PRESCRIPTION'] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const emptyLineItem = (): LineItemInput => ({
  serviceType: 'MEDICAL',
  cptCode: '',
  description: '',
  serviceDate: new Date().toISOString().split('T')[0],
  billedAmount: 0,
});

export function NewClaimModal({ open, onClose, onSuccess }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerNpi, setProviderNpi] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState('');
  const [lineItems, setLineItems] = useState<LineItemInput[]>([emptyLineItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open)
      api
        .getMembers()
        .then(setMembers)
        .catch(() => setMembers([]));
  }, [open]);

  function updateLineItem(index: number, field: keyof LineItemInput, value: string | number) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, [field]: value } : li)));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.submitClaim({ memberId, providerName, providerNpi, diagnosisCode, lineItems });
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setMemberId('');
    setProviderName('');
    setProviderNpi('');
    setDiagnosisCode('');
    setLineItems([emptyLineItem()]);
    setError(null);
    onClose();
  }

  const inputClass =
    'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Submit New Claim</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Member */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select required value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass}>
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.externalMemberId})
                </option>
              ))}
            </select>
          </div>

          {/* Provider */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider Name</label>
              <input
                required
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="City Medical Center"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider NPI</label>
              <input
                required
                value={providerNpi}
                onChange={(e) => setProviderNpi(e.target.value)}
                placeholder="1234567890"
                className={inputClass}
              />
            </div>
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Diagnosis Code (ICD-10)</label>
            <input
              required
              value={diagnosisCode}
              onChange={(e) => setDiagnosisCode(e.target.value)}
              placeholder="J06.9"
              className={inputClass}
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Line Items</label>
              <Button type="button" variant="ghost" size="sm" onClick={addLineItem}>
                <Plus size={14} />
                Add line item
              </Button>
            </div>
            <div className="space-y-3">
              {lineItems.map((li, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 relative">
                  {lineItems.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLineItem(idx)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Service Type</label>
                      <select
                        value={li.serviceType}
                        onChange={(e) => updateLineItem(idx, 'serviceType', e.target.value)}
                        className="w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                      >
                        {SERVICE_TYPES.map((st) => (
                          <option key={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">CPT Code</label>
                      <input
                        required
                        value={li.cptCode}
                        onChange={(e) => updateLineItem(idx, 'cptCode', e.target.value)}
                        placeholder="99213"
                        className="w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                      />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      required
                      value={li.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      placeholder="Office visit"
                      className="w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Service Date</label>
                      <input
                        required
                        type="date"
                        value={li.serviceDate}
                        onChange={(e) => updateLineItem(idx, 'serviceDate', e.target.value)}
                        className="w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Billed Amount ($)</label>
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={li.billedAmount ? li.billedAmount : ''}
                        onChange={(e) => updateLineItem(idx, 'billedAmount', parseFloat(e.target.value || '0'))}
                        placeholder="150.00"
                        className="w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Claim'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
