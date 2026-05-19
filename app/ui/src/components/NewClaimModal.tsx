import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Trash2 } from 'lucide-react';
import { api, type Member, type LineItemInput } from '@/lib/api';

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
  billedAmountCents: 0,
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

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold text-gray-900">
              Submit New Claim
            </Dialog.Title>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Member */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
              <select
                required
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider Name
                </label>
                <input
                  required
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="City Medical Center"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider NPI</label>
                <input
                  required
                  value={providerNpi}
                  onChange={(e) => setProviderNpi(e.target.value)}
                  placeholder="1234567890"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Diagnosis */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Diagnosis Code (ICD-10)
              </label>
              <input
                required
                value={diagnosisCode}
                onChange={(e) => setDiagnosisCode(e.target.value)}
                placeholder="J06.9"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Line Items</label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={14} /> Add line item
                </button>
              </div>
              <div className="space-y-3">
                {lineItems.map((li, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 relative">
                    {lineItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Service Type
                        </label>
                        <select
                          value={li.serviceType}
                          onChange={(e) => updateLineItem(idx, 'serviceType', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {SERVICE_TYPES.map((st) => (
                            <option key={st}>{st}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          CPT Code
                        </label>
                        <input
                          required
                          value={li.cptCode}
                          onChange={(e) => updateLineItem(idx, 'cptCode', e.target.value)}
                          placeholder="99213"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Description
                      </label>
                      <input
                        required
                        value={li.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        placeholder="Office visit"
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Service Date
                        </label>
                        <input
                          required
                          type="date"
                          value={li.serviceDate}
                          onChange={(e) => updateLineItem(idx, 'serviceDate', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Billed Amount ($)
                        </label>
                        <input
                          required
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={li.billedAmountCents ? li.billedAmountCents / 100 : ''}
                          onChange={(e) =>
                            updateLineItem(
                              idx,
                              'billedAmountCents',
                              Math.round(parseFloat(e.target.value || '0') * 100)
                            )
                          }
                          placeholder="150.00"
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {submitting ? 'Submitting…' : 'Submit Claim'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
