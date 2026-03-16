'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

function Toast({ msg, type, onDone }: { msg: string; type: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast toast-${type}`}>{msg}</div>;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--red)', warning: 'var(--yellow)', info: 'var(--accent2)',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const notify = (msg: string, type = 'success') => setToast({ msg, type });

  const load = () => {
    setLoading(true);
    api.getAlerts(filter ? { severity: filter } : {}).then((r) => setAlerts(r.alerts || r.data || [])).catch((e) => notify(e.message, 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const markRead = async (id: string) => {
    try { await api.markAlertRead(id); notify('Marked as read'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };
  const resolve = async (id: string) => {
    try { await api.resolveAlert(id); notify('Alert resolved'); load(); } catch (e: any) { notify(e.message, 'error'); }
  };

  const unread = alerts.filter((a) => !a.is_read).length;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="page-header">
        <h1>Alerts {unread > 0 && <span style={{ fontSize: 14, background: 'var(--red)', color: 'white', borderRadius: 10, padding: '2px 10px', marginLeft: 8 }}>{unread} unread</span>}</h1>
        <p>System alerts, warnings, and notifications</p>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', 'critical', 'warning', 'info'].map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f)}>
            {f || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text2)' }}>No alerts</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a: any) => (
            <div key={a.id} className="card" style={{ opacity: a.is_read ? 0.7 : 1, borderLeft: `3px solid ${SEVERITY_COLORS[a.severity] || 'var(--border)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: SEVERITY_COLORS[a.severity] || 'var(--text2)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>{a.severity}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{a.alert_type || a.type}</span>
                    {!a.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
                  </div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{a.title || a.message}</div>
                  {a.details && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{typeof a.details === 'object' ? JSON.stringify(a.details) : a.details}</div>}
                  {a.product_id && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Product: {a.product_id}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {!a.is_read && <button className="btn btn-sm btn-outline" onClick={() => markRead(a.id)}>Mark Read</button>}
                  {!a.is_resolved && <button className="btn btn-sm btn-success" onClick={() => resolve(a.id)}>Resolve</button>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
