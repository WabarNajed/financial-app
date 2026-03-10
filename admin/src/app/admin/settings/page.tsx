'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSystemStatus().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  const stats = data?.stats || {};
  const campaigns = stats.campaigns || {};

  return (
    <div>
      <div className="page-header">
        <h1>Settings & Diagnostics</h1>
        <p>System configuration, integration status, and statistics</p>
      </div>

      {/* Product Stats */}
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

      {/* Integration Status */}
      <div className="card">
        <h3>Integration Status</h3>
        <table>
          <thead><tr><th>Service</th><th>Status</th><th>Details</th><th>Missing Env Vars</th><th>Impact</th></tr></thead>
          <tbody>
            {(data?.integrations || []).map((i: any, idx: number) => {
              const envMap: Record<string, { vars: string; impact: string }> = {
                'PostgreSQL': { vars: i.status !== 'active' ? 'DB_PASSWORD, DATABASE_URL' : '—', impact: i.status !== 'active' ? 'No data persistence' : 'Full database' },
                'LLM (Content Generation)': { vars: i.status !== 'active' ? 'OPENAI_API_KEY' : '—', impact: i.status === 'fallback' ? 'Using deterministic fallback' : 'AI-powered content' },
                'Salla Store': { vars: i.status !== 'active' ? 'SALLA_CLIENT_ID, SALLA_ACCESS_TOKEN' : '—', impact: i.status !== 'active' ? 'Cannot push products to store' : 'Store connected' },
                'AliExpress': { vars: i.status === 'fallback' ? 'RAPIDAPI_KEY or ALIEXPRESS_APP_KEY' : '—', impact: i.status === 'fallback' ? 'Mock product pool only' : 'Live supplier data' },
                'Alibaba': { vars: i.status !== 'active' ? 'ALIBABA_APP_KEY' : '—', impact: i.status !== 'active' ? 'Scraping fallback' : 'Official API' },
                'n8n Automation': { vars: i.status !== 'active' ? 'N8N_API_KEY' : '—', impact: i.status !== 'active' ? 'No workflow automation' : 'Automated pipelines' },
              };
              const info = envMap[i.name] || { vars: '—', impact: '—' };
              return (
                <tr key={idx} style={{ cursor: 'default' }}>
                  <td style={{ fontWeight: 500 }}>{i.name}</td>
                  <td><StatusIcon status={i.status} /></td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{i.detail}</td>
                  <td style={{ fontSize: 12, color: info.vars !== '—' ? 'var(--red)' : 'var(--text2)' }}>{info.vars}</td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{info.impact}</td>
                </tr>
              );
            })}
            {/* Ad platform readiness */}
            {['TikTok Ads API', 'Snapchat Ads API', 'Meta Ads API'].map((name) => (
              <tr key={name} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500 }}>{name}</td>
                <td><span style={{ color: 'var(--yellow)' }}>● Prepared</span></td>
                <td style={{ color: 'var(--text2)', fontSize: 12 }}>Architecture ready, simulation mode</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>API credentials</td>
                <td style={{ fontSize: 12, color: 'var(--text2)' }}>Using simulated results</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Campaign Stats */}
      <div className="card">
        <h3>Campaign Statistics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard label="Total Campaigns" value={campaigns.total || 0} />
          <StatCard label="Testing" value={campaigns.testing || 0} color="var(--yellow)" />
          <StatCard label="Scaled" value={campaigns.scaled || 0} color="var(--green)" />
          <StatCard label="Killed" value={campaigns.killed || 0} color="var(--red)" />
        </div>
      </div>

      {/* Config Reference */}
      <div className="card">
        <h3>Configuration Reference</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <h4 style={{ fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>Pricing Defaults</h4>
            <table>
              <tbody>
                {[
                  ['Target Margin', '35%'], ['Minimum Margin', '20%'], ['VAT Rate', '15%'],
                  ['Platform Fee', '2.5%'], ['Default Shipping (SAR)', '25'], ['USD → SAR Rate', '3.75'],
                ].map(([k, v]) => (
                  <tr key={k} style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>Scoring Weights</h4>
            <table>
              <tbody>
                {[
                  ['Trend', '20%'], ['Demand', '20%'], ['Margin', '15%'], ['Virality', '15%'],
                  ['Shipping', '10%'], ['Competition', '10%'], ['Supplier Trust', '10%'],
                ].map(([k, v]) => (
                  <tr key={k} style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ad Optimization Thresholds */}
      <div className="card">
        <h3>Ad Optimization Rules</h3>
        <table>
          <thead><tr><th>Rule</th><th>Condition</th><th>Action</th></tr></thead>
          <tbody>
            {[
              ['Kill Low CTR', 'CTR < 1% after 500+ impressions', 'Kill creative, launch new'],
              ['Kill High CPA', 'CPA > 1.5x target CPA after 20+ clicks', 'Kill creative'],
              ['Scale Winner', 'ROAS >= 2.0x', 'Increase budget 1.5x'],
              ['Aggressive Scale', 'ROAS >= 3.0x', 'Increase budget 2.0x'],
            ].map(([rule, cond, action]) => (
              <tr key={rule} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500 }}>{rule}</td>
                <td style={{ color: 'var(--text2)', fontSize: 13 }}>{cond}</td>
                <td style={{ fontSize: 13 }}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scaling Stages */}
      <div className="card">
        <h3>Scaling Stages</h3>
        <table>
          <thead><tr><th>Stage</th><th>ROAS Required</th><th>Budget Range</th></tr></thead>
          <tbody>
            {[
              ['Testing', '—', '< 200 SAR'],
              ['Validation', '>= 2.0x', '200 - 500 SAR'],
              ['Scale', '>= 2.0x', '200 - 500 SAR'],
              ['Aggressive Scale', '>= 2.5x', '500+ SAR'],
            ].map(([stage, roas, budget]) => (
              <tr key={stage} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500 }}>{stage}</td>
                <td>{roas}</td>
                <td style={{ color: 'var(--text2)' }}>{budget}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Category Markup Rules</h3>
        <table>
          <thead><tr><th>Category</th><th>Min Markup</th><th>Max Markup</th><th>Shipping</th></tr></thead>
          <tbody>
            {[
              { cat: 'Beauty', min: '2.5x', max: '3.5x', ship: '12 SAR' },
              { cat: 'Fitness', min: '2.0x', max: '2.8x', ship: '25 SAR' },
              { cat: 'Tech', min: '2.2x', max: '3.0x', ship: '18 SAR' },
              { cat: 'Kitchen', min: '2.3x', max: '3.2x', ship: '15 SAR' },
              { cat: 'Car', min: '2.0x', max: '2.6x', ship: '20 SAR' },
              { cat: 'Home', min: '2.4x', max: '3.3x', ship: '15 SAR' },
            ].map((r) => (
              <tr key={r.cat} style={{ cursor: 'default' }}>
                <td style={{ fontWeight: 500 }}>{r.cat}</td><td>{r.min}</td><td>{r.max}</td><td>{r.ship}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System Workflow */}
      <div className="card">
        <h3>Full System Workflow</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {[
            'AI Discovers Products', 'AI Analyzes & Scores', 'AI Generates Listings',
            'Admin Approves', 'AI Generates Creatives', 'Admin Selects Creative',
            'AI Launches Ad Test', 'AI Monitors Performance', 'AI Kills Losers', 'AI Scales Winners',
          ].map((step, i) => (
            <span key={i}>
              <span className="badge badge-blue" style={{ fontSize: 12 }}>{i + 1}. {step}</span>
              {i < 9 && <span style={{ margin: '0 2px', color: 'var(--text2)' }}>→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
