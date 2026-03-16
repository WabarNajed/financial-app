'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '🏠' },
  { href: '/admin/products', label: 'Products', icon: '📦' },
  { href: '/admin/orders', label: 'Orders', icon: '🛒' },
  { href: '/admin/queue', label: 'Queue', icon: '📋' },
  { href: '/admin/creatives', label: 'Creatives', icon: '🎬' },
  { href: '/admin/ads', label: 'Campaigns', icon: '📊' },
  { href: '/admin/export-preview', label: 'Export', icon: '🔄' },
  { href: '/admin/integrations', label: 'Integrations', icon: '🔗' },
  { href: '/admin/communications', label: 'Communications', icon: '💬' },
  { href: '/admin/alerts', label: 'Alerts', icon: '🔔' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    api.getUnreadAlertCount().then((r) => setAlertCount(r.unread || 0)).catch(() => {});
    const interval = setInterval(() => {
      api.getUnreadAlertCount().then((r) => setAlertCount(r.unread || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          Saudi Dropshipping AI
          <small>Admin Control Panel</small>
        </div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? 'active' : ''}>
            <span>{n.icon}</span> {n.label}
            {n.label === 'Alerts' && alertCount > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--red)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{alertCount}</span>
            )}
          </Link>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
