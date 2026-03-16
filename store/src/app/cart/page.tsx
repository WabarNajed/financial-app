'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store-context';
import { Header, Footer } from '../components';

export default function CartPage() {
  const { cart, updateCartItem, removeCartItem } = useStore();
  const items = cart?.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.storefront_price) || 0) * (i.quantity || 1), 0);

  return (
    <>
      <Header />
      <div className="container" style={{ padding: '30px 20px', minHeight: '60vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Shopping Cart</h1>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <p style={{ color: 'var(--text2)', marginBottom: 20, fontSize: 16 }}>Your cart is empty</p>
            <Link href="/products" className="btn btn-primary btn-lg">Continue Shopping</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 30 }}>
            <div>
              <table className="cart-table">
                <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {items.map((item) => {
                    const imgs = item.image_urls || [];
                    const img = item.primary_image_url || imgs[0];
                    const price = Number(item.storefront_price) || 0;
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="product-cell">
                            {img && <img src={img} alt={item.name_ar || item.name || ''} />}
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name_ar || item.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontWeight: 500 }}>{price} SAR</td>
                        <td>
                          <div className="qty-control">
                            <button onClick={() => updateCartItem(item.id, Math.max(1, item.quantity - 1))}>-</button>
                            <span>{item.quantity}</span>
                            <button onClick={() => updateCartItem(item.id, item.quantity + 1)}>+</button>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{(price * item.quantity).toFixed(2)} SAR</td>
                        <td>
                          <button onClick={() => removeCartItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="cart-summary">
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Order Summary</h3>
              <div className="row"><span>Subtotal</span><span>{subtotal.toFixed(2)} SAR</span></div>
              <div className="row"><span>Shipping</span><span style={{ color: 'var(--accent)' }}>Calculated at checkout</span></div>
              <div className="row total"><span>Total</span><span>{subtotal.toFixed(2)} SAR</span></div>
              <Link href="/checkout" className="btn btn-primary btn-lg btn-full" style={{ marginTop: 16, textDecoration: 'none' }}>
                Proceed to Checkout
              </Link>
              <Link href="/products" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 14, color: 'var(--text2)' }}>
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
