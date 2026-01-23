/*
  Password change functionality
*/

import { getApiBaseUrl } from "./config.js";

const form = document.getElementById('change-password-form');
const errorDiv = document.getElementById('password-error');
const successDiv = document.getElementById('password-success');

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  // Clear previous messages
  errorDiv.hidden = true;
  errorDiv.textContent = '';
  successDiv.style.display = 'none';
  successDiv.textContent = '';

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    errorDiv.textContent = 'New passwords do not match';
    errorDiv.hidden = false;
    return;
  }

  // Validate password length
  if (newPassword.length < 6) {
    errorDiv.textContent = 'New password must be at least 6 characters';
    errorDiv.hidden = false;
    return;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/password/change`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Failed to change password';
      errorDiv.hidden = false;
      return;
    }

    // Success!
    successDiv.textContent = 'Password changed successfully! You can continue using the system.';
    successDiv.style.display = 'block';

    // Clear form
    form.reset();

    // Optionally redirect after a delay
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);

  } catch (error) {
    console.error('Password change error:', error);
    errorDiv.textContent = 'An error occurred. Please try again.';
    errorDiv.hidden = false;
  }
});
