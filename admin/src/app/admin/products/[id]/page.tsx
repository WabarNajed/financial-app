'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

function Section({ title, open: initOpen, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initOpen !== false);
  return (
    <div className="card">
      <h3 className="section-header" onClick={() => setOpen(!open)}>
        {title} <span style={{ fontSize: 16 }}>{open ? '▾' : '▸'}</span>
      </h3>
      {open && children}
    </div>
  );
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const color = value >= 70 ? 'var(--green)' : value >= 50 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{Number(value).toFixed(1)}</span>
      </div>
      <div className="score-bar"><div className="score-fill" style={{ width: `${Math.min(value, 100)}%`, background: color }} /></div>
    </div>
  );
}

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [exportPreview, setExportPreview] = useState<any>(null);

  // Form state
  const [core, setCore] = useState<any>({});
  const [scores, setScores] = useState<any>({});
  const [commerce, setCommerce] = useState<any>({});
  const [listingPack, setListingPack] = useState<any>({});
  const [status, setStatus] = useState('');

  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProduct(id);
      const d = res.data;
      setCore({
        name: d.name || '', name_ar: d.name_ar || '', category: d.category || '',
        source: d.source || '', source_url: d.source_url || '',
        keywords: Array.isArray(d.keywords) ? d.keywords : (typeof d.keywords === 'string' ? JSON.parse(d.keywords) : []),
        image_urls: Array.isArray(d.image_urls) ? d.image_urls : (typeof d.image_urls === 'string' ? JSON.parse(d.image_urls) : []),
      });
      const sc = d.score || {};
      setScores({
        virality_score: d.virality_score ?? sc.virality_score ?? 0,
        impulse_buy_score: d.impulse_buy_score ?? 0,
        saudi_relevance_score: d.saudi_relevance_score ?? 0,
        supplier_trust_score: sc.supplier_trust_score ?? 0,
        shipping_score: sc.shipping_score ?? 0,
        margin_score: sc.margin_score ?? 0,
        competition_score: sc.competition_score ?? 0,
        trend_score: sc.trend_score ?? 0,
        final_score: sc.final_score ?? 0,
      });
      setCommerce(d.commerce || {});
      setListingPack(d.listing_pack || {});
      setStatus(d.status || 'discovered');
    } catch (e: any) { notify(e.message, 'error'); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProduct(id, { core, scores, commerce, listing_pack: listingPack });
      notify('Product saved');
      load();
    } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };

  const approve = async () => {
    try { await api.approveProduct(id); notify('Product approved'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const reject = async () => {
    try { await api.rejectProduct(id); notify('Product rejected'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const rebuild = async () => {
    try { await api.rebuildExport(id); notify('Export data rebuilt'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const previewExport = async () => {
    try { const res = await api.getExportPreview(id); setExportPreview(res); } catch (e: any) { notify(e.message, 'error'); }
  };
  const copyExportJSON = async () => {
    try {
      const res = await api.getExportPreview(id);
      await navigator.clipboard.writeText(JSON.stringify(res, null, 2));
      notify('Copied to clipboard');
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const updateCore = (k: string, v: any) => setCore((c: any) => ({ ...c, [k]: v }));
  const updateScore = (k: string, v: any) => setScores((s: any) => ({ ...s, [k]: Number(v) }));
  const updateCommerce = (k: string, v: any) => setCommerce((c: any) => ({ ...c, [k]: v }));
  const updateLP = (k: string, v: any) => setListingPack((l: any) => ({ ...l, [k]: v }));

  // Salla simulator computed values
  const simTitle = listingPack.store_title_ar || commerce.arabic_title || core.name_ar || core.name || '';
  const simDesc = listingPack.full_description_ar || commerce.description_ar || '';
  const simPrice = listingPack.compare_at_price_sar || commerce.recommended_price_sar || 0;
  const simSalePrice = commerce.recommended_price_sar || 0;
  const simDiscount = simPrice > 0 && simSalePrice > 0 && simPrice > simSalePrice
    ? Math.round(((simPrice - simSalePrice) / simPrice) * 100) : 0;
  const simTags = Array.isArray(listingPack.tags) ? listingPack.tags : [];
  const simFeatures = Array.isArray(commerce.features) ? commerce.features : [];
  const simSku = listingPack.sku_hint || '';
  const simCategory = listingPack.suggested_category || '';
  const simStock = listingPack.stock_recommendation || 0;

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading product...</div>;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <div className="sticky-bar">
        <div>
          <button className="btn btn-outline btn-sm" onClick={() => router.push('/admin/products')} style={{ marginRight: 10 }}>← Back</button>
          <strong style={{ fontSize: 16 }}>{core.name}</strong>
          <span style={{ marginLeft: 10 }}>{statusBadge(status)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>

      <div className="editor-layout">
        {/* LEFT — Editor Forms */}
        <div>
          {/* Section A: Core Product */}
          <Section title="Core Product">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Name</label><input value={core.name} onChange={(e) => updateCore('name', e.target.value)} /></div>
              <div className="field"><label>Name (Arabic)</label><input dir="rtl" value={core.name_ar} onChange={(e) => updateCore('name_ar', e.target.value)} /></div>
              <div className="field"><label>Category</label><input value={core.category} onChange={(e) => updateCore('category', e.target.value)} /></div>
              <div className="field"><label>Source</label><input value={core.source} onChange={(e) => updateCore('source', e.target.value)} /></div>
            </div>
            <div className="field"><label>Source URL</label><input value={core.source_url} onChange={(e) => updateCore('source_url', e.target.value)} /></div>
            <div className="field">
              <label>Keywords (comma-separated)</label>
              <input value={(core.keywords || []).join(', ')} onChange={(e) => updateCore('keywords', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} />
            </div>
            <div className="field">
              <label>Image URLs (comma-separated)</label>
              <input value={(core.image_urls || []).join(', ')} onChange={(e) => updateCore('image_urls', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} />
            </div>
          </Section>

          {/* Section B: Scores */}
          <Section title="Scores">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {['virality_score', 'impulse_buy_score', 'saudi_relevance_score', 'supplier_trust_score', 'shipping_score', 'margin_score', 'competition_score', 'trend_score', 'final_score'].map((k) => (
                <div key={k}>
                  <ScoreBar value={scores[k] || 0} label={k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} />
                  <input type="number" min={0} max={100} step={0.1} value={scores[k] ?? 0} onChange={(e) => updateScore(k, e.target.value)} style={{ marginTop: 4 }} />
                </div>
              ))}
            </div>
          </Section>

          {/* Section C: Commerce */}
          <Section title="Commerce Package">
            <div className="field"><label>Arabic Title</label><input dir="rtl" value={commerce.arabic_title || ''} onChange={(e) => updateCommerce('arabic_title', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field"><label>Cost (SAR)</label><input type="number" value={commerce.estimated_cost_sar || ''} onChange={(e) => updateCommerce('estimated_cost_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Price (SAR)</label><input type="number" value={commerce.recommended_price_sar || ''} onChange={(e) => updateCommerce('recommended_price_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Profit (SAR)</label><input type="number" value={commerce.estimated_profit_sar || ''} onChange={(e) => updateCommerce('estimated_profit_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Min Price</label><input type="number" value={commerce.min_price_sar || ''} onChange={(e) => updateCommerce('min_price_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Max Price</label><input type="number" value={commerce.max_price_sar || ''} onChange={(e) => updateCommerce('max_price_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Competitor Price</label><input type="number" value={commerce.competitor_price_sar || ''} onChange={(e) => updateCommerce('competitor_price_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Gross Margin %</label><input type="number" value={commerce.gross_margin_percent || ''} onChange={(e) => updateCommerce('gross_margin_percent', Number(e.target.value))} /></div>
              <div className="field"><label>Potential Label</label><input value={commerce.potential_label || ''} onChange={(e) => updateCommerce('potential_label', e.target.value)} /></div>
            </div>
            <div className="field"><label>Description (Arabic)</label><textarea dir="rtl" rows={4} value={commerce.description_ar || ''} onChange={(e) => updateCommerce('description_ar', e.target.value)} /></div>
            <div className="field">
              <label>Features (one per line)</label>
              <textarea dir="rtl" rows={4} value={(commerce.features || []).join('\n')} onChange={(e) => updateCommerce('features', e.target.value.split('\n').filter(Boolean))} />
            </div>
            <div className="card" style={{ background: 'var(--bg)', marginTop: 8 }}>
              <h3>TikTok Ad Script</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Hook</label><input dir="rtl" value={commerce.tiktok_ad_script?.hook || ''} onChange={(e) => updateCommerce('tiktok_ad_script', { ...(commerce.tiktok_ad_script || {}), hook: e.target.value })} /></div>
                <div className="field"><label>Problem</label><input dir="rtl" value={commerce.tiktok_ad_script?.problem || ''} onChange={(e) => updateCommerce('tiktok_ad_script', { ...(commerce.tiktok_ad_script || {}), problem: e.target.value })} /></div>
                <div className="field"><label>Demo</label><input dir="rtl" value={commerce.tiktok_ad_script?.demo || ''} onChange={(e) => updateCommerce('tiktok_ad_script', { ...(commerce.tiktok_ad_script || {}), demo: e.target.value })} /></div>
                <div className="field"><label>CTA</label><input dir="rtl" value={commerce.tiktok_ad_script?.cta || ''} onChange={(e) => updateCommerce('tiktok_ad_script', { ...(commerce.tiktok_ad_script || {}), cta: e.target.value })} /></div>
              </div>
            </div>
          </Section>

          {/* Section D: Listing Pack */}
          <Section title="Listing Pack">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Store Title (Arabic)</label><input dir="rtl" value={listingPack.store_title_ar || ''} onChange={(e) => updateLP('store_title_ar', e.target.value)} /></div>
              <div className="field"><label>Store Title (English)</label><input value={listingPack.store_title_en || ''} onChange={(e) => updateLP('store_title_en', e.target.value)} /></div>
            </div>
            <div className="field"><label>Short Description (Arabic)</label><textarea dir="rtl" rows={2} value={listingPack.short_description_ar || ''} onChange={(e) => updateLP('short_description_ar', e.target.value)} /></div>
            <div className="field"><label>Short Description (English)</label><textarea rows={2} value={listingPack.short_description_en || ''} onChange={(e) => updateLP('short_description_en', e.target.value)} /></div>
            <div className="field"><label>Full Description (Arabic)</label><textarea dir="rtl" rows={5} value={listingPack.full_description_ar || ''} onChange={(e) => updateLP('full_description_ar', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>SEO Title (Arabic)</label><input dir="rtl" value={listingPack.seo_title_ar || ''} onChange={(e) => updateLP('seo_title_ar', e.target.value)} /></div>
              <div className="field"><label>SEO Description (Arabic)</label><input dir="rtl" value={listingPack.seo_description_ar || ''} onChange={(e) => updateLP('seo_description_ar', e.target.value)} /></div>
              <div className="field"><label>Suggested Category</label><input dir="rtl" value={listingPack.suggested_category || ''} onChange={(e) => updateLP('suggested_category', e.target.value)} /></div>
              <div className="field"><label>SKU Hint</label><input value={listingPack.sku_hint || ''} onChange={(e) => updateLP('sku_hint', e.target.value)} /></div>
              <div className="field"><label>Compare-at Price (SAR)</label><input type="number" value={listingPack.compare_at_price_sar || ''} onChange={(e) => updateLP('compare_at_price_sar', Number(e.target.value))} /></div>
              <div className="field"><label>Stock Recommendation</label><input type="number" value={listingPack.stock_recommendation || ''} onChange={(e) => updateLP('stock_recommendation', Number(e.target.value))} /></div>
            </div>
            <div className="field">
              <label>Tags (comma-separated)</label>
              <input dir="rtl" value={(listingPack.tags || []).join(', ')} onChange={(e) => updateLP('tags', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} />
            </div>
          </Section>

          {/* Section E: Export & Approval */}
          <Section title="Export & Approval">
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <div><label>Status</label><div style={{ marginTop: 4 }}>{statusBadge(status)}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {status !== 'approved' && <button className="btn btn-success" onClick={approve}>Approve</button>}
              {status !== 'rejected' && <button className="btn btn-danger" onClick={reject}>Reject</button>}
              <button className="btn btn-outline" onClick={rebuild}>Rebuild Export Data</button>
              <button className="btn btn-outline" onClick={previewExport}>View Export Preview</button>
              <button className="btn btn-outline" onClick={copyExportJSON}>Copy Export JSON</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={async () => { try { await api.generateCreatives(id); notify('Creatives generated'); load(); } catch (e: any) { notify(e.message, 'error'); } }}>Generate Ad Creatives</button>
              <button className="btn btn-outline" onClick={async () => { try { await api.rebuildImages(id); notify('Images rebuilt'); load(); } catch (e: any) { notify(e.message, 'error'); } }}>Rebuild Images</button>
              <button className="btn btn-outline" onClick={async () => { try { await api.createCampaign({ product_id: id, platform: 'tiktok', budget: 50 }); notify('Campaign created — go to Ads page'); } catch (e: any) { notify(e.message, 'error'); } }}>Create Ad Campaign</button>
            </div>
            {exportPreview && (
              <div style={{ marginTop: 16 }}>
                <label>Export Preview</label>
                {!exportPreview.export_ready && exportPreview.validation_errors?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {exportPreview.validation_errors.map((e: string, i: number) => (
                      <div key={i} style={{ color: 'var(--red)', fontSize: 12, marginBottom: 2 }}>• {e}</div>
                    ))}
                  </div>
                )}
                <pre className="json-preview">{JSON.stringify(exportPreview, null, 2)}</pre>
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT — Live Salla Simulator */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ marginBottom: 10 }}>Live Salla Preview</h3>

            {/* Product Card Preview */}
            <div className="sim-card" style={{ marginBottom: 16 }}>
              <div className="sim-img">📦 Product Image</div>
              <div className="sim-body">
                <div className="sim-title">{simTitle || 'Product Title'}</div>
                <div>
                  <span className="sim-price">{simSalePrice} SAR</span>
                  {simPrice > simSalePrice && <span className="sim-compare">{simPrice} SAR</span>}
                  {simDiscount > 0 && <span className="sim-discount">-{simDiscount}%</span>}
                </div>
              </div>
            </div>

            {/* Product Page Preview */}
            <div className="sim-card">
              <div className="sim-body">
                <div className="sim-title" style={{ fontSize: 18 }}>{simTitle || 'Product Title'}</div>
                <div style={{ marginBottom: 12 }}>
                  <span className="sim-price">{simSalePrice} SAR</span>
                  {simPrice > simSalePrice && <span className="sim-compare">{simPrice} SAR</span>}
                  {simDiscount > 0 && <span className="sim-discount">-{simDiscount}%</span>}
                </div>

                {simFeatures.length > 0 && (
                  <ul className="sim-features">
                    {simFeatures.map((f: string, i: number) => <li key={i}>{f}</li>)}
                  </ul>
                )}

                <div className="sim-desc">{simDesc || 'No description'}</div>

                {simTags.length > 0 && (
                  <div className="sim-tags">
                    {simTags.map((t: string, i: number) => <span key={i} className="sim-tag">{t}</span>)}
                  </div>
                )}

                <div className="sim-meta">
                  <span><strong>SKU:</strong> {simSku || '—'}</span>
                  <span><strong>Category:</strong> {simCategory || '—'}</span>
                  <span><strong>Stock:</strong> {simStock}</span>
                  <span><strong>Margin:</strong> {commerce.gross_margin_percent || 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, string> = { approved: 'badge-green', rejected: 'badge-red', discovered: 'badge-blue', analyzed: 'badge-yellow', pushed_to_salla: 'badge-green', failed: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}
