const BASE = '/api/v1/storefront';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getStoreSettings: () => request('/store-settings'),
  getProducts: (params?: Record<string, string>) => request('/products' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  getProduct: (slug: string) => request(`/products/${slug}`),
  getCategories: () => request('/categories'),

  // Cart
  getOrCreateCart: (body: { session_id?: string; customer_id?: string }) => request('/cart', { method: 'POST', body: JSON.stringify(body) }),
  addToCart: (body: { cart_id: string; product_id: string; quantity?: number }) => request('/cart/add', { method: 'POST', body: JSON.stringify(body) }),
  updateCartItem: (body: { item_id: string; quantity: number }) => request('/cart/update', { method: 'POST', body: JSON.stringify(body) }),
  removeCartItem: (body: { item_id: string }) => request('/cart/remove', { method: 'POST', body: JSON.stringify(body) }),

  // Auth
  register: (body: any) => request('/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) => request('/login', { method: 'POST', body: JSON.stringify(body) }),

  // Checkout
  checkout: (body: any) => request('/checkout', { method: 'POST', body: JSON.stringify(body) }),

  // Order tracking
  getOrder: (id: string) => request(`/order/${id}`),
  getCustomerOrders: (customerId: string) => request(`/customer/${customerId}/orders`),
};
