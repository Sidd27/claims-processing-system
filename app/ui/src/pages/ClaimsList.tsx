import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { api, type Claim } from '@/lib/api';
import { StatusBadge } from '@/components/ui/badge';
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Claims</h1>
            <p className="text-sm text-gray-500 mt-0.5">{claims.length} claims total</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Add New Claim
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : claims.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No claims yet.{' '}
            <button onClick={() => setModalOpen(true)} className="text-blue-600 hover:underline">
              Submit the first one.
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Claim ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Provider</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Diagnosis</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim, i) => (
                  <tr
                    key={claim.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i === claims.length - 1 ? 'border-0' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/claims/${claim.id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {claim.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{claim.providerName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {claim.diagnosisCode}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={claim.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{dateStr(claim.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewClaimModal open={modalOpen} onClose={() => setModalOpen(false)} onSuccess={load} />
    </div>
  );
}
