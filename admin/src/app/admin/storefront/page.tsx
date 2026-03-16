'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

export default function StorefrontPage() {
  const [tab, setTab] = useState<'theme' | 'categories' | 'publish' | 'customers'>('theme');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="page-header">
        <h1>Storefront Management</h1>
        <p>Control your custom store: theme, categories, and product publishing</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['theme', 'categories', 'publish', 'customers'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>
      {tab === 'theme' && <ThemeTab notify={notify} />}
      {tab === 'categories' && <CategoriesTab notify={notify} />}
      {tab === 'publish' && <PublishTab notify={notify} />}
      {tab === 'customers' && <CustomersTab />}
    </div>
  );
}

// ── Theme Tab ──
function ThemeTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getStoreSettings().then((r) => setSettings(r.settings || {})).catch(() => {}).finally(() => setLoading(false)); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveStoreSettings(settings); notify('Store settings saved'); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };

  const update = (k: string, v: any) => setSettings((s: any) => ({ ...s, [k]: v }));

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      {/* Branding */}
      <div className="card">
        <h3>Branding</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Store Name</label><input value={settings.store_name || ''} onChange={(e) => update('store_name', e.target.value)} /></div>
          <div className="field"><label>Store Name (Arabic)</label><input dir="rtl" value={settings.store_name_ar || ''} onChange={(e) => update('store_name_ar', e.target.value)} /></div>
          <div className="field"><label>Logo URL</label><input value={settings.logo_url || ''} onChange={(e) => update('logo_url', e.target.value)} placeholder="https://..." /></div>
          <div className="field"><label>Favicon URL</label><input value={settings.favicon_url || ''} onChange={(e) => update('favicon_url', e.target.value)} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Store Description (Arabic)</label><textarea dir="rtl" rows={2} value={settings.store_description_ar || ''} onChange={(e) => update('store_description_ar', e.target.value)} /></div>
        </div>
      </div>

      {/* Colors */}
      <div className="card">
        <h3>Theme Colors</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { key: 'primary_color', label: 'Primary' },
            { key: 'secondary_color', label: 'Secondary' },
            { key: 'accent_color', label: 'Accent' },
            { key: 'background_color', label: 'Background' },
            { key: 'text_color', label: 'Text' },
          ].map((c) => (
            <div key={c.key} className="field">
              <label>{c.label}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={settings[c.key] || '#6366f1'} onChange={(e) => update(c.key, e.target.value)} style={{ width: 40, height: 32, padding: 2 }} />
                <input value={settings[c.key] || ''} onChange={(e) => update(c.key, e.target.value)} style={{ flex: 1 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hero */}
      <div className="card">
        <h3>Hero Banner</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Hero Title</label><input value={settings.hero_title || ''} onChange={(e) => update('hero_title', e.target.value)} /></div>
          <div className="field"><label>Hero Title (Arabic)</label><input dir="rtl" value={settings.hero_title_ar || ''} onChange={(e) => update('hero_title_ar', e.target.value)} /></div>
          <div className="field"><label>Hero Subtitle</label><input value={settings.hero_subtitle || ''} onChange={(e) => update('hero_subtitle', e.target.value)} /></div>
          <div className="field"><label>Hero Subtitle (Arabic)</label><input dir="rtl" value={settings.hero_subtitle_ar || ''} onChange={(e) => update('hero_subtitle_ar', e.target.value)} /></div>
          <div className="field"><label>Hero Image URL</label><input value={settings.hero_image_url || ''} onChange={(e) => update('hero_image_url', e.target.value)} /></div>
          <div className="field"><label>CTA Text (Arabic)</label><input dir="rtl" value={settings.hero_cta_text_ar || ''} onChange={(e) => update('hero_cta_text_ar', e.target.value)} /></div>
        </div>
      </div>

      {/* Sections toggle */}
      <div className="card">
        <h3>Homepage Sections</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            { key: 'show_hero', label: 'Hero Banner' },
            { key: 'show_featured', label: 'Featured Products' },
            { key: 'show_categories', label: 'Categories' },
            { key: 'show_new_arrivals', label: 'New Arrivals' },
            { key: 'show_trust_badges', label: 'Trust Badges' },
          ].map((s) => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={settings[s.key] !== false} onChange={(e) => update(s.key, e.target.checked)} /> {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="card">
        <h3>Contact & Social</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>WhatsApp Number</label><input value={settings.whatsapp_number || ''} onChange={(e) => update('whatsapp_number', e.target.value)} placeholder="+966..." /></div>
          <div className="field"><label>Phone</label><input value={settings.phone || ''} onChange={(e) => update('phone', e.target.value)} /></div>
          <div className="field"><label>Email</label><input value={settings.email || ''} onChange={(e) => update('email', e.target.value)} /></div>
          <div className="field"><label>Address</label><input value={settings.address || ''} onChange={(e) => update('address', e.target.value)} /></div>
          <div className="field"><label>Instagram URL</label><input value={settings.instagram_url || ''} onChange={(e) => update('instagram_url', e.target.value)} /></div>
          <div className="field"><label>TikTok URL</label><input value={settings.tiktok_url || ''} onChange={(e) => update('tiktok_url', e.target.value)} /></div>
          <div className="field"><label>Twitter URL</label><input value={settings.twitter_url || ''} onChange={(e) => update('twitter_url', e.target.value)} /></div>
          <div className="field"><label>Facebook URL</label><input value={settings.facebook_url || ''} onChange={(e) => update('facebook_url', e.target.value)} /></div>
        </div>
      </div>

      {/* Footer */}
      <div className="card">
        <h3>Footer & Policies</h3>
        <div className="field"><label>Footer Text (Arabic)</label><textarea dir="rtl" rows={2} value={settings.footer_text_ar || ''} onChange={(e) => update('footer_text_ar', e.target.value)} /></div>
        <div className="field"><label>Privacy Policy</label><textarea rows={4} value={settings.privacy_policy || ''} onChange={(e) => update('privacy_policy', e.target.value)} /></div>
        <div className="field"><label>Terms of Service</label><textarea rows={4} value={settings.terms_of_service || ''} onChange={(e) => update('terms_of_service', e.target.value)} /></div>
        <div className="field"><label>Return Policy</label><textarea rows={4} value={settings.return_policy || ''} onChange={(e) => update('return_policy', e.target.value)} /></div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginBottom: 40 }}>{saving ? 'Saving...' : 'Save All Settings'}</button>
    </div>
  );
}

// ── Categories Tab ──
function CategoriesTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ name: '', name_ar: '', slug: '', description_ar: '', image_url: '', sort_order: 0, is_active: true });
  const [saving, setSaving] = useState(false);

  const load = () => { api.getCategories().then((r) => setCategories(r.categories || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name || !form.slug) { notify('Name and slug required', 'error'); return; }
    setSaving(true);
    try { await api.saveCategory(form); notify('Category saved'); load(); setForm({ name: '', name_ar: '', slug: '', description_ar: '', image_url: '', sort_order: 0, is_active: true }); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try { await api.deleteCategory(id); notify('Deleted'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      {categories.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <table>
            <thead><tr><th>Name</th><th>Name (AR)</th><th>Slug</th><th>Products</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>
              {categories.map((c: any) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td dir="rtl">{c.name_ar || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.slug}</td>
                  <td>{c.product_count || 0}</td>
                  <td>{c.is_active ? '✓' : '—'}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-outline" onClick={() => setForm(c)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card" style={{ background: 'var(--bg)' }}>
        <h4 style={{ marginBottom: 12 }}>{form.id ? 'Edit Category' : 'New Category'}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Name (Arabic)</label><input dir="rtl" value={form.name_ar || ''} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
          <div className="field"><label>Slug</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="electronics, fashion..." /></div>
          <div className="field"><label>Image URL</label><input value={form.image_url || ''} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></div>
          <div className="field"><label>Sort Order</label><input type="number" value={form.sort_order || 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
          <div className="field"><label>Active</label><select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'true' })} style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}><option value="true">Yes</option><option value="false">No</option></select></div>
        </div>
        <div className="field"><label>Description (Arabic)</label><textarea dir="rtl" rows={2} value={form.description_ar || ''} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} /></div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Category'}</button>
      </div>
    </div>
  );
}

// ── Publish Tab ──
function PublishTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      api.getProducts({ limit: '200' }),
      api.getCategories(),
    ]).then(([pRes, cRes]) => {
      setProducts(pRes.data || []);
      setCategories(cRes.categories || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const publish = async (id: string) => {
    try { await api.publishProduct(id, {}); notify('Published to storefront'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const unpublish = async (id: string) => {
    try { await api.unpublishProduct(id); notify('Unpublished'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  const published = products.filter((p) => p.is_published);
  const unpublished = products.filter((p) => !p.is_published);

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{published.length}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Published</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text2)' }}>{unpublished.length}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Unpublished</div></div>
        </div>
      </div>
      <div className="card">
        <h3>All Products</h3>
        <table>
          <thead><tr><th>Product</th><th>Status</th><th>Price</th><th>Published</th><th>Actions</th></tr></thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td style={{ fontSize: 12 }}>{p.status}</td>
                <td>{p.storefront_price || '—'}</td>
                <td>{p.is_published ? <span style={{ color: 'var(--green)' }}>Live</span> : <span style={{ color: 'var(--text2)' }}>Draft</span>}</td>
                <td>
                  {p.is_published
                    ? <button className="btn btn-sm btn-danger" onClick={() => unpublish(p.id)}>Unpublish</button>
                    : <button className="btn btn-sm btn-success" onClick={() => publish(p.id)}>Publish</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Customers Tab ──
function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getCustomers().then((r) => setCustomers(r.customers || [])).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div className="card">
      <h3>Customers ({customers.length})</h3>
      {customers.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 30 }}>No customers yet</div>
      ) : (
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Joined</th></tr></thead>
          <tbody>
            {customers.map((c: any) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td style={{ fontSize: 12 }}>{c.email}</td>
                <td style={{ fontSize: 12 }}>{c.phone || '—'}</td>
                <td style={{ fontSize: 12 }}>{c.city || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
