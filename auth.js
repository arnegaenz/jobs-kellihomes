/**
 * Secure Authentication Module
 * Handles login, logout, and session management with backend JWT authentication
 */

import { getApiBaseUrl } from "./config.js";

/**
 * Check if user is authenticated by verifying with backend
 */
export async function isAuthenticated() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: "GET",
      credentials: "include", // CRITICAL: Send cookies
      headers: {
        Accept: "application/json"
      }
    });

    return response.ok;
  } catch (error) {
    console.error("Auth check failed:", error);
    return false;
  }
}

/**
 * Get current authenticated user info
 */
export async function getCurrentUser() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.user; // { id, username, fullName, email }
  } catch (error) {
    console.error("Failed to get current user:", error);
    return null;
  }
}

/**
 * Login with username and password
 */
export async function login(username, password) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      credentials: "include", // CRITICAL: Receive cookies
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        username: username.trim(),
        password
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    return data.user; // { id, username, fullName, email }
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

/**
 * Logout and clear authentication cookies
 */
export async function logout() {
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    // Clear any local storage remnants from old auth system
    try {
      localStorage.removeItem("kh-auth-user");
    } catch (e) {
      // Ignore localStorage errors
    }

    return true;
  } catch (error) {
    console.error("Logout error:", error);
    return false;
  }
}

/**
 * Refresh access token if it's expired
 * Called automatically by API client when receiving 401 with TOKEN_EXPIRED code
 */
export async function refreshAccessToken() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    return response.ok;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return false;
  }
}
