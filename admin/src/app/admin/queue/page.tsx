'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function statusBadge(s: string) {
  const map: Record<string, string> = { approved: 'badge-green', rejected: 'badge-red', discovered: 'badge-blue', analyzed: 'badge-yellow', pushed_to_salla: 'badge-green' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

export default function QueuePage() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get all products, filter client-side for queue items
      const res = await api.getProducts({ limit: '200', sort_by: 'updated_at', sort_dir: 'desc' });
      const all = res.data || [];
      // Queue: not approved, or approved but not pushed
      const queued = all.filter((p: any) =>
        p.status !== 'pushed_to_salla' && p.status !== 'rejected'
      );
      setProducts(queued);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doApprove = async (id: string) => {
    try { await api.approveProduct(id); setToast({ msg: 'Approved', type: 'success' }); load(); } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
  };
  const doReject = async (id: string) => {
    try { await api.rejectProduct(id); setToast({ msg: 'Rejected', type: 'success' }); load(); } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>{toast.msg}</div>}
      <div className="page-header">
        <h1>Review Queue ({products.length})</h1>
        <p>Products pending review, approval, or Salla push</p>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Product</th><th>Score</th><th>Margin</th><th>Status</th><th>Export</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>Queue is empty</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/admin/products/${p.id}`)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>
                  <span style={{ fontWeight: 600, color: (p.final_score || 0) >= 70 ? 'var(--green)' : 'var(--text2)' }}>
                    {p.final_score ? Number(p.final_score).toFixed(1) : '—'}
                  </span>
                </td>
                <td>{p.gross_margin_percent ? `${p.gross_margin_percent}%` : '—'}</td>
                <td>{statusBadge(p.status)}</td>
                <td>{p.has_commerce && p.has_listing_pack ? <span className="badge badge-green">Ready</span> : <span className="badge badge-gray">Missing</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-success btn-sm" onClick={() => doApprove(p.id)}>Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => doReject(p.id)}>Reject</button>
                    <button className="btn btn-outline btn-sm" onClick={() => router.push(`/admin/products/${p.id}`)}>Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
