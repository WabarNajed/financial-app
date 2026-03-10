'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function statusBadge(s: string) {
  const map: Record<string, string> = { draft: 'badge-gray', testing: 'badge-yellow', scaled: 'badge-green', killed: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

function MetricCard({ label, value, suffix, color }: { label: string; value: number | string; suffix?: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)' }}>{value}{suffix}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function AdsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.getCampaigns().then((r) => setCampaigns(r.data || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const launch = async (id: string) => {
    try {
      const r = await api.launchCampaign(id);
      setToast({ msg: `Launched! ROAS: ${r.performance?.roas}x | CTR: ${r.performance?.ctr}%`, type: 'success' });
      load();
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
  };

  const simulate = async (id: string) => {
    try {
      const r = await api.simulateCampaign(id);
      setToast({ msg: `Simulated: ${r.optimization?.action} — ${r.optimization?.reason}`, type: 'success' });
      load();
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
  };

  const optimize = async () => {
    try {
      const r = await api.runOptimization();
      setToast({ msg: `Optimization: ${r.killed} killed, ${r.scaled} scaled`, type: 'success' });
      load();
    } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
  };

  // Summary stats
  const totalBudget = campaigns.reduce((s, c) => s + (Number(c.budget) || 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (Number(c.impressions) || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (Number(c.clicks) || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + (Number(c.conversions) || 0), 0);
  const avgRoas = campaigns.filter(c => c.roas > 0).length > 0
    ? (campaigns.reduce((s, c) => s + (Number(c.roas) || 0), 0) / campaigns.filter(c => c.roas > 0).length).toFixed(2)
    : '0';

  return (
    <div>
      {toast && <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>{toast.msg}</div>}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <h1>Ad Campaigns</h1>
          <p>Campaign performance, optimization, and scaling</p>
        </div>
        <button className="btn btn-primary" onClick={optimize}>Run Optimization Cycle</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card"><MetricCard label="Total Budget" value={totalBudget} suffix=" SAR" /></div>
        <div className="card"><MetricCard label="Impressions" value={totalImpressions.toLocaleString()} /></div>
        <div className="card"><MetricCard label="Clicks" value={totalClicks.toLocaleString()} /></div>
        <div className="card"><MetricCard label="Conversions" value={totalConversions} color="var(--green)" /></div>
        <div className="card"><MetricCard label="Avg ROAS" value={avgRoas} suffix="x" color={Number(avgRoas) >= 2 ? 'var(--green)' : 'var(--yellow)'} /></div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Product</th><th>Platform</th><th>Budget</th><th>Status</th><th>Stage</th>
              <th>Impr.</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Conv.</th><th>CPA</th><th>ROAS</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40 }}>Loading...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>No campaigns yet. Create one from the product editor.</td></tr>
            ) : campaigns.map((c) => (
              <tr key={c.id} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.product_name || c.product_id?.slice(0, 8)}</td>
                <td><span className="badge badge-blue">{c.platform}</span></td>
                <td>{c.budget} SAR</td>
                <td>{statusBadge(c.status)}</td>
                <td><span className="badge badge-gray">{c.scaling_stage || 'testing'}</span></td>
                <td>{(c.impressions || 0).toLocaleString()}</td>
                <td>{c.clicks || 0}</td>
                <td style={{ color: (c.ctr || 0) >= 1 ? 'var(--green)' : 'var(--red)' }}>{(c.ctr || 0).toFixed(2)}%</td>
                <td>{(c.cpc || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>{c.conversions || 0}</td>
                <td>{(c.cpa || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 600, color: (c.roas || 0) >= 2 ? 'var(--green)' : (c.roas || 0) >= 1 ? 'var(--yellow)' : 'var(--red)' }}>
                  {(c.roas || 0).toFixed(2)}x
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {c.status === 'draft' && <button className="btn btn-success btn-sm" onClick={() => launch(c.id)}>Launch</button>}
                    {c.status !== 'killed' && <button className="btn btn-outline btn-sm" onClick={() => simulate(c.id)}>Simulate</button>}
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
