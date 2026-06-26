const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function readSession() {
  try {
    return JSON.parse(localStorage.getItem("salty_session") || "null");
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem("salty_session", JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem("salty_session");
}

export function getStoredSession() {
  return readSession();
}

export async function api(path, options = {}) {
  const session = readSession();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;

  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    body: options.body && !isFormData && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  let data = {};
  if (text) {
    if (!contentType.includes("application/json")) {
      const error = new Error(
        response.url.includes("/api/")
          ? "The secure account service is not connected. Please try again shortly."
          : "We could not complete that request. Please try again."
      );
      error.status = response.status || 503;
      error.data = { responseType: contentType || "unknown" };
      throw error;
    }
    try {
      data = JSON.parse(text);
    } catch {
      const error = new Error("The secure account service returned an invalid response. Please try again shortly.");
      error.status = response.status || 502;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function apiText(path) {
  const session = readSession();
  const headers = {};
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`${API_BASE}/api${path}`, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || "Request failed");
    error.status = response.status;
    throw error;
  }
  return text;
}

async function apiBlob(path) {
  const session = readSession();
  const headers = {};
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(`${API_BASE}/api${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(text || "Request failed");
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

export const authApi = {
  firebaseSession: (body) => api("/auth/firebase-session", { method: "POST", body }),
  sendOtp: (body) => api("/auth/send-otp", { method: "POST", body }),
  verifyOtp: (body) => api("/auth/verify-otp", { method: "POST", body }),
  sendEmailOtp: (body) => api("/auth/send-email-otp", { method: "POST", body }),
  verifyEmailOtp: (body) => api("/auth/verify-email-otp", { method: "POST", body }),
  me: () => api("/auth/me"),
  updateProfile: (body) => api("/auth/profile", { method: "PUT", body }),
  syncCustomerData: (body) => api("/auth/sync-customer-data", { method: "POST", body }),
  addAddress: (body) => api("/auth/addresses", { method: "POST", body }),
  updateAddress: (id, body) => api(`/auth/addresses/${id}`, { method: "PUT", body }),
  setDefaultAddress: (id) => api(`/auth/addresses/${id}/default`, { method: "PUT" }),
  deleteAddress: (id) => api(`/auth/addresses/${id}`, { method: "DELETE" }),
  wishlist: () => api("/auth/wishlist"),
  addWishlist: (id) => api(`/auth/wishlist/${id}`, { method: "PUT" }),
  removeWishlist: (id) => api(`/auth/wishlist/${id}`, { method: "DELETE" }),
};

export const locationApi = {
  pincode: (pincode) => api(`/location/pincode/${encodeURIComponent(pincode)}`),
};

export const deliveryApi = {
  serviceability: (pincode) => api(`/delivery/serviceability/${encodeURIComponent(pincode)}`),
};

export const contactApi = {
  send: (body) => api("/contact", { method: "POST", body }),
};

export const catalogApi = {
  products: (params = {}) => {
    const search = new URLSearchParams(params);
    return api(`/products${search.toString() ? `?${search}` : ""}`);
  },
  product: (slug) => api(`/products/${slug}`),
  reviews: (slug) => api(`/products/${slug}/reviews`),
  createReview: (slug, formData) => api(`/products/${slug}/reviews`, { method: "POST", body: formData }),
  settings: () => api("/storefront/settings"),
};

export const orderApi = {
  quote: (body) => api("/orders/quote", { method: "POST", body }),
  create: (body) => api("/orders", { method: "POST", body }),
  mine: () => api("/orders/my"),
  track: (body) => api("/orders/track", { method: "POST", body }),
  detail: (id) => api(`/orders/${id}`),
  request: (id, formData) => api(`/orders/${id}/request`, { method: "POST", body: formData }),
  refreshTracking: (id) => api(`/orders/${id}/tracking/refresh`, { method: "POST" }),
};

export const paymentApi = {
  createOrder: (body) => api("/payments/create-order", { method: "POST", body }),
  verify: (body) => api("/payments/verify", { method: "POST", body }),
  failed: (body) => api("/payments/failed", { method: "POST", body }),
  cancelled: (body) => api("/payments/cancelled", { method: "POST", body }),
};

export const adminApi = {
  dashboard: () => api("/admin/dashboard"),
  reviews: () => api("/admin/reviews"),
  updateReview: (id, body) => api(`/admin/reviews/${id}`, { method: "PUT", body }),
  contactMessages: () => api("/admin/contact-messages"),
  products: () => api("/admin/products"),
  exportProducts: () => apiText("/admin/products/export.csv"),
  exportProductsXlsx: () => apiBlob("/admin/products/export.xlsx"),
  productBySku: (sku) => api(`/admin/products/by-sku/${encodeURIComponent(sku)}`),
  categories: () => api("/admin/categories"),
  media: () => api("/admin/media"),
  importLogs: () => api("/admin/import-logs"),
  createProduct: (body) => api("/admin/products", { method: "POST", body }),
  bulkCreateProducts: (products) => api("/admin/products/bulk", { method: "POST", body: { products } }),
  importProducts: (formData) => api("/admin/products/import", { method: "POST", body: formData }),
  uploadProductImages: (formData) => api("/admin/products/upload", { method: "POST", body: formData }),
  uploadContentImage: (formData) => api("/admin/content/upload", { method: "POST", body: formData }),
  updateProduct: (id, body) => api(`/admin/products/${id}`, { method: "PUT", body }),
  deleteProduct: (id) => api(`/admin/products/${id}`, { method: "DELETE" }),
  orders: () => api("/admin/orders"),
  order: (id) => api(`/admin/orders/${id}`),
  updateOrder: (id, status) => api(`/admin/orders/${id}/status`, { method: "PUT", body: { status } }),
  updateTracking: (id, body) => api(`/admin/orders/${id}/tracking`, { method: "PUT", body }),
  createShipment: (id) => api(`/admin/orders/${id}/shipment/create`, { method: "POST" }),
  refreshShipment: (id) => api(`/admin/orders/${id}/shipment/refresh`, { method: "POST" }),
  transactions: () => api("/admin/transactions"),
  paymentDashboard: () => api("/admin/payments/dashboard"),
  customers: () => api("/admin/customers"),
  customer: (id) => api(`/admin/customers/${id}`),
  updateCustomerStatus: (id, status) => api(`/admin/customers/${id}/status`, { method: "PUT", body: { status } }),
  refunds: () => api("/admin/refunds"),
  createRefund: (body) => api("/admin/refunds", { method: "POST", body }),
  updateRefund: (id, body) => api(`/admin/refunds/${id}`, { method: "PUT", body }),
  settings: () => api("/admin/settings"),
  saveSettings: (settings) => api("/admin/settings", { method: "PUT", body: { settings } }),
  testIntegration: (integration) => api(`/admin/settings/test/${integration}`, { method: "POST" }),
  readiness: () => api("/admin/readiness"),
};
