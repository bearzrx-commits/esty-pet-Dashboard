import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 30000,
});

// 请求拦截器 - 自动添加认证令牌
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理 401 错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ====== 认证 API ======
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }).then(r => r.data),
  getMe: () => api.get('/auth/me').then(r => r.data),
  getUsers: () => api.get('/auth/users').then(r => r.data),
  createUser: (data: any) => api.post('/auth/users', data).then(r => r.data),
  updateUser: (id: string, data: any) => api.put(`/auth/users/${id}`, data).then(r => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { oldPassword, newPassword }).then(r => r.data),
  updateProfile: (data: any) => api.put('/auth/profile', data).then(r => r.data),
};

// ====== 仪表盘 API ======
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats').then(r => r.data),
};

// ====== 订单 API ======
export const orderApi = {
  getOrders: (params?: any) => api.get('/orders', { params }).then(r => r.data),
  getOrder: (id: string) => api.get(`/orders/${id}`).then(r => r.data),
  confirmOrder: (id: string, data: { supplier_id: string; admin_notes?: string }) =>
    api.put(`/orders/${id}/confirm`, data).then(r => r.data),
  reassignOrder: (id: string, data: { supplier_id: string; admin_notes?: string }) =>
    api.put(`/orders/${id}/reassign`, data).then(r => r.data),
  createOrder: (data: any) => api.post('/orders', data).then(r => r.data),
};

// ====== 供应商 API ======
export const supplierApi = {
  getTasks: (params?: any) => api.get('/suppliers/tasks', { params }).then(r => r.data),
  acceptTask: (id: string) => api.put(`/suppliers/tasks/${id}/accept`).then(r => r.data),
  startProduction: (id: string) => api.put(`/suppliers/tasks/${id}/start-production`).then(r => r.data),
  completeTask: (id: string, notes?: string) =>
    api.put(`/suppliers/tasks/${id}/complete`, { supplier_notes: notes }).then(r => r.data),
  rejectTask: (id: string, reason?: string) =>
    api.put(`/suppliers/tasks/${id}/reject`, { reason }).then(r => r.data),
};

// ====== 物流 API ======
export const logisticsApi = {
  getList: (params?: any) => api.get('/logistics', { params }).then(r => r.data),
  create: (data: any) => api.post('/logistics', data).then(r => r.data),
  updateStatus: (id: string, data: { status: string; tracking_number?: string }) =>
    api.put(`/logistics/${id}/status`, data).then(r => r.data),
  getByOrder: (orderId: string) => api.get(`/logistics/order/${orderId}`).then(r => r.data),
  queryTracking: (logisticsId: string) => api.get(`/tracking/${logisticsId}`).then(r => r.data),
  syncTracking: (logisticsId: string) => api.post(`/tracking/sync/${logisticsId}`).then(r => r.data),
};

// ====== Etsy API ======
export const etsyApi = {
  testConnection: () => api.get('/etsy/test-connection').then(r => r.data),
  syncOrders: () => api.post('/etsy/sync-orders').then(r => r.data),
};

// ====== 上传 API ======
export const uploadApi = {
  generateToken: (orderId: string) => api.post(`/uploads/token/${orderId}`).then(r => r.data),
  getOrderUploads: (orderId: string) => api.get(`/uploads/order/${orderId}`).then(r => r.data),
  updateImageNote: (id: string, description: string) => api.put(`/uploads/images/${id}`, { description }).then(r => r.data),
};

export default api;
