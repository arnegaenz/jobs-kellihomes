window.KH_CONFIG = {
  apiBaseUrl: "https://api.jobs.kellihomes.com",
  mapboxToken: "pk.eyJ1Ijoia2VsbGlob21lcyIsImEiOiJjbWt1OWV2Z3kxeTdyM2dxODM5MW5xMmttIn0.UZVFite5tNNwrIOXJgBcYQ"
};

export function getApiBaseUrl() {
  if (!window.KH_CONFIG || !window.KH_CONFIG.apiBaseUrl) {
    throw new Error("KH_CONFIG.apiBaseUrl is not set");
  }
  return window.KH_CONFIG.apiBaseUrl.replace(/\/$/, "");
}
