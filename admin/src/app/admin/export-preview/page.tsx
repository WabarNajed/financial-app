'use client';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

export default function ExportPreviewPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getProducts({ status: 'approved', limit: '100' }).then((res) => {
      const all = res.data || [];
      setProducts(all);
      if (all.length > 0 && !selected) setSelected(all[0].id);
    }).catch(console.error);
  }, []);

  const loadPreview = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await api.getExportPreview(selected);
      setPreview(res);
    } catch (e: any) {
      setPreview({ error: e.message });
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const copyJSON = async () => {
    if (preview) {
      await navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Export Preview</h1>
        <p>View the Salla payload JSON for approved products</p>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Select Product</label>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {products.length === 0 && <option value="">No approved products</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.status}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={loadPreview}>Refresh</button>
          <button className="btn btn-outline" onClick={copyJSON}>Copy JSON</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>Loading...</div>}

      {preview && !loading && (
        <div className="card">
          {preview.validation_errors?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ color: 'var(--red)', marginBottom: 8 }}>Validation Errors</h3>
              {preview.validation_errors.map((e: string, i: number) => (
                <div key={i} style={{ color: 'var(--red)', fontSize: 13, marginBottom: 2 }}>• {e}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span className={`badge ${preview.export_ready ? 'badge-green' : 'badge-red'}`}>
              {preview.export_ready ? 'Export Ready' : 'Not Ready'}
            </span>
            <span className="badge badge-blue">{preview.approval_status}</span>
          </div>
          <pre className="json-preview">{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
