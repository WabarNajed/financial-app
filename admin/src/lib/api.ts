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
  // Products
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

  // Images
  rebuildImages: (id: string) => request(`/products/${id}/rebuild-image-data`, { method: 'POST' }),
  rebuildMissingImages: () => request(`/products/rebuild-missing-images`, { method: 'POST' }),

  // Creatives
  generateCreatives: (id: string) => request(`/products/${id}/generate-creatives`, { method: 'POST' }),
  listCreatives: () => request('/creatives'),

  // Campaigns
  getCampaigns: () => request('/campaigns'),
  createCampaign: (body: any) => request('/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  launchCampaign: (id: string) => request(`/campaigns/${id}/launch`, { method: 'POST' }),
  simulateCampaign: (id: string) => request(`/campaigns/${id}/simulate`, { method: 'POST' }),
  runOptimization: () => request('/campaigns/optimize', { method: 'POST' }),

  // Discovery
  getTikTokTrends: (keywords: string) => request(`/discovery/tiktok-trends?keywords=${encodeURIComponent(keywords)}`),
  getAliExpressProducts: (keyword: string) => request(`/discovery/aliexpress?keyword=${encodeURIComponent(keyword)}`),
  getAmazonProducts: (keyword: string) => request(`/discovery/amazon?keyword=${encodeURIComponent(keyword)}`),
  getGoogleTrends: (keywords: string) => request(`/discovery/google-trends?keywords=${encodeURIComponent(keywords)}`),

  // System
  getSystemStatus: () => request('/system-status'),
};
