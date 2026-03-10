'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin/products', label: 'Products', icon: '📦' },
  { href: '/admin/queue', label: 'Queue', icon: '📋' },
  { href: '/admin/creatives', label: 'Creatives', icon: '🎬' },
  { href: '/admin/ads', label: 'Ads', icon: '📊' },
  { href: '/admin/export-preview', label: 'Export', icon: '🔄' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
          </Link>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
