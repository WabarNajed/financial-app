'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Product {
  id: string; name: string; category: string; source: string; status: string;
  final_score: number; updated_at: string; has_commerce: boolean; has_listing_pack: boolean;
  recommended_price_sar: number | null; gross_margin_percent: number | null;
}

function statusBadge(s: string) {
  const map: Record<string, string> = { approved: 'badge-green', rejected: 'badge-red', discovered: 'badge-blue', analyzed: 'badge-yellow', pushed_to_salla: 'badge-green', failed: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

export default function ProductList() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', category: '', source: '', sort_by: 'updated_at', sort_dir: 'desc' });
  const [filterOpts, setFilterOpts] = useState<{ categories: string[]; sources: string[]; statuses: string[] }>({ categories: [], sources: [], statuses: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '50' };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.source) params.source = filters.source;
      params.sort_by = filters.sort_by;
      params.sort_dir = filters.sort_dir;
      const res = await api.getProducts(params);
      setProducts(res.data || []);
      setTotal(res.total || 0);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getFilters().then(setFilterOpts).catch(console.error); }, []);

  const setFilter = (key: string, val: string) => setFilters((f) => ({ ...f, [key]: val }));

  return (
    <div>
      <div className="page-header">
        <h1>Products ({total})</h1>
        <p>All discovered products with scores, commerce data, and export status</p>
      </div>

      <div className="filters-bar">
        <div className="field">
          <label>Search</label>
          <input placeholder="Product name..." value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All</option>
            {filterOpts.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All</option>
            {filterOpts.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Source</label>
          <select value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
            <option value="">All</option>
            {filterOpts.sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Sort by</label>
          <select value={filters.sort_by} onChange={(e) => setFilter('sort_by', e.target.value)}>
            <option value="updated_at">Last Updated</option>
            <option value="final_score">Score</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="field">
          <label>Direction</label>
          <select value={filters.sort_dir} onChange={(e) => setFilter('sort_dir', e.target.value)}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Product</th><th>Category</th><th>Source</th><th>Score</th>
              <th>Status</th><th>Export</th><th>Price (SAR)</th><th>Margin</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>No products found</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} onClick={() => router.push(`/admin/products/${p.id}`)}>
                <td style={{ fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                <td>{p.category}</td>
                <td><span className="badge badge-blue">{p.source}</span></td>
                <td>
                  <span style={{ fontWeight: 600, color: (p.final_score || 0) >= 70 ? 'var(--green)' : (p.final_score || 0) >= 50 ? 'var(--yellow)' : 'var(--text2)' }}>
                    {p.final_score ? Number(p.final_score).toFixed(1) : '—'}
                  </span>
                </td>
                <td>{statusBadge(p.status)}</td>
                <td>
                  {p.has_commerce && p.has_listing_pack ? (
                    <span className="badge badge-green">Ready</span>
                  ) : (
                    <span className="badge badge-gray">Missing</span>
                  )}
                </td>
                <td>{p.recommended_price_sar ? `${p.recommended_price_sar} SAR` : '—'}</td>
                <td>{p.gross_margin_percent ? `${p.gross_margin_percent}%` : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
