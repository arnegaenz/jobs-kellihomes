import {
  fetchJobs,
  fetchJobById,
  createJob,
  updateJob,
  deleteJob,
  fetchJobLineItems,
  saveJobLineItems,
  fetchJobDocuments,
  fetchDocuments,
  requestDocumentUpload,
  deleteDocument,
  restoreDocument,
  updateDocumentType,
  fetchBusinessDocuments,
  uploadBusinessDocument,
  updateBusinessDocument,
  deleteBusinessDocument,
  restoreBusinessDocument
} from "./api.js";

import {
  isAuthenticated,
  getCurrentUser,
  login,
  logout
} from "./auth.js";

// Button loading state utilities
function setButtonLoading(button, loadingText = "Loading...") {
  if (!button) return;
  button.dataset.originalText = button.textContent;
  button.textContent = loadingText;
  button.disabled = true;
}

function resetButton(button) {
  if (!button) return;
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  delete button.dataset.originalText;
}

// Debounce utility for performance
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Mapbox Address Autocomplete
 * Provides address suggestions as user types using Mapbox Geocoding API
 */
async function searchAddresses(query) {
  if (!query || query.length < 3) return [];

  const token = window.KH_CONFIG.mapboxToken;
  if (!token) {
    console.error('Mapbox token not configured');
    return [];
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=US&types=address&limit=5`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Mapbox API request failed');
    }

    const data = await response.json();
    return data.features || [];
  } catch (error) {
    console.error('Error fetching address suggestions:', error);
    return [];
  }
}

function initAddressAutocomplete(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const suggestionsContainer = document.getElementById(suggestionsId);

  if (!input || !suggestionsContainer) return;

  let currentFocus = -1;

  const debouncedSearch = debounce(async (query) => {
    if (query.length < 3) {
      suggestionsContainer.classList.remove('is-visible');
      return;
    }

    const results = await searchAddresses(query);
    renderAddressSuggestions(results, suggestionsContainer, input);
  }, 300);

  input.addEventListener('input', (e) => {
    currentFocus = -1;
    debouncedSearch(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestionsContainer.querySelectorAll('.kh-address-suggestion');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentFocus++;
      addActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentFocus--;
      addActive(items);
      } else if (e.key === 'Enter') {
      // Always prevent Enter from submitting the form in address field
      e.preventDefault();
      if (currentFocus > -1 && items[currentFocus]) {
        items[currentFocus].click();
      }
      // If no suggestion selected, just close the dropdown without submitting
      if (suggestionsContainer.classList.contains('is-visible')) {
        suggestionsContainer.classList.remove('is-visible');
      }
    } else if (e.key === 'Escape') {
      suggestionsContainer.classList.remove('is-visible');
    }
  });

  function addActive(items) {
    if (!items.length) return;
    removeActive(items);

    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;

    items[currentFocus].classList.add('is-active');
  }

  function removeActive(items) {
    items.forEach(item => item.classList.remove('is-active'));
  }

  // Close suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== input && !suggestionsContainer.contains(e.target)) {
      suggestionsContainer.classList.remove('is-visible');
    }
  });
}

function renderAddressSuggestions(results, container, input) {
  container.innerHTML = '';

  if (!results || results.length === 0) {
    container.classList.remove('is-visible');
    return;
  }

  results.forEach(result => {
    const suggestion = document.createElement('div');
    suggestion.className = 'kh-address-suggestion';

    const name = document.createElement('div');
    name.className = 'kh-address-suggestion__name';
    name.textContent = result.text || '';

    const full = document.createElement('div');
    full.className = 'kh-address-suggestion__full';
    full.textContent = result.place_name || '';

    suggestion.appendChild(name);
    suggestion.appendChild(full);

    suggestion.addEventListener('click', () => {
      input.value = result.place_name;
      container.classList.remove('is-visible');
      input.focus();
    });

    container.appendChild(suggestion);
  });

  container.classList.add('is-visible');
}

// Network status monitoring
let isOnline = navigator.onLine;

window.addEventListener("online", () => {
  isOnline = true;
  console.log("Connection restored");
});

window.addEventListener("offline", () => {
  isOnline = false;
  console.log("Connection lost");
});

// Enhanced error handling helper
function handleError(error, messageId, defaultMessage = "An error occurred") {
  console.error(error);

  let userMessage = defaultMessage;

  if (!isOnline) {
    userMessage = "No internet connection. Please check your network and try again.";
  } else if (error.message) {
    // Use the error message from the API if available
    userMessage = error.message;
  }

  if (messageId) {
    setMessage(messageId, userMessage, true);
  }

  return userMessage;
}

const LINE_ITEM_CATALOG = [
  { code: "01.01", group: "01.00 Site Work", name: "Demolition", description: "Removal of any structures" },
  { code: "01.02", group: "01.00 Site Work", name: "Excavation", description: "Excavation - Foundation Prep" },
  { code: "01.03", group: "01.00 Site Work", name: "Rough Grading", description: "General Site Grading" },
  { code: "01.04", group: "01.00 Site Work", name: "Water System", description: "Water Lines | Hook Up" },
  { code: "01.05", group: "01.00 Site Work", name: "Sewer | Septic", description: "Sewer | Septic Installation" },
  { code: "01.06", group: "01.00 Site Work", name: "Temp Power | Sani-can", description: "Site Power" },
  { code: "01.07", group: "01.00 Site Work", name: "Rockeries", description: "Engineered Rockeries" },
  { code: "02.01", group: "02.00 Foundation", name: "Footings", description: "" },
  { code: "02.02", group: "02.00 Foundation", name: "Foundation Walls", description: "" },
  { code: "02.03", group: "02.00 Foundation", name: "Garage | Basement Floor", description: "Concrete Flatwork" },
  { code: "02.04", group: "02.00 Foundation", name: "Drainage | Waterproofing", description: "Footing Drains | Waterproofing" },
  { code: "02.05", group: "02.00 Foundation", name: "Structural Foundation", description: "Pin Piles | Other Structural Foundation Requirements" },
  { code: "02.06", group: "02.00 Foundation", name: "Temporary Shoring", description: "Temporary Shoring" },
  { code: "03.01", group: "03.00 Structural", name: "Framing Lumber | Materials", description: "All Lumber and hardware needed for Framing" },
  { code: "03.02", group: "03.00 Structural", name: "Trusses and Sheathing", description: "Trusses | Roof Sheathing" },
  { code: "03.03", group: "03.00 Structural", name: "Framing Labor", description: "Framing Labor" },
  { code: "03.04", group: "03.00 Structural", name: "Structural Steel", description: "Structural Steel" },
  { code: "04.01", group: "04.00 Exterior", name: "Roofing", description: "Roof Material and Labor" },
  { code: "04.02", group: "04.00 Exterior", name: "Siding & Exterior Trim", description: "Subcontractor Labor and Materials" },
  { code: "04.03", group: "04.00 Exterior", name: "Masonry Veneer & Chimney", description: "Stone Exterior" },
  { code: "04.04", group: "04.00 Exterior", name: "Gutters & Downspouts", description: "Gutters and Downspouts" },
  { code: "04.05", group: "04.00 Exterior", name: "Window | Slider | Skylight", description: "All Exterior Glazing & Windows" },
  { code: "04.06", group: "04.00 Exterior", name: "Exterior Doors", description: "" },
  { code: "04.07", group: "04.00 Exterior", name: "Garage Doors", description: "" },
  { code: "05.01", group: "05.00 Interior Infrastructure", name: "Fireplaces", description: "" },
  { code: "05.02", group: "05.00 Interior Infrastructure", name: "Fire Sprinklers", description: "" },
  { code: "05.03", group: "05.00 Interior Infrastructure", name: "Plumbing (Rough)", description: "Could be labor or materials" },
  { code: "05.04", group: "05.00 Interior Infrastructure", name: "Electrical (Rough)", description: "" },
  { code: "05.05", group: "05.00 Interior Infrastructure", name: "Low Voltage (Rough)", description: "" },
  { code: "05.06", group: "05.00 Interior Infrastructure", name: "HVAC (Rough)", description: "" },
  { code: "05.07", group: "05.00 Interior Infrastructure", name: "Gas Piping", description: "" },
  { code: "05.08", group: "05.00 Interior Infrastructure", name: "Central Vacuum", description: "" },
  { code: "06.01", group: "06.00 Interior Enclosure", name: "Insulation", description: "" },
  { code: "06.02", group: "06.00 Interior Enclosure", name: "Drywall | Sheetrock", description: "" },
  { code: "06.03", group: "06.00 Interior Enclosure", name: "Sound Proofing", description: "" },
  { code: "07.01", group: "07.00 Interior Finish", name: "Painting Walls | Millwork", description: "" },
  { code: "07.03", group: "07.00 Interior Finish", name: "Cabinets | Hardware", description: "Cabinets & Hardware" },
  { code: "07.04", group: "07.00 Interior Finish", name: "Countertops", description: "Kitchen | Bathrooms" },
  { code: "07.05", group: "07.00 Interior Finish", name: "Tile | Granite | Laminate", description: "Tile | Granite | Laminate" },
  { code: "07.06", group: "07.00 Interior Finish", name: "Masonry Trim", description: "Masonry Trim" },
  { code: "07.07", group: "07.00 Interior Finish", name: "Doors | Closets", description: "Interior Doors | Closet Packs" },
  { code: "07.08", group: "07.00 Interior Finish", name: "Millwork | Interior Trim", description: "Baseboard | Door wraps | Window wraps" },
  { code: "07.09", group: "07.00 Interior Finish", name: "Staircase | Railing", description: "Railings & Hand rails" },
  { code: "07.10", group: "07.00 Interior Finish", name: "Finish Carpentry", description: "Labor" },
  { code: "07.11", group: "07.00 Interior Finish", name: "Finish Hardware", description: "Knobs | Handles | Slides | Hinges" },
  { code: "07.12", group: "07.00 Interior Finish", name: "Plumbing Trim", description: "Sinks | Faucets" },
  { code: "07.13", group: "07.00 Interior Finish", name: "Electrical Trim", description: "Plates | Switches | Can light trims" },
  { code: "07.14", group: "07.00 Interior Finish", name: "Lighting Fixtures", description: "Light Fixtures | Chandeliers" },
  { code: "07.15", group: "07.00 Interior Finish", name: "Appliances", description: "Kitchen | Laundry | All" },
  { code: "07.16", group: "07.00 Interior Finish", name: "Carpet | Vinyl Flooring", description: "Floor Coverings" },
  { code: "07.17", group: "07.00 Interior Finish", name: "Mirrors | Shower Doors", description: "Show Doors | Mirrors" },
  { code: "07.18", group: "07.00 Interior Finish", name: "Closet Shelving", description: "Master | Laundry | Pantry" },
  { code: "07.20", group: "07.00 Interior Finish", name: "Hardwood Flooring", description: "Labor & Materials" },
  { code: "08.01", group: "08.00 Exterior Finish", name: "Painting (Exterior)", description: "Painting Labor and Materials" },
  { code: "08.02", group: "08.00 Exterior Finish", name: "Decks", description: "Deck labor and materials" },
  { code: "08.03", group: "08.00 Exterior Finish", name: "Fences", description: "Fencing Labor and Materials" },
  { code: "08.04", group: "08.00 Exterior Finish", name: "Final Grading", description: "Pre-Landscaping grading" },
  { code: "08.05", group: "08.00 Exterior Finish", name: "Driveway | Sidewalks", description: "Concrete | Pavers | Gravel | Stone" },
  { code: "08.06", group: "08.00 Exterior Finish", name: "Landscaping", description: "Lawn | Trees | Plants" },
  { code: "08.07", group: "08.00 Exterior Finish", name: "Irrigation", description: "Landscape Irrigation" },
  { code: "09.01", group: "09.00 Miscellaneous", name: "Cleanup", description: "Jobsite Cleaning" },
  { code: "09.02", group: "09.00 Miscellaneous", name: "Loan Costs", description: "" },
  { code: "09.03", group: "09.00 Miscellaneous", name: "Loan Carry (Interest)", description: "" },
  { code: "09.04", group: "09.00 Miscellaneous", name: "Permits | Engineering", description: "Job Specific Permits | Licenses" },
  { code: "09.05", group: "09.00 Miscellaneous", name: "Contingency", description: "Planning for unexpected costs" },
  { code: "09.06", group: "09.00 Miscellaneous", name: "Land Acquisition", description: "Land acquisition for Spec" },
  { code: "09.07", group: "09.00 Miscellaneous", name: "Building Insurance", description: "Insurance for Building" },
  { code: "09.08", group: "09.00 Miscellaneous", name: "Utilities", description: "Project Utilities During Construction" },
  { code: "09.09", group: "09.00 Miscellaneous", name: "Legal Fees", description: "" },
  { code: "10.00", group: "10.00 Builder Markup", name: "Construction Markup", description: "Construction Markup" },
  { code: "10.02", group: "10.00 Builder Markup", name: "Additional GC Time", description: "Hourly rate for additional GC Time" },
  { code: "07.03.01", group: "07.00 Interior Finish", name: "Cabinets (Client Paid)", description: "Cabinets and Hardware (Client Paid)" },
  { code: "11.00", group: "11.00 Project Deposit", name: "Project Deposit", description: "" }
];

const LINE_ITEM_STATUSES = ["Not Started", "In Progress", "Complete", "On Hold"];

const DOCUMENT_TYPES = [
  { value: "Miscellaneous", icon: "file" },
  { value: "Approved Planset", icon: "blueprint" },
  { value: "Cabinet Plans", icon: "blueprint" },
  { value: "Permit", icon: "stamp" },
  { value: "Insurance Estimate", icon: "shield" },
  { value: "Contract / Agreement", icon: "file" },
  { value: "Change Order", icon: "swap" },
  { value: "Photos", icon: "camera" },
  { value: "Invoice", icon: "receipt" },
  { value: "Inspection / Signoff", icon: "check" },
  { value: "Warranty Docs", icon: "warranty" }
];

/**
 * Tab Navigation System
 * Handles tab switching with URL hash persistence
 */

function initTabNavigation() {
  const tabs = document.querySelectorAll('.kh-tab');
  const tabPanels = document.querySelectorAll('.kh-tab-panel');

  if (!tabs.length || !tabPanels.length) return;

  // Get initial tab from URL hash or default to 'summary'
  const initialTab = getTabFromHash() || 'summary';

  // Tab click handlers
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchToTab(tabName);
    });
  });

  // Handle browser back/forward
  window.addEventListener('hashchange', () => {
    const tabName = getTabFromHash();
    if (tabName) {
      switchToTab(tabName, false); // false = don't update hash
    }
  });

  // Set initial tab
  switchToTab(initialTab, false);
}

function switchToTab(tabName, updateHash = true) {
  const tabs = document.querySelectorAll('.kh-tab');
  const tabPanels = document.querySelectorAll('.kh-tab-panel');

  // Remove active state from all tabs
  tabs.forEach(tab => tab.classList.remove('is-active'));
  tabPanels.forEach(panel => panel.classList.remove('is-active'));

  // Add active state to selected tab
  const activeTab = document.querySelector(`.kh-tab[data-tab="${tabName}"]`);
  const activePanel = document.querySelector(`.kh-tab-panel[data-tab-panel="${tabName}"]`);

  if (activeTab && activePanel) {
    activeTab.classList.add('is-active');
    activePanel.classList.add('is-active');

    // Update URL hash for persistence
    if (updateHash) {
      updateUrlHash(tabName);
    }
  }
}

function getTabFromHash() {
  const hash = window.location.hash.slice(1); // Remove '#'
  const validTabs = ['summary', 'details', 'documents'];
  return validTabs.includes(hash) ? hash : null;
}

function updateUrlHash(tabName) {
  const newUrl = `${window.location.pathname}${window.location.search}#${tabName}`;
  history.replaceState(null, '', newUrl);
}

function isJobDetailPage() {
  return window.location.pathname.endsWith("job.html");
}

function isDocumentsPage() {
  return window.location.pathname.endsWith("documents.html");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Alias for formatDate (used in job overview and line items)
const formatDateDisplay = formatDate;

function createPill(text, extraClass) {
  const span = document.createElement("span");
  span.className = `kh-pill ${extraClass || ""}`.trim();
  span.textContent = text;
  return span;
}

function healthClass(health) {
  const normalized = String(health || "").toLowerCase();
  if (normalized.includes("risk")) return "kh-pill--risk";
  if (normalized.includes("watch")) return "kh-pill--watch";
  return "kh-pill--ok";
}

function stageClass() {
  return "kh-pill--stage";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value || "—";
  }
}

function setMessage(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#c2463d" : "";
}

function wireDateInputs(form) {
  if (!form) return;
  const dateInputs = form.querySelectorAll('input[type="date"]');
  dateInputs.forEach((input) => {
    input.addEventListener("change", () => {
      // Collapse native pickers after a date is selected.
      input.blur();
    });
  });
}

function wireValidation(form) {
  if (!form) return;

  const emailInput = form.clientEmail;
  const phoneInput = form.clientPhone;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[0-9+().\-\s]*$/;

  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      const email = String(emailInput.value || "").trim();
      if (email && !emailPattern.test(email)) {
        showFieldError(emailInput, "Enter a valid email address");
      } else {
        clearFieldError(emailInput);
      }
    });

    emailInput.addEventListener("input", () => {
      // Clear error on input to give immediate feedback
      if (emailInput.classList.contains("kh-input--error")) {
        const email = String(emailInput.value || "").trim();
        if (!email || emailPattern.test(email)) {
          clearFieldError(emailInput);
        }
      }
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener("blur", () => {
      const phone = String(phoneInput.value || "").trim();
      const digits = phone.replace(/\D/g, "");
      if (phone) {
        if (!phonePattern.test(phone) || digits.length < 7) {
          showFieldError(phoneInput, "Enter a valid phone number (at least 7 digits)");
        } else {
          clearFieldError(phoneInput);
        }
      } else {
        clearFieldError(phoneInput);
      }
    });

    phoneInput.addEventListener("input", () => {
      // Clear error on input
      if (phoneInput.classList.contains("kh-input--error")) {
        const phone = String(phoneInput.value || "").trim();
        const digits = phone.replace(/\D/g, "");
        if (!phone || (phonePattern.test(phone) && digits.length >= 7)) {
          clearFieldError(phoneInput);
        }
      }
    });
  }
}

function getDocumentType(type) {
  return DOCUMENT_TYPES.find((item) => item.value === type) || DOCUMENT_TYPES[0];
}

function getDocumentIcon(name) {
  const icons = {
    blueprint:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 4h16v12H7l-3 4V4z"/><path d="M8 8h8M8 12h8"/></svg>',
    stamp:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M7 8h10v4l2 2v2H5v-2l2-2z"/><path d="M9 5h6"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v6h6"/></svg>',
    swap:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M7 7h10l-2-2m2 2-2 2"/><path d="M17 17H7l2 2m-2-2 2-2"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    receipt:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M20 7l-10 10-4-4"/><circle cx="12" cy="12" r="9"/></svg>',
    warranty:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 3l3 4 5 1-3 4 1 5-6-2-6 2 1-5-3-4 5-1z"/></svg>'
  };

  return icons[name] || icons.file;
}

function requiresApprovedPlanset(stage) {
  return String(stage || "").toLowerCase() === "in construction";
}

function showFieldError(input, message) {
  if (!input) return;

  // Add error class
  input.classList.add("kh-input--error");
  input.classList.remove("kh-input--success");

  // Remove existing error message
  const existingError = input.parentElement.querySelector(".kh-field-error");
  if (existingError) {
    existingError.remove();
  }

  // Add error message
  if (message) {
    const errorSpan = document.createElement("span");
    errorSpan.className = "kh-field-error";
    errorSpan.textContent = message;
    input.parentElement.appendChild(errorSpan);
  }
}

function clearFieldError(input) {
  if (!input) return;

  input.classList.remove("kh-input--error");
  const errorSpan = input.parentElement.querySelector(".kh-field-error");
  if (errorSpan) {
    errorSpan.remove();
  }
}

function validateClientContact(form, messageId) {
  const emailInput = form.clientEmail;
  const phoneInput = form.clientPhone;
  const email = String(emailInput?.value || "").trim();
  const phone = String(phoneInput?.value || "").trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[0-9+().\-\s]*$/;
  const digits = phone.replace(/\D/g, "");

  // Clear previous errors
  clearFieldError(emailInput);
  clearFieldError(phoneInput);

  if (email && !emailPattern.test(email)) {
    showFieldError(emailInput, "Enter a valid email address");
    setMessage(messageId, "Enter a valid client email address.", true);
    emailInput.focus();
    return false;
  }

  if (phone) {
    if (!phonePattern.test(phone) || digits.length < 7) {
      showFieldError(phoneInput, "Enter a valid phone number (at least 7 digits)");
      setMessage(messageId, "Enter a valid client phone number.", true);
      phoneInput.focus();
      return false;
    }
  }

  setMessage(messageId, "");
  return true;
}

function formatPhoneDisplay(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value || "";
}

function populateDocumentTypeSelect() {
  const select = document.getElementById("document-type");
  if (!select) return;

  select.innerHTML = "";

  DOCUMENT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.value;
    select.appendChild(option);
  });

  // Default to Miscellaneous
  select.value = "Miscellaneous";
}

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

function showLogin() {
  document.body.classList.add("kh-auth-locked");
  const panel = document.getElementById("login-panel");
  if (panel) {
    panel.hidden = false;
    panel.style.display = "flex";
  }
}

function hideLogin() {
  document.body.classList.remove("kh-auth-locked");
  const panel = document.getElementById("login-panel");
  if (panel) {
    panel.hidden = true;
    panel.style.display = "none";
  }
}

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
    const submitButton = form.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, "Signing in...");
    setMessage("login-message", "Signing in...");

    try {
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");

      await login(username, password);

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
      resetButton(submitButton);
    }
  });

  return authenticated;
}

function renderSummary(jobs) {
  const active = jobs.filter((job) =>
    ["groundbreaking", "in construction", "punch list"].includes(
      String(job.stage).toLowerCase()
    )
  ).length;
  const precon = jobs.filter((job) =>
    ["preconstruction", "permitting"].includes(String(job.stage).toLowerCase())
  ).length;
  const closed = jobs.filter((job) =>
    String(job.stage).toLowerCase() === "closed"
  ).length;

  setText("summary-active", String(active));
  setText("summary-precon", String(precon));
  setText("summary-closed", String(closed));
}

function showTableLoading(tableBodyId, colspan = 7) {
  const tableBody = document.getElementById(tableBodyId);
  if (!tableBody) return;
  tableBody.innerHTML = `<tr><td colspan="${colspan}"><div class="kh-loading"><div class="kh-spinner"></div>Loading...</div></td></tr>`;
}

function showListLoading(listId, text = "Loading...") {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = `<li><div class="kh-loading"><div class="kh-spinner"></div>${text}</div></li>`;
}

function renderJobsTable(jobs) {
  const tableBody = document.getElementById("jobs-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!jobs.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">No jobs yet. Create one to get started.</td>';
    tableBody.appendChild(row);
    return;
  }

  jobs.forEach((job) => {
    const row = document.createElement("tr");
    row.className = "kh-table__row";
    row.dataset.jobId = job.id;

    const jobCell = document.createElement("td");
    jobCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${job.name || "Untitled"}</div>
        <div class="kh-job__meta">${job.location || ""}</div>
      </div>
    `;

    const clientCell = document.createElement("td");
    clientCell.textContent = job.client || "—";

    const stageCell = document.createElement("td");
    stageCell.appendChild(createPill(job.stage || "—", stageClass(job.stage)));

    const typeCell = document.createElement("td");
    typeCell.textContent = job.type || "—";

    const startCell = document.createElement("td");
    startCell.textContent = formatDate(job.startDate);

    const targetCell = document.createElement("td");
    targetCell.textContent = formatDate(job.targetCompletion);

    row.append(jobCell, clientCell, stageCell, typeCell, startCell, targetCell);

    row.addEventListener("click", () => {
      window.location.href = `job.html?jobId=${encodeURIComponent(job.id)}`;
    });

    tableBody.appendChild(row);
  });
}

function populateDocumentFilters(jobs) {
  const jobSelect = document.getElementById("documents-filter-job");
  const typeSelect = document.getElementById("documents-filter-type");
  if (!jobSelect || !typeSelect) return;

  jobSelect.innerHTML = "";
  typeSelect.innerHTML = "";

  const allJobs = document.createElement("option");
  allJobs.value = "";
  allJobs.textContent = "All jobs";
  jobSelect.appendChild(allJobs);

  jobs.forEach((job) => {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = job.name || "Untitled Job";
    jobSelect.appendChild(option);
  });

  const allTypes = document.createElement("option");
  allTypes.value = "";
  allTypes.textContent = "All types";
  typeSelect.appendChild(allTypes);

  DOCUMENT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.value;
    typeSelect.appendChild(option);
  });
}

function renderDocumentsTable(documents, jobs, onTypeChange) {
  const tableBody = document.getElementById("documents-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (!documents.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="4">No documents uploaded yet.</td>';
    tableBody.appendChild(row);
    return;
  }

  const jobMap = new Map(jobs.map((job) => [job.id, job.name]));

  documents.forEach((doc) => {
    const row = document.createElement("tr");
    const type = getDocumentType(doc.documentType);

    const docCell = document.createElement("td");
    docCell.innerHTML = `
      <div class="kh-doc-title">
        <span class="kh-doc-icon">${getDocumentIcon(type.icon)}</span>
        <div>
          <div>${doc.name || "Document"}</div>
          <div class="kh-doc-meta">${doc.size ? `${Math.round(doc.size / 1024)} KB` : ""}</div>
        </div>
      </div>
    `;

    const typeCell = document.createElement("td");
    const typeSelect = document.createElement("select");
    typeSelect.className = "kh-input kh-input--compact";
    DOCUMENT_TYPES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.value;
      typeSelect.appendChild(option);
    });
    if (!DOCUMENT_TYPES.some((item) => item.value === doc.documentType) && doc.documentType) {
      const option = document.createElement("option");
      option.value = doc.documentType;
      option.textContent = doc.documentType;
      typeSelect.appendChild(option);
    }
    typeSelect.value = doc.documentType || DOCUMENT_TYPES[0].value;
    if (doc.deletedAt) {
      typeSelect.disabled = true;
    }
    typeSelect.addEventListener("change", () => {
      if (onTypeChange) {
        onTypeChange(doc, typeSelect.value, typeSelect);
      }
    });
    typeCell.appendChild(typeSelect);

    const jobCell = document.createElement("td");
    jobCell.textContent = jobMap.get(doc.jobId) || "—";

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(doc.createdAt);

    if (doc.deletedAt) {
      row.classList.add("is-trashed");
    }

    if (doc.url && !doc.deletedAt) {
      docCell.querySelector("div").addEventListener("click", () => {
        window.open(doc.url, "_blank", "noopener");
      });
    }

    row.append(docCell, typeCell, jobCell, dateCell);
    tableBody.appendChild(row);
  });
}

function renderBusinessDocumentsTable(documents) {
  const tableBody = document.getElementById("business-docs-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (!documents.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5">No business documents uploaded yet.</td>';
    tableBody.appendChild(row);
    return;
  }

  documents.forEach((doc) => {
    const row = document.createElement("tr");

    // Document name cell with icon
    const docCell = document.createElement("td");
    const fileExtension = doc.file_name?.split('.').pop()?.toLowerCase() || '';
    const icon = getDocumentIconForExtension(fileExtension);
    const sizeKB = doc.file_size ? Math.round(doc.file_size / 1024) : 0;

    docCell.innerHTML = `
      <div class="kh-doc-title">
        <span class="kh-doc-icon">${icon}</span>
        <div>
          <div>${doc.file_name || "Document"}</div>
          <div class="kh-doc-meta">${sizeKB > 0 ? `${sizeKB} KB` : ""}</div>
        </div>
      </div>
    `;
    if (doc.url && !doc.deleted_at) {
      docCell.style.cursor = "pointer";
      docCell.addEventListener("click", () => {
        window.open(doc.url, "_blank", "noopener");
      });
    }

    // Type cell
    const typeCell = document.createElement("td");
    typeCell.textContent = doc.type || "—";

    // Description cell
    const descCell = document.createElement("td");
    descCell.textContent = doc.description || "—";
    descCell.style.maxWidth = "300px";
    descCell.style.overflow = "hidden";
    descCell.style.textOverflow = "ellipsis";
    descCell.style.whiteSpace = "nowrap";
    if (doc.description) {
      descCell.title = doc.description;
    }

    // Date cell
    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(doc.uploaded_at);

    // Actions cell
    const actionsCell = document.createElement("td");
    if (doc.deleted_at) {
      const restoreBtn = document.createElement("button");
      restoreBtn.className = "kh-button kh-button--secondary kh-button--small";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", async () => {
        try {
          await restoreBusinessDocument(doc.id);
          setMessage("business-docs-message", "Document restored successfully.");
          // Reload business documents
          const showTrashed = Boolean(document.getElementById("business-docs-filter-trashed")?.checked);
          const updatedDocs = await fetchBusinessDocuments({ showTrashed });
          renderBusinessDocumentsTable(updatedDocs);
        } catch (error) {
          console.error("Failed to restore business document:", error);
          setMessage("business-docs-message", "Failed to restore document.", true);
        }
      });
      actionsCell.appendChild(restoreBtn);
    } else {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "kh-button kh-button--secondary kh-button--small";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`Delete "${doc.file_name}"?`)) return;
        try {
          await deleteBusinessDocument(doc.id);
          setMessage("business-docs-message", "Document deleted successfully.");
          // Reload business documents
          const showTrashed = Boolean(document.getElementById("business-docs-filter-trashed")?.checked);
          const updatedDocs = await fetchBusinessDocuments({ showTrashed });
          renderBusinessDocumentsTable(updatedDocs);
        } catch (error) {
          console.error("Failed to delete business document:", error);
          setMessage("business-docs-message", "Failed to delete document.", true);
        }
      });
      actionsCell.appendChild(deleteBtn);
    }

    if (doc.deleted_at) {
      row.classList.add("is-trashed");
    }

    row.append(docCell, typeCell, descCell, dateCell, actionsCell);
    tableBody.appendChild(row);
  });
}

function getDocumentIconForExtension(ext) {
  const icons = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    xls: '📊',
    xlsx: '📊',
  };
  return icons[ext] || '📎';
}

function buildLineItemsMap(items = []) {
  const map = new Map();
  items.forEach((item) => {
    if (item && item.code) {
      map.set(item.code, item);
    }
  });
  return map;
}

// Store current line items in memory for editing
let currentLineItems = [];
let currentEditingLineItemCode = null;

function renderLineItemsTwoTables(items = []) {
  renderLineItemsCosts("line-items-costs-body", items);
  renderLineItemsSchedule("line-items-schedule-body", items);
  renderLineItemsSummary(items);
}

/**
 * Render quick summary stats at top of Line Items tab
 * Shows budget, spent, remaining, and latest end date
 */
function renderLineItemsSummary(lineItems = []) {
  const summaryEl = document.getElementById('line-items-summary');
  if (!summaryEl) return;

  // Show/hide based on whether there are items
  summaryEl.hidden = lineItems.length === 0;
  if (lineItems.length === 0) return;

  // Calculate totals
  let totalBudget = 0;
  let totalSpent = 0;
  let latestEndDate = null;

  lineItems.forEach(item => {
    const original = parseFloat(item.originalBudget) || 0;
    const increases = (item.budgetHistory || []).reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0);
    totalBudget += original + increases;
    totalSpent += parseFloat(item.actual) || 0;

    // Find latest scheduled end date
    const schedule = item.schedule || {};
    const endDate = schedule.endDate;
    if (endDate) {
      if (!latestEndDate || endDate > latestEndDate) {
        latestEndDate = endDate;
      }
    }
  });

  const remaining = totalBudget - totalSpent;

  // Update DOM
  const budgetEl = document.getElementById('summary-budget');
  const spentEl = document.getElementById('summary-spent');
  const remainingEl = document.getElementById('summary-remaining');
  const endDateEl = document.getElementById('summary-end-date');

  if (budgetEl) budgetEl.textContent = `$${formatCurrency(totalBudget)}`;
  if (spentEl) spentEl.textContent = `$${formatCurrency(totalSpent)}`;

  if (remainingEl) {
    remainingEl.textContent = `$${formatCurrency(remaining)}`;
    // Color code
    if (remaining < 0) {
      remainingEl.className = 'kh-summary-stat__value kh-summary-stat__value--danger';
    } else if (remaining < totalBudget * 0.1) {
      remainingEl.className = 'kh-summary-stat__value kh-summary-stat__value--warning';
    } else {
      remainingEl.className = 'kh-summary-stat__value kh-summary-stat__value--ok';
    }
  }

  if (endDateEl) {
    endDateEl.textContent = latestEndDate ? formatDateDisplay(latestEndDate) : '—';
  }
}

function renderLineItemsCosts(tbodyId, items = []) {
  const tableBody = document.getElementById(tbodyId);
  const emptyState = document.getElementById("line-items-empty");
  if (!tableBody) return;

  currentLineItems = items;
  tableBody.innerHTML = "";

  if (emptyState) {
    emptyState.hidden = items.length > 0;
  }

  if (items.length === 0) return;

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.code = item.code;

    // Item name
    const itemCell = document.createElement("td");
    const catalogItem = LINE_ITEM_CATALOG.find(c => c.code === item.code);
    itemCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${item.name}</div>
        <div class="kh-job__meta">${catalogItem?.description || ""}</div>
      </div>
    `;

    // Original Budget (read-only label, set from import)
    const originalBudgetCell = document.createElement("td");
    originalBudgetCell.className = "kh-cell-currency";
    originalBudgetCell.innerHTML = `<span data-field="originalBudget" data-value="${item.originalBudget || 0}">$${formatCurrency(item.originalBudget || 0)}</span>`;

    // Budget Increases (button + display)
    const increasesCell = document.createElement("td");
    const totalIncreases = (item.budgetHistory || []).reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0);
    let historyHtml = '';
    if (item.budgetHistory && item.budgetHistory.length > 0) {
      historyHtml = item.budgetHistory.map((inc, idx) =>
        `<div class="kh-budget-increase-item">
          <span>+$${formatCurrency(inc.amount)}: ${inc.reason}</span>
          <button class="kh-budget-increase-delete" data-action="delete-increase" data-code="${item.code}" data-index="${idx}" title="Delete">&times;</button>
        </div>`
      ).join('');
    }
    increasesCell.innerHTML = `
      <button class="kh-link" data-action="add-increase" data-code="${item.code}">+ Add</button>
      ${historyHtml ? `<div class="kh-budget-history">${historyHtml}</div>` : ''}
    `;

    // Current Budget (calculated, read-only)
    const currentBudgetCell = document.createElement("td");
    const currentBudget = parseFloat(item.originalBudget || 0) + totalIncreases;
    currentBudgetCell.innerHTML = `<strong>$${formatCurrency(currentBudget)}</strong>`;
    currentBudgetCell.className = "kh-cell-currency";

    // Actual (editable) - whole dollars only
    const actualCell = document.createElement("td");
    actualCell.className = "kh-cell-currency";
    actualCell.innerHTML = `<input type="text" inputmode="numeric" value="${Math.round(item.actual || 0)}" data-field="actual" class="kh-input-currency" />`;

    // Variance (calculated, color-coded) - no + for positive
    const varianceCell = document.createElement("td");
    const variance = currentBudget - parseFloat(item.actual || 0);
    const varianceClass = variance >= 0 ? "kh-variance-good" : "kh-variance-bad";
    varianceCell.innerHTML = `<span class="${varianceClass}">$${formatCurrency(variance)}</span>`;
    varianceCell.className = "kh-cell-currency";

    // Delete button
    const actionsCell = document.createElement("td");
    actionsCell.innerHTML = `<button class="kh-link kh-link--danger" data-action="delete-line-item" data-code="${item.code}">Remove</button>`;

    row.appendChild(itemCell);
    row.appendChild(originalBudgetCell);
    row.appendChild(increasesCell);
    row.appendChild(currentBudgetCell);
    row.appendChild(actualCell);
    row.appendChild(varianceCell);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });

  // Attach event listeners
  attachLineItemEventListeners(tbodyId);
}

function renderLineItemsSchedule(tbodyId, items = []) {
  const tableBody = document.getElementById(tbodyId);
  if (!tableBody) return;

  tableBody.innerHTML = "";
  if (items.length === 0) return;

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.code = item.code;

    // Item name
    const itemCell = document.createElement("td");
    const catalogItem = LINE_ITEM_CATALOG.find(c => c.code === item.code);
    itemCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${item.name}</div>
        <div class="kh-job__meta">${catalogItem?.description || ""}</div>
      </div>
    `;

    // Schedule (estimated and actual start/end dates) - compact grid layout
    const scheduleCell = document.createElement("td");
    const schedule = item.schedule || {};
    scheduleCell.innerHTML = `
      <div class="kh-schedule-grid">
        <span></span>
        <span class="kh-schedule-col-label">Start</span>
        <span class="kh-schedule-col-label">End</span>
        <span class="kh-schedule-row-label">Est.</span>
        <input type="date" value="${schedule.startDate || ''}" data-field="schedule.startDate" title="Estimated Start" />
        <input type="date" value="${schedule.endDate || ''}" data-field="schedule.endDate" title="Estimated End" />
        <span class="kh-schedule-row-label">Act.</span>
        <input type="date" value="${schedule.actualStartDate || ''}" data-field="schedule.actualStartDate" title="Actual Start" />
        <input type="date" value="${schedule.actualEndDate || ''}" data-field="schedule.actualEndDate" title="Actual End" />
      </div>
    `;

    // Status dropdown
    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");
    statusSelect.dataset.field = "status";
    LINE_ITEM_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if ((item.status || "Not Started") === status) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    });
    statusCell.appendChild(statusSelect);

    // Vendor (editable text input)
    const vendorCell = document.createElement("td");
    vendorCell.innerHTML = `<input type="text" value="${item.vendor || ''}" data-field="vendor" placeholder="Vendor name" />`;

    // Notes (editable textarea)
    const notesCell = document.createElement("td");
    notesCell.innerHTML = `<textarea data-field="notes" placeholder="Notes...">${item.notes || ''}</textarea>`;

    // Delete button
    const actionsCell = document.createElement("td");
    actionsCell.innerHTML = `<button class="kh-link kh-link--danger" data-action="delete-line-item" data-code="${item.code}">Remove</button>`;

    row.appendChild(itemCell);
    row.appendChild(scheduleCell);
    row.appendChild(statusCell);
    row.appendChild(vendorCell);
    row.appendChild(notesCell);
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });

  // Attach event listeners
  attachLineItemEventListeners(tbodyId);
}

function renderLineItems(tbodyId, items = []) {
  const tableBody = document.getElementById(tbodyId);
  const emptyState = document.getElementById("line-items-empty");
  if (!tableBody) return;

  currentLineItems = items;
  tableBody.innerHTML = "";

  // Show/hide empty state
  if (emptyState) {
    emptyState.hidden = items.length > 0;
  }

  if (items.length === 0) {
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.code = item.code;

    // Item name
    const itemCell = document.createElement("td");
    const catalogItem = LINE_ITEM_CATALOG.find(c => c.code === item.code);
    itemCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${item.name}</div>
        <div class="kh-job__meta">${catalogItem?.description || ""}</div>
      </div>
    `;

    // Original Budget (read-only label, set from import)
    const originalBudgetCell = document.createElement("td");
    originalBudgetCell.className = "kh-cell-currency";
    originalBudgetCell.innerHTML = `<span data-field="originalBudget" data-value="${item.originalBudget || 0}">$${formatCurrency(item.originalBudget || 0)}</span>`;

    // Budget Increases (button + display)
    const increasesCell = document.createElement("td");
    const totalIncreases = (item.budgetHistory || []).reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0);
    let historyHtml = '';
    if (item.budgetHistory && item.budgetHistory.length > 0) {
      historyHtml = item.budgetHistory.map((inc, idx) =>
        `<div class="kh-budget-increase-item">
          <span>+$${formatCurrency(inc.amount)}: ${inc.reason}</span>
          <button class="kh-budget-increase-delete" data-action="delete-increase" data-code="${item.code}" data-index="${idx}" title="Delete">&times;</button>
        </div>`
      ).join('');
    }
    increasesCell.innerHTML = `
      <button class="kh-link" data-action="add-increase" data-code="${item.code}">+ Add</button>
      ${historyHtml ? `<div class="kh-budget-history">${historyHtml}</div>` : ''}
    `;

    // Current Budget (calculated, read-only)
    const currentBudgetCell = document.createElement("td");
    const currentBudget = parseFloat(item.originalBudget || 0) + totalIncreases;
    currentBudgetCell.innerHTML = `<strong>$${formatCurrency(currentBudget)}</strong>`;
    currentBudgetCell.className = "kh-cell-currency";

    // Actual (editable) - whole dollars only
    const actualCell = document.createElement("td");
    actualCell.className = "kh-cell-currency";
    actualCell.innerHTML = `<input type="text" inputmode="numeric" value="${Math.round(item.actual || 0)}" data-field="actual" class="kh-input-currency" />`;

    // Variance (calculated, color-coded) - no + for positive
    const varianceCell = document.createElement("td");
    const variance = currentBudget - parseFloat(item.actual || 0);
    const varianceClass = variance >= 0 ? "kh-variance-good" : "kh-variance-bad";
    varianceCell.innerHTML = `<span class="${varianceClass}">$${formatCurrency(variance)}</span>`;
    varianceCell.className = "kh-cell-currency";

    // Schedule (start/end/actual dates)
    const scheduleCell = document.createElement("td");
    const schedule = item.schedule || {};
    scheduleCell.innerHTML = `
      <div class="kh-schedule">
        <label>
          <span>Start</span>
          <input type="date" value="${schedule.startDate || ''}" data-field="schedule.startDate" />
        </label>
        <label>
          <span>Scheduled End</span>
          <input type="date" value="${schedule.endDate || ''}" data-field="schedule.endDate" />
        </label>
        <label>
          <span>Actual End</span>
          <input type="date" value="${schedule.actualEndDate || ''}" data-field="schedule.actualEndDate" />
        </label>
      </div>
    `;

    // Status dropdown
    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");
    statusSelect.dataset.field = "status";
    LINE_ITEM_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if ((item.status || "Not Started") === status) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    });
    statusCell.appendChild(statusSelect);

    // Vendor
    const vendorCell = document.createElement("td");
    vendorCell.innerHTML = `<input type="text" value="${item.vendor || ""}" data-field="vendor" />`;

    // Notes
    const notesCell = document.createElement("td");
    notesCell.innerHTML = `<textarea data-field="notes">${item.notes || ""}</textarea>`;

    // Remove button
    const actionsCell = document.createElement("td");
    actionsCell.innerHTML = `<button class="kh-link kh-link--danger" data-action="remove" data-code="${item.code}">Remove</button>`;

    row.append(itemCell, originalBudgetCell, increasesCell, currentBudgetCell, actualCell, varianceCell, scheduleCell, statusCell, vendorCell, notesCell, actionsCell);
    tableBody.appendChild(row);
  });

  // Wire up event listeners
  wireLineItemActions(tableBody);
}

function wireLineItemActions(tableBody) {
  // Add increase button
  tableBody.querySelectorAll('[data-action="add-increase"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const code = e.target.dataset.code;
      showBudgetIncreaseModal(code);
    });
  });

  // Delete budget increase button
  tableBody.querySelectorAll('[data-action="delete-increase"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = e.target.dataset.code;
      const index = parseInt(e.target.dataset.index, 10);
      const item = currentLineItems.find(i => i.code === code);
      if (!item || !item.budgetHistory || !item.budgetHistory[index]) return;

      const increase = item.budgetHistory[index];
      if (confirm(`Delete budget increase of $${formatCurrency(increase.amount)}?\n\nReason: ${increase.reason}`)) {
        item.budgetHistory.splice(index, 1);
        renderLineItemsTwoTables(currentLineItems);
        triggerLineItemAutoSave();
      }
    });
  });

  // Remove button (legacy single-table view)
  tableBody.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const code = e.target.dataset.code;
      if (confirm('Remove this line item?')) {
        currentLineItems = currentLineItems.filter(item => item.code !== code);
        renderLineItemsTwoTables(currentLineItems);
        updateDeleteAllButtonVisibility();
      }
    });
  });
}

/**
 * Debounced auto-save for line items
 * Saves after 1 second of no changes to avoid excessive API calls
 */
let autoSaveTimeout = null;
function triggerLineItemAutoSave() {
  // Clear any pending save
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  // Show saving indicator
  setMessage("line-items-message", "Saving...");

  // Debounce: wait 1 second before actually saving
  autoSaveTimeout = setTimeout(async () => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("jobId");
    if (!jobId) return;

    // Collect current data from tables
    const lineItems = collectLineItemsFromTwoTables();
    currentLineItems = lineItems;

    try {
      await saveJobLineItems(jobId, lineItems);
      setMessage("line-items-message", "Saved.");

      // Update Summary tab cards
      renderFinancialSnapshot(lineItems);
      renderJobSchedule(lineItems);
      renderLineItemsSummary(lineItems);

      // Clear message after 2 seconds
      setTimeout(() => {
        setMessage("line-items-message", "");
      }, 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setMessage("line-items-message", "Save failed. Please try again.", true);
    }
  }, 1000);
}

/**
 * Attach event listeners for the two-table line items view
 * Handles delete-line-item, add-increase actions, and auto-save on input changes
 */
function attachLineItemEventListeners(tbodyId) {
  const tableBody = document.getElementById(tbodyId);
  if (!tableBody) return;

  // Delete line item buttons
  tableBody.querySelectorAll('[data-action="delete-line-item"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const code = e.target.dataset.code;
      const item = currentLineItems.find(i => i.code === code);
      const itemName = item ? item.name : 'this item';
      if (confirm(`Remove "${itemName}" from both costing and schedule?`)) {
        currentLineItems = currentLineItems.filter(item => item.code !== code);
        renderLineItemsTwoTables(currentLineItems);
        updateDeleteAllButtonVisibility();
        // Auto-save after delete
        triggerLineItemAutoSave();
      }
    });
  });

  // Add budget increase buttons
  tableBody.querySelectorAll('[data-action="add-increase"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const code = e.target.dataset.code;
      showBudgetIncreaseModal(code);
    });
  });

  // Delete budget increase buttons
  tableBody.querySelectorAll('[data-action="delete-increase"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = e.target.dataset.code;
      const index = parseInt(e.target.dataset.index, 10);
      const item = currentLineItems.find(i => i.code === code);
      if (!item || !item.budgetHistory || !item.budgetHistory[index]) return;

      const increase = item.budgetHistory[index];
      if (confirm(`Delete budget increase of $${formatCurrency(increase.amount)}?\n\nReason: ${increase.reason}`)) {
        item.budgetHistory.splice(index, 1);
        renderLineItemsTwoTables(currentLineItems);
        triggerLineItemAutoSave();
      }
    });
  });

  // Auto-save on any input change
  tableBody.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('change', () => {
      triggerLineItemAutoSave();
    });
  });
}

/**
 * Update Delete All button visibility based on whether there are line items
 */
function updateDeleteAllButtonVisibility() {
  const deleteAllBtn = document.getElementById('delete-all-line-items');
  if (deleteAllBtn) {
    deleteAllBtn.hidden = currentLineItems.length === 0;
  }
}

/**
 * Delete all line items
 */
async function deleteAllLineItems() {
  if (currentLineItems.length === 0) return;

  if (confirm(`Delete all ${currentLineItems.length} line items? This cannot be undone.`)) {
    currentLineItems = [];
    renderLineItemsTwoTables(currentLineItems);
    updateDeleteAllButtonVisibility();
    // Auto-save after delete all
    triggerLineItemAutoSave();
  }
}

/**
 * Parse QuickBooks CSV and import line items
 * CSV format: Service name with code (XX.XX Name), Est. Cost, Act. Cost, ...
 */
function parseQuickBooksCSV(csvText) {
  const lines = csvText.split('\n');
  const parsedItems = [];

  for (let i = 1; i < lines.length; i++) { // Skip header row
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(line);
    if (fields.length < 3) continue;

    const itemName = fields[0];
    const estCost = parseFloat(fields[1]) || 0;
    const actCost = parseFloat(fields[2]) || 0;

    // Skip rows that are totals, headers, or have no name
    if (!itemName ||
        itemName.toLowerCase().startsWith('total') ||
        itemName.toLowerCase() === 'service' ||
        itemName.toLowerCase() === 'total') continue;

    // Skip group headers (XX.00 format with no data)
    const codeMatch = itemName.match(/^(\d+\.\d+)/);
    if (!codeMatch) continue;

    const code = codeMatch[1];

    // Skip if this is a group header (ends in .00 and has no estCost)
    if (code.endsWith('.00') && estCost === 0) continue;

    // Extract name and description
    // Format: "01.01 Demolition (Removal of any structures)" or "01.01 Demolition"
    // Or: "03.01 Framing Lumber|Materials (All Lumber...)"
    let nameAndDesc = itemName.substring(code.length).trim();
    let name = nameAndDesc;
    let description = '';

    // Check for description in parentheses
    const parenMatch = nameAndDesc.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      name = parenMatch[1].trim();
      description = parenMatch[2].trim();
    }

    // Check for description after pipe
    const pipeIndex = name.indexOf('|');
    if (pipeIndex > -1) {
      name = name.substring(0, pipeIndex).trim();
    }

    parsedItems.push({
      code: code,
      name: name,
      description: description,
      originalBudget: estCost,
      budgetHistory: [],
      currentBudget: estCost,
      actual: actCost,
      variance: estCost - actCost,
      schedule: { startDate: null, endDate: null, actualStartDate: null, actualEndDate: null },
      notes: '',
      status: 'Not Started',
      vendor: ''
    });
  }

  return parsedItems;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim()); // Don't forget the last field

  return fields;
}

/**
 * Handle CSV file import - parses CSV and auto-saves to database
 */
async function handleCSVImport(file) {
  if (!file) return;

  // Get jobId from URL
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("jobId");
  if (!jobId) {
    alert('Error: Could not determine job ID.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const csvText = e.target.result;
      const importedItems = parseQuickBooksCSV(csvText);

      if (importedItems.length === 0) {
        alert('No valid line items found in CSV file.');
        return;
      }

      // Merge with existing items (add new ones)
      importedItems.forEach(newItem => {
        // Check if item with same code already exists
        const existingIndex = currentLineItems.findIndex(item => item.code === newItem.code);
        if (existingIndex === -1) {
          // Add new item
          currentLineItems.push(newItem);
        } else {
          // Item exists - keep existing and add with modified code
          newItem.code = newItem.code + '-imp';
          currentLineItems.push(newItem);
        }
      });

      // Sort by code
      currentLineItems.sort((a, b) => a.code.localeCompare(b.code));

      renderLineItemsTwoTables(currentLineItems);
      updateDeleteAllButtonVisibility();

      // Auto-save to database
      setMessage("line-items-message", "Saving imported items...");
      try {
        await saveJobLineItems(jobId, currentLineItems);
        setMessage("line-items-message", `Imported and saved ${importedItems.length} line items.`);

        // Update Summary tab cards
        renderFinancialSnapshot(currentLineItems);
        renderJobSchedule(currentLineItems);
        renderLineItemsSummary(currentLineItems);
      } catch (saveError) {
        console.error('Error saving imported items:', saveError);
        setMessage("line-items-message", "Imported but failed to save. Please click Save.", true);
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the format.');
    }
  };

  reader.readAsText(file);
}

function formatCurrency(value) {
  return Math.round(parseFloat(value || 0)).toLocaleString('en-US');
}

function collectLineItems(tbodyId) {
  const tableBody = document.getElementById(tbodyId);
  if (!tableBody) return [];

  const rows = Array.from(tableBody.querySelectorAll("tr"));
  return rows.map((row) => {
    const code = row.dataset.code;
    const existingItem = currentLineItems.find(item => item.code === code);

    // Collect field values from DOM
    const originalBudgetEl = row.querySelector('[data-field="originalBudget"]');
    const originalBudget = parseFloat(originalBudgetEl?.dataset?.value || originalBudgetEl?.value || 0);
    const actual = parseFloat(row.querySelector('[data-field="actual"]')?.value || 0);
    const status = row.querySelector('[data-field="status"]')?.value || "Not Started";
    const vendor = row.querySelector('[data-field="vendor"]')?.value || "";
    const notes = row.querySelector('[data-field="notes"]')?.value || "";
    const startDate = row.querySelector('[data-field="schedule.startDate"]')?.value || null;
    const endDate = row.querySelector('[data-field="schedule.endDate"]')?.value || null;

    // Build line item object
    return {
      code: code,
      name: existingItem?.name || "",
      originalBudget: originalBudget,
      budgetHistory: existingItem?.budgetHistory || [],
      currentBudget: originalBudget + (existingItem?.budgetHistory || []).reduce((sum, inc) => sum + parseFloat(inc.amount || 0), 0),
      actual: actual,
      variance: 0, // Will be calculated by backend
      schedule: { startDate, endDate },
      notes: notes,
      status: status,
      vendor: vendor
    };
  });
}

/**
 * Collect line items from the two-table layout
 * Merges data from costs table and schedule table
 */
function collectLineItemsFromTwoTables() {
  const costsBody = document.getElementById('line-items-costs-body');
  const scheduleBody = document.getElementById('line-items-schedule-body');

  if (!costsBody || !scheduleBody) return currentLineItems;

  // Build a map from current line items
  const itemsMap = new Map();
  currentLineItems.forEach(item => {
    itemsMap.set(item.code, { ...item });
  });

  // Collect cost data from costs table
  costsBody.querySelectorAll('tr').forEach(row => {
    const code = row.dataset.code;
    if (!itemsMap.has(code)) return;

    const item = itemsMap.get(code);
    const originalBudgetEl = row.querySelector('[data-field="originalBudget"]');
    item.originalBudget = parseFloat(originalBudgetEl?.dataset?.value || originalBudgetEl?.value || 0);
    item.actual = parseFloat(row.querySelector('[data-field="actual"]')?.value || 0);
  });

  // Collect schedule data from schedule table
  scheduleBody.querySelectorAll('tr').forEach(row => {
    const code = row.dataset.code;
    if (!itemsMap.has(code)) return;

    const item = itemsMap.get(code);
    item.status = row.querySelector('[data-field="status"]')?.value || "Not Started";
    item.vendor = row.querySelector('[data-field="vendor"]')?.value || "";
    item.notes = row.querySelector('[data-field="notes"]')?.value || "";

    const startDate = row.querySelector('[data-field="schedule.startDate"]')?.value || null;
    const endDate = row.querySelector('[data-field="schedule.endDate"]')?.value || null;
    const actualStartDate = row.querySelector('[data-field="schedule.actualStartDate"]')?.value || null;
    const actualEndDate = row.querySelector('[data-field="schedule.actualEndDate"]')?.value || null;
    item.schedule = { startDate, endDate, actualStartDate, actualEndDate };
  });

  return Array.from(itemsMap.values());
}

// Modal handling for adding line items
function showAddLineItemModal() {
  const modal = document.getElementById('add-line-item-modal');
  const catalogList = document.getElementById('line-item-catalog-list');
  const searchInput = document.getElementById('line-item-search');

  if (!modal || !catalogList) return;

  // Filter out already-added items
  const addedCodes = new Set(currentLineItems.map(item => item.code));
  const availableItems = LINE_ITEM_CATALOG.filter(item => !addedCodes.has(item.code));

  const renderCatalog = (filter = '') => {
    const filtered = availableItems.filter(item =>
      item.name.toLowerCase().includes(filter.toLowerCase()) ||
      item.group.toLowerCase().includes(filter.toLowerCase()) ||
      item.code.includes(filter)
    );

    catalogList.innerHTML = filtered.map(item => `
      <div class="kh-catalog-item" data-code="${item.code}">
        <div class="kh-catalog-item__name">${item.code} - ${item.name}</div>
        <div class="kh-catalog-item__desc">${item.group}${item.description ? ' · ' + item.description : ''}</div>
      </div>
    `).join('');

    // Wire up click handlers
    catalogList.querySelectorAll('.kh-catalog-item').forEach(el => {
      el.addEventListener('click', () => {
        const code = el.dataset.code;
        addLineItem(code);
        modal.hidden = true;
      });
    });
  };

  renderCatalog();

  searchInput.value = '';
  searchInput.oninput = (e) => renderCatalog(e.target.value);

  modal.hidden = false;
}

function addLineItem(code) {
  const catalogItem = LINE_ITEM_CATALOG.find(item => item.code === code);
  if (!catalogItem) return;

  const newItem = {
    code: catalogItem.code,
    name: catalogItem.name,
    originalBudget: 0,
    budgetHistory: [],
    currentBudget: 0,
    actual: 0,
    variance: 0,
    schedule: { startDate: null, endDate: null, actualStartDate: null, actualEndDate: null },
    notes: '',
    status: 'Not Started',
    vendor: ''
  };

  currentLineItems.push(newItem);
  renderLineItemsTwoTables(currentLineItems);
  updateDeleteAllButtonVisibility();
  // Auto-save after adding new item
  triggerLineItemAutoSave();
}

// Modal handling for budget increases
function showBudgetIncreaseModal(code) {
  const modal = document.getElementById('budget-increase-modal');
  const amountInput = document.getElementById('budget-increase-amount');
  const reasonInput = document.getElementById('budget-increase-reason');
  const saveButton = document.getElementById('save-budget-increase');

  if (!modal) return;

  currentEditingLineItemCode = code;
  amountInput.value = '';
  reasonInput.value = '';

  saveButton.onclick = () => {
    const amount = parseFloat(amountInput.value);
    const reason = reasonInput.value.trim();

    if (!amount || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!reason) {
      alert('Please enter a reason for the increase');
      return;
    }

    // Add increase to the line item
    const item = currentLineItems.find(item => item.code === currentEditingLineItemCode);
    if (item) {
      if (!item.budgetHistory) item.budgetHistory = [];
      item.budgetHistory.push({
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        reason: reason
      });
      renderLineItemsTwoTables(currentLineItems);
      // Auto-save after budget increase
      triggerLineItemAutoSave();
    }

    modal.hidden = true;
  };

  modal.hidden = false;
}

/**
 * Render Job Overview Card (Summary Tab)
 */
let currentJob = null; // Store current job for reference

function renderJobOverview(job) {
  currentJob = job; // Store for later use

  // Stage (replaces status)
  const statusEl = document.getElementById('overview-status');
  if (statusEl) statusEl.textContent = job.stage || '—';

  // Dates
  const startEl = document.getElementById('overview-start');
  if (startEl) startEl.textContent = formatDateDisplay(job.startDate);

  const targetEl = document.getElementById('overview-target');
  if (targetEl) targetEl.textContent = formatDateDisplay(job.targetCompletion);

  // Actual completion (only show if completed)
  const actualEl = document.getElementById('overview-actual');
  const actualRow = document.getElementById('overview-actual-row');
  if (actualEl && actualRow) {
    if (job.actualCompletion) {
      actualEl.textContent = formatDateDisplay(job.actualCompletion);
      actualRow.hidden = false;
    } else {
      actualEl.textContent = '—';
      // Hide row if not in closed stage
      actualRow.hidden = job.stage?.toLowerCase() !== 'closed';
    }
  }

  // Client info
  const clientEl = document.getElementById('overview-client');
  if (clientEl) clientEl.textContent = job.client || '—';

  const contactEl = document.getElementById('overview-contact');
  if (contactEl) contactEl.textContent = job.primaryContact || '—';

  // Notes preview
  const notesPreview = document.getElementById('overview-notes-preview');
  if (notesPreview) {
    if (job.notes && job.notes.trim()) {
      notesPreview.textContent = job.notes.substring(0, 150) + (job.notes.length > 150 ? '...' : '');
    } else {
      notesPreview.textContent = 'No notes yet.';
    }
  }
}

/**
 * Render Financial Snapshot Card (Summary Tab)
 * Calculated from line items
 */
function renderFinancialSnapshot(lineItems = []) {
  // Calculate totals from line items
  let originalTotal = 0;
  let changeOrdersTotal = 0;
  let actualTotal = 0;

  lineItems.forEach(item => {
    const original = parseFloat(item.originalBudget) || 0;
    const increases = (item.budgetHistory || []).reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0);
    const actual = parseFloat(item.actual) || 0;

    originalTotal += original;
    changeOrdersTotal += increases;
    actualTotal += actual;
  });

  const currentBudget = originalTotal + changeOrdersTotal;
  const remaining = currentBudget - actualTotal;

  // Also update the Line Items tab summary
  renderLineItemsSummary(lineItems);


  // Populate fields
  const finOriginal = document.getElementById('fin-original');
  if (finOriginal) finOriginal.textContent = `$${formatCurrency(originalTotal)}`;

  const finChanges = document.getElementById('fin-changes');
  if (finChanges) finChanges.textContent = `$${formatCurrency(changeOrdersTotal)}`;

  const finCurrent = document.getElementById('fin-current');
  if (finCurrent) finCurrent.textContent = `$${formatCurrency(currentBudget)}`;

  const finCosts = document.getElementById('fin-costs');
  if (finCosts) finCosts.textContent = `$${formatCurrency(actualTotal)}`;

  const finRemaining = document.getElementById('fin-remaining');
  if (finRemaining) {
    finRemaining.textContent = `$${formatCurrency(remaining)}`;

    // Color code remaining budget
    if (remaining < 0) {
      finRemaining.style.color = 'var(--kh-pill-risk)';
    } else if (remaining < currentBudget * 0.1) {
      finRemaining.style.color = 'var(--kh-pill-watch)';
    } else {
      finRemaining.style.color = 'var(--kh-pill-ok)';
    }
  }
}

/**
 * Render Job Schedule Card (Summary Tab)
 * Shows line items with status and dates
 */
function renderJobSchedule(lineItems = []) {
  const scheduleList = document.getElementById('schedule-list');
  const emptyState = document.getElementById('schedule-empty');

  if (!scheduleList) return;

  scheduleList.innerHTML = '';

  if (lineItems.length === 0) {
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;

  lineItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'kh-schedule-item';

    const status = item.status || 'Not Started';
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');

    const schedule = item.schedule || {};
    const scheduledDate = schedule.endDate ? formatDateDisplay(schedule.endDate) : '—';
    const actualDate = schedule.actualEndDate ? formatDateDisplay(schedule.actualEndDate) : null;

    const datesHtml = actualDate
      ? `Scheduled: ${scheduledDate}<br><span class="kh-schedule-item__date-actual">Actual: ${actualDate}</span>`
      : `Scheduled: ${scheduledDate}`;

    li.innerHTML = `
      <div class="kh-schedule-item__name">${item.name}</div>
      <span class="kh-schedule-item__status kh-schedule-item__status--${statusClass}">${status}</span>
      <div class="kh-schedule-item__dates">${datesHtml}</div>
    `;

    scheduleList.appendChild(li);
  });
}

/**
 * Initialize Job Notes Modal
 */
function initJobNotesModal() {
  const viewNotesBtn = document.getElementById('view-job-notes');

  if (viewNotesBtn) {
    viewNotesBtn.addEventListener('click', () => {
      if (currentJob && currentJob.notes) {
        alert(currentJob.notes);
      } else {
        alert('No notes yet.');
      }
    });
  }
}

async function initDashboardPage() {
  const apiStatus = document.getElementById("api-status");
  const createPanel = document.getElementById("create-job-panel");
  const createButton = document.getElementById("create-job-button");
  const cancelButton = document.getElementById("create-job-cancel");
  const form = document.getElementById("job-create-form");

  // Initialize address autocomplete for job creation form
  initAddressAutocomplete('job-address-input', 'address-suggestions-create');

  if (createButton && createPanel) {
    createButton.addEventListener("click", () => {
      createPanel.hidden = false;
      createPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (cancelButton && createPanel) {
    cancelButton.addEventListener("click", () => {
      createPanel.hidden = true;
    });
  }

  if (form) {
    wireDateInputs(form);
    wireValidation(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateClientContact(form, "create-job-message")) {
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      setButtonLoading(submitButton, "Creating job...");
      setMessage("create-job-message", "Saving job...");

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.clientPhone = formatPhoneDisplay(payload.clientPhone);

      if (requiresApprovedPlanset(payload.stage)) {
        setMessage(
          "create-job-message",
          "Approved Planset is required before moving to In Construction.",
          true
        );
        resetButton(submitButton);
        return;
      }

      try {
        const created = await createJob(payload);
        setMessage("create-job-message", "Job created.");
        if (created && created.id) {
          window.location.href = `job.html?jobId=${encodeURIComponent(created.id)}`;
        } else {
          form.reset();
          resetButton(submitButton);
        }
      } catch (error) {
        handleError(error, "create-job-message", "Failed to create job");
        resetButton(submitButton);
      }
    });
  }

  // Show loading state
  showTableLoading("jobs-table-body", 7);

  let allJobs = [];

  // Filter logic
  const hideClosedCheckbox = document.getElementById("hide-closed-jobs");

  const applyJobFilters = () => {
    const hideClosed = hideClosedCheckbox?.checked || false;

    const filtered = allJobs.filter((job) => {
      if (hideClosed && job.stage === "Closed") {
        return false;
      }
      return true;
    });

    renderJobsTable(filtered);
  };

  if (hideClosedCheckbox) {
    hideClosedCheckbox.addEventListener("change", applyJobFilters);
  }

  try {
    const jobs = await fetchJobs();
    allJobs = jobs;
    renderSummary(jobs);
    applyJobFilters(); // Apply initial filter
    if (apiStatus) {
      apiStatus.hidden = true;
    }
  } catch (error) {
    console.error("Failed to initialize dashboard.", error);
    renderSummary([]);
    renderJobsTable([]);
    if (apiStatus) {
      apiStatus.hidden = false;
    }
  }
}

async function initDocumentsPage() {
  // Job documents filters
  const docJobFilter = document.getElementById("documents-filter-job");
  const docTypeFilter = document.getElementById("documents-filter-type");
  const docTrashFilter = document.getElementById("documents-filter-trashed");

  // Business documents elements
  const businessDocsTrashFilter = document.getElementById("business-docs-filter-trashed");
  const uploadBusinessDocButton = document.getElementById("upload-business-doc-button");
  const uploadBusinessDocModal = document.getElementById("upload-business-doc-modal");
  const uploadBusinessDocForm = document.getElementById("upload-business-doc-form");
  const cancelBusinessUpload = document.getElementById("cancel-business-upload");

  let cachedJobs = [];
  let cachedDocuments = [];
  let cachedBusinessDocuments = [];

  // Job documents filtering
  const applyDocumentFilters = () => {
    const jobId = docJobFilter?.value || "";
    const type = docTypeFilter?.value || "";
    const showTrashed = Boolean(docTrashFilter?.checked);

    const filtered = cachedDocuments.filter((doc) => {
      const jobMatch = jobId ? doc.jobId === jobId : true;
      const typeMatch = type ? doc.documentType === type : true;
      const trashMatch = showTrashed ? true : !doc.deletedAt;
      return jobMatch && typeMatch && trashMatch;
    });

    renderDocumentsTable(filtered, cachedJobs, handleDocumentTypeChange);
  };

  // Business documents filtering
  const applyBusinessDocumentFilters = () => {
    const showTrashed = Boolean(businessDocsTrashFilter?.checked);

    const filtered = cachedBusinessDocuments.filter((doc) => {
      return showTrashed ? true : !doc.deleted_at;
    });

    renderBusinessDocumentsTable(filtered);
  };

  // Debounced version for filter changes
  const debouncedFilter = debounce(applyDocumentFilters, 150);

  const handleDocumentTypeChange = async (doc, nextType, select) => {
    if (!nextType || nextType === doc.documentType) return;
    const original = doc.documentType;
    if (select) {
      select.disabled = true;
    }
    setMessage("documents-page-message", "Updating document type...");
    try {
      await updateDocumentType(doc.id, nextType);
      doc.documentType = nextType;
      setMessage("documents-page-message", "Document type updated.");
      applyDocumentFilters();
    } catch (error) {
      console.error("Failed to update document type.", error);
      setMessage("documents-page-message", "Unable to update document type.", true);
      doc.documentType = original;
      if (select) {
        select.value = original || "";
      }
    } finally {
      if (select) {
        select.disabled = false;
      }
    }
  };

  // Business document upload modal handlers
  if (uploadBusinessDocButton) {
    uploadBusinessDocButton.addEventListener("click", () => {
      uploadBusinessDocModal?.removeAttribute("hidden");
      uploadBusinessDocForm?.reset();
      setMessage("upload-business-doc-message", "");
    });
  }

  if (cancelBusinessUpload) {
    cancelBusinessUpload.addEventListener("click", () => {
      uploadBusinessDocModal?.setAttribute("hidden", "");
    });
  }

  const closeButton = uploadBusinessDocModal?.querySelector(".kh-modal__close");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      uploadBusinessDocModal?.setAttribute("hidden", "");
    });
  }

  if (uploadBusinessDocForm) {
    uploadBusinessDocForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(uploadBusinessDocForm);
      const file = formData.get("file");
      const type = formData.get("type");
      const description = formData.get("description");

      if (!file || !type) {
        setMessage("upload-business-doc-message", "Please select a file and type.", true);
        return;
      }

      setMessage("upload-business-doc-message", "Uploading...");
      const submitButton = uploadBusinessDocForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        await uploadBusinessDocument(file, type, description);
        setMessage("upload-business-doc-message", "Document uploaded successfully!");
        uploadBusinessDocModal?.setAttribute("hidden", "");

        // Reload business documents
        cachedBusinessDocuments = await fetchBusinessDocuments({ showTrashed: Boolean(businessDocsTrashFilter?.checked) });
        applyBusinessDocumentFilters();
      } catch (error) {
        console.error("Failed to upload business document:", error);
        setMessage("upload-business-doc-message", error.message || "Upload failed. Please try again.", true);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // Show loading state
  showTableLoading("documents-table-body", 4);
  showTableLoading("business-docs-table-body", 5);

  try {
    // Load job documents
    cachedJobs = await fetchJobs();
    populateDocumentFilters(cachedJobs);
    cachedDocuments = (await fetchDocuments({ includeTrashed: true })) || [];
    applyDocumentFilters();

    // Load business documents
    cachedBusinessDocuments = await fetchBusinessDocuments({ showTrashed: false });
    applyBusinessDocumentFilters();

    // Attach job document filter listeners
    if (docJobFilter) {
      docJobFilter.addEventListener("change", debouncedFilter);
    }
    if (docTypeFilter) {
      docTypeFilter.addEventListener("change", debouncedFilter);
    }
    if (docTrashFilter) {
      docTrashFilter.addEventListener("change", applyDocumentFilters);
    }

    // Attach business document filter listeners
    if (businessDocsTrashFilter) {
      businessDocsTrashFilter.addEventListener("change", async () => {
        showTableLoading("business-docs-table-body", 5);
        try {
          cachedBusinessDocuments = await fetchBusinessDocuments({ showTrashed: Boolean(businessDocsTrashFilter.checked) });
          applyBusinessDocumentFilters();
        } catch (error) {
          console.error("Failed to reload business documents:", error);
          renderBusinessDocumentsTable([]);
        }
      });
    }
  } catch (error) {
    console.error("Failed to initialize documents page.", error);
    renderDocumentsTable([], []);
    renderBusinessDocumentsTable([]);
  }
}

function renderJobDetail(job) {
  setText("job-title", job.name);
  setText("job-subtitle", `${job.location || ""} · ${job.type || ""} · Kelli Homes`);

  const stagePill = document.getElementById("job-stage-pill");
  if (stagePill) {
    stagePill.textContent = job.stage || "—";
    stagePill.className = `kh-pill ${stageClass(job.stage)}`;
  }

  setText("glance-start", formatDate(job.startDate));
  setText("glance-target", formatDate(job.targetCompletion));
  setText("glance-client", job.client);
  setText("glance-email", job.clientEmail);
  setText("glance-phone", formatPhoneDisplay(job.clientPhone));
  setText("glance-contact", job.primaryContact);

  setText("fin-contract", job.financials?.contractValue);
  setText("fin-supplements", job.financials?.supplements);
  setText("fin-costs", job.financials?.costsToDate);
  setText("fin-margin", job.financials?.projectedMargin);

  const marginStatus = document.getElementById("fin-margin-status");
  if (marginStatus) {
    marginStatus.textContent = job.financials?.marginStatus || "—";
    marginStatus.className = `kh-pill ${healthClass(job.financials?.marginStatus)}`;
  }

  const milestonesList = document.getElementById("milestones-list");
  if (milestonesList) {
    milestonesList.innerHTML = "";
    let milestones = job.milestones || [];
    if (typeof milestones === "string") {
      try {
        milestones = JSON.parse(milestones);
      } catch (error) {
        milestones = [];
      }
    }
    if (!Array.isArray(milestones)) {
      milestones = [];
    }
    milestones.forEach((milestone) => {
      const item = document.createElement("li");
      item.className = `kh-milestone ${milestone.status === "done" ? "kh-milestone--done" : ""}`;
      item.innerHTML = `
        <div class="kh-milestone__title">${milestone.title}</div>
        <div class="kh-milestone__date">${formatDate(milestone.date)}</div>
      `;
      milestonesList.appendChild(item);
    });
  }
}

function fillEditForm(job) {
  const form = document.getElementById("job-edit-form");
  if (!form) return;
  form.name.value = job.name || "";
  form.location.value = job.location || "";
  form.client.value = job.client || "";
  form.clientEmail.value = job.clientEmail || "";
  form.clientPhone.value = formatPhoneDisplay(job.clientPhone);
  form.stage.value = job.stage || "Preconstruction";
  form.type.value = job.type || "";
  form.startDate.value = job.startDate || "";
  form.targetCompletion.value = job.targetCompletion || "";
  form.actualCompletion.value = job.actualCompletion || "";
  form.primaryContact.value = job.primaryContact || "";
  form.notes.value = job.notes || "";
}

async function loadDocuments(jobId) {
  showListLoading("documents-list", "Loading documents...");
  try {
    const showTrashed = Boolean(document.getElementById("documents-show-trashed")?.checked);
    const allDocuments = await fetchDocuments({ includeTrashed: showTrashed });
    // Filter documents for this specific job
    const jobDocuments = (allDocuments || []).filter(doc => doc.jobId === jobId);
    renderDocuments(jobId, jobDocuments);
  } catch (error) {
    console.error("Failed to load documents.", error);
    setMessage("documents-message", "Unable to load documents.", true);
  }
}

function renderDocuments(jobId, documents) {
  const list = document.getElementById("documents-list");
  if (!list) return;
  list.innerHTML = "";

  if (!documents.length) {
    const empty = document.createElement("li");
    empty.textContent = "No documents uploaded yet.";
    list.appendChild(empty);
    return;
  }

  documents.forEach((doc) => {
    const type = getDocumentType(doc.documentType);
    const item = document.createElement("li");
    if (doc.deletedAt) {
      item.classList.add("is-trashed");
    }
    item.innerHTML = `
      <div class="kh-doc-title">
        <span class="kh-doc-icon">${getDocumentIcon(type.icon)}</span>
        <div>
          <a href="${doc.url || "#"}" target="_blank" rel="noopener">${doc.name || "Document"}</a>
          <div class="kh-doc-meta">${doc.documentType || "—"} · ${formatDate(doc.createdAt)}</div>
        </div>
      </div>
      <button class="kh-link" data-doc-id="${doc.id}">${doc.deletedAt ? "Restore" : "Move to trash"}</button>
    `;
    item.querySelector("button").addEventListener("click", async (e) => {
      const btn = e.target;
      setButtonLoading(btn, doc.deletedAt ? "Restoring..." : "Deleting...");
      try {
        if (doc.deletedAt) {
          await restoreDocument(doc.id);
        } else {
          await deleteDocument(doc.id);
        }
        loadDocuments(jobId);
      } catch (error) {
        console.error("Failed to update document.", error);
        setMessage("documents-message", "Unable to update document.", true);
        resetButton(btn);
      }
    });
    list.appendChild(item);
  });
}

async function initJobDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("jobId");

  if (!jobId) {
    showJobNotFound();
    return;
  }

  // Initialize tab navigation
  initTabNavigation();
  initJobNotesModal();

  // Initialize address autocomplete for job edit form
  initAddressAutocomplete('job-address-edit', 'address-suggestions-edit');

  const editPanel = document.getElementById("edit-job-panel");
  const editButton = document.getElementById("edit-job-button");
  const editCancel = document.getElementById("edit-job-cancel");
  const editForm = document.getElementById("job-edit-form");
  const deleteButton = document.getElementById("delete-job-button");
  populateDocumentTypeSelect();

  if (editButton && editPanel) {
    editButton.addEventListener("click", () => {
      editPanel.hidden = false;
      editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (editCancel && editPanel) {
    editCancel.addEventListener("click", () => {
      // Reset form to original values when canceling
      if (editForm && currentJob) {
        fillEditForm(currentJob);
      }
      editPanel.hidden = true;
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const ok = window.confirm(
        "We recommend that you archive the job instead of deleting. Proceed with delete?"
      );
      if (!ok) return;
      try {
        await deleteJob(jobId);
        window.location.href = "index.html";
      } catch (error) {
        console.error("Failed to delete job.", error);
        setMessage("edit-job-message", "Unable to delete job.", true);
      }
    });
  }

  if (editForm) {
    wireDateInputs(editForm);
    wireValidation(editForm);
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateClientContact(editForm, "edit-job-message")) {
        return;
      }

      const submitButton = editForm.querySelector('button[type="submit"]');
      setButtonLoading(submitButton, "Saving...");
      setMessage("edit-job-message", "Saving changes...");

      const formData = new FormData(editForm);
      const payload = Object.fromEntries(formData.entries());
      payload.clientPhone = formatPhoneDisplay(payload.clientPhone);

      if (requiresApprovedPlanset(payload.stage)) {
        try {
          const documents = await fetchJobDocuments(jobId);
          const hasPlanset = (documents || []).some(
            (doc) => doc.documentType === "Approved Planset"
          );
          if (!hasPlanset) {
            setMessage(
              "edit-job-message",
              "Approved Planset is required before moving to In Construction.",
              true
            );
            resetButton(submitButton);
            return;
          }
        } catch (docError) {
          setMessage(
            "edit-job-message",
            "Unable to verify documents. Please try again.",
            true
          );
          resetButton(submitButton);
          return;
        }
      }
      try {
        const updated = await updateJob(jobId, payload);
        setMessage("edit-job-message", "Job updated.");
        editPanel.hidden = true;
        renderJobDetail(updated || payload);
        resetButton(submitButton);
      } catch (error) {
        handleError(error, "edit-job-message", "Failed to update job");
        resetButton(submitButton);
      }
    });
  }

  // Wire up line item modals
  const addLineItemButton = document.getElementById("add-line-item-button");
  const closeAddLineItem = document.getElementById("close-add-line-item");
  const closeBudgetIncrease = document.getElementById("close-budget-increase");
  const addLineItemModal = document.getElementById("add-line-item-modal");
  const budgetIncreaseModal = document.getElementById("budget-increase-modal");

  if (addLineItemButton) {
    addLineItemButton.addEventListener("click", () => showAddLineItemModal());
  }

  // Wire up Import CSV button
  const importCSVInput = document.getElementById("import-csv-input");
  if (importCSVInput) {
    importCSVInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        handleCSVImport(file);
        e.target.value = ''; // Reset so same file can be imported again
      }
    });
  }

  // Wire up Delete All button
  const deleteAllButton = document.getElementById("delete-all-line-items");
  if (deleteAllButton) {
    deleteAllButton.addEventListener("click", () => deleteAllLineItems());
  }

  if (closeAddLineItem && addLineItemModal) {
    closeAddLineItem.addEventListener("click", () => {
      addLineItemModal.hidden = true;
    });
  }

  if (closeBudgetIncrease && budgetIncreaseModal) {
    closeBudgetIncrease.addEventListener("click", () => {
      budgetIncreaseModal.hidden = true;
    });
  }

  // Click outside modal to close
  if (addLineItemModal) {
    addLineItemModal.addEventListener("click", (e) => {
      if (e.target === addLineItemModal) {
        addLineItemModal.hidden = true;
      }
    });
  }

  if (budgetIncreaseModal) {
    budgetIncreaseModal.addEventListener("click", (e) => {
      if (e.target === budgetIncreaseModal) {
        budgetIncreaseModal.hidden = true;
      }
    });
  }

  const uploadInput = document.getElementById("document-upload");
  const documentTypeSelect = document.getElementById("document-type");
  const showTrashedToggle = document.getElementById("documents-show-trashed");
  if (showTrashedToggle) {
    showTrashedToggle.addEventListener("change", () => {
      loadDocuments(jobId);
    });
  }
  if (uploadInput) {
    uploadInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      // Default to Miscellaneous if nothing selected
      const documentType = documentTypeSelect?.value || "Miscellaneous";

      // Disable upload input during upload
      uploadInput.disabled = true;
      if (documentTypeSelect) {
        documentTypeSelect.disabled = true;
      }
      setMessage("documents-message", "Uploading document...");

      try {
        const response = await requestDocumentUpload(jobId, file, documentType);
        await fetch(response.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        setMessage("documents-message", "Document uploaded.");
        uploadInput.value = "";
        // Reset to Miscellaneous after upload
        if (documentTypeSelect) {
          documentTypeSelect.value = "Miscellaneous";
        }
        await loadDocuments(jobId);
      } catch (error) {
        console.error("Failed to upload document.", error);
        const errorMsg = error.message || "Unknown error";
        setMessage("documents-message", `Failed to upload document.\nError: ${errorMsg}`, true);
      } finally {
        uploadInput.disabled = false;
        if (documentTypeSelect) {
          documentTypeSelect.disabled = false;
        }
      }
    });
  }

  const loadJobDetail = async (attempt) => {
    try {
      const job = await fetchJobById(jobId);
      if (!job) {
        throw new Error("Job not found");
      }
      renderJobDetail(job);
      fillEditForm(job);

      // NEW: Render Summary tab cards
      renderJobOverview(job);

      try {
        showTableLoading("line-items-costs-body", 6);
        showTableLoading("line-items-schedule-body", 6);
        const lineItems = await fetchJobLineItems(jobId);
        renderLineItemsTwoTables(lineItems || []);
        updateDeleteAllButtonVisibility();

        // Render Summary tab cards with line items data
        renderFinancialSnapshot(lineItems || []);
        renderJobSchedule(lineItems || []);
      } catch (error) {
        console.error("Failed to load line items.", error);
        renderLineItemsTwoTables([]);
        updateDeleteAllButtonVisibility();

        // Render Summary tab cards with empty data
        renderFinancialSnapshot([]);
        renderJobSchedule([]);

        setMessage("line-items-message", "Unable to load line items.", true);
      }

      await loadDocuments(jobId);
    } catch (error) {
      if (attempt < 2) {
        setTimeout(() => {
          loadJobDetail(attempt + 1);
        }, 700);
        return;
      }
      console.error("Failed to load job detail.", error);
      showJobNotFound();
    }
  };

  loadJobDetail(1);
}

function showJobNotFound() {
  const container = document.getElementById("job-detail-container");
  if (!container) return;
  container.innerHTML = `
    <div class="kh-empty">
      <h2>Job not found</h2>
      <p>The job you are looking for could not be found.</p>
      <a class="kh-link" href="index.html">Back to dashboard</a>
    </div>
  `;
}

// Initialize authentication and page
(async () => {
  const authReady = await initLoginFlow();
  if (authReady) {
    if (isJobDetailPage()) {
      initJobDetailPage();
    } else if (isDocumentsPage()) {
      initDocumentsPage();
    } else {
      initDashboardPage();
    }
  }
})();

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
