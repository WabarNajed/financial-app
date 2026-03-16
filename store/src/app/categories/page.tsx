'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Header, Footer } from '../components';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  useEffect(() => { api.getCategories().then((r) => setCategories(r.categories || [])).catch(() => {}); }, []);

  return (
    <>
      <Header />
      <div className="container" style={{ padding: '30px 20px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Categories</h1>
        {categories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>No categories yet</div>
        ) : (
          <div className="category-grid">
            {categories.map((c: any) => (
              <Link key={c.id} href={`/products?category=${c.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="category-card">
                  {c.image_url && <img src={c.image_url} alt={c.name_ar || c.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} />}
                  <div className="cat-name">{c.name_ar || c.name}</div>
                  {c.description_ar && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{c.description_ar}</div>}
                  <div className="cat-count">{c.product_count || 0} products</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
