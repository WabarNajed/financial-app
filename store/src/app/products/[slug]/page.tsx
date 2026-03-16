'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store-context';
import { Header, Footer, ProductCard, Toast } from '../../components';

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useStore();
  const [product, setProduct] = useState<any>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getProduct(slug).then((r) => { setProduct(r.product); setRelated(r.related || []); }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  const handleAddToCart = async () => {
    if (!product) return;
    setAdding(true);
    try { await addToCart(product.id, qty); setToast({ msg: 'Added to cart!' }); } catch (e: any) { setToast({ msg: e.message, type: 'error' }); }
    setAdding(false);
  };

  if (loading) return <><Header /><div style={{ textAlign: 'center', padding: 80, color: 'var(--text2)' }}>Loading...</div><Footer /></>;
  if (!product) return <><Header /><div style={{ textAlign: 'center', padding: 80 }}>Product not found</div><Footer /></>;

  const imgs = product.image_urls || [];
  const price = Number(product.storefront_price) || 0;
  const compare = Number(product.compare_at_price) || 0;
  const discount = compare > price && price > 0 ? Math.round(((compare - price) / compare) * 100) : 0;
  const features = product.features || [];
  const desc = product.full_description_ar || product.description_ar || product.short_description_ar || '';

  return (
    <>
      <Header />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="container">
        <div className="product-detail">
          {/* Gallery */}
          <div className="product-gallery">
            {imgs.length > 0 ? (
              <img src={imgs[selectedImage] || imgs[0]} alt={product.name_ar || product.name} className="main-image" />
            ) : (
              <div className="main-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }}>No Image</div>
            )}
            {imgs.length > 1 && (
              <div className="thumbs">
                {imgs.map((url: string, i: number) => (
                  <img key={i} src={url} alt="" className={`thumb ${i === selectedImage ? 'active' : ''}`} onClick={() => setSelectedImage(i)} />
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="product-info">
            <h1 className="title">{product.name_ar || product.name}</h1>

            <div className="price-block">
              <span className="sale-price">{price} SAR</span>
              {compare > price && <span className="orig-price">{compare} SAR</span>}
              {discount > 0 && <span className="save-badge">Save {discount}%</span>}
            </div>

            {product.short_description_ar && <p style={{ color: 'var(--text2)', marginBottom: 16, fontSize: 15, lineHeight: 1.6 }}>{product.short_description_ar}</p>}

            {features.length > 0 && (
              <ul className="features" dir="rtl">
                {features.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            )}

            {/* Add to Cart */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
              <div className="qty-control">
                <button onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
                <span>{qty}</span>
                <button onClick={() => setQty(qty + 1)}>+</button>
              </div>
              <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={handleAddToCart} disabled={adding}>
                {adding ? 'Adding...' : 'Add to Cart'}
              </button>
            </div>

            {/* WhatsApp buy */}
            <a href={`https://wa.me/?text=${encodeURIComponent(`I want to order: ${product.name_ar || product.name} - ${price} SAR`)}`} target="_blank" rel="noopener" className="btn btn-success btn-lg btn-full" style={{ textDecoration: 'none', marginBottom: 16 }}>
              Order via WhatsApp
            </a>

            {desc && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Description</h3>
                <div className="description" dir="rtl">{desc}</div>
              </div>
            )}

            {product.category && (
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text2)' }}>
                Category: {product.category}
              </div>
            )}
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="section">
            <h2 className="section-title">Related Products</h2>
            <div className="product-grid">{related.map((p: any) => <ProductCard key={p.id} product={p} />)}</div>
          </section>
        )}
      </div>
      <Footer />
    </>
  );
}
