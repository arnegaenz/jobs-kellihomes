# Frontend Migration Guide - Secure Authentication

## Overview
This guide explains how to update the frontend to work with the new secure backend authentication.

## Changes Summary

1. **Remove hardcoded credentials** from main.js
2. **Add new auth.js module** for secure authentication
3. **Update api.js** to send credentials with requests
4. **Update config.js** to export getApiBaseUrl function
5. **Update main.js** to use new auth module
6. **Add logout functionality** to the header

## Step-by-Step Instructions

### 1. Add New Files

Copy these new files to your repository:

- `auth.js` - New authentication module
- `utils/sanitize.js` - Input sanitization (to be created)

### 2. Update config.js

**Replace the entire file** with:

```javascript
window.KH_CONFIG = {
  apiBaseUrl: "https://api.jobs.kellihomes.com"
};

export function getApiBaseUrl() {
  if (!window.KH_CONFIG || !window.KH_CONFIG.apiBaseUrl) {
    throw new Error("KH_CONFIG.apiBaseUrl is not set");
  }
  return window.KH_CONFIG.apiBaseUrl.replace(/\/$/, "");
}
```

### 3. Update api.js

**Find this section** (lines 1-32):

```javascript
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
```

**Replace with:**

```javascript
import { getApiBaseUrl } from "./config.js";
import { refreshAccessToken } from "./auth.js";

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
      // If we can't parse error or refresh fails, fall through
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
```

### 4. Update main.js

**At the top of the file, ADD these imports:**

```javascript
import {
  isAuthenticated,
  getCurrentUser,
  login,
  logout
} from "./auth.js";
```

**REMOVE these lines** (94-100):

```javascript
const AUTH_USERS = [
  { username: "arne", password: "$yd3JAC9" },
  { username: "raquel", password: "elizabeth1" },
  { username: "justin", password: "Aryna2026" }
];
const AUTH_STORAGE_KEY = "kh-auth-user";
let authUserFallback = null;
```

**REMOVE these functions** (lines 261-353):

```javascript
function getAuthenticatedUser() { ... }
function setAuthenticatedUser(username) { ... }
function isAuthenticated() { ... }
```

**REPLACE `updateSignedInUser()` function** (lines 281-287) with:

```javascript
async function updateSignedInUser() {
  const label = document.getElementById("signed-in-user");
  if (!label) return;

  const user = await getCurrentUser();
  if (user) {
    label.textContent = `Signed in as ${user.username}`;
  } else {
    label.textContent = "Signed in as —";
  }
}
```

**REPLACE `initLoginFlow()` function** (lines 307-353) with:

```javascript
async function initLoginFlow() {
  const form = document.getElementById("login-form");
  if (!form) return false;

  const authenticated = await isAuthenticated();

  if (!authenticated) {
    showLogin();
  } else {
    hideLogin();
  }

  await updateSignedInUser();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("login-message", "Signing in...");

    try {
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");

      const user = await login(username, password);

      await updateSignedInUser();
      setMessage("login-message", "Signed in. Loading...");
      hideLogin();

      // Clear old localStorage if it exists
      try {
        localStorage.removeItem("kh-auth-user");
      } catch (e) {
        // Ignore
      }

      // Initialize the appropriate page
      if (isJobDetailPage()) {
        initJobDetailPage();
      } else if (isDocumentsPage()) {
        initDocumentsPage();
      } else {
        initDashboardPage();
      }
    } catch (error) {
      console.error("Login failed:", error);
      setMessage("login-message", error.message || "Invalid login. Please try again.", true);
    }
  });

  return authenticated;
}
```

### 5. Add Logout Functionality to HTML

**Edit index.html, job.html, and documents.html**

Find this section in the header:

```html
<div class="kh-user" id="signed-in-user">Signed in as —</div>
```

**Replace with:**

```html
<div class="kh-user">
  <span id="signed-in-user">Signed in as —</span>
  <button class="kh-link" id="logout-button" style="margin-left: 12px;">Logout</button>
</div>
```

**Then add this JavaScript at the end of main.js** (after the initialization code):

```javascript
// Add logout functionality
document.addEventListener("DOMContentLoaded", () => {
  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      await logout();
      window.location.reload();
    });
  }
});
```

### 6. Add Input Sanitization Utility

Create a new file `utils/sanitize.js`:

```javascript
/**
 * Client-side input sanitization
 */

export function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  return str
    .trim()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>]/g, ''); // Remove < and > characters
}

export function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];

      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
}
```

**Then update the API calls in main.js** to sanitize input before sending:

In `api.js`, add sanitization to the createJob and updateJob functions:

```javascript
import { sanitizeObject } from "./utils/sanitize.js";

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
```

## Testing Checklist

After making these changes:

- [ ] Login page appears when not authenticated
- [ ] Login with valid credentials works
- [ ] Login with invalid credentials shows error
- [ ] User info displays in header after login
- [ ] Dashboard loads after successful login
- [ ] Job detail page requires authentication
- [ ] Documents page requires authentication
- [ ] Logout button works
- [ ] After logout, login page appears again
- [ ] All API calls work (create job, edit job, upload documents, etc.)
- [ ] Browser refresh maintains login state
- [ ] Opening in new tab requires login if not authenticated

## Deployment

1. **Test locally** if possible (requires backend running locally)
2. **Commit changes** to Git
3. **Push to GitHub** - GitHub Pages will automatically deploy
4. **Verify** the live site works with the backend

### Git Commands

```bash
# In your local repository
git add auth.js utils/sanitize.js config.js api.js main.js index.html job.html documents.html
git commit -m "Implement secure authentication with backend"
git push origin main
```

GitHub Pages will automatically deploy your changes within 1-2 minutes.

## Troubleshooting

### "Authentication required" appears immediately
- Check that backend is running and accessible
- Verify CORS is configured with `credentials: true`
- Check browser console for errors

### Login doesn't work
- Check backend logs: `pm2 logs kh-jobs-api`
- Verify users exist in database
- Check network tab in browser DevTools for login request

### API calls return 401
- Verify `credentials: 'include'` is set in api.js
- Check that cookies are being sent (Network tab → Headers)
- Verify backend CORS allows credentials

### Cookies not being set
- Ensure backend is HTTPS in production
- Verify `secure` flag is set correctly based on environment
- Check SameSite policy

## Rollback

If issues arise, revert to previous version:

```bash
git revert HEAD
git push origin main
```

This will restore the old authentication system while you troubleshoot.
