import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import { api, type ClaimDetail as ClaimDetailType, type LineItemWithResult } from '@/lib/api'
import { StatusBadge } from '@/components/ui/badge'
import { DisputeModal } from '@/components/DisputeModal'
import { ResolveDisputeModal } from '@/components/ResolveDisputeModal'
import { dollars, dateStr } from '@/lib/format'

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<ClaimDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [disputeModal, setDisputeModal] = useState<{ lineItemId: string } | null>(null)
  const [resolveModal, setResolveModal] = useState<{ disputeId: string } | null>(null)
  const [actionPending, setActionPending] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      setDetail(await api.getClaim(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claim')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handlePay() {
    if (!id || !detail) return
    setActionPending(true)
    try {
      await api.payClaim(id)
      await load()
    } finally {
      setActionPending(false)
    }
  }

  async function handleAdjudicate() {
    if (!id) return
    setActionPending(true)
    try {
      await api.adjudicateClaim(id)
      await load()
    } finally {
      setActionPending(false)
    }
  }

  function toggleSteps(lineItemId: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      next.has(lineItemId) ? next.delete(lineItemId) : next.add(lineItemId)
      return next
    })
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
  if (error) return <div className="text-center py-16 text-red-500 text-sm">{error}</div>
  if (!detail) return null

  const { claim, lineItems } = detail
  const canPay = claim.status === 'approved' || claim.status === 'partially_approved'
  const canReview = claim.status === 'under_review'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
            <ArrowLeft size={14} /> All Claims
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-semibold text-gray-900 font-mono">{claim.id.slice(0, 8)}…</h1>
                <StatusBadge status={claim.status} />
              </div>
              <p className="text-sm text-gray-500">
                {claim.providerName} · {claim.diagnosisCode} · Submitted {dateStr(claim.submittedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              {canReview && (
                <button
                  onClick={handleAdjudicate}
                  disabled={actionPending}
                  className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 disabled:opacity-50 transition-colors font-medium"
                >
                  Re-adjudicate
                </button>
              )}
              {canPay && (
                <button
                  onClick={handlePay}
                  disabled={actionPending}
                  className="px-3 py-1.5 text-sm bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors font-medium"
                >
                  Mark as Paid
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-700">Line Items</h2>
          </div>
          {lineItems.map(li => (
            <LineItemRow
              key={li.id}
              li={li}
              claimStatus={claim.status}
              expanded={expandedSteps.has(li.id)}
              onToggle={() => toggleSteps(li.id)}
              onDispute={() => setDisputeModal({ lineItemId: li.id })}
            />
          ))}
        </div>
      </div>

      {disputeModal && (
        <DisputeModal
          open
          claimId={claim.id}
          lineItemId={disputeModal.lineItemId}
          onClose={() => setDisputeModal(null)}
          onSuccess={load}
        />
      )}

      {resolveModal && (
        <ResolveDisputeModal
          open
          disputeId={resolveModal.disputeId}
          onClose={() => setResolveModal(null)}
          onSuccess={load}
        />
      )}
    </div>
  )
}

function LineItemRow({
  li, claimStatus, expanded, onToggle, onDispute
}: {
  li: LineItemWithResult
  claimStatus: string
  expanded: boolean
  onToggle: () => void
  onDispute: () => void
}) {
  const result = li.adjudicationResult
  const DISPUTABLE = ['approved', 'partially_approved', 'denied']
  const canDispute = DISPUTABLE.includes(claimStatus)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-gray-800 truncate">{li.description}</span>
              <StatusBadge status={li.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="font-mono">{li.cptCode}</span>
              <span>{li.serviceType}</span>
              <span>{dateStr(li.serviceDate)}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-medium text-gray-800">
              {result ? dollars(result.approvedAmountCents) : '—'} approved
            </div>
            <div className="text-xs text-gray-400">{dollars(li.billedAmountCents)} billed</div>
          </div>
        </div>

        {result && result.reductionReasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.reductionReasons.map(r => (
              <span key={r} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono">
                {r}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          {result && result.explanationSteps.length > 0 ? (
            <button
              onClick={onToggle}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? 'Hide' : 'Show'} explanation steps
            </button>
          ) : <div />}
          {canDispute && (
            <button
              onClick={onDispute}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium transition-colors"
            >
              Open Dispute
            </button>
          )}
        </div>

        {expanded && result && result.explanationSteps.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {result.explanationSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                <span className="font-mono text-gray-500 shrink-0 pt-0.5">{step.rule}</span>
                <span className="text-gray-600 flex-1">{step.description}</span>
                <span className="text-gray-400 shrink-0 font-mono">
                  {dollars(step.amountBefore)} → {dollars(step.amountAfter)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
