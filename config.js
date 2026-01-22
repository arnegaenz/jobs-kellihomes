window.KH_CONFIG = {
  apiBaseUrl: "https://api.jobs.kellihomes.com"
};

export function getApiBaseUrl() {
  if (!window.KH_CONFIG || !window.KH_CONFIG.apiBaseUrl) {
    throw new Error("KH_CONFIG.apiBaseUrl is not set");
  }
  return window.KH_CONFIG.apiBaseUrl.replace(/\/$/, "");
}
