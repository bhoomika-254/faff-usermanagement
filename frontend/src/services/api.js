import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const memoryAPI = {
  // Health check
  getHealth: () => api.get('/health'),

  // System stats
  getSystemStats: () => api.get('/stats'),

  // Users
  getUsers: () => api.get('/users'),
  getUserSummary: (userId) => api.get(`/users/${userId}/summary`),
  getUserMemory: (userId, layer = null) => {
    const params = layer ? { layer } : {};
    return api.get(`/users/${userId}/memory`, { params });
  },

  // Updates
  getPendingUpdates: (limit = 500, layer = null) => {
    const params = { limit };
    if (layer) params.layer = layer;
    return api.get('/updates/pending', { params });
  },
  approveUpdate: (updateId, reviewedBy = 'ops_user') => 
    api.post(`/updates/${updateId}/approve`, { action: 'approve', reviewed_by: reviewedBy }),
  rejectUpdate: (updateId, reviewedBy = 'ops_user') => 
    api.post(`/updates/${updateId}/reject`, { action: 'reject', reviewed_by: reviewedBy }),

  // Processing
  processAllJsons: (forceReprocess = false) => api.post('/process/all-jsons', {}, { params: { force_reprocess: forceReprocess } }),
  processSingleJson: (userId, forceReprocess = false) => api.post(`/process/json/${userId}`, {}, { params: { force_reprocess: forceReprocess } }),
  reprocessRejectedNode: (nodeId) => api.post(`/reprocess/${nodeId}`),
  getReprocessingCandidates: () => api.get('/reprocess/candidates'),
};

export default api;