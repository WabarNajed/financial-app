'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

function StatusDot({ active, label }: { active: boolean; label?: string }) {
  return <span style={{ color: active ? 'var(--green)' : 'var(--red)' }}>{'\u25CF'} {label || (active ? 'Active' : 'Inactive')}</span>;
}

// ── Salla Tab ──
function SallaTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.getSallaConfig().then((r) => { setConfig(r.config || r || {}); }).catch(() => {}).finally(() => setLoading(false)); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveSallaConfig(config); notify('Salla config saved'); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };
  const test = async () => {
    setTesting(true);
    try { const r = await api.testSallaConnection(); notify(r.success ? 'Connection successful' : `Test failed: ${r.error || 'Unknown'}`, r.success ? 'success' : 'error'); } catch (e: any) { notify(e.message, 'error'); }
    setTesting(false);
  };
  const toggle = async (enable: boolean) => {
    try { enable ? await api.enableSalla() : await api.disableSalla(); notify(enable ? 'Salla enabled' : 'Salla disabled'); api.getSallaConfig().then((r) => setConfig(r.config || r || {})); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Salla Store Integration</h3>
        <StatusDot active={!!config.is_active} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Client ID</label><input value={config.client_id || ''} onChange={(e) => setConfig({ ...config, client_id: e.target.value })} /></div>
        <div className="field"><label>Client Secret</label><input type="password" value={config.client_secret || ''} onChange={(e) => setConfig({ ...config, client_secret: e.target.value })} /></div>
        <div className="field"><label>Access Token</label><input type="password" value={config.access_token || ''} onChange={(e) => setConfig({ ...config, access_token: e.target.value })} /></div>
        <div className="field"><label>Refresh Token</label><input type="password" value={config.refresh_token || ''} onChange={(e) => setConfig({ ...config, refresh_token: e.target.value })} /></div>
        <div className="field"><label>Store URL</label><input value={config.store_url || ''} onChange={(e) => setConfig({ ...config, store_url: e.target.value })} placeholder="https://your-store.salla.sa" /></div>
        <div className="field"><label>Webhook Secret</label><input type="password" value={config.webhook_secret || ''} onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })} /></div>
      </div>
      {config.last_test_status && (
        <div style={{ marginTop: 8, fontSize: 12, color: config.last_test_status === 'success' ? 'var(--green)' : 'var(--red)' }}>
          Last test: {config.last_test_status} {config.last_test_message && `— ${config.last_test_message}`}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button className="btn btn-outline" onClick={test} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</button>
        {config.is_active
          ? <button className="btn btn-danger" onClick={() => toggle(false)}>Disable</button>
          : <button className="btn btn-success" onClick={() => toggle(true)}>Enable</button>
        }
      </div>
    </div>
  );
}

// ── Email Tab ──
function EmailTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ host: '', port: 587, secure: false, username: '', password: '', from_email: '', display_name: '' });
  const [saving, setSaving] = useState(false);

  const load = () => { api.getEmailAccounts().then((r) => setAccounts(r.accounts || r.data || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveEmailAccount(form); notify('Email account saved'); load(); setForm({ host: '', port: 587, secure: false, username: '', password: '', from_email: '', display_name: '' }); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };
  const test = async (id?: string) => {
    try { const r = await api.testEmailConnection(id); notify(r.success ? 'Email connection OK' : `Test failed: ${r.error || ''}`, r.success ? 'success' : 'error'); } catch (e: any) { notify(e.message, 'error'); }
  };
  const toggle = async (id: string, enable: boolean) => {
    try { enable ? await api.enableEmail(id) : await api.disableEmail(id); notify(enable ? 'Enabled' : 'Disabled'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>Email Accounts</h3>
      {accounts.length > 0 && (
        <table style={{ marginBottom: 20 }}>
          <thead><tr><th>Email</th><th>Host</th><th>Status</th><th>Last Test</th><th>Actions</th></tr></thead>
          <tbody>
            {accounts.map((a: any) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 500 }}>{a.from_email || a.username}</td>
                <td style={{ fontSize: 12 }}>{a.host}:{a.port}</td>
                <td><StatusDot active={!!a.is_active} /></td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.last_test_status || '—'}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm btn-outline" onClick={() => test(a.id)}>Test</button>
                  {a.is_active
                    ? <button className="btn btn-sm btn-danger" onClick={() => toggle(a.id, false)}>Disable</button>
                    : <button className="btn btn-sm btn-success" onClick={() => toggle(a.id, true)}>Enable</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card" style={{ background: 'var(--bg)' }}>
        <h4 style={{ marginBottom: 12 }}>Add / Update Email Account</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>SMTP Host</label><input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.gmail.com" /></div>
          <div className="field"><label>Port</label><input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></div>
          <div className="field"><label>Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="field"><label>Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="field"><label>From Email</label><input value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} /></div>
          <div className="field"><label>Display Name</label><input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} /> Use TLS/SSL
          </label>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving...' : 'Save Account'}</button>
      </div>
    </div>
  );
}

// ── Ads Tab ──
function AdsTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ platform: 'tiktok_ads', app_id: '', app_secret: '', access_token: '' });
  const [saving, setSaving] = useState(false);

  const load = () => { api.getAdPlatforms().then((r) => setPlatforms(r.platforms || r.data || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveAdPlatform(form); notify('Ad platform saved'); load(); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };
  const toggle = async (platform: string, enable: boolean) => {
    try { enable ? await api.enableAdPlatform(platform) : await api.disableAdPlatform(platform); notify(enable ? 'Enabled' : 'Disabled'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const setMode = async (platform: string, mode: string) => {
    try { await api.setAdPlatformMode(platform, mode); notify(`Mode set to ${mode}`); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>Ad Platforms</h3>
      {platforms.length > 0 && (
        <table style={{ marginBottom: 20 }}>
          <thead><tr><th>Platform</th><th>Status</th><th>Mode</th><th>Actions</th></tr></thead>
          <tbody>
            {platforms.map((p: any) => (
              <tr key={p.platform}>
                <td style={{ fontWeight: 500 }}>{p.platform}</td>
                <td><StatusDot active={!!p.is_active} /></td>
                <td>
                  <select value={p.mode || 'simulation'} onChange={(e) => setMode(p.platform, e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    <option value="simulation">Simulation</option>
                    <option value="live">Live</option>
                  </select>
                </td>
                <td style={{ display: 'flex', gap: 4 }}>
                  {p.is_active
                    ? <button className="btn btn-sm btn-danger" onClick={() => toggle(p.platform, false)}>Disable</button>
                    : <button className="btn btn-sm btn-success" onClick={() => toggle(p.platform, true)}>Enable</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="card" style={{ background: 'var(--bg)' }}>
        <h4 style={{ marginBottom: 12 }}>Add / Update Ad Platform</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Platform</label>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value="tiktok_ads">TikTok Ads</option>
              <option value="snapchat_ads">Snapchat Ads</option>
              <option value="meta_ads">Meta Ads</option>
            </select>
          </div>
          <div className="field"><label>App ID</label><input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} /></div>
          <div className="field"><label>App Secret</label><input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} /></div>
          <div className="field"><label>Access Token</label><input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} /></div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 12 }}>{saving ? 'Saving...' : 'Save Platform'}</button>
      </div>
    </div>
  );
}

// ── Main Page ──
export default function IntegrationsPage() {
  const [tab, setTab] = useState<'salla' | 'email' | 'ads'>('salla');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="page-header">
        <h1>Integrations</h1>
        <p>Manage Salla, Email, and Ad platform connections</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['salla', 'email', 'ads'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t === 'ads' ? 'Ad Platforms' : t === 'salla' ? 'Salla Store' : 'Email'}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'salla' && <SallaTab notify={notify} />}
        {tab === 'email' && <EmailTab notify={notify} />}
        {tab === 'ads' && <AdsTab notify={notify} />}
      </div>
    </div>
  );
}
