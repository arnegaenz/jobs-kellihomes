/*
  API layer for Kelli Homes Job Management.
  TODO: Point these endpoints at your Lightsail API when ready.
*/

function getApiBaseUrl() {
  if (!window.KH_CONFIG || !window.KH_CONFIG.apiBaseUrl) {
    throw new Error("KH_CONFIG.apiBaseUrl is not set");
  }
  return window.KH_CONFIG.apiBaseUrl.replace(/\/$/, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
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
    body: JSON.stringify(payload)
  });
}

export async function updateJob(jobId, payload) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
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
    body: JSON.stringify({ lineItems })
  });
}

export async function fetchJobDocuments(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents`);
}

export async function requestDocumentUpload(jobId, file) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size
    })
  });
}

export async function deleteDocument(jobId, documentId) {
  const apiBaseUrl = getApiBaseUrl();
  return fetchJson(`${apiBaseUrl}/jobs/${jobId}/documents/${documentId}`, {
    method: "DELETE"
  });
}
