import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../store/toastStore';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

const NETWORK_ERROR_TOAST_COOLDOWN_MS = 15_000;
let lastNetworkErrorToastAt = 0;

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap envelope data if present
    if (response.data && response.data.success !== undefined) {
      return response.data;
    }
    return response;
  },
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh');

      if (!isAuthEndpoint) {
        originalRequest._retry = true;
        const refreshToken = useAuthStore.getState().refreshToken;

        if (!refreshToken) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(error);
        }

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return apiClient(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        isRefreshing = true;

        try {
          const response = await axios.post('/api/v1/auth/refresh', { refreshToken });
          const envelope = response.data;

          if (envelope.success && envelope.data) {
            const { accessToken, refreshToken: newRefreshToken } = envelope.data;
            const currentUser = useAuthStore.getState().user;

            if (currentUser) {
              useAuthStore.getState().setAuth(currentUser, accessToken, newRefreshToken);
            }

            apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            }

            processQueue(null, accessToken);
            return apiClient(originalRequest);
          } else {
            throw new Error('Refresh token invalid');
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          useAuthStore.getState().logout();
          showToast({
            type: 'error',
            title: 'Session Expired',
            message: 'Your session has expired. Please log in again.',
          });
          window.location.href = '/login';
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Extract error message from API Envelope
    const apiError = error.response?.data?.error;
    const errorMessage = apiError?.message || error.message || 'An unexpected error occurred';

    // Server unreachable: show one toast per outage instead of one per failed request
    if (!error.response) {
      const now = Date.now();
      if (now - lastNetworkErrorToastAt > NETWORK_ERROR_TOAST_COOLDOWN_MS) {
        lastNetworkErrorToastAt = now;
        showToast({
          type: 'error',
          title: 'Server unreachable',
          message: 'Cannot connect to the server. Check that it is running, then refresh the page.',
        });
      }
      return Promise.reject(error);
    }

    // Show toast for non-auth errors
    if (error.response?.status !== 401) {
      showToast({
        type: 'error',
        title: apiError?.code ? `Error (${apiError.code})` : 'Request Failed',
        message: errorMessage,
      });
    }

    return Promise.reject(error);
  }
);
