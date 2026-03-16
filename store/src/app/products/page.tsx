'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Header, Footer, ProductCard } from '../components';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const categorySlug = searchParams.get('category') || '';

  useEffect(() => {
    api.getCategories().then((r) => setCategories(r.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (categorySlug) params.category = categorySlug;
    if (search) params.search = search;
    if (sort) params.sort = sort;
    api.getProducts(params).then((r) => setProducts(r.products || [])).catch(() => {}).finally(() => setLoading(false));
  }, [categorySlug, search, sort]);

  const activeCategory = categories.find((c: any) => c.slug === categorySlug);

  return (
    <>
      <Header />
      <div className="container" style={{ padding: '30px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{activeCategory ? (activeCategory.name_ar || activeCategory.name) : 'All Products'}</h1>
        {activeCategory?.description_ar && <p style={{ color: 'var(--text2)', marginBottom: 20 }}>{activeCategory.description_ar}</p>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, flex: 1, minWidth: 200, maxWidth: 400 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
            <option value="">Sort: Newest</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <a href="/products" className={`btn btn-sm ${!categorySlug ? 'btn-primary' : 'btn-outline'}`} style={{ textDecoration: 'none' }}>All</a>
              {categories.map((c: any) => (
                <a key={c.id} href={`/products?category=${c.slug}`} className={`btn btn-sm ${categorySlug === c.slug ? 'btn-primary' : 'btn-outline'}`} style={{ textDecoration: 'none' }}>
                  {c.name_ar || c.name}
                </a>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>Loading...</div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>No products found</div>
        ) : (
          <div className="product-grid">{products.map((p: any) => <ProductCard key={p.id} product={p} />)}</div>
        )}
      </div>
      <Footer />
    </>
  );
}
