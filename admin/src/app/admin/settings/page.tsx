'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'active') return <span style={{ color: 'var(--green)' }}>● Active</span>;
  if (status === 'fallback') return <span style={{ color: 'var(--yellow)' }}>● Fallback</span>;
  return <span style={{ color: 'var(--red)' }}>● Inactive</span>;
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--accent2)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'overview' | 'budget' | 'automation' | 'diagnostics'>('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  useEffect(() => {
    api.getSystemStatus().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  const stats = data?.stats || {};
  const campaigns = stats.campaigns || {};

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="page-header">
        <h1>Settings & Diagnostics</h1>
        <p>System configuration, budget control, and diagnostics</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['overview', 'budget', 'automation', 'diagnostics'] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} campaigns={campaigns} data={data} />}
      {tab === 'budget' && <BudgetTab notify={notify} />}
      {tab === 'automation' && <AutomationTab notify={notify} />}
      {tab === 'diagnostics' && <DiagnosticsTab notify={notify} />}
    </div>
  );
}

function OverviewTab({ stats, campaigns, data }: { stats: any; campaigns: any; data: any }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card"><StatCard label="Total Products" value={stats.total_products || 0} /></div>
        <div className="card"><StatCard label="With Images" value={stats.with_images || 0} color="var(--green)" /></div>
        <div className="card"><StatCard label="Missing Images" value={stats.missing_images || 0} color={stats.missing_images > 0 ? 'var(--red)' : 'var(--green)'} /></div>
        <div className="card"><StatCard label="Image Coverage" value={`${stats.image_coverage_pct || 0}%`} color={stats.image_coverage_pct >= 80 ? 'var(--green)' : 'var(--yellow)'} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card"><StatCard label="Approved" value={stats.approved || 0} color="var(--green)" /></div>
        <div className="card"><StatCard label="Export Ready" value={stats.export_ready || 0} color="var(--accent2)" /></div>
        <div className="card"><StatCard label="Pushed to Salla" value={stats.pushed_to_salla || 0} color="var(--green)" /></div>
        <div className="card"><StatCard label="Active Campaigns" value={(campaigns.testing || 0) + (campaigns.scaled || 0)} color="var(--accent2)" /></div>
      </div>
      <div className="card">
        <h3>Integration Status</h3>
        <table>
          <thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            {(data?.integrations || []).map((i: any, idx: number) => (
              <tr key={idx} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500 }}>{i.name}</td>
                <td><StatusIcon status={i.status} /></td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>{i.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BudgetTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [budget, setBudget] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getBudget().then((r) => setBudget(r.budget || r || {})).catch(() => {}).finally(() => setLoading(false)); }, []);

  const save = async () => {
    setSaving(true);
    try { await api.saveBudget(budget); notify('Budget settings saved'); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  const fields = [
    { key: 'total_ad_budget', label: 'Total Ad Budget (SAR)', desc: 'Maximum total ad spend across all platforms' },
    { key: 'daily_budget', label: 'Daily Budget (SAR)', desc: 'Maximum daily ad spend' },
    { key: 'test_campaign_budget', label: 'Test Campaign Budget (SAR)', desc: 'Budget for testing new products' },
    { key: 'scaling_budget', label: 'Scaling Budget (SAR)', desc: 'Budget for scaling winners' },
    { key: 'max_cpa', label: 'Max CPA (SAR)', desc: 'Kill campaigns above this CPA' },
    { key: 'min_roas', label: 'Min ROAS', desc: 'Minimum return on ad spend to continue' },
    { key: 'emergency_stop_budget', label: 'Emergency Stop Budget (SAR)', desc: 'Kill all campaigns if total spend exceeds this' },
    { key: 'max_daily_burn', label: 'Max Daily Burn (SAR)', desc: 'Alert if daily spend exceeds this' },
    { key: 'max_products_testing_at_once', label: 'Max Products Testing', desc: 'Limit concurrent product tests' },
  ];

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>Budget Control</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {fields.map((f) => (
          <div key={f.key} className="field">
            <label>{f.label}</label>
            <input type="number" value={budget[f.key] ?? ''} onChange={(e) => setBudget({ ...budget, [f.key]: Number(e.target.value) })} />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 16 }}>{saving ? 'Saving...' : 'Save Budget Settings'}</button>
    </div>
  );
}

function AutomationTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [mode, setMode] = useState('manual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getAutomationMode().then((r) => setMode(r.mode || 'manual')).catch(() => {}).finally(() => setLoading(false)); }, []);

  const save = async (newMode: string) => {
    setSaving(true);
    try { await api.setAutomationMode(newMode); setMode(newMode); notify(`Mode set to ${newMode}`); } catch (e: any) { notify(e.message, 'error'); }
    setSaving(false);
  };

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  const modes = [
    { value: 'manual', label: 'Manual', desc: 'All actions require admin approval. AI suggests, you decide.', color: 'var(--yellow)' },
    { value: 'assisted', label: 'Assisted', desc: 'AI auto-executes low-risk tasks (kill losers, send alerts). High-risk needs approval.', color: 'var(--accent2)' },
    { value: 'auto', label: 'Full Auto', desc: 'AI handles everything: scaling, killing, ordering, emails. Monitor via alerts.', color: 'var(--green)' },
  ];

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>Automation Mode</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {modes.map((m) => (
          <div key={m.value} style={{ border: mode === m.value ? `2px solid ${m.color}` : '1px solid var(--border)', borderRadius: 8, padding: 16, cursor: 'pointer', background: mode === m.value ? 'rgba(99,102,241,0.05)' : 'transparent' }} onClick={() => save(m.value)}>
            <div style={{ fontWeight: 700, fontSize: 16, color: m.color, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>{m.desc}</div>
            {mode === m.value && <div style={{ marginTop: 8, fontSize: 11, color: m.color, fontWeight: 600 }}>ACTIVE</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosticsTab({ notify }: { notify: (m: string, t?: string) => void }) {
  const [diag, setDiag] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getDiagnostics().then(setDiag).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div style={{ color: 'var(--text2)', padding: 20 }}>Loading...</div>;

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>System Diagnostics</h3>
      {diag ? (
        <pre className="json-preview">{JSON.stringify(diag, null, 2)}</pre>
      ) : (
        <div style={{ color: 'var(--text2)' }}>No diagnostics data available</div>
      )}
    </div>
  );
}
