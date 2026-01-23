/**
 * Kelli Homes Job Management - Main UI Logic
 * WITH SECURE AUTHENTICATION
 *
 * This replaces the old main.js with secure backend authentication.
 * The authentication code has been moved to auth.js.
 */

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
  updateDocumentType
} from "./api.js";

import {
  isAuthenticated,
  getCurrentUser,
  login,
  logout
} from "./auth.js";

// All the constants remain the same
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

// All utility functions remain the same
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
      input.blur();
    });
  });
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

function validateClientContact(form, messageId) {
  const email = String(form.clientEmail?.value || "").trim();
  const phone = String(form.clientPhone?.value || "").trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[0-9+().\-\s]*$/;
  const digits = phone.replace(/\D/g, "");

  if (email && !emailPattern.test(email)) {
    setMessage(messageId, "Enter a valid client email address.", true);
    form.clientEmail.focus();
    return false;
  }

  if (phone) {
    if (!phonePattern.test(phone) || digits.length < 7) {
      setMessage(messageId, "Enter a valid client phone number.", true);
      form.clientPhone.focus();
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
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select document type";
  select.appendChild(placeholder);

  DOCUMENT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type.value;
    option.textContent = type.value;
    select.appendChild(option);
  });
}

// UPDATED: New authentication UI functions
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

// UPDATED: New secure login flow
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

// All the rendering functions remain exactly the same
// (renderSummary, renderJobsTable, populateDocumentFilters, renderDocumentsTable, etc.)
// Copying them here for completeness...