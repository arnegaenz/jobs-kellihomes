/*
  API layer for Kelli Homes Job Management with secure authentication.
*/

import { getApiBaseUrl } from "./config.js";
import { refreshAccessToken } from "./auth.js";
import { sanitizeObject } from "./utils/sanitize.js";

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// In-flight request cache for deduplication
const requestCache = new Map();

// Helper to create timeout promise
function createTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timeout")), ms);
  });
}

// Helper to wait before retry
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if error is retryable
function isRetryableError(error, response) {
  // Retry on network errors
  if (!response) return true;

  // Retry on server errors (5xx) but not client errors (4xx)
  if (response.status >= 500) return true;

  // Retry on specific status codes
  if (response.status === 408 || response.status === 429) return true;

  return false;
}

async function fetchJson(url, options = {}, retryCount = 0, isRetry = false) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  try {
    const response = await Promise.race([
      fetch(url, {
        ...options,
        credentials: "include", // CRITICAL: Send authentication cookies
        headers: {
          Accept: "application/json",
          ...(options.headers || {})
        }
      }),
      createTimeout(timeout)
    ]);

    // Handle token expiration with automatic refresh
    if (!response.ok && response.status === 401 && retryCount === 0) {
      try {
        const errorData = await response.clone().json();

        // If access token expired, try to refresh it
        if (errorData.code === "TOKEN_EXPIRED") {
          const refreshed = await refreshAccessToken();

          if (refreshed) {
            // Retry the original request with new token
            return fetchJson(url, options, retryCount + 1, false);
          }
        }
      } catch (e) {
        // If we can't parse error or refresh fails, fall through to error handling
      }
    }

    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        // User needs to log in again
        window.location.href = "/";
        throw new Error("Authentication required");
      }

      // Check if we should retry
      if (isRetryableError(null, response) && retryCount < MAX_RETRIES) {
        await delay(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
        return fetchJson(url, options, retryCount + 1, true);
      }

      // Parse error message
      let errorMessage = `Request failed (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (e) {
        const text = await response.text();
        if (text) errorMessage = text;
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } catch (error) {
    // Retry on network errors
    if (isRetryableError(error, null) && retryCount < MAX_RETRIES && !isRetry) {
      await delay(RETRY_DELAY * (retryCount + 1));
      return fetchJson(url, options, retryCount + 1, true);
    }

    // Enhance error message
    if (error.message === "Request timeout") {
      throw new Error("Request timed out. Please check your connection and try again.");
    }
    if (error.message === "Failed to fetch") {
      throw new Error("Unable to connect to server. Please check your internet connection.");
    }

    throw error;
  }
}

// Deduplicated fetch - prevents duplicate simultaneous requests
async function fetchJsonDedup(url, options = {}) {
  const cacheKey = `${url}:${JSON.stringify(options)}`;

  // Return existing in-flight request if found
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey);
  }

  // Create new request and cache it
  const promise = fetchJson(url, options)
    .finally(() => {
      // Remove from cache after completion
      requestCache.delete(cacheKey);
    });

  requestCache.set(cacheKey, promise);
  return promise;
}

export async function fetchJobs() {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJsonDedup(`${apiBaseUrl}/jobs`);
}

export async function fetchJobById(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJsonDedup(`${apiBaseUrl}/jobs/${jobId}`);
}

export async function createJob(payload) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeObject(payload))
  });
}

export async function updateJob(jobId, payload) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeObject(payload))
  });
}

export async function deleteJob(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}`, {
    method: "DELETE"
  });
}

export async function fetchJobLineItems(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJsonDedup(`${apiBaseUrl}/jobs/${jobId}/line-items`);
}

export async function saveJobLineItems(jobId, lineItems) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/line-items`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lineItems: sanitizeObject(lineItems) })
  });
}

export async function fetchJobDocuments(jobId, options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  const query = options.includeTrashed ? "?includeTrashed=true" : "";
  return fetchJsonDedup(`${apiBaseUrl}/jobs/${jobId}/documents${query}`);
}

export async function fetchDocuments(options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  const query = options.includeTrashed ? "?includeTrashed=true" : "";
  return fetchJsonDedup(`${apiBaseUrl}/documents${query}`);
}

export async function requestDocumentUpload(jobId, file, documentType) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      documentType
    })
  });
}

export async function deleteDocument(jobId, documentId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function restoreDocument(jobId, documentId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents/${documentId}/restore`, {
    method: "POST"
  });
}

export async function updateDocumentType(documentId, documentType) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/documents/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentType })
  });
}

// Business Documents API
export async function fetchBusinessDocuments(options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  const query = options.showTrashed ? "?showTrashed=true" : "";
  return fetchJsonDedup(`${apiBaseUrl}/business-documents${query}`);
}

export async function uploadBusinessDocument(file, type, description) {
  const apiBaseUrl = getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  if (description) {
    formData.append('description', description);
  }

  return fetchJson(`${apiBaseUrl}/business-documents/upload`, {
    method: "POST",
    body: formData,
    // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
    headers: {}
  });
}

export async function updateBusinessDocument(documentId, data) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/business-documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}

export async function deleteBusinessDocument(documentId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/business-documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function restoreBusinessDocument(documentId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/business-documents/${documentId}/restore`, {
    method: "POST"
  });
}
