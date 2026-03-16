const API_KEY = 'abukhalid123';
const BASE = '/api/v1/admin';
const INT_BASE = '/api/v1/integrations';
const COMMS_BASE = '/api/v1/communications';
const ORDERS_BASE = '/api/v1/orders';
const ALERTS_BASE = '/api/v1/alerts';
const SETTINGS_BASE = '/api/v1/settings';

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${path}`, {
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
  // ── Products ─────────────────────────────────────────────────────────────
  getProducts: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`${BASE}/products${qs ? `?${qs}` : ''}`);
  },
  getFilters: () => request(`${BASE}/filters`),
  getProduct: (id: string) => request(`${BASE}/products/${id}`),
  updateProduct: (id: string, body: any) => request(`${BASE}/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  approveProduct: (id: string) => request(`${BASE}/products/${id}/approve`, { method: 'POST', body: JSON.stringify({ reviewed_by: 'admin' }) }),
  rejectProduct: (id: string) => request(`${BASE}/products/${id}/reject`, { method: 'POST', body: JSON.stringify({ reviewed_by: 'admin' }) }),
  rebuildExport: (id: string) => request(`${BASE}/products/${id}/rebuild-export-data`, { method: 'POST' }),
  getExportPreview: (id: string) => request(`${BASE}/products/${id}/export-preview`),
  getGuardrails: (id: string) => request(`${BASE}/products/${id}/guardrails`),

  // ── Images ───────────────────────────────────────────────────────────────
  rebuildImages: (id: string) => request(`${BASE}/products/${id}/rebuild-image-data`, { method: 'POST' }),
  rebuildMissingImages: () => request(`${BASE}/products/rebuild-missing-images`, { method: 'POST' }),
  addImages: (id: string, urls: string[]) => request(`${BASE}/products/${id}/images/add`, { method: 'POST', body: JSON.stringify({ urls }) }),
  removeImage: (id: string, url: string) => request(`${BASE}/products/${id}/images/remove`, { method: 'POST', body: JSON.stringify({ url }) }),
  setPrimaryImage: (id: string, url: string) => request(`${BASE}/products/${id}/images/set-primary`, { method: 'POST', body: JSON.stringify({ url }) }),
  reorderImages: (id: string, urls: string[]) => request(`${BASE}/products/${id}/images/reorder`, { method: 'POST', body: JSON.stringify({ urls }) }),
  syncImageStatuses: () => request(`${BASE}/products/sync-image-statuses`, { method: 'POST' }),

  // ── Supplier ─────────────────────────────────────────────────────────────
  getSupplierMapping: (id: string) => request(`${BASE}/products/${id}/supplier-mapping`),
  saveSupplierMapping: (id: string, body: any) => request(`${BASE}/products/${id}/supplier-mapping`, { method: 'POST', body: JSON.stringify(body) }),
  runSupplierCheck: () => request(`${BASE}/supplier-check`, { method: 'POST' }),

  // ── Salla Sync ───────────────────────────────────────────────────────────
  pushToSalla: (id: string, force = false) => request(`${BASE}/products/${id}/push-to-salla`, { method: 'POST', body: JSON.stringify({ force }) }),
  disableInSalla: (id: string) => request(`${BASE}/products/${id}/disable-in-salla`, { method: 'POST' }),
  deleteFromSalla: (id: string) => request(`${BASE}/products/${id}/delete-from-salla`, { method: 'POST' }),

  // ── Creatives ────────────────────────────────────────────────────────────
  generateCreatives: (id: string) => request(`${BASE}/products/${id}/generate-creatives`, { method: 'POST' }),
  listCreatives: () => request(`${BASE}/creatives`),

  // ── Campaigns ────────────────────────────────────────────────────────────
  getCampaigns: () => request(`${BASE}/campaigns`),
  createCampaign: (body: any) => request(`${BASE}/campaigns`, { method: 'POST', body: JSON.stringify(body) }),
  launchCampaign: (id: string) => request(`${BASE}/campaigns/${id}/launch`, { method: 'POST' }),
  simulateCampaign: (id: string) => request(`${BASE}/campaigns/${id}/simulate`, { method: 'POST' }),
  runOptimization: () => request(`${BASE}/campaigns/optimize`, { method: 'POST' }),

  // ── Discovery ────────────────────────────────────────────────────────────
  getTikTokTrends: (keywords: string) => request(`${BASE}/discovery/tiktok-trends?keywords=${encodeURIComponent(keywords)}`),
  getAliExpressProducts: (keyword: string) => request(`${BASE}/discovery/aliexpress?keyword=${encodeURIComponent(keyword)}`),
  getAmazonProducts: (keyword: string) => request(`${BASE}/discovery/amazon?keyword=${encodeURIComponent(keyword)}`),
  getGoogleTrends: (keywords: string) => request(`${BASE}/discovery/google-trends?keywords=${encodeURIComponent(keywords)}`),

  // ── System ───────────────────────────────────────────────────────────────
  getSystemStatus: () => request(`${BASE}/system-status`),

  // ── Salla Integration ────────────────────────────────────────────────────
  getSallaConfig: () => request(`${INT_BASE}/salla`),
  saveSallaConfig: (body: any) => request(`${INT_BASE}/salla`, { method: 'POST', body: JSON.stringify(body) }),
  testSallaConnection: () => request(`${INT_BASE}/salla/test`, { method: 'POST' }),
  enableSalla: () => request(`${INT_BASE}/salla/enable`, { method: 'POST' }),
  disableSalla: () => request(`${INT_BASE}/salla/disable`, { method: 'POST' }),

  // ── Email Integration ────────────────────────────────────────────────────
  getEmailAccounts: () => request(`${INT_BASE}/email`),
  saveEmailAccount: (body: any) => request(`${INT_BASE}/email`, { method: 'POST', body: JSON.stringify(body) }),
  testEmailConnection: (id?: string) => request(`${INT_BASE}/email/test`, { method: 'POST', body: JSON.stringify({ id }) }),
  enableEmail: (id?: string) => request(`${INT_BASE}/email/enable`, { method: 'POST', body: JSON.stringify({ id }) }),
  disableEmail: (id?: string) => request(`${INT_BASE}/email/disable`, { method: 'POST', body: JSON.stringify({ id }) }),

  // ── Ad Platforms ─────────────────────────────────────────────────────────
  getAdPlatforms: () => request(`${INT_BASE}/ads`),
  getAdPlatform: (platform: string) => request(`${INT_BASE}/ads/${platform}`),
  saveAdPlatform: (body: any) => request(`${INT_BASE}/ads`, { method: 'POST', body: JSON.stringify(body) }),
  enableAdPlatform: (platform: string) => request(`${INT_BASE}/ads/${platform}/enable`, { method: 'POST' }),
  disableAdPlatform: (platform: string) => request(`${INT_BASE}/ads/${platform}/disable`, { method: 'POST' }),
  setAdPlatformMode: (platform: string, mode: string) => request(`${INT_BASE}/ads/${platform}/mode`, { method: 'POST', body: JSON.stringify({ mode }) }),

  // ── Orders ───────────────────────────────────────────────────────────────
  getOrders: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`${ORDERS_BASE}${qs ? `?${qs}` : ''}`);
  },
  getOrder: (id: string) => request(`${ORDERS_BASE}/${id}`),
  updateOrderStatus: (id: string, status: string) => request(`${ORDERS_BASE}/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  getOrderStats: () => request(`${ORDERS_BASE}/stats/summary`),
  getSupplierSheet: (id: string) => request(`${ORDERS_BASE}/${id}/supplier-sheet`),
  emailCustomer: (id: string, body: any) => request(`${ORDERS_BASE}/${id}/email-customer`, { method: 'POST', body: JSON.stringify(body) }),
  contactSupplier: (id: string, body: any) => request(`${ORDERS_BASE}/${id}/contact-supplier`, { method: 'POST', body: JSON.stringify(body) }),

  // ── Communications ───────────────────────────────────────────────────────
  getCommunications: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`${COMMS_BASE}${qs ? `?${qs}` : ''}`);
  },
  getEmails: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`${COMMS_BASE}/emails${qs ? `?${qs}` : ''}`);
  },
  sendEmail: (body: any) => request(`${COMMS_BASE}/send-email`, { method: 'POST', body: JSON.stringify(body) }),
  getTemplates: () => request(`${COMMS_BASE}/templates`),
  saveTemplate: (body: any) => request(`${COMMS_BASE}/templates`, { method: 'POST', body: JSON.stringify(body) }),
  previewTemplate: (body: any) => request(`${COMMS_BASE}/templates/preview`, { method: 'POST', body: JSON.stringify(body) }),
  seedTemplates: () => request(`${COMMS_BASE}/templates/seed`, { method: 'POST' }),

  // ── Alerts ───────────────────────────────────────────────────────────────
  getAlerts: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`${ALERTS_BASE}${qs ? `?${qs}` : ''}`);
  },
  getUnreadAlertCount: () => request(`${ALERTS_BASE}/unread-count`),
  markAlertRead: (id: string) => request(`${ALERTS_BASE}/${id}/read`, { method: 'POST' }),
  resolveAlert: (id: string) => request(`${ALERTS_BASE}/${id}/resolve`, { method: 'POST' }),

  // ── Store Management ────────────────────────────────────────────────────
  getStoreSettings: () => request(`${BASE}/store-settings`),
  saveStoreSettings: (body: any) => request(`${BASE}/store-settings`, { method: 'POST', body: JSON.stringify(body) }),
  getCategories: () => request(`${BASE}/categories`),
  saveCategory: (body: any) => request(`${BASE}/categories`, { method: 'POST', body: JSON.stringify(body) }),
  deleteCategory: (id: string) => request(`${BASE}/categories/${id}`, { method: 'DELETE' }),
  publishProduct: (id: string, body: any) => request(`${BASE}/products/${id}/publish`, { method: 'POST', body: JSON.stringify(body) }),
  unpublishProduct: (id: string) => request(`${BASE}/products/${id}/unpublish`, { method: 'POST' }),
  getCustomers: () => request(`${BASE}/customers`),

  // ── Settings ─────────────────────────────────────────────────────────────
  getSettings: (category?: string) => {
    const qs = category ? `?category=${category}` : '';
    return request(`${SETTINGS_BASE}${qs}`);
  },
  saveSettings: (settings: any, category = 'general') => request(`${SETTINGS_BASE}`, { method: 'POST', body: JSON.stringify({ settings, category }) }),
  getBudget: () => request(`${SETTINGS_BASE}/budget`),
  saveBudget: (body: any) => request(`${SETTINGS_BASE}/budget`, { method: 'POST', body: JSON.stringify(body) }),
  getAutomationMode: () => request(`${SETTINGS_BASE}/automation-mode`),
  setAutomationMode: (mode: string) => request(`${SETTINGS_BASE}/automation-mode`, { method: 'POST', body: JSON.stringify({ mode }) }),
  getDiagnostics: () => request(`${SETTINGS_BASE}/diagnostics`),
};
