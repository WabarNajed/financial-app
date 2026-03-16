'use client';
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { api } from './api';

interface StoreSettings {
  store_name?: string; store_name_ar?: string; logo_url?: string; favicon_url?: string;
  primary_color?: string; secondary_color?: string; accent_color?: string;
  background_color?: string; text_color?: string; whatsapp_number?: string;
  phone?: string; email?: string; hero_title?: string; hero_title_ar?: string;
  hero_subtitle?: string; hero_subtitle_ar?: string; hero_image_url?: string;
  hero_cta_text?: string; hero_cta_text_ar?: string;
  show_hero?: boolean; show_featured?: boolean; show_categories?: boolean;
  show_new_arrivals?: boolean; show_trust_badges?: boolean;
  footer_text?: string; footer_text_ar?: string;
  facebook_url?: string; instagram_url?: string; tiktok_url?: string; twitter_url?: string;
  currency?: string;
  [key: string]: any;
}

interface CartItem {
  id: string; product_id: string; quantity: number; name?: string; name_ar?: string;
  slug?: string; image_urls?: string[]; primary_image_url?: string;
  storefront_price?: number; compare_at_price?: number;
}

interface Cart { id: string; items: CartItem[]; }
interface Customer { id: string; name: string; email: string; phone?: string; }

interface StoreContextValue {
  settings: StoreSettings; cart: Cart | null; customer: Customer | null;
  cartCount: number; loading: boolean;
  refreshCart: () => Promise<void>;
  addToCart: (productId: string, qty?: number) => Promise<void>;
  updateCartItem: (itemId: string, qty: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const StoreContext = createContext<StoreContextValue>({} as any);
export const useStore = () => useContext(StoreContext);

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = localStorage.getItem('session_id');
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('session_id', sid); }
  return sid;
}

export function StoreProvider({ children, initialSettings }: { children: ReactNode; initialSettings?: StoreSettings }) {
  const [settings, setSettings] = useState<StoreSettings>(initialSettings || {});
  const [cart, setCart] = useState<Cart | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!initialSettings) api.getStoreSettings().then((r) => setSettings(r.settings || {})).catch(() => {});
    const saved = typeof window !== 'undefined' ? localStorage.getItem('customer') : null;
    if (saved) try { setCustomer(JSON.parse(saved)); } catch {}
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const sid = getSessionId();
      const r = await api.getOrCreateCart({ session_id: sid, customer_id: customer?.id });
      setCart(r.cart);
    } catch {} finally { setLoading(false); }
  }, [customer]);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const addToCart = async (productId: string, qty = 1) => {
    if (!cart) return;
    await api.addToCart({ cart_id: cart.id, product_id: productId, quantity: qty });
    await refreshCart();
  };
  const updateCartItem = async (itemId: string, qty: number) => { await api.updateCartItem({ item_id: itemId, quantity: qty }); await refreshCart(); };
  const removeCartItem = async (itemId: string) => { await api.removeCartItem({ item_id: itemId }); await refreshCart(); };

  const login = async (email: string, password: string) => {
    const r = await api.login({ email, password });
    setCustomer(r.customer);
    localStorage.setItem('customer', JSON.stringify(r.customer));
    await refreshCart();
  };
  const register = async (data: any) => {
    const r = await api.register(data);
    setCustomer(r.customer);
    localStorage.setItem('customer', JSON.stringify(r.customer));
    await refreshCart();
  };
  const logout = () => { setCustomer(null); localStorage.removeItem('customer'); };

  const cartCount = cart?.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;

  return (
    <StoreContext.Provider value={{ settings, cart, customer, cartCount, loading, refreshCart, addToCart, updateCartItem, removeCartItem, login, register, logout }}>
      {children}
    </StoreContext.Provider>
  );
}
