import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { api, type Claim } from '@/lib/api';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NewClaimModal } from '@/components/NewClaimModal';
import { dateStr } from '@/lib/format';

export function ClaimsList() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setClaims(await api.getClaims());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Claims</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{claims.length} claims total</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={load} title="Refresh">
              <RefreshCw size={16} />
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} />
              Add New Claim
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : claims.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No claims yet.{' '}
            <button onClick={() => setModalOpen(true)} className="text-primary hover:underline">
              Submit the first one.
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Claim ID</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <Link to={`/claims/${claim.id}`} className="font-mono text-xs text-primary hover:underline">
                        {claim.id.slice(0, 8)}…
                      </Link>
                    </TableCell>
                    <TableCell className="text-foreground">{claim.providerName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{claim.diagnosisCode}</TableCell>
                    <TableCell>
                      <StatusBadge status={claim.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{dateStr(claim.submittedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <NewClaimModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={load} />
    </div>
  );
}
