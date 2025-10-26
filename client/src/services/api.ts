import axios, { AxiosResponse, AxiosError } from 'axios';
import { store } from '../store';
import { refreshAccessToken, logout } from '../store/slices/authSlice';

// Base API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const state = store.getState();
    const token = state.auth.token;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        await store.dispatch(refreshAccessToken());
        
        // Retry original request with new token
        const state = store.getState();
        const newToken = state.auth.token;
        
        if (newToken && originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        store.dispatch(logout());
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

// API Response Types
export interface ApiResponse<T = any> {
  status: 'success' | 'fail' | 'error';
  data?: T;
  message?: string;
  errors?: any[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
}

// Auth API
export const authAPI = {
  register: (userData: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/register', userData);
  },

  login: (credentials: {
    email: string;
    password: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/login', credentials);
  },

  logout: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/logout');
  },

  refreshToken: (refreshToken: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/refresh', { refreshToken });
  },

  forgotPassword: (email: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/forgot-password', { email });
  },

  resetPassword: (token: string, password: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/reset-password', { token, password });
  },

  verifyEmail: (token: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/verify-email', { token });
  },

  resendVerification: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/auth/resend-verification');
  },

  updateProfile: (profileData: any): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch('/auth/profile', profileData);
  },

  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch('/auth/change-password', data);
  },

  deleteAccount: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete('/auth/account');
  },
};

// Users API
export const usersAPI = {
  getProfile: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/users/${userId}` : '/users/me';
    return api.get(endpoint);
  },

  updateProfile: (data: any): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch('/users/me', data);
  },

  updatePreferences: (preferences: any): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch('/users/me/preferences', preferences);
  },

  uploadAvatar: (formData: FormData): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  deleteAvatar: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete('/users/me/avatar');
  },

  getStats: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/users/${userId}/stats` : '/users/me/stats';
    return api.get(endpoint);
  },

  getBadges: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/users/${userId}/badges` : '/users/me/badges';
    return api.get(endpoint);
  },

  getFollowing: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/users/${userId}/following` : '/users/me/following';
    return api.get(endpoint);
  },

  getFollowers: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/users/${userId}/followers` : '/users/me/followers';
    return api.get(endpoint);
  },

  followUser: (userId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/users/${userId}/follow`);
  },

  unfollowUser: (userId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/users/${userId}/follow`);
  },

  blockUser: (userId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/users/${userId}/block`);
  },

  unblockUser: (userId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/users/${userId}/block`);
  },

  reportUser: (userId: string, reason: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/users/${userId}/report`, { reason });
  },

  searchUsers: (query: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/users/search?q=${encodeURIComponent(query)}`);
  },

  getLeaderboard: (params?: {
    timeframe?: string;
    category?: string;
    limit?: number;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.timeframe) queryParams.append('timeframe', params.timeframe);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    return api.get(`/users/leaderboard?${queryParams.toString()}`);
  },
};

// Questions API
export const questionsAPI = {
  getQuestions: (params?: {
    page?: number;
    limit?: number;
    category?: string;
    difficulty?: number;
    sortBy?: string;
    search?: string;
    filters?: any;
  }): Promise<AxiosResponse<ApiResponse<PaginatedResponse<any>>>> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.category) queryParams.append('category', params.category);
    if (params?.difficulty) queryParams.append('difficulty', params.difficulty.toString());
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.search) queryParams.append('search', params.search);
    
    return api.get(`/questions?${queryParams.toString()}`);
  },

  getQuestion: (id: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/questions/${id}`);
  },

  createQuestion: (questionData: {
    optionA: string;
    optionB: string;
    category: string;
    difficulty: number;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/questions', questionData);
  },

  updateQuestion: (id: string, data: any): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch(`/questions/${id}`, data);
  },

  deleteQuestion: (id: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/questions/${id}`);
  },

  getTrendingQuestions: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.get('/questions/trending');
  },

  getUserQuestions: (userId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/questions/user/${userId}`);
  },

  searchQuestions: (query: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/questions/search?q=${encodeURIComponent(query)}`);
  },

  reportQuestion: (id: string, reason: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/questions/${id}/report`, { reason });
  },

  shareQuestion: (id: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/questions/${id}/share`);
  },

  getQuestionAnalytics: (id: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/questions/${id}/analytics`);
  },
};

// Votes API
export const votesAPI = {
  vote: (questionId: string, option: 'A' | 'B'): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/votes', { questionId, option });
  },

  updateVote: (voteId: string, option: 'A' | 'B'): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch(`/votes/${voteId}`, { option });
  },

  deleteVote: (voteId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/votes/${voteId}`);
  },

  getUserVotes: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/votes/user/${userId}` : '/votes/me';
    return api.get(endpoint);
  },

  getQuestionVotes: (questionId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/votes/question/${questionId}`);
  },

  getVoteStats: (questionId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/votes/question/${questionId}/stats`);
  },

  getVotingTrends: (params?: {
    timeframe?: string;
    category?: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.timeframe) queryParams.append('timeframe', params.timeframe);
    if (params?.category) queryParams.append('category', params.category);
    
    return api.get(`/votes/trends?${queryParams.toString()}`);
  },
};

// Chat API
export const chatAPI = {
  getMessages: (questionId: string, params?: {
    page?: number;
    limit?: number;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    return api.get(`/chat/${questionId}?${queryParams.toString()}`);
  },

  sendMessage: (data: {
    questionId: string;
    message: string;
    parentId?: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/chat', data);
  },

  updateMessage: (messageId: string, message: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.patch(`/chat/${messageId}`, { message });
  },

  deleteMessage: (messageId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/chat/${messageId}`);
  },

  addReaction: (messageId: string, emoji: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/chat/${messageId}/reaction`, { emoji });
  },

  removeReaction: (messageId: string, emoji: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.delete(`/chat/${messageId}/reaction`, { data: { emoji } });
  },

  reportMessage: (messageId: string, reason: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.post(`/chat/${messageId}/report`, { reason });
  },
};

// Analytics API
export const analyticsAPI = {
  getDashboard: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.get('/analytics/dashboard');
  },

  getUserAnalytics: (userId?: string): Promise<AxiosResponse<ApiResponse>> => {
    const endpoint = userId ? `/analytics/user/${userId}` : '/analytics/me';
    return api.get(endpoint);
  },

  getQuestionAnalytics: (questionId: string): Promise<AxiosResponse<ApiResponse>> => {
    return api.get(`/analytics/question/${questionId}`);
  },

  getVotingPatterns: (params?: {
    timeframe?: string;
    category?: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.timeframe) queryParams.append('timeframe', params.timeframe);
    if (params?.category) queryParams.append('category', params.category);
    
    return api.get(`/analytics/voting-patterns?${queryParams.toString()}`);
  },

  getEngagementMetrics: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.get('/analytics/engagement');
  },

  getTopQuestions: (params?: {
    timeframe?: string;
    category?: string;
    limit?: number;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.timeframe) queryParams.append('timeframe', params.timeframe);
    if (params?.category) queryParams.append('category', params.category);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    return api.get(`/analytics/top-questions?${queryParams.toString()}`);
  },

  getTopUsers: (params?: {
    timeframe?: string;
    metric?: string;
    limit?: number;
  }): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = new URLSearchParams();
    if (params?.timeframe) queryParams.append('timeframe', params.timeframe);
    if (params?.metric) queryParams.append('metric', params.metric);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    return api.get(`/analytics/top-users?${queryParams.toString()}`);
  },
};

// AI API
export const aiAPI = {
  generateQuestion: (data: {
    category?: string;
    difficulty?: number;
    theme?: string;
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/ai/generate', data);
  },

  getAIStats: (timeframe?: string): Promise<AxiosResponse<ApiResponse>> => {
    const queryParams = timeframe ? `?timeframe=${timeframe}` : '';
    return api.get(`/ai/stats${queryParams}`);
  },

  getAILimits: (): Promise<AxiosResponse<ApiResponse>> => {
    return api.get('/ai/limits');
  },

  batchGenerate: (data: {
    count: number;
    categories?: string[];
    difficulties?: number[];
  }): Promise<AxiosResponse<ApiResponse>> => {
    return api.post('/ai/batch', data);
  },
};

export default api;