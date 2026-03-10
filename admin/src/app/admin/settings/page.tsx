'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function StatusIcon({ status }: { status: string }) {
  if (status === 'active') return <span style={{ color: 'var(--green)' }}>● Active</span>;
  if (status === 'fallback') return <span style={{ color: 'var(--yellow)' }}>● Fallback</span>;
  return <span style={{ color: 'var(--red)' }}>● Inactive</span>;
}

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSystemStatus().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>System configuration and integration status</p>
      </div>

      {/* Integration Status */}
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

      {/* Stats */}
      <div className="card">
        <h3>Database Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent2)' }}>{data?.stats?.total_products || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Total Products</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{data?.stats?.approved || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Approved</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{data?.stats?.pushed_to_salla || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Pushed to Salla</div>
          </div>
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
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Target Margin</td><td>35%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Minimum Margin</td><td>20%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>VAT Rate</td><td>15%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Platform Fee</td><td>2.5%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Default Shipping (SAR)</td><td>25</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>USD → SAR Rate</td><td>3.75</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ fontSize: 13, marginBottom: 10, color: 'var(--text)' }}>Scoring Weights</h4>
            <table>
              <tbody>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Trend</td><td>20%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Demand</td><td>20%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Margin</td><td>15%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Virality</td><td>15%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Shipping</td><td>10%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Competition</td><td>10%</td></tr>
                <tr style={{ cursor: 'default' }}><td style={{ color: 'var(--text2)' }}>Supplier Trust</td><td>10%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Category Markup Rules</h3>
        <table>
          <thead><tr><th>Category</th><th>Min Markup</th><th>Max Markup</th><th>Shipping Surcharge</th></tr></thead>
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
    </div>
  );
}
