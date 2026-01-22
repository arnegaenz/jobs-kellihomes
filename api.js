/*
  API layer for Kelli Homes Job Management with secure authentication.
*/

import { getApiBaseUrl } from "./config.js";
import { refreshAccessToken } from "./auth.js";
import { sanitizeObject } from "./utils/sanitize.js";

async function fetchJson(url, options = {}, retryCount = 0) {
  const response = await fetch(url, {
    ...options,
    credentials: "include", // CRITICAL: Send authentication cookies
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  // Handle token expiration with automatic refresh
  if (!response.ok && response.status === 401 && retryCount === 0) {
    try {
      const errorData = await response.clone().json();

      // If access token expired, try to refresh it
      if (errorData.code === "TOKEN_EXPIRED") {
        const refreshed = await refreshAccessToken();

        if (refreshed) {
          // Retry the original request with new token
          return fetchJson(url, options, retryCount + 1);
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

    const message = await response.text();
    throw new Error(`Request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function fetchJobs() {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs`);
}

export async function fetchJobById(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}`);
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
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/line-items`);
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
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents${query}`);
}

export async function fetchDocuments(options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  const query = options.includeTrashed ? "?includeTrashed=true" : "";
  return fetchJson(`${apiBaseUrl}/documents${query}`);
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
