'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Stat({ label, value, color, sub }: { label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--accent2)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function IntegrationRow({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const color = status === 'active' || status === 'connected' ? 'var(--green)' : status === 'fallback' || status === 'configured' ? 'var(--yellow)' : 'var(--red)';
  const label = status === 'active' || status === 'connected' ? 'Active' : status === 'fallback' ? 'Fallback' : status === 'configured' ? 'Configured' : 'Inactive';
  return (
    <tr style={{ cursor: 'default' }}>
      <td style={{ fontWeight: 500 }}>{name}</td>
      <td><span style={{ color }}>{'\u25CF'} {label}</span></td>
      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{detail || ''}</td>
    </tr>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSystemStatus().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading dashboard...</div>;

  const s = data?.stats || {};
  const c = s.campaigns || {};
  const o = s.orders || {};
  const rev = s.revenue || {};

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Complete operations overview</p>
      </div>

      {/* Row 1: Products */}
      <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Products</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="Total Products" value={s.total_products || 0} />
        <Stat label="Approved" value={s.approved || 0} color="var(--green)" />
        <Stat label="Export Ready" value={s.export_ready || 0} color="var(--accent2)" />
        <Stat label="Missing Images" value={s.missing_images || 0} color={s.missing_images > 0 ? 'var(--red)' : 'var(--green)'} />
        <Stat label="Supplier Issues" value={s.supplier_issues || 0} color={s.supplier_issues > 0 ? 'var(--red)' : 'var(--green)'} />
      </div>

      {/* Row 2: Orders */}
      <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Orders & Revenue</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="Total Orders" value={o.total || 0} />
        <Stat label="Pending Fulfillment" value={o.pending || 0} color={o.pending > 0 ? 'var(--yellow)' : 'var(--green)'} />
        <Stat label="Revenue" value={`${rev.total_revenue || 0} SAR`} color="var(--green)" />
        <Stat label="Ad Spend" value={`${rev.total_ad_spend || 0} SAR`} color="var(--yellow)" />
        <Stat label="ROAS" value={`${rev.overall_roas || 0}x`} color={rev.overall_roas >= 2 ? 'var(--green)' : 'var(--yellow)'} />
      </div>

      {/* Row 3: Campaigns */}
      <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Campaigns</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="Active Campaigns" value={(c.testing || 0) + (c.scaled || 0)} color="var(--accent2)" />
        <Stat label="Winning (Scaled)" value={c.scaled || 0} color="var(--green)" />
        <Stat label="Testing" value={c.testing || 0} color="var(--yellow)" />
        <Stat label="Killed" value={c.killed || 0} color="var(--red)" />
        <Stat label="Avg ROAS" value={`${(c.avg_roas || 0).toFixed(2)}x`} color={c.avg_roas >= 2 ? 'var(--green)' : 'var(--yellow)'} />
      </div>

      {/* Row 4: Operations */}
      <h3 style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Operations</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Stat label="Unread Alerts" value={s.unread_alerts || 0} color={s.unread_alerts > 0 ? 'var(--red)' : 'var(--green)'} />
        <Stat label="Unread Emails" value={s.unread_emails || 0} color={s.unread_emails > 0 ? 'var(--yellow)' : 'var(--green)'} />
        <Stat label="Image Coverage" value={`${s.image_coverage_pct || 0}%`} color={s.image_coverage_pct >= 80 ? 'var(--green)' : 'var(--yellow)'} />
        <Stat label="Pushed to Salla" value={s.pushed_to_salla || 0} color="var(--green)" />
      </div>

      {/* Integration Status */}
      <div className="card">
        <h3>Integration Status</h3>
        <table>
          <thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead>
          <tbody>
            {(data?.integrations || []).map((i: any, idx: number) => (
              <IntegrationRow key={idx} name={i.name} status={i.status} detail={i.detail} />
            ))}
            {/* DB-managed integrations */}
            {data?.salla && (
              <IntegrationRow name="Salla (DB Config)" status={data.salla.active ? 'connected' : data.salla.configured ? 'configured' : 'inactive'} detail={data.salla.last_test || ''} />
            )}
            {data?.email && (
              <IntegrationRow name="Email (DB Config)" status={data.email.active ? 'active' : data.email.configured ? 'configured' : 'inactive'} />
            )}
            {(data?.ad_platforms || []).map((p: any) => (
              <IntegrationRow key={p.platform} name={`${p.platform} Ads`} status={p.is_active ? 'active' : 'configured'} detail={`Mode: ${p.mode || 'simulation'}`} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
