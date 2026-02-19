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
  restoreBusinessDocument,
  fetchTasks,
  fetchTaskById,
  createTask,
  updateTask,
  deleteTask,
  fetchUsers,
  fetchInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  requestInventoryPhotoUpload,
  deleteInventoryPhoto,
  claimInventoryItem,
  unclaimInventoryItem
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
  { value: "Renderings / Drawings", icon: "blueprint" },
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

function isTasksPage() {
  return window.location.pathname.endsWith("tasks.html");
}

function isWastelandPage() {
  return window.location.pathname.endsWith("wasteland.html");
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
      } else if (isTasksPage()) {
        initTasksPage();
      } else if (isDocumentsPage()) {
        initDocumentsPage();
      } else if (isWastelandPage()) {
        initWastelandPage();
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

// ============================================
// CALENDAR VIEW - Weekly Calendar with Job Swimlanes
// ============================================

let calendarStartDate = getSundayOfWeek(new Date()); // Start from current week's Sunday
let calendarJobs = [];
let calendarJobLineItems = {}; // { jobId: [lineItems] }
let calendarSelectedJobs = new Set(); // Track which jobs are selected
let calendarInitialized = false;

// Calendar task state
let calendarTasks = []; // All tasks with dates
let calendarTasksByJob = {}; // { jobId: [tasks] }
let calendarUnlinkedTasks = []; // Tasks with no job
let calendarShowTasks = true; // Toggle for task visibility

// Color palette for jobs - chosen to be visually distinct
const JOB_COLORS = [
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }, // Blue
  { bg: '#dcfce7', border: '#22c55e', text: '#166534' }, // Green
  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }, // Amber
  { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }, // Pink
  { bg: '#ffedd5', border: '#f97316', text: '#9a3412' }, // Orange
  { bg: '#e9d5ff', border: '#a855f7', text: '#6b21a8' }, // Purple
  { bg: '#ccfbf1', border: '#14b8a6', text: '#0f766e' }, // Teal
  { bg: '#fecaca', border: '#ef4444', text: '#991b1b' }, // Red
];

function getJobColor(jobIndex) {
  return JOB_COLORS[jobIndex % JOB_COLORS.length];
}

function getSundayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function formatDateRange(startDate, numWeeks) {
  const endDate = addDays(startDate, numWeeks * 7 - 1);
  const startMonth = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endMonth = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startMonth} - ${endMonth}`;
}

function getItemDates(item) {
  const schedule = item.schedule || {};
  const estStart = schedule.startDate ? new Date(schedule.startDate) : null;
  const estEnd = schedule.endDate ? new Date(schedule.endDate) : null;
  const actStart = schedule.actualStartDate ? new Date(schedule.actualStartDate) : null;
  const actEnd = schedule.actualEndDate ? new Date(schedule.actualEndDate) : null;

  const startDate = actStart || estStart;
  const endDate = actEnd || estEnd;
  const isActual = !!(actStart || actEnd);

  return { startDate, endDate, isActual };
}

function getCalendarWeeks(numWeeks) {
  const weeks = [];
  let currentDay = new Date(calendarStartDate);

  for (let w = 0; w < numWeeks; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(currentDay));
      currentDay = addDays(currentDay, 1);
    }
    weeks.push(week);
  }

  return weeks;
}

// Calculate how many swimlanes would appear in each week
function countSwimlanesPerWeek(selectedJobs, numWeeks) {
  const weeks = getCalendarWeeks(numWeeks);
  const counts = [];

  weeks.forEach(weekDays => {
    let count = 0;
    selectedJobs.forEach(job => {
      const lineItems = calendarJobLineItems[job.id] || [];
      lineItems.forEach(item => {
        if (doesItemAppearInWeek(item, weekDays)) {
          count++;
        }
      });

      // Count job-linked tasks
      if (calendarShowTasks) {
        const jobTasks = calendarTasksByJob[job.id] || [];
        jobTasks.forEach(task => {
          if (doesItemAppearInWeek(task, weekDays)) {
            count++;
          }
        });
      }
    });

    // Count unlinked tasks
    if (calendarShowTasks) {
      calendarUnlinkedTasks.forEach(task => {
        if (doesItemAppearInWeek(task, weekDays)) {
          count++;
        }
      });
    }

    counts.push(count);
  });

  return counts;
}

// Calculate how many weeks fit in the square calendar
function calculateWeeksForSquare(selectedJobs) {
  const gridContainer = document.getElementById('calendar-grid');
  if (!gridContainer) return 4;

  const containerWidth = gridContainer.offsetWidth;
  if (containerWidth === 0) return 4; // Fallback if not rendered yet

  // Check if we're on mobile (no aspect-ratio enforcement)
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    // On mobile, use density-based calculation
    return calculateOptimalWeeksByDensity(selectedJobs);
  }

  // On desktop, calendar is square so height = width
  const availableHeight = containerWidth;

  // Estimate heights (approximate based on CSS):
  // - Header row: ~40px
  // - Day row per week: ~36px
  // - Swimlane row: ~27px (26px + 1px border)
  // - Min 4 swimlanes per week
  const HEADER_HEIGHT = 40;
  const DAY_ROW_HEIGHT = 36;
  const SWIMLANE_HEIGHT = 27;
  const MIN_SWIMLANES = 4;

  // Calculate swimlane counts per week for different week counts
  const MIN_WEEKS = 2;
  const MAX_WEEKS = 10;

  for (let numWeeks = MAX_WEEKS; numWeeks >= MIN_WEEKS; numWeeks--) {
    const counts = countSwimlanesPerWeek(selectedJobs, numWeeks);

    // Calculate total height needed
    let totalHeight = HEADER_HEIGHT;
    for (let i = 0; i < numWeeks; i++) {
      const swimlanesThisWeek = Math.max(counts[i] || 0, MIN_SWIMLANES);
      totalHeight += DAY_ROW_HEIGHT + (swimlanesThisWeek * SWIMLANE_HEIGHT);
    }

    // If this fits in the square, use it
    if (totalHeight <= availableHeight) {
      return numWeeks;
    }
  }

  return MIN_WEEKS;
}

// Fallback density-based calculation for mobile
function calculateOptimalWeeksByDensity(selectedJobs) {
  const MIN_WEEKS = 2;
  const MAX_WEEKS = 8;
  const TARGET_MAX_SWIMLANES = 12;

  for (let numWeeks = MAX_WEEKS; numWeeks >= MIN_WEEKS; numWeeks--) {
    const counts = countSwimlanesPerWeek(selectedJobs, numWeeks);
    const maxSwimlanes = Math.max(...counts, 0);

    if (maxSwimlanes <= TARGET_MAX_SWIMLANES) {
      return numWeeks;
    }
  }

  return MIN_WEEKS;
}

function normalizeDate(date) {
  // Normalize to midnight local time to avoid timezone issues
  if (!date) return null;
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getItemSpanInWeek(item, weekDays) {
  const { startDate, endDate } = getItemDates(item);
  if (!startDate && !endDate) return { startCol: -1, span: 0 };

  // Normalize all dates to midnight local time
  const itemStart = normalizeDate(startDate || endDate);
  const itemEnd = normalizeDate(endDate || startDate);
  const weekStart = normalizeDate(weekDays[0]);
  const weekSat = normalizeDate(weekDays[6]);

  // Check if item overlaps this week at all
  // Item must start on or before Saturday AND end on or after Sunday
  if (itemStart > weekSat || itemEnd < weekStart) {
    return { startCol: -1, span: 0 };
  }

  // Clamp item dates to this week
  const visibleStart = itemStart < weekStart ? weekStart : itemStart;
  const visibleEnd = itemEnd > weekSat ? weekSat : itemEnd;

  // Find which column it starts on
  let startCol = 0;
  for (let i = 0; i < 7; i++) {
    const dayNorm = normalizeDate(weekDays[i]);
    if (dayNorm.getTime() === visibleStart.getTime() || dayNorm > visibleStart) {
      startCol = i;
      break;
    }
  }

  // Calculate span (difference in days + 1 for inclusive)
  const diffTime = visibleEnd.getTime() - visibleStart.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const span = Math.min(Math.max(diffDays, 1), 7 - startCol);

  return { startCol, span };
}

function doesItemAppearInWeek(item, weekDays) {
  const { startDate, endDate } = getItemDates(item);
  if (!startDate && !endDate) return false;

  const itemStart = normalizeDate(startDate || endDate);
  const itemEnd = normalizeDate(endDate || startDate);
  const weekStart = normalizeDate(weekDays[0]);
  const weekSat = normalizeDate(weekDays[6]);

  // Item appears if it starts on or before Saturday AND ends on or after Sunday
  return itemStart <= weekSat && itemEnd >= weekStart;
}

async function initCalendarView(jobs) {
  calendarJobs = jobs.filter(j => j.stage !== 'Closed');
  calendarSelectedJobs = new Set(calendarJobs.map(j => j.id));

  calendarJobLineItems = {};

  // Fetch line items and tasks in parallel
  const [, allTasks] = await Promise.all([
    Promise.all(calendarJobs.map(async (job) => {
      try {
        const lineItems = await fetchJobLineItems(job.id);
        calendarJobLineItems[job.id] = lineItems || [];
      } catch (e) {
        calendarJobLineItems[job.id] = [];
      }
    })),
    fetchTasks().catch(() => [])
  ]);

  // Process tasks - only include those with dates
  calendarTasks = (allTasks || []).filter(t => t.startDate || t.endDate);

  // Adapt tasks to have schedule shape compatible with calendar helpers
  calendarTasks.forEach(t => {
    t.schedule = {
      startDate: t.startDate ? t.startDate.split('T')[0] : null,
      endDate: t.endDate ? t.endDate.split('T')[0] : null
    };
    t.name = t.title; // For calendar item display
  });

  // Group by job
  calendarTasksByJob = {};
  calendarUnlinkedTasks = [];
  calendarTasks.forEach(t => {
    if (t.jobId) {
      if (!calendarTasksByJob[t.jobId]) calendarTasksByJob[t.jobId] = [];
      calendarTasksByJob[t.jobId].push(t);
    } else {
      calendarUnlinkedTasks.push(t);
    }
  });

  renderCalendarFilters();
  renderCalendarGrid();
  updateCalendarRange();
  setupCalendarNavigation();
  calendarInitialized = true;
}

function renderCalendarFilters() {
  const filtersContainer = document.getElementById('calendar-filters');
  if (!filtersContainer) return;

  const selectedJobsList = calendarJobs.filter(j => calendarSelectedJobs.has(j.id));
  const hasCalendarTasks = calendarTasks.length > 0;

  filtersContainer.innerHTML = `
    <label class="kh-cal-filter kh-cal-filter--all">
      <input type="checkbox" class="kh-checkbox" id="calendar-select-all" checked />
      <span class="kh-cal-filter__label">All Jobs</span>
    </label>
    ${calendarJobs.map((job, idx) => {
      const color = getJobColor(idx);
      return `
        <label class="kh-cal-filter" style="background: ${color.bg}; border-color: ${color.border}; color: ${color.text};">
          <input type="checkbox" class="kh-checkbox" data-job-id="${job.id}" data-job-index="${idx}" ${calendarSelectedJobs.has(job.id) ? 'checked' : ''} />
          <span class="kh-cal-filter__label">${job.name}</span>
        </label>
      `;
    }).join('')}
    ${hasCalendarTasks ? `
      <label class="kh-cal-filter kh-cal-filter--tasks">
        <input type="checkbox" class="kh-checkbox" id="calendar-toggle-tasks" ${calendarShowTasks ? 'checked' : ''} />
        <span class="kh-cal-filter__label">Tasks</span>
      </label>
    ` : ''}
  `;

  const selectAll = document.getElementById('calendar-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      if (e.target.checked) {
        calendarSelectedJobs = new Set(calendarJobs.map(j => j.id));
      } else {
        calendarSelectedJobs = new Set();
      }
      filtersContainer.querySelectorAll('[data-job-id]').forEach(cb => {
        cb.checked = e.target.checked;
      });
      renderCalendarGrid();
    });
  }

  filtersContainer.querySelectorAll('[data-job-id]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const jobId = e.target.dataset.jobId;
      if (e.target.checked) {
        calendarSelectedJobs.add(jobId);
      } else {
        calendarSelectedJobs.delete(jobId);
      }
      const allChecked = calendarSelectedJobs.size === calendarJobs.length;
      if (selectAll) selectAll.checked = allChecked;
      renderCalendarGrid();
    });
  });

  // Tasks toggle
  const tasksToggle = document.getElementById('calendar-toggle-tasks');
  if (tasksToggle) {
    tasksToggle.addEventListener('change', (e) => {
      calendarShowTasks = e.target.checked;
      renderCalendarGrid();
    });
  }
}

function renderCalendarGrid() {
  hideCalendarPopover();
  const gridContainer = document.getElementById('calendar-grid');
  if (!gridContainer) return;

  const selectedJobs = calendarJobs.filter(j => calendarSelectedJobs.has(j.id));
  const hasTasksToShow = calendarShowTasks && calendarTasks.length > 0;

  if (selectedJobs.length === 0 && !hasTasksToShow) {
    gridContainer.innerHTML = '<div class="kh-calendar__empty">Select jobs to display</div>';
    return;
  }

  // Calculate weeks to fit in square (desktop) or by density (mobile)
  const numWeeks = calculateWeeksForSquare(selectedJobs);
  const weeks = getCalendarWeeks(numWeeks);
  const today = new Date();

  // Update the date range display
  updateCalendarRange(numWeeks);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build a map of job index for color assignment (based on original order)
  const jobIndexMap = {};
  calendarJobs.forEach((job, idx) => {
    jobIndexMap[job.id] = idx;
  });

  let html = '<div class="kh-cal">';

  // Header row with day names
  html += '<div class="kh-cal__header">';
  dayNames.forEach(name => {
    html += `<div class="kh-cal__header-cell">${name}</div>`;
  });
  html += '</div>';

  // Weeks container for flex layout
  html += '<div class="kh-cal__weeks">';

  // Track months for alternating backgrounds (per-day coloring)
  const monthColorMap = {};
  let monthColorCounter = 0;

  function getMonthColorClass(date) {
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (!(monthKey in monthColorMap)) {
      monthColorMap[monthKey] = monthColorCounter++;
    }
    return monthColorMap[monthKey] % 2 === 0 ? '' : 'kh-cal__day--alt';
  }

  // Week rows
  weeks.forEach((weekDays) => {
    html += '<div class="kh-cal__week">';

    // Day cells with date numbers
    html += '<div class="kh-cal__days">';
    weekDays.forEach((day) => {
      const isToday = isSameDay(day, today);
      const isFirstOfMonth = day.getDate() === 1;
      const monthColorClass = getMonthColorClass(day);
      const classes = ['kh-cal__day'];
      if (isToday) classes.push('kh-cal__day--today');
      if (monthColorClass) classes.push(monthColorClass);

      // Show month label on first of month
      const monthLabel = isFirstOfMonth ? day.toLocaleDateString('en-US', { month: 'short' }) : '';

      html += `<div class="${classes.join(' ')}">`;
      if (monthLabel) {
        html += `<span class="kh-cal__month-label">${monthLabel}</span>`;
      }
      html += `<span class="kh-cal__day-num">${day.getDate()}</span>`;
      html += '</div>';
    });
    html += '</div>';

    // Swimlanes - one row per line item that appears this week
    html += '<div class="kh-cal__swimlanes">';

    const MIN_ROWS = 4;
    let rowCount = 0;

    selectedJobs.forEach((job) => {
      const jobIdx = jobIndexMap[job.id];
      const color = getJobColor(jobIdx);
      const lineItems = calendarJobLineItems[job.id] || [];

      // Filter to items that appear in this week
      const itemsThisWeek = lineItems.filter(item => doesItemAppearInWeek(item, weekDays));

      // Each line item gets its own swimlane row
      itemsThisWeek.forEach(item => {
        const { startCol, span } = getItemSpanInWeek(item, weekDays);
        if (span <= 0) return;

        const { startDate, endDate, isActual } = getItemDates(item);
        const itemStart = startDate || endDate;
        const itemEnd = endDate || startDate;
        const continuesFromPrev = itemStart < weekDays[0];
        const continuesToNext = itemEnd > weekDays[6];

        const status = item.status || 'Not Started';
        const actualClass = isActual ? 'kh-cal__item--actual' : 'kh-cal__item--estimated';
        const continueLeftClass = continuesFromPrev ? 'kh-cal__item--continues-left' : '';
        const continueRightClass = continuesToNext ? 'kh-cal__item--continues-right' : '';

        const leftPercent = (startCol / 7) * 100;
        const widthPercent = (span / 7) * 100;

        html += `<div class="kh-cal__swimlane" data-job-id="${job.id}">`;
        html += `<div class="kh-cal__item ${actualClass} ${continueLeftClass} ${continueRightClass}"
                      style="left: ${leftPercent}%; width: ${widthPercent}%; background: ${color.bg}; border-color: ${color.border}; color: ${color.text};"
                      data-job-id="${job.id}" data-item-type="line-item" data-item-code="${item.code}"
                      title="${job.name}: ${item.name} (${status})">
                   <span class="kh-cal__item-text">${item.name}</span>
                 </div>`;
        html += '</div>'; // .kh-cal__swimlane
        rowCount++;
      });

      // Job-linked tasks (dashed border, same job color)
      if (calendarShowTasks) {
        const jobTasks = (calendarTasksByJob[job.id] || []).filter(t => doesItemAppearInWeek(t, weekDays));
        jobTasks.forEach(task => {
          const { startCol, span } = getItemSpanInWeek(task, weekDays);
          if (span <= 0) return;

          const taskStart = normalizeDate(task.schedule.startDate || task.schedule.endDate);
          const taskEnd = normalizeDate(task.schedule.endDate || task.schedule.startDate);
          const continuesFromPrev = taskStart < weekDays[0];
          const continuesToNext = taskEnd > weekDays[6];
          const continueLeftClass = continuesFromPrev ? 'kh-cal__item--continues-left' : '';
          const continueRightClass = continuesToNext ? 'kh-cal__item--continues-right' : '';

          const leftPercent = (startCol / 7) * 100;
          const widthPercent = (span / 7) * 100;

          html += `<div class="kh-cal__swimlane" data-job-id="${job.id}">`;
          html += `<div class="kh-cal__item kh-cal__item--task ${continueLeftClass} ${continueRightClass}"
                        style="left: ${leftPercent}%; width: ${widthPercent}%; background: ${color.bg}; border-color: ${color.border}; color: ${color.text};"
                        data-job-id="${job.id}" data-item-type="task" data-task-id="${task.id}"
                        title="${job.name} task: ${task.name} (${task.status || 'Not Started'})">
                     <span class="kh-cal__item-text">${task.name}</span>
                   </div>`;
          html += '</div>';
          rowCount++;
        });
      }
    });

    // Unlinked tasks (neutral gray)
    if (calendarShowTasks) {
      const unlinkedThisWeek = calendarUnlinkedTasks.filter(t => doesItemAppearInWeek(t, weekDays));
      unlinkedThisWeek.forEach(task => {
        const { startCol, span } = getItemSpanInWeek(task, weekDays);
        if (span <= 0) return;

        const taskStart = normalizeDate(task.schedule.startDate || task.schedule.endDate);
        const taskEnd = normalizeDate(task.schedule.endDate || task.schedule.startDate);
        const continuesFromPrev = taskStart < weekDays[0];
        const continuesToNext = taskEnd > weekDays[6];
        const continueLeftClass = continuesFromPrev ? 'kh-cal__item--continues-left' : '';
        const continueRightClass = continuesToNext ? 'kh-cal__item--continues-right' : '';

        const leftPercent = (startCol / 7) * 100;
        const widthPercent = (span / 7) * 100;

        html += `<div class="kh-cal__swimlane">`;
        html += `<div class="kh-cal__item kh-cal__item--task ${continueLeftClass} ${continueRightClass}"
                      style="left: ${leftPercent}%; width: ${widthPercent}%; background: #f0f0f0; border-color: #999; color: #555;"
                      data-item-type="unlinked-task" data-task-id="${task.id}"
                      title="Task: ${task.name} (${task.status || 'Not Started'})">
                   <span class="kh-cal__item-text">${task.name}</span>
                 </div>`;
        html += '</div>';
        rowCount++;
      });
    }

    // Add empty rows to reach minimum
    while (rowCount < MIN_ROWS) {
      html += '<div class="kh-cal__swimlane kh-cal__swimlane--empty"></div>';
      rowCount++;
    }

    html += '</div>'; // .kh-cal__swimlanes
    html += '</div>'; // .kh-cal__week
  });

  html += '</div>'; // .kh-cal__weeks
  html += '</div>'; // .kh-cal
  gridContainer.innerHTML = html;
  attachCalendarPopoverListeners(gridContainer);
}

// --- Calendar Popover System ---

let activePopover = null;
let popoverTimeout = null;
let popoverLeaveTimeout = null;

function attachCalendarPopoverListeners(container) {
  if (container._popoverListenersAttached) return;
  container.addEventListener('mouseenter', handleCalItemEnter, true);
  container.addEventListener('mouseleave', handleCalItemLeave, true);
  container._popoverListenersAttached = true;
}

function handleCalItemEnter(e) {
  const item = e.target.closest('.kh-cal__item');
  if (!item) return;

  clearTimeout(popoverLeaveTimeout);
  clearTimeout(popoverTimeout);

  popoverTimeout = setTimeout(() => {
    showCalendarPopover(item);
  }, 250);
}

function handleCalItemLeave(e) {
  const item = e.target.closest('.kh-cal__item');
  if (!item) return;

  clearTimeout(popoverTimeout);
  popoverLeaveTimeout = setTimeout(() => {
    hideCalendarPopover();
  }, 200);
}

function showCalendarPopover(itemEl) {
  hideCalendarPopover();

  const itemType = itemEl.dataset.itemType;
  const jobId = itemEl.dataset.jobId;
  const itemCode = itemEl.dataset.itemCode;
  const taskId = itemEl.dataset.taskId;

  let popoverHTML = '';
  let job = null;
  let borderColor = '#ccc';

  if (itemType === 'line-item' && jobId) {
    job = calendarJobs.find(j => String(j.id) === String(jobId));
    const lineItems = calendarJobLineItems[jobId] || [];
    const item = lineItems.find(li => li.code === itemCode);
    if (!item || !job) return;

    const jobIdx = calendarJobs.indexOf(job);
    const color = getJobColor(jobIdx);
    borderColor = color.border;

    const status = item.status || 'Not Started';
    const schedule = item.schedule || {};
    const startDate = schedule.startDate || schedule.actualStartDate;
    const endDate = schedule.endDate || schedule.actualEndDate;
    const budget = item.budget != null ? `$${Number(item.budget).toLocaleString()}` : '—';
    const actual = item.actual != null ? `$${Number(item.actual).toLocaleString()}` : '—';

    popoverHTML = `
      <div class="kh-cal-popover__header">
        <span class="kh-cal-popover__color" style="background:${color.border}"></span>
        <span class="kh-cal-popover__title">${item.name}</span>
      </div>
      <div class="kh-cal-popover__job">${job.name}</div>
      <div class="kh-cal-popover__rows">
        <div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Status</span>
          <span class="kh-cal-popover__value">${status}</span>
        </div>
        ${startDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Start</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(startDate)}</span>
        </div>` : ''}
        ${endDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">End</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(endDate)}</span>
        </div>` : ''}
        <div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Budget</span>
          <span class="kh-cal-popover__value">${budget}</span>
        </div>
        <div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Actual</span>
          <span class="kh-cal-popover__value">${actual}</span>
        </div>
      </div>
      <button class="kh-cal-popover__edit" onclick="window.location.href='job.html?id=${jobId}'">Edit Job</button>
    `;
  } else if (itemType === 'task' && jobId) {
    job = calendarJobs.find(j => String(j.id) === String(jobId));
    const tasks = calendarTasksByJob[jobId] || [];
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task || !job) return;

    const jobIdx = calendarJobs.indexOf(job);
    const color = getJobColor(jobIdx);
    borderColor = color.border;

    const status = task.status || 'Not Started';
    const schedule = task.schedule || {};

    popoverHTML = `
      <div class="kh-cal-popover__header">
        <span class="kh-cal-popover__color" style="background:${color.border}"></span>
        <span class="kh-cal-popover__title">${task.name}</span>
      </div>
      <div class="kh-cal-popover__job">${job.name} — Task</div>
      <div class="kh-cal-popover__rows">
        <div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Status</span>
          <span class="kh-cal-popover__value">${status}</span>
        </div>
        ${schedule.startDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Start</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(schedule.startDate)}</span>
        </div>` : ''}
        ${schedule.endDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">End</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(schedule.endDate)}</span>
        </div>` : ''}
      </div>
      <button class="kh-cal-popover__edit" onclick="window.location.href='tasks.html'">Edit Task</button>
    `;
  } else if (itemType === 'unlinked-task') {
    const task = calendarUnlinkedTasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    borderColor = '#999';
    const status = task.status || 'Not Started';
    const schedule = task.schedule || {};

    popoverHTML = `
      <div class="kh-cal-popover__header">
        <span class="kh-cal-popover__color" style="background:#999"></span>
        <span class="kh-cal-popover__title">${task.name}</span>
      </div>
      <div class="kh-cal-popover__job">Unlinked Task</div>
      <div class="kh-cal-popover__rows">
        <div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Status</span>
          <span class="kh-cal-popover__value">${status}</span>
        </div>
        ${schedule.startDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">Start</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(schedule.startDate)}</span>
        </div>` : ''}
        ${schedule.endDate ? `<div class="kh-cal-popover__row">
          <span class="kh-cal-popover__label">End</span>
          <span class="kh-cal-popover__value">${formatPopoverDate(schedule.endDate)}</span>
        </div>` : ''}
      </div>
      <button class="kh-cal-popover__edit" onclick="window.location.href='tasks.html'">Edit Task</button>
    `;
  } else {
    return;
  }

  const popover = document.createElement('div');
  popover.className = 'kh-cal-popover';
  popover.style.borderTop = `3px solid ${borderColor}`;
  popover.innerHTML = popoverHTML;

  // Keep popover open when hovering over it
  popover.addEventListener('mouseenter', () => {
    clearTimeout(popoverLeaveTimeout);
  });
  popover.addEventListener('mouseleave', () => {
    popoverLeaveTimeout = setTimeout(() => {
      hideCalendarPopover();
    }, 150);
  });

  document.body.appendChild(popover);
  activePopover = popover;

  // Position popover near the item
  const rect = itemEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left + (rect.width / 2) - (popRect.width / 2);

  // Keep within viewport
  if (left < 8) left = 8;
  if (left + popRect.width > window.innerWidth - 8) left = window.innerWidth - popRect.width - 8;
  if (top + popRect.height > window.innerHeight - 8) {
    top = rect.top - popRect.height - 6;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function hideCalendarPopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

function formatPopoverDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Close popover on scroll or click outside
document.addEventListener('click', (e) => {
  if (activePopover && !activePopover.contains(e.target) && !e.target.closest('.kh-cal__item')) {
    hideCalendarPopover();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCalendarPopover();
});

function updateCalendarRange(numWeeks) {
  const rangeEl = document.getElementById('calendar-range');
  if (rangeEl) {
    // If numWeeks not provided, calculate it
    if (!numWeeks) {
      const selectedJobs = calendarJobs.filter(j => calendarSelectedJobs.has(j.id));
      numWeeks = calculateOptimalWeeks(selectedJobs);
    }
    rangeEl.textContent = formatDateRange(calendarStartDate, numWeeks);
  }
}

function setupCalendarNavigation() {
  const prevBtn = document.getElementById('calendar-prev');
  const nextBtn = document.getElementById('calendar-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      calendarStartDate = addWeeks(calendarStartDate, -1);
      renderCalendarGrid();
      updateCalendarRange();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      calendarStartDate = addWeeks(calendarStartDate, 1);
      renderCalendarGrid();
      updateCalendarRange();
    });
  }
}

async function initDashboardCalendar(jobs) {
  if (calendarInitialized) return;

  const grid = document.getElementById('calendar-grid');
  if (grid) grid.innerHTML = '<div class="kh-loading"><div class="kh-spinner"></div>Loading calendar...</div>';

  await initCalendarView(jobs);
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
  const tableWrap = tableBody?.closest(".kh-table-wrap");
  if (!tableBody) return;

  if (docsPageJobViewMode === "grid") {
    // Grid view
    const gridContainer = tableWrap || tableBody.parentElement;
    const table = tableBody.closest("table");
    if (table) table.style.display = "none";

    let grid = gridContainer.querySelector(".kh-table--documents-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "kh-table--documents-grid";
      gridContainer.appendChild(grid);
    }
    grid.innerHTML = "";

    if (!documents.length) {
      grid.innerHTML = '<div style="padding: 1rem; color: var(--kh-text-muted);">No documents uploaded yet.</div>';
      return;
    }

    const jobMap = new Map(jobs.map((job) => [job.id, job.name]));

    documents.forEach((doc) => {
      const type = getDocumentType(doc.documentType);
      const card = document.createElement("div");
      card.className = "kh-doc-grid-card";
      if (doc.deletedAt) card.classList.add("is-trashed");

      const showPdfThumb = isPdfFile(doc.name) && doc.url && !doc.deletedAt;
      let thumbHtml;
      if (isImageFile(doc.name) && doc.url && !doc.deletedAt) {
        thumbHtml = `<img src="${doc.url}" loading="lazy" alt="${doc.name || 'Document'}" />`;
      } else if (isExcelFile(doc.name)) {
        thumbHtml = getExcelThumbnailSvg();
      } else {
        thumbHtml = `<span class="kh-doc-icon--large">${getDocumentIcon(type.icon)}</span>`;
      }

      card.innerHTML = `
        <div class="kh-doc-thumb">${thumbHtml}</div>
        <div class="kh-doc-grid-card__body">
          <div class="kh-doc-grid-card__name">${doc.name || "Document"}</div>
          <div class="kh-doc-grid-card__meta">${doc.documentType || "—"} · ${jobMap.get(doc.jobId) || "—"}</div>
          <div class="kh-doc-grid-card__meta">${formatDate(doc.createdAt)}</div>
        </div>
      `;

      if (doc.url && !doc.deletedAt) {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          window.open(doc.url, "_blank", "noopener");
        });
      }

      if (showPdfThumb) {
        renderPdfThumbnail(doc.url, card.querySelector(".kh-doc-thumb"));
      }

      grid.appendChild(card);
    });
    return;
  }

  // List view (original table)
  const table = tableBody.closest("table");
  if (table) table.style.display = "";
  const grid = tableBody.closest(".kh-table-wrap")?.querySelector(".kh-table--documents-grid");
  if (grid) grid.remove();

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

  const tableWrap = tableBody.closest(".kh-table-wrap");

  if (docsPageBizViewMode === "grid") {
    // Grid view
    const table = tableBody.closest("table");
    if (table) table.style.display = "none";

    let grid = tableWrap?.querySelector(".kh-table--documents-grid");
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "kh-table--documents-grid";
      tableWrap.appendChild(grid);
    }
    grid.innerHTML = "";

    if (!documents.length) {
      grid.innerHTML = '<div style="padding: 1rem; color: var(--kh-text-muted);">No business documents uploaded yet.</div>';
      return;
    }

    documents.forEach((doc) => {
      const card = document.createElement("div");
      card.className = "kh-doc-grid-card";
      if (doc.deleted_at) card.classList.add("is-trashed");

      const fileExtension = doc.file_name?.split('.').pop()?.toLowerCase() || '';
      const showPdfThumb = isPdfFile(doc.file_name) && doc.url && !doc.deleted_at;
      let thumbHtml;
      if (isImageFile(doc.file_name) && doc.url && !doc.deleted_at) {
        thumbHtml = `<img src="${doc.url}" loading="lazy" alt="${doc.file_name || 'Document'}" />`;
      } else if (isExcelFile(doc.file_name)) {
        thumbHtml = getExcelThumbnailSvg();
      } else {
        const icon = getDocumentIconForExtension(fileExtension);
        thumbHtml = `<span class="kh-doc-icon--large" style="font-size: 28px;">${icon}</span>`;
      }

      card.innerHTML = `
        <div class="kh-doc-thumb">${thumbHtml}</div>
        <div class="kh-doc-grid-card__body">
          <div class="kh-doc-grid-card__name">${doc.file_name || "Document"}</div>
          <div class="kh-doc-grid-card__meta">${doc.type || "—"}</div>
          <div class="kh-doc-grid-card__meta">${formatDate(doc.uploaded_at)}</div>
        </div>
      `;

      if (doc.url && !doc.deleted_at) {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          window.open(doc.url, "_blank", "noopener");
        });
      }

      if (showPdfThumb) {
        renderPdfThumbnail(doc.url, card.querySelector(".kh-doc-thumb"));
      }

      grid.appendChild(card);
    });
    return;
  }

  // List view (original table)
  const table = tableBody.closest("table");
  if (table) table.style.display = "";
  const grid = tableWrap?.querySelector(".kh-table--documents-grid");
  if (grid) grid.remove();

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

function isImageFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
}

function isPdfFile(filename) {
  if (!filename) return false;
  return filename.split('.').pop().toLowerCase() === 'pdf';
}

function isExcelFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return ['xls', 'xlsx', 'csv'].includes(ext);
}

function getExcelThumbnailSvg() {
  return `<svg viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
    <rect width="180" height="140" fill="#f0fdf4"/>
    <rect x="8" y="8" width="164" height="20" rx="3" fill="#166534"/>
    <text x="14" y="22" fill="#fff" font-size="11" font-family="system-ui">Job Costing Summary</text>
    <rect x="8" y="32" width="60" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="12" y="43" fill="#166534" font-size="9" font-family="system-ui" font-weight="600">Item</text>
    <rect x="68" y="32" width="52" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="72" y="43" fill="#166534" font-size="9" font-family="system-ui" font-weight="600">Budget</text>
    <rect x="120" y="32" width="52" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="124" y="43" fill="#166534" font-size="9" font-family="system-ui" font-weight="600">Actual</text>
    <rect x="8" y="46" width="60" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="12" y="57" fill="#374151" font-size="8" font-family="system-ui">Foundation</text>
    <rect x="68" y="46" width="52" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="72" y="57" fill="#374151" font-size="8" font-family="system-ui">$24,500</text>
    <rect x="120" y="46" width="52" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="124" y="57" fill="#374151" font-size="8" font-family="system-ui">$23,800</text>
    <rect x="8" y="60" width="60" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="12" y="71" fill="#374151" font-size="8" font-family="system-ui">Framing</text>
    <rect x="68" y="60" width="52" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="72" y="71" fill="#374151" font-size="8" font-family="system-ui">$38,200</text>
    <rect x="120" y="60" width="52" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="124" y="71" fill="#374151" font-size="8" font-family="system-ui">$39,100</text>
    <rect x="8" y="74" width="60" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="12" y="85" fill="#374151" font-size="8" font-family="system-ui">Electrical</text>
    <rect x="68" y="74" width="52" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="72" y="85" fill="#374151" font-size="8" font-family="system-ui">$12,750</text>
    <rect x="120" y="74" width="52" height="14" fill="#fff" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="124" y="85" fill="#374151" font-size="8" font-family="system-ui">$11,200</text>
    <rect x="8" y="88" width="60" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="12" y="99" fill="#374151" font-size="8" font-family="system-ui">Plumbing</text>
    <rect x="68" y="88" width="52" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="72" y="99" fill="#374151" font-size="8" font-family="system-ui">$15,600</text>
    <rect x="120" y="88" width="52" height="14" fill="#f9fafb" stroke="#e5e7eb" stroke-width="0.5"/>
    <text x="124" y="99" fill="#374151" font-size="8" font-family="system-ui">$14,950</text>
    <rect x="8" y="106" width="60" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="12" y="117" fill="#166534" font-size="9" font-family="system-ui" font-weight="700">Total</text>
    <rect x="68" y="106" width="52" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="72" y="117" fill="#166534" font-size="9" font-family="system-ui" font-weight="700">$91,050</text>
    <rect x="120" y="106" width="52" height="14" fill="#dcfce7" stroke="#bbf7d0" stroke-width="0.5"/>
    <text x="124" y="117" fill="#166534" font-size="9" font-family="system-ui" font-weight="700">$89,050</text>
  </svg>`;
}

function renderPdfThumbnail(url, container) {
  if (!window.pdfjsLib || !url) return;

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  pdfjsLib.getDocument(url).promise.then(pdf => {
    return pdf.getPage(1);
  }).then(page => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Render at a size that fits the thumbnail container
    const thumbWidth = container.clientWidth || 180;
    const viewport = page.getViewport({ scale: 1 });
    const scale = thumbWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    page.render({ canvasContext: ctx, viewport: scaledViewport }).promise.then(() => {
      container.innerHTML = '';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'cover';
      container.appendChild(canvas);
    });
  }).catch(() => {
    // Silently fail - keep the icon placeholder
  });
}

// Document view mode state
let jobDocViewMode = 'list';
let docsPageJobViewMode = 'list';
let docsPageBizViewMode = 'list';

function createViewToggle(currentMode, onToggle) {
  const container = document.createElement('div');
  container.className = 'kh-view-toggle';

  const listBtn = document.createElement('button');
  listBtn.className = `kh-view-toggle__btn${currentMode === 'list' ? ' is-active' : ''}`;
  listBtn.type = 'button';
  listBtn.title = 'List view';
  listBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';

  const gridBtn = document.createElement('button');
  gridBtn.className = `kh-view-toggle__btn${currentMode === 'grid' ? ' is-active' : ''}`;
  gridBtn.type = 'button';
  gridBtn.title = 'Grid view';
  gridBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';

  listBtn.addEventListener('click', () => {
    if (currentMode === 'list') return;
    currentMode = 'list';
    listBtn.classList.add('is-active');
    gridBtn.classList.remove('is-active');
    onToggle('list');
  });

  gridBtn.addEventListener('click', () => {
    if (currentMode === 'grid') return;
    currentMode = 'grid';
    gridBtn.classList.add('is-active');
    listBtn.classList.remove('is-active');
    onToggle('grid');
  });

  container.appendChild(listBtn);
  container.appendChild(gridBtn);
  return container;
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
 * Shows line items with status and dates in a table layout
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

  // Add header row
  const header = document.createElement('li');
  header.className = 'kh-schedule-item kh-schedule-item--header';
  header.innerHTML = `
    <div class="kh-schedule-item__name">Item</div>
    <div class="kh-schedule-item__status-col">Status</div>
    <div class="kh-schedule-item__date-col">Est. Start</div>
    <div class="kh-schedule-item__date-col">Est. End</div>
    <div class="kh-schedule-item__date-col">Act. Start</div>
    <div class="kh-schedule-item__date-col">Act. End</div>
  `;
  scheduleList.appendChild(header);

  lineItems.forEach(item => {
    const li = document.createElement('li');
    li.className = 'kh-schedule-item';

    const status = item.status || 'Not Started';
    const statusClass = status.toLowerCase().replace(/\s+/g, '-');

    const schedule = item.schedule || {};
    const estStart = schedule.startDate ? formatDateDisplay(schedule.startDate) : '—';
    const estEnd = schedule.endDate ? formatDateDisplay(schedule.endDate) : '—';
    const actStart = schedule.actualStartDate ? formatDateDisplay(schedule.actualStartDate) : '—';
    const actEnd = schedule.actualEndDate ? formatDateDisplay(schedule.actualEndDate) : '—';

    li.innerHTML = `
      <div class="kh-schedule-item__name">${item.name}</div>
      <div class="kh-schedule-item__status-col">
        <span class="kh-schedule-item__status kh-schedule-item__status--${statusClass}">${status}</span>
      </div>
      <div class="kh-schedule-item__date-col">${estStart}</div>
      <div class="kh-schedule-item__date-col">${estEnd}</div>
      <div class="kh-schedule-item__date-col kh-schedule-item__date-col--actual">${actStart}</div>
      <div class="kh-schedule-item__date-col kh-schedule-item__date-col--actual">${actEnd}</div>
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
    initDashboardCalendar(allJobs); // Initialize calendar below jobs list
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

  // View toggle for job documents
  const jobDocsToggleContainer = document.getElementById("job-docs-page-view-toggle");
  if (jobDocsToggleContainer) {
    jobDocsToggleContainer.appendChild(createViewToggle(docsPageJobViewMode, (mode) => {
      docsPageJobViewMode = mode;
      applyDocumentFilters();
    }));
  }

  // View toggle for business documents
  const bizDocsToggleContainer = document.getElementById("biz-doc-view-toggle");
  if (bizDocsToggleContainer) {
    bizDocsToggleContainer.appendChild(createViewToggle(docsPageBizViewMode, (mode) => {
      docsPageBizViewMode = mode;
      applyBusinessDocumentFilters();
    }));
  }

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

  // Apply grid/list class
  list.classList.toggle("kh-documents--grid", jobDocViewMode === "grid");

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

    if (jobDocViewMode === "grid") {
      // Grid card layout
      let thumbHtml;
      const showPdfThumb = isPdfFile(doc.name) && doc.url && !doc.deletedAt;
      if (isImageFile(doc.name) && doc.url && !doc.deletedAt) {
        thumbHtml = `<img src="${doc.url}" loading="lazy" alt="${doc.name || 'Document'}" />`;
      } else if (isExcelFile(doc.name)) {
        thumbHtml = getExcelThumbnailSvg();
      } else {
        thumbHtml = `<span class="kh-doc-icon--large">${getDocumentIcon(type.icon)}</span>`;
      }

      item.innerHTML = `
        <div class="kh-doc-card-link">
          <div class="kh-doc-thumb">${thumbHtml}</div>
          <div class="kh-doc-card-body">
            <div class="kh-doc-card-name">${doc.name || "Document"}</div>
            <div class="kh-doc-meta">${doc.documentType || "—"} · ${formatDate(doc.createdAt)}</div>
          </div>
        </div>
        <div class="kh-doc-card-footer">
          <button class="kh-link" data-doc-id="${doc.id}">${doc.deletedAt ? "Restore" : "Trash"}</button>
        </div>
      `;
      if (doc.url && !doc.deletedAt) {
        item.querySelector(".kh-doc-card-link").style.cursor = "pointer";
        item.querySelector(".kh-doc-card-link").addEventListener("click", () => {
          window.open(doc.url, "_blank", "noopener");
        });
      }
      if (showPdfThumb) {
        renderPdfThumbnail(doc.url, item.querySelector(".kh-doc-thumb"));
      }
    } else {
      // List layout (original)
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
    }

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

// ==========================================
// Tasks Page
// ==========================================

function getPriorityClass(priority) {
  const map = { 'Low': 'low', 'Medium': 'medium', 'High': 'high', 'Urgent': 'urgent' };
  return map[priority] || 'medium';
}

function getTaskStatusClass(status) {
  const map = {
    'Not Started': 'not-started',
    'In Progress': 'in-progress',
    'Complete': 'complete',
    'On Hold': 'on-hold',
    'Blocked': 'blocked',
    'Cancelled': 'cancelled'
  };
  return map[status] || 'not-started';
}

// Assignee color map — central definition for per-user pill colors
const ASSIGNEE_COLORS = {
  'arne':   { bg: '#FF9500', text: '#fff' },
  'justin': { bg: '#FF5F1F', text: '#fff' },
  'raquel': { bg: '#E8198B', text: '#fff' },
  'kelli':  { bg: '#E8198B', text: '#fff' }
};

function getAssigneeTag(username) {
  const colors = ASSIGNEE_COLORS[username.toLowerCase()];
  if (colors) {
    return `<span class="kh-assignee-tag" style="background:${colors.bg};color:${colors.text}">${username}</span>`;
  }
  return `<span class="kh-assignee-tag">${username}</span>`;
}

// Compact date formatting for task table
function formatTaskDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { month: date.toLocaleDateString("en-US", { month: "short" }), day: date.getDate(), year: date.getFullYear(), raw: date };
}

function formatTaskDateRange(startDate, endDate) {
  const s = formatTaskDate(startDate);
  const e = formatTaskDate(endDate);
  if (!s && !e) return null;
  if (s && !e) return `${s.month} ${s.day}, ${s.year}`;
  if (!s && e) return `${e.month} ${e.day}, ${e.year}`;
  // Both dates present
  if (s.year === e.year) {
    return `${s.month} ${s.day} \u2013 ${e.month} ${e.day}, ${e.year}`;
  }
  return `${s.month} ${s.day}, ${s.year} \u2013 ${e.month} ${e.day}, ${e.year}`;
}

// Sort state for tasks table
let tasksSortColumn = "priority";
let tasksSortAsc = true; // true = default order (Urgent first for priority)

const PRIORITY_ORDER = { 'Urgent': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
const STATUS_ORDER = { 'Not Started': 0, 'In Progress': 1, 'On Hold': 2, 'Blocked': 3, 'Complete': 4, 'Cancelled': 5 };

function sortTasks(tasks, column, asc) {
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case "task":
        cmp = (a.title || "").localeCompare(b.title || "");
        break;
      case "priority":
        cmp = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
        break;
      case "status":
        cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
        break;
      case "assignees": {
        const aa = (a.assignees || [])[0] || "\uffff";
        const ba = (b.assignees || [])[0] || "\uffff";
        cmp = aa.localeCompare(ba);
        break;
      }
      case "job": {
        const aj = a.jobName || "\uffff";
        const bj = b.jobName || "\uffff";
        cmp = aj.localeCompare(bj);
        break;
      }
      case "dates": {
        const ad = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const bd = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        cmp = ad - bd;
        break;
      }
    }
    return asc ? cmp : -cmp;
  });
  return sorted;
}

function updateSortIndicators() {
  const table = document.querySelector(".kh-table--tasks");
  if (!table) return;
  table.querySelectorAll("th[data-sort]").forEach(th => {
    const arrow = th.querySelector(".kh-sort-arrow");
    if (!arrow) return;
    if (th.dataset.sort === tasksSortColumn) {
      th.classList.add("kh-sort-active");
      arrow.textContent = tasksSortAsc ? "▲" : "▼";
    } else {
      th.classList.remove("kh-sort-active");
      arrow.textContent = "";
    }
  });
}

function renderTasksTable(tasks, containerId = "tasks-table-body") {
  const tableBody = document.getElementById(containerId);
  if (!tableBody) return;

  // Clean up any body-appended kebab menus from previous render
  document.querySelectorAll("body > .kh-kebab__menu").forEach(m => m.remove());
  tableBody.innerHTML = "";
  updateSortIndicators();

  if (!tasks.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7">No tasks found.</td>';
    tableBody.appendChild(row);
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("tr");

    // Task title + description
    const titleCell = document.createElement("td");
    titleCell.innerHTML = `
      <div class="kh-task-title" title="${task.title}">${task.title}</div>
      ${task.description ? `<div class="kh-task-desc" title="${task.description}">${task.description}</div>` : ''}
    `;

    // Priority pill
    const priorityCell = document.createElement("td");
    priorityCell.innerHTML = `<span class="kh-priority kh-priority--${getPriorityClass(task.priority)}">${task.priority}</span>`;

    // Status pill
    const statusCell = document.createElement("td");
    statusCell.innerHTML = `<span class="kh-task-status kh-task-status--${getTaskStatusClass(task.status)}">${task.status}</span>`;

    // Assignees
    const assigneesCell = document.createElement("td");
    const assignees = task.assignees || [];
    if (assignees.length > 0) {
      assigneesCell.innerHTML = `<div class="kh-assignee-list">${assignees.map(a => getAssigneeTag(a)).join('')}</div>`;
    } else {
      assigneesCell.innerHTML = '<span class="kh-empty-dash">&mdash;</span>';
    }

    // Job
    const jobCell = document.createElement("td");
    if (task.jobId && task.jobName) {
      const jobLink = document.createElement("a");
      jobLink.href = `job.html?jobId=${task.jobId}`;
      jobLink.className = "kh-link kh-task-job-link";
      jobLink.textContent = task.jobName;
      jobLink.title = task.jobName;
      jobCell.appendChild(jobLink);
    } else {
      jobCell.innerHTML = '<span class="kh-empty-dash">&mdash;</span>';
    }

    // Dates
    const datesCell = document.createElement("td");
    const dateStr = formatTaskDateRange(task.startDate, task.endDate);
    if (dateStr) {
      datesCell.innerHTML = `<span style="font-size: 12px; white-space: nowrap;">${dateStr}</span>`;
    } else {
      datesCell.innerHTML = '<span class="kh-empty-dash">&mdash;</span>';
    }

    // Actions — kebab menu (menu appended to body to escape table overflow)
    const actionsCell = document.createElement("td");
    const trigger = document.createElement("button");
    trigger.className = "kh-kebab__trigger";
    trigger.innerHTML = "&#8942;";

    const menu = document.createElement("div");
    menu.className = "kh-kebab__menu";

    const editItem = document.createElement("button");
    editItem.className = "kh-kebab__item";
    editItem.textContent = "Edit";
    editItem.addEventListener("click", () => { menu.classList.remove("is-open"); openTaskModal(task); });

    const deleteItem = document.createElement("button");
    deleteItem.className = "kh-kebab__item kh-kebab__item--danger";
    deleteItem.textContent = "Delete";
    deleteItem.addEventListener("click", async () => {
      menu.classList.remove("is-open");
      if (!confirm(`Delete task "${task.title}"?`)) return;
      try {
        await deleteTask(task.id);
        setMessage("tasks-message", "Task deleted.");
        refreshTasksList();
      } catch (error) {
        console.error("Failed to delete task:", error);
        setMessage("tasks-message", "Failed to delete task.", true);
      }
    });

    menu.appendChild(editItem);
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".kh-kebab__menu.is-open").forEach(m => { if (m !== menu) m.classList.remove("is-open"); });
      const rect = trigger.getBoundingClientRect();
      menu.style.top = (rect.bottom + 4) + "px";
      menu.style.left = (rect.right - 110) + "px";
      menu.classList.toggle("is-open");
    });

    actionsCell.appendChild(trigger);

    row.append(titleCell, priorityCell, statusCell, assigneesCell, jobCell, datesCell, actionsCell);
    tableBody.appendChild(row);
  });
}

let tasksPageJobs = [];
let tasksPageUsers = [];
let tasksPageAllTasks = [];

function openTaskModal(task = null, presetJobId = null) {
  const modal = document.getElementById("task-modal");
  const form = document.getElementById("task-form");
  const title = document.getElementById("task-modal-title");
  const submitBtn = document.getElementById("task-form-submit");
  const idField = document.getElementById("task-form-id");

  if (!modal || !form) return;

  form.reset();
  idField.value = "";

  // Populate job select
  const jobSelect = document.getElementById("task-form-job");
  if (jobSelect) {
    jobSelect.innerHTML = '<option value="">No job linked</option>';
    tasksPageJobs.forEach(job => {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = job.name;
      jobSelect.appendChild(opt);
    });
  }

  // Populate assignees checkboxes
  const assigneesContainer = document.getElementById("task-form-assignees");
  if (assigneesContainer) {
    assigneesContainer.innerHTML = "";
    tasksPageUsers.forEach(username => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = username;
      cb.name = "assignees";
      label.appendChild(cb);
      label.appendChild(document.createTextNode(username));
      assigneesContainer.appendChild(label);
    });
  }

  if (task) {
    // Edit mode
    title.textContent = "Edit Task";
    submitBtn.textContent = "Save Changes";
    idField.value = task.id;
    document.getElementById("task-form-title").value = task.title || "";
    document.getElementById("task-form-description").value = task.description || "";
    document.getElementById("task-form-priority").value = task.priority || "Medium";
    document.getElementById("task-form-status").value = task.status || "Not Started";
    document.getElementById("task-form-start-date").value = task.startDate ? task.startDate.split('T')[0] : "";
    document.getElementById("task-form-end-date").value = task.endDate ? task.endDate.split('T')[0] : "";
    if (jobSelect) jobSelect.value = task.jobId || "";

    // Check assignees
    const assignees = task.assignees || [];
    assigneesContainer?.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = assignees.includes(cb.value);
    });
  } else {
    // Create mode
    title.textContent = "Create Task";
    submitBtn.textContent = "Create Task";
    if (presetJobId && jobSelect) {
      jobSelect.value = presetJobId;
    }
  }

  modal.removeAttribute("hidden");
}

function closeTaskModal() {
  const modal = document.getElementById("task-modal");
  if (modal) modal.setAttribute("hidden", "");
}

async function refreshTasksList() {
  try {
    tasksPageAllTasks = await fetchTasks() || [];
    applyTasksFilters();
  } catch (error) {
    console.error("Failed to refresh tasks:", error);
  }
}

function applyTasksFilters() {
  const status = document.getElementById("tasks-filter-status")?.value || "";
  const priority = document.getElementById("tasks-filter-priority")?.value || "";
  const assignee = document.getElementById("tasks-filter-assignee")?.value || "";
  const jobId = document.getElementById("tasks-filter-job")?.value || "";
  const hideCompleted = document.getElementById("tasks-hide-completed")?.checked || false;

  let filtered = tasksPageAllTasks;

  if (status) filtered = filtered.filter(t => t.status === status);
  if (priority) filtered = filtered.filter(t => t.priority === priority);
  if (assignee) filtered = filtered.filter(t => (t.assignees || []).includes(assignee));
  if (jobId) filtered = filtered.filter(t => String(t.jobId) === jobId);
  if (hideCompleted) filtered = filtered.filter(t => t.status !== 'Complete' && t.status !== 'Cancelled');

  filtered = sortTasks(filtered, tasksSortColumn, tasksSortAsc);
  renderTasksTable(filtered);
}

async function initTasksPage() {
  // Load jobs, users, and tasks in parallel
  try {
    const [jobs, users, tasks] = await Promise.all([
      fetchJobs(),
      fetchUsers(),
      fetchTasks()
    ]);

    tasksPageJobs = jobs || [];
    tasksPageUsers = users || [];
    tasksPageAllTasks = tasks || [];

    // Populate filter dropdowns
    const assigneeFilter = document.getElementById("tasks-filter-assignee");
    if (assigneeFilter) {
      tasksPageUsers.forEach(username => {
        const opt = document.createElement("option");
        opt.value = username;
        opt.textContent = username;
        assigneeFilter.appendChild(opt);
      });
    }

    const jobFilter = document.getElementById("tasks-filter-job");
    if (jobFilter) {
      tasksPageJobs.forEach(job => {
        const opt = document.createElement("option");
        opt.value = job.id;
        opt.textContent = job.name;
        jobFilter.appendChild(opt);
      });
    }

    // Apply initial filters
    applyTasksFilters();
  } catch (error) {
    console.error("Failed to initialize tasks page:", error);
    setMessage("tasks-message", "Failed to load tasks.", true);
  }

  // Wire up filter events
  ["tasks-filter-status", "tasks-filter-priority", "tasks-filter-assignee", "tasks-filter-job", "tasks-hide-completed"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyTasksFilters);
  });

  // Wire up sortable column headers
  document.querySelectorAll(".kh-table--tasks th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (tasksSortColumn === col) {
        tasksSortAsc = !tasksSortAsc;
      } else {
        tasksSortColumn = col;
        tasksSortAsc = true;
      }
      applyTasksFilters();
    });
  });

  // Close kebab menus on outside click
  document.addEventListener("click", () => {
    document.querySelectorAll(".kh-kebab__menu.is-open").forEach(m => m.classList.remove("is-open"));
  });

  // Wire up create button
  const createBtn = document.getElementById("create-task-button");
  if (createBtn) {
    createBtn.addEventListener("click", () => openTaskModal());
  }

  // Wire up modal close
  const closeBtn = document.getElementById("close-task-modal");
  const cancelBtn = document.getElementById("cancel-task-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeTaskModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeTaskModal);

  const modal = document.getElementById("task-modal");
  const overlay = modal?.querySelector(".kh-modal__overlay");
  if (overlay) {
    overlay.addEventListener("click", closeTaskModal);
  }

  // Wire up form submission
  const form = document.getElementById("task-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const idField = document.getElementById("task-form-id");
      const isEdit = Boolean(idField?.value);
      const submitBtn = document.getElementById("task-form-submit");

      // Collect assignees
      const assignees = [];
      document.querySelectorAll('#task-form-assignees input[type="checkbox"]:checked').forEach(cb => {
        assignees.push(cb.value);
      });

      const payload = {
        title: document.getElementById("task-form-title").value,
        description: document.getElementById("task-form-description").value,
        priority: document.getElementById("task-form-priority").value,
        status: document.getElementById("task-form-status").value,
        startDate: document.getElementById("task-form-start-date").value || null,
        endDate: document.getElementById("task-form-end-date").value || null,
        jobId: document.getElementById("task-form-job").value || null,
        assignees
      };

      setButtonLoading(submitBtn, "Saving...");

      try {
        if (isEdit) {
          await updateTask(idField.value, payload);
          setMessage("tasks-message", "Task updated.");
        } else {
          await createTask(payload);
          setMessage("tasks-message", "Task created.");
        }
        closeTaskModal();
        refreshTasksList();
      } catch (error) {
        console.error("Failed to save task:", error);
        setMessage("task-form-message", `Failed to ${isEdit ? 'update' : 'create'} task.`, true);
      } finally {
        resetButton(submitBtn);
      }
    });
  }
}

// ==========================================
// Job Detail - Tasks Tab
// ==========================================

let jobDetailUsers = [];

function renderJobTasksTable(tasks, jobId) {
  const tableBody = document.getElementById("job-tasks-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!tasks.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">No tasks for this job.</td>';
    tableBody.appendChild(row);
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("tr");

    const titleCell = document.createElement("td");
    titleCell.innerHTML = `
      <div class="kh-task-title" title="${task.title}">${task.title}</div>
      ${task.description ? `<div class="kh-task-desc" title="${task.description}">${task.description}</div>` : ''}
    `;

    const priorityCell = document.createElement("td");
    priorityCell.innerHTML = `<span class="kh-priority kh-priority--${getPriorityClass(task.priority)}">${task.priority}</span>`;

    const statusCell = document.createElement("td");
    statusCell.innerHTML = `<span class="kh-task-status kh-task-status--${getTaskStatusClass(task.status)}">${task.status}</span>`;

    const assigneesCell = document.createElement("td");
    const assignees = task.assignees || [];
    if (assignees.length > 0) {
      assigneesCell.innerHTML = `<div class="kh-assignee-list">${assignees.map(a => getAssigneeTag(a)).join('')}</div>`;
    } else {
      assigneesCell.innerHTML = '<span class="kh-empty-dash">&mdash;</span>';
    }

    const datesCell = document.createElement("td");
    const jobDateStr = formatTaskDateRange(task.startDate, task.endDate);
    if (jobDateStr) {
      datesCell.innerHTML = `<span style="font-size: 12px; white-space: nowrap;">${jobDateStr}</span>`;
    } else {
      datesCell.innerHTML = '<span class="kh-empty-dash">&mdash;</span>';
    }

    const actionsCell = document.createElement("td");
    const jobTrigger = document.createElement("button");
    jobTrigger.className = "kh-kebab__trigger";
    jobTrigger.innerHTML = "&#8942;";

    const jobMenu = document.createElement("div");
    jobMenu.className = "kh-kebab__menu";

    const jobEditItem = document.createElement("button");
    jobEditItem.className = "kh-kebab__item";
    jobEditItem.textContent = "Edit";
    jobEditItem.addEventListener("click", () => { jobMenu.classList.remove("is-open"); openJobTaskModal(task, jobId); });

    const jobDeleteItem = document.createElement("button");
    jobDeleteItem.className = "kh-kebab__item kh-kebab__item--danger";
    jobDeleteItem.textContent = "Delete";
    jobDeleteItem.addEventListener("click", async () => {
      jobMenu.classList.remove("is-open");
      if (!confirm(`Delete task "${task.title}"?`)) return;
      try {
        await deleteTask(task.id);
        setMessage("job-tasks-message", "Task deleted.");
        loadJobTasks(jobId);
      } catch (error) {
        console.error("Failed to delete task:", error);
        setMessage("job-tasks-message", "Failed to delete task.", true);
      }
    });

    jobMenu.appendChild(jobEditItem);
    jobMenu.appendChild(jobDeleteItem);
    document.body.appendChild(jobMenu);

    jobTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".kh-kebab__menu.is-open").forEach(m => { if (m !== jobMenu) m.classList.remove("is-open"); });
      const rect = jobTrigger.getBoundingClientRect();
      jobMenu.style.top = (rect.bottom + 4) + "px";
      jobMenu.style.left = (rect.right - 110) + "px";
      jobMenu.classList.toggle("is-open");
    });

    actionsCell.appendChild(jobTrigger);

    row.append(titleCell, priorityCell, statusCell, assigneesCell, datesCell, actionsCell);
    tableBody.appendChild(row);
  });
}

async function loadJobTasks(jobId) {
  try {
    const tasks = await fetchTasks({ jobId });
    renderJobTasksTable(tasks || [], jobId);
  } catch (error) {
    console.error("Failed to load job tasks:", error);
    setMessage("job-tasks-message", "Failed to load tasks.", true);
  }
}

function openJobTaskModal(task = null, jobId = null) {
  const modal = document.getElementById("job-task-modal");
  const form = document.getElementById("job-task-form");
  const title = document.getElementById("job-task-modal-title");
  const submitBtn = document.getElementById("job-task-form-submit");
  const idField = document.getElementById("job-task-form-id");

  if (!modal || !form) return;

  form.reset();
  idField.value = "";

  // Populate assignees checkboxes
  const assigneesContainer = document.getElementById("job-task-form-assignees");
  if (assigneesContainer) {
    assigneesContainer.innerHTML = "";
    jobDetailUsers.forEach(username => {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = username;
      cb.name = "assignees";
      label.appendChild(cb);
      label.appendChild(document.createTextNode(username));
      assigneesContainer.appendChild(label);
    });
  }

  if (task) {
    title.textContent = "Edit Task";
    submitBtn.textContent = "Save Changes";
    idField.value = task.id;
    document.getElementById("job-task-form-title").value = task.title || "";
    document.getElementById("job-task-form-description").value = task.description || "";
    document.getElementById("job-task-form-priority").value = task.priority || "Medium";
    document.getElementById("job-task-form-status").value = task.status || "Not Started";
    document.getElementById("job-task-form-start-date").value = task.startDate ? task.startDate.split('T')[0] : "";
    document.getElementById("job-task-form-end-date").value = task.endDate ? task.endDate.split('T')[0] : "";

    const assignees = task.assignees || [];
    assigneesContainer?.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = assignees.includes(cb.value);
    });
  } else {
    title.textContent = "Add Task";
    submitBtn.textContent = "Add Task";
  }

  modal.removeAttribute("hidden");
}

function closeJobTaskModal() {
  const modal = document.getElementById("job-task-modal");
  if (modal) modal.setAttribute("hidden", "");
}

function initJobTasksTab(jobId) {
  // Load users for assignee picker
  fetchUsers().then(users => {
    jobDetailUsers = users || [];
  }).catch(() => {
    jobDetailUsers = [];
  });

  // Load tasks
  loadJobTasks(jobId);

  // Wire up Add Task button
  const addBtn = document.getElementById("add-job-task-button");
  if (addBtn) {
    addBtn.addEventListener("click", () => openJobTaskModal(null, jobId));
  }

  // Wire up modal close
  const closeBtn = document.getElementById("close-job-task-modal");
  const cancelBtn = document.getElementById("cancel-job-task-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeJobTaskModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeJobTaskModal);

  const modal = document.getElementById("job-task-modal");
  const overlay = modal?.querySelector(".kh-modal__overlay");
  if (overlay) overlay.addEventListener("click", closeJobTaskModal);

  // Wire up form
  const form = document.getElementById("job-task-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const idField = document.getElementById("job-task-form-id");
      const isEdit = Boolean(idField?.value);
      const submitBtn = document.getElementById("job-task-form-submit");

      const assignees = [];
      document.querySelectorAll('#job-task-form-assignees input[type="checkbox"]:checked').forEach(cb => {
        assignees.push(cb.value);
      });

      const payload = {
        title: document.getElementById("job-task-form-title").value,
        description: document.getElementById("job-task-form-description").value,
        priority: document.getElementById("job-task-form-priority").value,
        status: document.getElementById("job-task-form-status").value,
        startDate: document.getElementById("job-task-form-start-date").value || null,
        endDate: document.getElementById("job-task-form-end-date").value || null,
        jobId: jobId,
        assignees
      };

      setButtonLoading(submitBtn, "Saving...");

      try {
        if (isEdit) {
          await updateTask(idField.value, payload);
          setMessage("job-tasks-message", "Task updated.");
        } else {
          await createTask(payload);
          setMessage("job-tasks-message", "Task added.");
        }
        closeJobTaskModal();
        loadJobTasks(jobId);
      } catch (error) {
        console.error("Failed to save task:", error);
        setMessage("job-task-form-message", `Failed to ${isEdit ? 'update' : 'create'} task.`, true);
      } finally {
        resetButton(submitBtn);
      }
    });
  }
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
  initJobTasksTab(jobId);

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

  // Document view toggle
  const docToggleContainer = document.getElementById("job-doc-view-toggle");
  if (docToggleContainer) {
    docToggleContainer.appendChild(createViewToggle(jobDocViewMode, (mode) => {
      jobDocViewMode = mode;
      loadDocuments(jobId);
    }));
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

// ==========================================
// Wasteland — Inventory Tracking
// ==========================================

const INVENTORY_CATEGORIES = [
  "Tile", "Lumber", "Hardware", "Plumbing", "Electrical", "Paint",
  "Flooring", "Roofing", "Insulation", "Drywall", "Fixtures", "Appliances", "Other"
];

let wastelandJobs = [];
let wastelandAllItems = [];
let wastelandViewMode = "grid";

function applyInventoryFilters() {
  const search = (document.getElementById("inventory-search")?.value || "").toLowerCase();
  const status = document.getElementById("inventory-filter-status")?.value || "";
  const category = document.getElementById("inventory-filter-category")?.value || "";

  const filtered = wastelandAllItems.filter(item => {
    if (status && item.status !== status) return false;
    if (category && item.category !== category) return false;
    if (search) {
      const haystack = `${item.name} ${item.description || ""} ${item.notes || ""} ${item.category || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  renderInventory(filtered);
}

function renderInventory(items) {
  const container = document.getElementById("inventory-content");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="kh-wasteland-empty">
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Ground line -->
          <path d="M0 52c10-2 20 1 30-1s20-3 30 0 15 2 20-1" stroke="#c4a872" stroke-width="1.5" fill="none"/>
          <!-- Distant crate outline -->
          <rect x="20" y="34" width="14" height="12" rx="1" stroke="#c4a872" stroke-width="1.2" opacity="0.4" stroke-dasharray="3 2"/>
          <!-- Tumbleweed -->
          <circle cx="55" cy="44" r="6" stroke="#c4a872" stroke-width="1" opacity="0.3" stroke-dasharray="2 2"/>
          <circle cx="55" cy="44" r="3" stroke="#c4a872" stroke-width="0.8" opacity="0.2" stroke-dasharray="1.5 1.5"/>
          <!-- Wind lines -->
          <line x1="10" y1="28" x2="22" y2="28" stroke="#c4a872" stroke-width="0.8" opacity="0.2" stroke-linecap="round"/>
          <line x1="14" y1="32" x2="28" y2="31" stroke="#c4a872" stroke-width="0.8" opacity="0.15" stroke-linecap="round"/>
          <line x1="50" y1="26" x2="62" y2="25" stroke="#c4a872" stroke-width="0.8" opacity="0.15" stroke-linecap="round"/>
        </svg>
        <p style="margin-top:16px;font-weight:700;color:#5c4a1e;letter-spacing:1.5px;text-transform:uppercase;font-size:14px;">Nothing in the wasteland</p>
        <p style="color:#8b7a55;font-size:13px;margin-top:4px;">Salvage your first leftover to stock the yard.</p>
      </div>`;
    return;
  }

  if (wastelandViewMode === "grid") {
    renderInventoryGrid(container, items);
  } else {
    renderInventoryTable(container, items);
  }
}

function getCategoryIcon(category) {
  const s = 'stroke="#8b6914" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const icons = {
    Tile:        `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="6" y="6" width="10" height="10" rx="1"/><rect x="20" y="6" width="10" height="10" rx="1"/><rect x="6" y="20" width="10" height="10" rx="1"/><rect x="20" y="20" width="10" height="10" rx="1"/></svg>`,
    Lumber:      `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="4" y="14" width="28" height="8" rx="2"/><line x1="10" y1="14" x2="10" y2="22"/><line x1="18" y1="14" x2="18" y2="22"/><line x1="26" y1="14" x2="26" y2="22"/><circle cx="14" cy="18" r="1.5" fill="#8b6914" opacity="0.3"/></svg>`,
    Hardware:    `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><circle cx="18" cy="14" r="3"/><path d="M18 17v6"/><path d="M14 28l4-5 4 5"/><path d="M12 10l-3-3M24 10l3-3"/></svg>`,
    Plumbing:    `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><path d="M10 8v10a4 4 0 004 4h8a4 4 0 004-4V8"/><line x1="10" y1="8" x2="26" y2="8"/><path d="M18 22v8"/><circle cx="18" cy="30" r="2" fill="#8b6914" opacity="0.2"/></svg>`,
    Electrical:  `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><path d="M20 4L14 18h8L16 32" stroke-width="2.2"/></svg>`,
    Paint:       `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="8" y="14" width="20" height="16" rx="2"/><path d="M12 14V10a2 2 0 012-2h8a2 2 0 012 2v4"/><path d="M14 22c0-2 4-2 4 0s4 2 4 0" stroke-width="1.5"/></svg>`,
    Flooring:    `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><path d="M4 28L18 8l14 20H4z"/><line x1="11" y1="18" x2="25" y2="18"/><line x1="18" y1="8" x2="18" y2="28"/></svg>`,
    Roofing:     `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><path d="M4 20L18 8l14 12"/><path d="M7 18.5L18 10l11 8.5"/><line x1="8" y1="20" x2="8" y2="30"/><line x1="28" y1="20" x2="28" y2="30"/><line x1="8" y1="30" x2="28" y2="30"/></svg>`,
    Insulation:  `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><path d="M8 10c4 0 4 4 8 4s4-4 8-4"/><path d="M8 18c4 0 4 4 8 4s4-4 8-4"/><path d="M8 26c4 0 4 4 8 4s4-4 8-4"/></svg>`,
    Drywall:     `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="6" y="8" width="24" height="20" rx="1"/><line x1="6" y1="18" x2="30" y2="18"/><circle cx="10" cy="12" r="1" fill="#8b6914" opacity="0.4"/><circle cx="26" cy="12" r="1" fill="#8b6914" opacity="0.4"/><circle cx="10" cy="24" r="1" fill="#8b6914" opacity="0.4"/><circle cx="26" cy="24" r="1" fill="#8b6914" opacity="0.4"/></svg>`,
    Fixtures:    `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><circle cx="18" cy="14" r="6"/><path d="M14 20l-2 10h12l-2-10"/><line x1="18" y1="8" x2="18" y2="12"/><line x1="12" y1="10" x2="14" y2="12.5"/><line x1="24" y1="10" x2="22" y2="12.5"/></svg>`,
    Appliances:  `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="8" y="6" width="20" height="24" rx="2"/><line x1="8" y1="14" x2="28" y2="14"/><circle cx="18" cy="10" r="2"/><rect x="12" y="18" width="12" height="8" rx="1" fill="#8b6914" opacity="0.08"/></svg>`,
  };
  return icons[category] || `<svg width="36" height="36" viewBox="0 0 36 36" ${s}><rect x="8" y="12" width="20" height="16" rx="2"/><path d="M12 12V9a2 2 0 012-2h8a2 2 0 012 2v3"/><line x1="14" y1="20" x2="22" y2="20"/></svg>`;
}

function renderInventoryGrid(container, items) {
  const grid = document.createElement("ul");
  grid.className = "kh-documents--grid";
  grid.style.listStyle = "none";
  grid.style.padding = "0";

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = item.status === "Claimed" ? "kh-inv-claimed" : "";

    const catIcon = getCategoryIcon(item.category);
    const thumbHtml = item.photoUrl
      ? `<img src="${item.photoUrl}" alt="${item.name}" />`
      : `<div class="kh-inv-placeholder">${catIcon}</div>`;

    const statusClass = item.status === "Available" ? "kh-inv-status--available" : "kh-inv-status--claimed";

    let metaLine = item.category || "";
    if (item.quantity > 1) metaLine += ` · Qty: ${item.quantity}`;

    let jobLine = "";
    if (item.status === "Claimed" && item.destinationJobName) {
      jobLine = `<div class="kh-inv-job">Claimed for: ${item.destinationJobName}</div>`;
    } else if (item.sourceJobName) {
      jobLine = `<div class="kh-inv-job">From: ${item.sourceJobName}</div>`;
    }

    li.innerHTML = `
      <div class="kh-doc-card-link kh-inv-card-link">
        <div class="kh-doc-thumb">${thumbHtml}</div>
        <div class="kh-doc-card-body">
          <div class="kh-doc-card-name">${item.name}</div>
          <div class="kh-doc-meta">
            <span class="kh-inv-status ${statusClass}">${item.status}</span>
            ${metaLine ? ` · ${metaLine}` : ""}
          </div>
          ${jobLine}
        </div>
      </div>
      <div class="kh-doc-card-footer kh-inv-actions"></div>
    `;

    const actions = li.querySelector(".kh-inv-actions");
    renderItemActions(actions, item);

    li.querySelector(".kh-inv-card-link").addEventListener("click", () => openInventoryModal(item));

    container.appendChild(li);
    grid.appendChild(li);
  });

  container.innerHTML = "";
  container.appendChild(grid);
}

function renderInventoryTable(container, items) {
  const html = `
    <div class="kh-panel">
      <div class="kh-table-wrap">
        <table class="kh-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Source Job</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body"></tbody>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;

  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  items.forEach(item => {
    const row = document.createElement("tr");
    if (item.status === "Claimed") row.className = "kh-inv-claimed";

    const statusClass = item.status === "Available" ? "kh-inv-status--available" : "kh-inv-status--claimed";

    row.innerHTML = `
      <td><a href="#" class="kh-link kh-inv-edit-link">${item.name}</a></td>
      <td>${item.category || "—"}</td>
      <td>${item.quantity || 1}</td>
      <td><span class="kh-inv-status ${statusClass}">${item.status}</span></td>
      <td>${item.status === "Claimed" ? (item.destinationJobName || "—") : (item.sourceJobName || "—")}</td>
      <td>${formatDate(item.createdAt)}</td>
      <td class="kh-inv-actions"></td>
    `;

    row.querySelector(".kh-inv-edit-link").addEventListener("click", (e) => {
      e.preventDefault();
      openInventoryModal(item);
    });

    const actions = row.querySelector(".kh-inv-actions");
    renderItemActions(actions, item);

    tbody.appendChild(row);
  });
}

function renderItemActions(container, item) {
  if (item.status === "Available") {
    const claimBtn = document.createElement("button");
    claimBtn.className = "kh-button kh-button--secondary kh-button--small";
    claimBtn.textContent = "Claim";
    claimBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openClaimModal(item);
    });
    container.appendChild(claimBtn);
  } else {
    const unclaimBtn = document.createElement("button");
    unclaimBtn.className = "kh-button kh-button--secondary kh-button--small";
    unclaimBtn.textContent = "Unclaim";
    unclaimBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await unclaimInventoryItem(item.id);
        setMessage("inventory-message", "Item unclaimed.");
        refreshInventory();
      } catch (err) {
        console.error("Failed to unclaim:", err);
        setMessage("inventory-message", "Failed to unclaim item.", true);
      }
    });
    container.appendChild(unclaimBtn);
  }
}

async function refreshInventory() {
  try {
    wastelandAllItems = await fetchInventoryItems() || [];
    applyInventoryFilters();
  } catch (err) {
    console.error("Failed to refresh inventory:", err);
  }
}

function openInventoryModal(item = null) {
  const modal = document.getElementById("inventory-modal");
  const title = document.getElementById("inventory-modal-title");
  const submitBtn = document.getElementById("inventory-form-submit");
  const form = document.getElementById("inventory-form");
  const preview = document.getElementById("inventory-form-photo-preview");

  if (!modal || !form) return;

  form.reset();
  document.getElementById("inventory-form-id").value = "";
  if (preview) preview.innerHTML = "";

  // Populate source job dropdown
  const jobSelect = document.getElementById("inventory-form-source-job");
  if (jobSelect) {
    jobSelect.innerHTML = '<option value="">None</option>';
    wastelandJobs.forEach(job => {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = job.name;
      jobSelect.appendChild(opt);
    });
  }

  if (item) {
    title.textContent = "Edit Item";
    submitBtn.textContent = "Save Changes";
    document.getElementById("inventory-form-id").value = item.id;
    document.getElementById("inventory-form-name").value = item.name || "";
    document.getElementById("inventory-form-quantity").value = item.quantity || 1;
    document.getElementById("inventory-form-category").value = item.category || "Other";
    document.getElementById("inventory-form-description").value = item.description || "";
    document.getElementById("inventory-form-notes").value = item.notes || "";
    if (jobSelect && item.sourceJobId) jobSelect.value = item.sourceJobId;
    if (preview && item.photoUrl) {
      preview.innerHTML = `<img src="${item.photoUrl}" style="max-width:200px;max-height:120px;border-radius:6px;" />`;
    }
  } else {
    title.textContent = "Add Item";
    submitBtn.textContent = "Add Item";
  }

  modal.hidden = false;
}

function closeInventoryModal() {
  const modal = document.getElementById("inventory-modal");
  if (modal) modal.hidden = true;
}

function openClaimModal(item) {
  const modal = document.getElementById("claim-modal");
  if (!modal) return;

  document.getElementById("claim-form-item-id").value = item.id;
  document.getElementById("claim-item-name").textContent = item.name;

  const jobSelect = document.getElementById("claim-form-job");
  if (jobSelect) {
    jobSelect.innerHTML = '<option value="">Select a job...</option>';
    wastelandJobs.forEach(job => {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = job.name;
      jobSelect.appendChild(opt);
    });
  }

  document.getElementById("claim-form-message").textContent = "";
  modal.hidden = false;
}

function closeClaimModal() {
  const modal = document.getElementById("claim-modal");
  if (modal) modal.hidden = true;
}

async function initWastelandPage() {
  // Load jobs and inventory in parallel
  try {
    const [jobs, items] = await Promise.all([
      fetchJobs(),
      fetchInventoryItems()
    ]);

    wastelandJobs = jobs || [];
    wastelandAllItems = items || [];

    applyInventoryFilters();
  } catch (error) {
    console.error("Failed to initialize Wasteland page:", error);
    setMessage("inventory-message", "Failed to load inventory.", true);
  }

  // Wire up filters
  const searchInput = document.getElementById("inventory-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => applyInventoryFilters(), 200));
  }

  ["inventory-filter-status", "inventory-filter-category"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyInventoryFilters);
  });

  // Wire up view toggle
  const gridBtn = document.getElementById("inventory-view-grid");
  const listBtn = document.getElementById("inventory-view-list");
  if (gridBtn) {
    gridBtn.addEventListener("click", () => {
      wastelandViewMode = "grid";
      gridBtn.classList.add("is-active");
      listBtn?.classList.remove("is-active");
      applyInventoryFilters();
    });
  }
  if (listBtn) {
    listBtn.addEventListener("click", () => {
      wastelandViewMode = "list";
      listBtn.classList.add("is-active");
      gridBtn?.classList.remove("is-active");
      applyInventoryFilters();
    });
  }

  // Wire up add button
  const addBtn = document.getElementById("add-inventory-button");
  if (addBtn) addBtn.addEventListener("click", () => openInventoryModal());

  // Wire up inventory modal close
  const closeBtn = document.getElementById("close-inventory-modal");
  const cancelBtn = document.getElementById("cancel-inventory-modal");
  if (closeBtn) closeBtn.addEventListener("click", closeInventoryModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeInventoryModal);

  const modal = document.getElementById("inventory-modal");
  const overlay = modal?.querySelector(".kh-modal__overlay");
  if (overlay) overlay.addEventListener("click", closeInventoryModal);

  // Wire up inventory form submission
  const form = document.getElementById("inventory-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idField = document.getElementById("inventory-form-id");
      const isEdit = Boolean(idField?.value);
      const submitBtn = document.getElementById("inventory-form-submit");

      const payload = {
        name: document.getElementById("inventory-form-name").value,
        quantity: parseInt(document.getElementById("inventory-form-quantity").value) || 1,
        category: document.getElementById("inventory-form-category").value,
        sourceJobId: document.getElementById("inventory-form-source-job").value || null,
        description: document.getElementById("inventory-form-description").value,
        notes: document.getElementById("inventory-form-notes").value
      };

      setButtonLoading(submitBtn, "Saving...");

      try {
        let savedItem;
        if (isEdit) {
          savedItem = await updateInventoryItem(idField.value, payload);
        } else {
          savedItem = await createInventoryItem(payload);
        }

        // Handle photo upload if file selected
        const photoInput = document.getElementById("inventory-form-photo");
        const file = photoInput?.files[0];
        if (file && savedItem?.id) {
          try {
            const { uploadUrl } = await requestInventoryPhotoUpload(savedItem.id, file);
            await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file
            });
          } catch (photoErr) {
            console.error("Photo upload failed:", photoErr);
            setMessage("inventory-message", "Item saved, but photo upload failed.", true);
          }
        }

        closeInventoryModal();
        setMessage("inventory-message", isEdit ? "Item updated." : "Item added.");
        refreshInventory();
      } catch (error) {
        console.error("Failed to save item:", error);
        setMessage("inventory-form-message", `Failed to ${isEdit ? 'update' : 'add'} item.`, true);
      } finally {
        resetButton(submitBtn);
      }
    });
  }

  // Wire up claim modal
  const closeClaimBtn = document.getElementById("close-claim-modal");
  const cancelClaimBtn = document.getElementById("cancel-claim-modal");
  if (closeClaimBtn) closeClaimBtn.addEventListener("click", closeClaimModal);
  if (cancelClaimBtn) cancelClaimBtn.addEventListener("click", closeClaimModal);

  const claimModal = document.getElementById("claim-modal");
  const claimOverlay = claimModal?.querySelector(".kh-modal__overlay");
  if (claimOverlay) claimOverlay.addEventListener("click", closeClaimModal);

  const claimForm = document.getElementById("claim-form");
  if (claimForm) {
    claimForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const itemId = document.getElementById("claim-form-item-id").value;
      const jobId = document.getElementById("claim-form-job").value;
      const submitBtn = document.getElementById("claim-form-submit");

      if (!jobId) {
        setMessage("claim-form-message", "Please select a job.", true);
        return;
      }

      setButtonLoading(submitBtn, "Claiming...");

      try {
        await claimInventoryItem(itemId, jobId);
        closeClaimModal();
        setMessage("inventory-message", "Item claimed.");
        refreshInventory();
      } catch (error) {
        console.error("Failed to claim item:", error);
        setMessage("claim-form-message", "Failed to claim item.", true);
      } finally {
        resetButton(submitBtn);
      }
    });
  }
}

// Initialize authentication and page
(async () => {
  const authReady = await initLoginFlow();
  if (authReady) {
    if (isJobDetailPage()) {
      initJobDetailPage();
    } else if (isTasksPage()) {
      initTasksPage();
    } else if (isDocumentsPage()) {
      initDocumentsPage();
    } else if (isWastelandPage()) {
      initWastelandPage();
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
