import axios from 'axios';

// API base URL - works for both local development and Hugging Face Spaces
const API_BASE_URL = process.env.REACT_APP_API_URL || (
  window.location.hostname === 'localhost' 
    ? 'http://localhost:8000/api' 
    : `${window.location.protocol}//${window.location.host}/api`
);

console.log('🔍 API Configuration Debug:');
console.log('- window.location.hostname:', window.location.hostname);
console.log('- window.location.protocol:', window.location.protocol);
console.log('- window.location.host:', window.location.host);
console.log('- Resolved API_BASE_URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('🚀 Making API request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      fullURL: `${config.baseURL}${config.url}`,
      headers: config.headers
    });
    return config;
  },
  (error) => {
    console.error('❌ Request setup error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('✅ API response received:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('❌ API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      responseData: error.response?.data
    });
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