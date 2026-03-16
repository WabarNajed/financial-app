'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store-context';
import { Header, Footer, ProductCard } from './components';

export default function HomePage() {
  const { settings } = useStore();
  const [featured, setFeatured] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]);

  useEffect(() => {
    api.getProducts({ limit: '8' }).then((r) => setFeatured(r.products || [])).catch(() => {});
    api.getCategories().then((r) => setCategories(r.categories || [])).catch(() => {});
    api.getProducts({ limit: '4', sort: 'newest' }).then((r) => setNewArrivals(r.products || [])).catch(() => {});
  }, []);

  return (
    <>
      <Header />

      {/* Hero */}
      {settings.show_hero !== false && (
        <section className="hero" style={settings.primary_color ? { background: `linear-gradient(135deg, ${settings.primary_color} 0%, ${settings.secondary_color || settings.primary_color} 100%)` } : {}}>
          <div className="container">
            <h1>{settings.hero_title_ar || settings.hero_title || 'Welcome to Our Store'}</h1>
            <p>{settings.hero_subtitle_ar || settings.hero_subtitle || 'Premium products delivered to your door'}</p>
            <Link href="/products" className="cta">{settings.hero_cta_text_ar || settings.hero_cta_text || 'Shop Now'}</Link>
          </div>
        </section>
      )}

      {/* Categories */}
      {settings.show_categories !== false && categories.length > 0 && (
        <section className="section">
          <div className="container">
            <h2 className="section-title">Shop by Category</h2>
            <div className="category-grid">
              {categories.slice(0, 6).map((c: any) => (
                <Link key={c.id} href={`/products?category=${c.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="category-card">
                    {c.image_url && <img src={c.image_url} alt={c.name_ar || c.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />}
                    <div className="cat-name">{c.name_ar || c.name}</div>
                    <div className="cat-count">{c.product_count || 0} products</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {settings.show_featured !== false && featured.length > 0 && (
        <section className="section" style={{ background: 'var(--bg2)' }}>
          <div className="container">
            <h2 className="section-title">Featured Products</h2>
            <div className="product-grid">
              {featured.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link href="/products" className="btn btn-primary btn-lg">View All Products</Link>
            </div>
          </div>
        </section>
      )}

      {/* Trust Badges */}
      {settings.show_trust_badges !== false && (
        <section className="section">
          <div className="container">
            <div className="trust-section">
              <div className="trust-badge"><div className="icon">🚚</div><div className="label">Fast Delivery</div><div className="desc">Across Saudi Arabia</div></div>
              <div className="trust-badge"><div className="icon">💳</div><div className="label">Secure Payment</div><div className="desc">Multiple options</div></div>
              <div className="trust-badge"><div className="icon">↩️</div><div className="label">Easy Returns</div><div className="desc">Hassle-free process</div></div>
              <div className="trust-badge"><div className="icon">💬</div><div className="label">24/7 Support</div><div className="desc">WhatsApp support</div></div>
            </div>
          </div>
        </section>
      )}

      {/* New Arrivals */}
      {settings.show_new_arrivals !== false && newArrivals.length > 0 && (
        <section className="section" style={{ background: 'var(--bg2)' }}>
          <div className="container">
            <h2 className="section-title">New Arrivals</h2>
            <div className="product-grid">
              {newArrivals.map((p: any) => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </>
  );
}
