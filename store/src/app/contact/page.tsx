'use client';
import { useStore } from '@/lib/store-context';
import { Header, Footer } from '../components';

export default function ContactPage() {
  const { settings } = useStore();

  return (
    <>
      <Header />
      <div className="container-sm" style={{ padding: '40px 20px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Contact Us</h1>
        <p style={{ textAlign: 'center', color: 'var(--text2)', marginBottom: 32 }}>We are here to help!</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 600, margin: '0 auto' }}>
          {settings.whatsapp_number && (
            <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener" style={{ background: '#25d366', color: 'white', padding: 24, borderRadius: 'var(--radius)', textAlign: 'center', textDecoration: 'none', fontWeight: 600 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>WhatsApp
            </a>
          )}
          {settings.email && (
            <a href={`mailto:${settings.email}`} style={{ background: 'var(--primary)', color: 'white', padding: 24, borderRadius: 'var(--radius)', textAlign: 'center', textDecoration: 'none', fontWeight: 600 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>Email
            </a>
          )}
          {settings.phone && (
            <a href={`tel:${settings.phone}`} style={{ background: 'var(--bg2)', padding: 24, borderRadius: 'var(--radius)', textAlign: 'center', textDecoration: 'none', color: 'var(--text)', fontWeight: 600 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📞</div>{settings.phone}
            </a>
          )}
          {settings.address && (
            <div style={{ background: 'var(--bg2)', padding: 24, borderRadius: 'var(--radius)', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📍</div>
              <div style={{ fontWeight: 600 }}>{settings.city || ''}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{settings.address}</div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
