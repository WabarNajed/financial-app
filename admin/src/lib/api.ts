const API_KEY = 'abukhalid123';
const BASE = '/api/v1/admin';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getProducts: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/products${qs ? `?${qs}` : ''}`);
  },
  getFilters: () => request('/filters'),
  getProduct: (id: string) => request(`/products/${id}`),
  updateProduct: (id: string, body: any) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  approveProduct: (id: string) => request(`/products/${id}/approve`, { method: 'POST', body: JSON.stringify({ reviewed_by: 'admin' }) }),
  rejectProduct: (id: string) => request(`/products/${id}/reject`, { method: 'POST', body: JSON.stringify({ reviewed_by: 'admin' }) }),
  rebuildExport: (id: string) => request(`/products/${id}/rebuild-export-data`, { method: 'POST' }),
  getExportPreview: (id: string) => request(`/products/${id}/export-preview`),
  getSystemStatus: () => request('/system-status'),
};
