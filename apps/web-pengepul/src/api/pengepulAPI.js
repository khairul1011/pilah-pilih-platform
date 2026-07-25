import axiosInstance from './axiosInstance';

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () => axiosInstance.get('/pengepul/dashboard');
export const getMonthlyData = () => axiosInstance.get('/pengepul/monthly-stats');

// ─── Sampah Masuk ─────────────────────────────────────────────────────────────
export const getWaitingPickups = () => axiosInstance.get('/pickups/pengepul/waiting');
export const weighPickupItems = (id, items) => axiosInstance.put(`/pickups/pengepul/weigh/${id}`, { items });
export const confirmAndCompletePickup = (id, payment_method) => axiosInstance.put(`/pickups/pengepul/confirm/${id}`, { payment_method });
export const confirmDepositPickup = (id) => axiosInstance.patch(`/pickups/pengepul/confirm-deposit/${id}`);
export const getIncomingWaste = (params) => axiosInstance.get('/pengepul/incoming-waste', { params });
export const updateWasteStatus = (id, status, catatan) =>
  axiosInstance.put(`/pengepul/incoming-waste/${id}/status`, { status, catatan });

// ─── Inventori ────────────────────────────────────────────────────────────────
export const getInventory = () => axiosInstance.get('/pengepul/inventory');
export const updateInventory = (waste_type, weight) =>
  axiosInstance.put('/pengepul/inventory', { waste_type, weight });
export const addInventoryStock = (waste_type, weight) =>
  axiosInstance.post('/pengepul/inventory/add', { waste_type, weight });

// ─── Kiriman Petugas ──────────────────────────────────────────────────────────
export const getPetugasPerformance = () => axiosInstance.get('/pengepul/petugas-performance');
export const getPetugasDetail = (id) => axiosInstance.get(`/pengepul/petugas/${id}/history`);

// ─── Penjualan Pabrik ─────────────────────────────────────────────────────────
export const getFactorySales = () => axiosInstance.get('/pengepul/sales');
export const createFactorySale = (data) => axiosInstance.post('/pengepul/sales', data);
export const updateSaleStatus = (id, status) =>
  axiosInstance.put(`/pengepul/sales/${id}/status`, { status });

// ─── Keuangan ─────────────────────────────────────────────────────────────────
export const getKeuangan = () => axiosInstance.get('/pengepul/keuangan');

// ─── Notifikasi ───────────────────────────────────────────────────────────────
export const getNotifications = () => axiosInstance.get('/notifications');
export const markNotifRead = (id) => axiosInstance.put(`/notifications/${id}/read`);
export const markAllNotifsRead = () => axiosInstance.put('/notifications/read-all');

// ─── Chat / Messages ──────────────────────────────────────────────────────────
export const getUnreadCount = () => axiosInstance.get('/messages/unread-count');
export const getMessagesByPickup = (pickupId) => axiosInstance.get(`/messages/${pickupId}`);
export const getMessagesByUser = (userId) => axiosInstance.get(`/messages/user/${userId}`);
export const sendMessage = (data) => axiosInstance.post('/messages', data);

// ─── Profil ───────────────────────────────────────────────────────────────────
export const updateProfile = (data) => axiosInstance.put('/pengepul/profile', data);
export const changePassword = (data) => axiosInstance.put('/pengepul/change-password', data);
export const getPetugasList = () => axiosInstance.get('/pengepul/petugas-list');
export const registerPetugas = (data) => axiosInstance.post('/auth/register-petugas', data);
