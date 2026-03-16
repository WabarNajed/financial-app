'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store-context';

export function Header() {
  const { settings, cartCount, customer, logout } = useStore();
  return (
    <header className="store-header">
      <div className="inner">
        <Link href="/" className="store-logo" style={{ textDecoration: 'none' }}>
          {settings.logo_url ? <img src={settings.logo_url} alt={settings.store_name || 'Store'} /> : (settings.store_name_ar || settings.store_name || 'Store')}
        </Link>
        <nav className="store-nav">
          <Link href="/products">Products</Link>
          <Link href="/categories">Categories</Link>
          <Link href="/contact">Contact</Link>
          {customer ? (
            <>
              <Link href="/account">{customer.name}</Link>
              <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 }}>Logout</button>
            </>
          ) : (
            <Link href="/auth">Login</Link>
          )}
          <Link href="/cart" className="cart-badge" style={{ fontSize: 20, textDecoration: 'none' }}>
            🛒{cartCount > 0 && <span className="count">{cartCount}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const { settings } = useStore();
  return (
    <footer className="store-footer">
      <div className="footer-grid">
        <div>
          <h4>{settings.store_name_ar || settings.store_name || 'Store'}</h4>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            {settings.store_description_ar || settings.store_description || 'Your trusted online store.'}
          </p>
          {settings.whatsapp_number && (
            <a href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener" style={{ display: 'inline-block', marginTop: 10, background: '#25d366', color: 'white', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              WhatsApp
            </a>
          )}
        </div>
        <div>
          <h4>Quick Links</h4>
          <Link href="/products">All Products</Link>
          <Link href="/categories">Categories</Link>
          <Link href="/track">Track Order</Link>
          <Link href="/contact">Contact Us</Link>
        </div>
        <div>
          <h4>Connect</h4>
          {settings.instagram_url && <a href={settings.instagram_url} target="_blank" rel="noopener">Instagram</a>}
          {settings.tiktok_url && <a href={settings.tiktok_url} target="_blank" rel="noopener">TikTok</a>}
          {settings.twitter_url && <a href={settings.twitter_url} target="_blank" rel="noopener">Twitter</a>}
          {settings.facebook_url && <a href={settings.facebook_url} target="_blank" rel="noopener">Facebook</a>}
          {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
        </div>
      </div>
      <div className="footer-bottom">
        {settings.footer_text_ar || settings.footer_text || `© ${new Date().getFullYear()} ${settings.store_name || 'Store'}. All rights reserved.`}
      </div>
    </footer>
  );
}

export function ProductCard({ product }: { product: any }) {
  const imgs = product.image_urls || [];
  const img = product.primary_image_url || imgs[0];
  const price = Number(product.storefront_price) || 0;
  const compare = Number(product.compare_at_price) || 0;
  const discount = compare > price && price > 0 ? Math.round(((compare - price) / compare) * 100) : 0;
  return (
    <Link href={`/products/${product.slug || product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="product-card">
        <div className="img-wrap">
          {img ? <img src={img} alt={product.name_ar || product.name} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>No Image</div>}
          {discount > 0 && <span className="discount">-{discount}%</span>}
        </div>
        <div className="info">
          <div className="name">{product.name_ar || product.name}</div>
          <div className="price-row">
            <span className="price">{price} SAR</span>
            {compare > price && <span className="compare-price">{compare} SAR</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Toast({ msg, type, onDone }: { msg: string; type?: string; onDone: () => void }) {
  if (typeof window !== 'undefined') setTimeout(onDone, 3000);
  return <div className={`toast ${type === 'error' ? 'toast-error' : ''}`}>{msg}</div>;
}
