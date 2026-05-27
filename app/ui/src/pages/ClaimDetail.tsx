import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { api, type ClaimDetail as ClaimDetailType, type LineItemWithResult } from '@/lib/api';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisputeModal } from '@/components/DisputeModal';
import { ResolveDisputeModal } from '@/components/ResolveDisputeModal';
import { dollars, dateStr } from '@/lib/format';

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ClaimDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [disputeModal, setDisputeModal] = useState<{ lineItemId: string } | null>(null);
  const [resolveModal, setResolveModal] = useState<{ disputeId: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.getClaim(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claim');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handlePay() {
    if (!id || !detail) return;
    setActionPending(true);
    try {
      await api.payClaim(id);
      await load();
    } finally {
      setActionPending(false);
    }
  }

  async function handleAdjudicate() {
    if (!id) return;
    setActionPending(true);
    try {
      await api.adjudicateClaim(id);
      await load();
    } finally {
      setActionPending(false);
    }
  }

  async function handleManualReview(lineItemId: string, decision: 'approved' | 'denied') {
    if (!id) return;
    setActionPending(true);
    try {
      await api.manualReviewLineItem(id, lineItemId, decision);
      await load();
    } finally {
      setActionPending(false);
    }
  }

  function toggleSteps(lineItemId: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(lineItemId) ? next.delete(lineItemId) : next.add(lineItemId);
      return next;
    });
  }

  if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>;
  if (error) return <div className="text-center py-16 text-destructive text-sm">{error}</div>;
  if (!detail) return null;

  const { claim, lineItems } = detail;
  const canPay = claim.status === 'approved' || claim.status === 'partially_approved';
  const canReview = claim.status === 'under_review';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft size={14} /> All Claims
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-semibold text-foreground font-mono">{claim.id}</h1>
                <StatusBadge status={claim.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {claim.memberName} · {claim.planName} · {claim.providerName} · {claim.diagnosisCode} · Submitted {dateStr(claim.submittedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              {canReview && (
                <Button variant="outline" size="sm" onClick={handleAdjudicate} disabled={actionPending}>
                  Re-adjudicate
                </Button>
              )}
              {canPay && (
                <Button size="sm" onClick={handlePay} disabled={actionPending}>
                  Mark as Paid
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <h2 className="text-sm font-medium text-foreground">Line Items</h2>
          </div>
          {lineItems.map((li) => (
            <LineItemRow
              key={li.id}
              li={li}
              claimStatus={claim.status}
              expanded={expandedSteps.has(li.id)}
              onToggle={() => toggleSteps(li.id)}
              onDispute={() => setDisputeModal({ lineItemId: li.id })}
              onResolve={li.openDispute ? () => setResolveModal({ disputeId: li.openDispute!.id }) : undefined}
              onManualApprove={li.status === 'needs_review' ? () => handleManualReview(li.id, 'approved') : undefined}
              onManualDeny={li.status === 'needs_review' ? () => handleManualReview(li.id, 'denied') : undefined}
              actionPending={actionPending}
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
  );
}

function LineItemRow({
  li,
  claimStatus,
  expanded,
  onToggle,
  onDispute,
  onResolve,
  onManualApprove,
  onManualDeny,
  actionPending,
}: {
  li: LineItemWithResult;
  claimStatus: string;
  expanded: boolean;
  onToggle: () => void;
  onDispute: () => void;
  onResolve?: () => void;
  onManualApprove?: () => void;
  onManualDeny?: () => void;
  actionPending?: boolean;
}) {
  const result = li.adjudicationResult;
  const canDispute = claimStatus === 'partially_approved' || claimStatus === 'denied';

  return (
    <div className="border-b border-border last:border-0">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-foreground truncate">{li.description}</span>
              <StatusBadge status={li.status} />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{li.cptCode}</span>
              <span>{li.serviceType}</span>
              <span>{dateStr(li.serviceDate)}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-medium text-foreground">
              {result ? dollars(result.approvedAmount) : '—'} approved
            </div>
            <div className="text-xs text-muted-foreground">{dollars(li.billedAmount)} billed</div>
          </div>
        </div>

        {result && result.reductionReasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.reductionReasons.map((r) => (
              <span key={r} className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono">
                {r}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          {result && result.explanationSteps.length > 0 ? (
            <Button variant="ghost" size="xs" onClick={onToggle} className="text-muted-foreground h-auto py-0.5 px-1">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? 'Hide' : 'Show'} explanation steps
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {onManualApprove && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onManualApprove}
                disabled={actionPending}
                className="text-green-600 hover:text-green-700 hover:bg-green-50 h-auto py-0.5 px-1"
              >
                Approve
              </Button>
            )}
            {onManualDeny && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onManualDeny}
                disabled={actionPending}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-auto py-0.5 px-1"
              >
                Deny
              </Button>
            )}
            {onResolve && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onResolve}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-auto py-0.5 px-1"
              >
                Resolve Dispute
              </Button>
            )}
            {canDispute && (
              <Button
                variant="ghost"
                size="xs"
                onClick={onDispute}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 h-auto py-0.5 px-1"
              >
                Open Dispute
              </Button>
            )}
          </div>
        </div>

        {expanded && result && result.explanationSteps.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {result.explanationSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 bg-muted/50 rounded-lg px-3 py-2 text-xs">
                <span className="font-mono text-muted-foreground shrink-0 pt-0.5">{step.rule}</span>
                <span className="text-foreground flex-1">{step.description}</span>
                <span className="text-muted-foreground shrink-0 font-mono">
                  {dollars(step.amountBefore)} → {dollars(step.amountAfter)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
