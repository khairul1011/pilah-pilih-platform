import axios from 'axios';

// ─── Base URL ──────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-production-f1e1.up.railway.app/api';

// ─── Axios Instance ────────────────────────────────────────────────────────────
const api = axios.create({ baseURL: BASE_URL });

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Helper ────────────────────────────────────────────────────────────────────
const get = (url, params) => api.get(url, { params }).then(r => r.data);
const post = (url, data) => api.post(url, data).then(r => r.data);
const put = (url, data) => api.put(url, data).then(r => r.data);
const del = (url) => api.delete(url).then(r => r.data);

// ─── AUTH ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => post('/auth/login', { email, password }),
  registerAdmin: (name, email, password) => post('/auth/register-admin', { name, email, password }),
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  getStats: () => get('/admin/stats'),
  getMonthlyChart: () => get('/admin/chart/monthly'),
  getActivity: () => get('/admin/activity'),
};

// ─── KELOLA USER ──────────────────────────────────────────────────────────────
export const userAPI = {
  getAll: () => get('/admin/users'),
  toggleStatus: (id) => put(`/admin/users/${id}/toggle`),
  delete: (id) => del(`/admin/users/${id}`),
};

// ─── KELOLA PETUGAS ───────────────────────────────────────────────────────────
export const petugasAPI = {
  getAll: () => get('/admin/petugas'),
  add: (data) => post('/admin/petugas', data),
  edit: (id, data) => put(`/admin/petugas/${id}`, data),
  delete: (id) => del(`/admin/petugas/${id}`),
  toggleStatus: (id) => put(`/admin/petugas/${id}/toggle`),
};

// ─── KELOLA PENGEPUL ──────────────────────────────────────────────────────────
export const pengepulAPI = {
  getAll: () => get('/admin/pengepul'),
  add: (data) => post('/admin/pengepul', data),
  edit: (id, data) => put(`/admin/pengepul/${id}`, data),
  delete: (id) => del(`/admin/pengepul/${id}`),
  toggleVerifikasi: (id) => put(`/admin/pengepul/${id}/verifikasi`),
};

// ─── JENIS SAMPAH ─────────────────────────────────────────────────────────────
export const wasteTypeAPI = {
  getAll: () => get('/admin/waste-types'),
  add: (data) => post('/admin/waste-types', data),
  edit: (id, data) => put(`/admin/waste-types/${id}`, data),
  delete: (id) => del(`/admin/waste-types/${id}`),
  toggle: (id) => put(`/admin/waste-types/${id}/toggle`),
};

// ─── HARGA SAMPAH ─────────────────────────────────────────────────────────────
export const priceAPI = {
  getAll: () => get('/admin/prices'),
  update: (id, price_per_kg) => put(`/admin/prices/${id}`, { price_per_kg }),
  getHistory: () => get('/admin/prices/history'),
};

// ─── PENARIKAN SALDO ──────────────────────────────────────────────────────────
export const withdrawalAPI = {
  getAll: () => get('/admin/withdrawals'),
  approve: (id) => put(`/admin/withdrawals/${id}/approve`),
  success: (id) => put(`/admin/withdrawals/${id}/success`),
  reject: (id, reason) => put(`/admin/withdrawals/${id}/reject`, { reason }),
};

// ─── MONITORING ───────────────────────────────────────────────────────────────
export const pickupAPI = {
  getAll: () => get('/admin/pickups'),
};

export const sampahAPI = {
  getMonitoring: () => get('/admin/sampah'),
};

// ─── KEUANGAN ─────────────────────────────────────────────────────────────────
export const keuanganAPI = {
  getSummary: () => get('/admin/keuangan'),
  getTransactions: () => get('/admin/transactions'),
};

// ─── NOTIFIKASI ───────────────────────────────────────────────────────────────
export const notifAPI = {
  getAll: () => get('/admin/notifications'),
  readAll: () => put('/admin/notifications/read-all'),
  read: (id) => put(`/admin/notifications/${id}/read`),
};

// ─── TIKET (PUSAT BANTUAN) ────────────────────────────────────────────────────
export const tiketAPI = {
  getAll: () => get('/admin/tickets'),
  reply: (id, reply) => post(`/admin/tickets/${id}/reply`, { reply }),
  close: (id) => put(`/admin/tickets/${id}/close`),
};

export default api;
