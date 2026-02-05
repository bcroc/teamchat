import { config } from './config';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
  timeout?: number;
}

// Token getter function - can be sync or async
type TokenGetter = () => string | null | Promise<string | null>;
let tokenGetter: TokenGetter = () => null;

/**
 * Set the token getter function for the API client
 * This allows the auth store to provide tokens asynchronously
 */
export function setTokenGetter(getter: TokenGetter): void {
  tokenGetter = getter;
}

/**
 * API Error class with structured error information
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    code: string, 
    message: string, 
    status: number, 
    details?: Record<string, unknown>,
    options?: { isNetworkError?: boolean; isTimeout?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.isNetworkError = options?.isNetworkError ?? false;
    this.isTimeout = options?.isTimeout ?? false;
  }

  /**
   * User-friendly error message
   */
  get userMessage(): string {
    if (this.isTimeout) {
      return 'Request timed out. Please check your connection and try again.';
    }
    if (this.isNetworkError) {
      return 'Unable to connect to the server. Please check your internet connection.';
    }
    if (this.status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (this.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (this.status === 404) {
      return 'The requested resource was not found.';
    }
    if (this.status >= 500) {
      return 'Server error. Please try again later.';
    }
    return this.message;
  }
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor(baseUrl: string, defaultTimeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.defaultTimeout = defaultTimeout;
  }

  private async getToken(): Promise<string | null> {
    return await tokenGetter();
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  /**
   * Create an AbortController with timeout
   */
  private createTimeoutController(timeout: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return { controller, timeoutId };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options;
    const url = this.buildUrl(path, params);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = await this.getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const { controller, timeoutId } = this.createTimeoutController(timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new ApiError(
          error.code || 'ERROR', 
          error.message, 
          response.status, 
          error.details
        );
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      // Handle abort/timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ApiError(
          'TIMEOUT', 
          'Request timed out', 
          0, 
          undefined, 
          { isTimeout: true }
        );
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiError(
          'NETWORK_ERROR', 
          'Network error', 
          0, 
          undefined, 
          { isNetworkError: true }
        );
      }

      // Re-throw unknown errors
      throw new ApiError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : 'An unknown error occurred',
        0
      );
    }
  }

  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  // File upload
  async upload<T>(path: string, file: File, data?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path);
    const formData = new FormData();
    formData.append('file', file);

    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const headers: HeadersInit = {};
    const token = await this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(error.code || 'ERROR', error.message, response.status);
    }

    return response.json();
  }

  // Download file
  async download(path: string): Promise<{ blob: Blob; filename: string }> {
    const url = this.buildUrl(path);

    const headers: HeadersInit = {};
    const token = await this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new ApiError('DOWNLOAD_ERROR', 'Download failed', response.status);
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'download';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    const blob = await response.blob();
    return { blob, filename };
  }
}

export const api = new ApiClient(config.api.baseUrl, config.api.timeout);
