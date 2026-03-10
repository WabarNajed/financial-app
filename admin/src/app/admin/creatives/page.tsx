'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.listCreatives().then((r) => setCreatives(r.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const generate = async (productId: string) => {
    try {
      await api.generateCreatives(productId);
      setToast({ msg: 'Creatives generated!', type: 'success' });
      const r = await api.listCreatives();
      setCreatives(r.data || []);
    } catch (e: any) {
      setToast({ msg: e.message, type: 'error' });
    }
  };

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>{toast.msg}</div>}
      <div className="page-header">
        <h1>Ad Creatives</h1>
        <p>TikTok ad concepts generated for products</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>Loading...</div>
      ) : creatives.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>
          <p>No creatives generated yet. Generate from the product editor or use the button below.</p>
        </div>
      ) : (
        creatives.map((item) => (
          <div key={item.product_id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{item.name}</strong>
                <span className="badge badge-blue" style={{ marginLeft: 8 }}>{item.category}</span>
                <span className={`badge ${item.status === 'approved' ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 6 }}>{item.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => generate(item.product_id)}>Regenerate</button>
                <button className="btn btn-outline btn-sm" onClick={() => setExpanded(expanded === item.product_id ? null : item.product_id)}>
                  {expanded === item.product_id ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              Generated: {item.creatives?.generated_at ? new Date(item.creatives.generated_at).toLocaleString() : '—'}
              &nbsp;|&nbsp;
              {item.creatives?.concepts?.length || 0} concepts
            </div>

            {expanded === item.product_id && item.creatives?.concepts && (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {item.creatives.concepts.map((c: any, i: number) => (
                  <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong>Concept #{c.concept_number || i + 1}</strong>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label>Hook</label>
                      <div dir="rtl" style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent2)' }}>{c.hook}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label>Script</label>
                      <div dir="rtl" style={{ fontSize: 13, lineHeight: 1.6 }}>{c.script}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label>Scene Plan</label>
                      <ul style={{ paddingLeft: 16, fontSize: 13, color: 'var(--text2)' }}>
                        {(c.scene_plan || []).map((s: string, j: number) => <li key={j}>{s}</li>)}
                      </ul>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label>Shot List</label>
                      <ul style={{ paddingLeft: 16, fontSize: 13, color: 'var(--text2)' }}>
                        {(c.shot_list || []).map((s: string, j: number) => <li key={j}>{s}</li>)}
                      </ul>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label>Caption</label>
                      <div dir="rtl" style={{ fontSize: 13 }}>{c.caption}</div>
                    </div>
                    <div>
                      <label>Hashtags</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(c.hashtags || []).map((h: string, j: number) => (
                          <span key={j} className="badge badge-blue">{h}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
