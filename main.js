import {
  fetchJobs,
  fetchJobById,
  createJob,
  updateJob,
  deleteJob,
  fetchJobLineItems,
  saveJobLineItems,
  fetchJobDocuments,
  requestDocumentUpload,
  deleteDocument
} from "./api.js";

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
const AUTH_USERS = [
  { username: "arne", password: "$yd3JAC9" },
  { username: "raquel", password: "elizabeth1" },
  { username: "justin", password: "Aryna2026" }
];
const AUTH_STORAGE_KEY = "kh-auth-user";

function isJobDetailPage() {
  return window.location.pathname.endsWith("job.html");
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

function getAuthenticatedUser() {
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

function setAuthenticatedUser(username) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, username);
}

function isAuthenticated() {
  return Boolean(getAuthenticatedUser());
}

function updateSignedInUser() {
  const user = getAuthenticatedUser();
  const label = document.getElementById("signed-in-user");
  if (label) {
    label.textContent = user ? `Signed in as ${user}` : "Signed in as —";
  }
}

function showLogin() {
  document.body.classList.add("kh-auth-locked");
  const panel = document.getElementById("login-panel");
  if (panel) {
    panel.hidden = false;
  }
}

function hideLogin() {
  document.body.classList.remove("kh-auth-locked");
  const panel = document.getElementById("login-panel");
  if (panel) {
    panel.hidden = true;
  }
}

function initLoginFlow() {
  const form = document.getElementById("login-form");
  if (!form) return false;

  if (!isAuthenticated()) {
    showLogin();
  } else {
    hideLogin();
  }

  updateSignedInUser();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setMessage("login-message", "Signing in...");
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    const match = AUTH_USERS.find(
      (user) => user.username === username && user.password === password
    );

    if (!match) {
      setMessage("login-message", "Invalid login. Please try again.", true);
      return;
    }

    setAuthenticatedUser(match.username);
    updateSignedInUser();
    hideLogin();

    if (isJobDetailPage()) {
      initJobDetailPage();
    } else {
      initDashboardPage();
    }
  });

  return isAuthenticated();
}

function renderSummary(jobs) {
  const active = jobs.filter((job) =>
    ["construction", "punch"].includes(String(job.stage).toLowerCase())
  ).length;
  const precon = jobs.filter((job) =>
    ["preconstruction", "estimating"].includes(String(job.stage).toLowerCase())
  ).length;
  const currentYear = new Date().getFullYear();
  const closedThisYear = jobs.filter((job) => {
    if (String(job.stage).toLowerCase() !== "closed") return false;
    const completion = new Date(job.targetCompletion);
    return completion.getFullYear() === currentYear;
  }).length;

  setText("summary-active", String(active));
  setText("summary-precon", String(precon));
  setText("summary-closed", String(closedThisYear));
}

function renderJobsTable(jobs) {
  const tableBody = document.getElementById("jobs-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!jobs.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7">No jobs yet. Create one to get started.</td>';
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

    const healthCell = document.createElement("td");
    healthCell.appendChild(createPill(job.health || "—", healthClass(job.health)));

    row.append(jobCell, clientCell, stageCell, typeCell, startCell, targetCell, healthCell);

    row.addEventListener("click", () => {
      window.location.href = `job.html?jobId=${encodeURIComponent(job.id)}`;
    });

    tableBody.appendChild(row);
  });
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

function renderLineItems(tbodyId, items = []) {
  const tableBody = document.getElementById(tbodyId);
  if (!tableBody) return;

  const lineItemMap = buildLineItemsMap(items);
  tableBody.innerHTML = "";

  LINE_ITEM_CATALOG.forEach((catalogItem) => {
    const existing = lineItemMap.get(catalogItem.code) || {};
    const row = document.createElement("tr");
    row.dataset.code = catalogItem.code;
    row.dataset.name = catalogItem.name;

    const itemCell = document.createElement("td");
    itemCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${catalogItem.group}: ${catalogItem.name}</div>
        <div class="kh-job__meta">${catalogItem.description || ""}</div>
      </div>
    `;

    const budgetCell = document.createElement("td");
    budgetCell.innerHTML = `<input type="text" value="${existing.budget || ""}" />`;

    const actualCell = document.createElement("td");
    actualCell.innerHTML = `<input type="text" value="${existing.actual || ""}" />`;

    const statusCell = document.createElement("td");
    const statusSelect = document.createElement("select");
    LINE_ITEM_STATUSES.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      if ((existing.status || "") === status) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    });
    statusCell.appendChild(statusSelect);

    const vendorCell = document.createElement("td");
    vendorCell.innerHTML = `<input type="text" value="${existing.vendor || ""}" />`;

    const notesCell = document.createElement("td");
    notesCell.innerHTML = `<textarea>${existing.notes || ""}</textarea>`;

    row.append(itemCell, budgetCell, actualCell, statusCell, vendorCell, notesCell);
    tableBody.appendChild(row);
  });
}

function collectLineItems(tbodyId) {
  const tableBody = document.getElementById(tbodyId);
  if (!tableBody) return [];

  const rows = Array.from(tableBody.querySelectorAll("tr"));
  return rows
    .map((row) => {
      const inputs = row.querySelectorAll("input, select, textarea");
      const [budget, actual, status, vendor, notes] = inputs;

      const entry = {
        code: row.dataset.code,
        name: row.dataset.name,
        budget: budget.value.trim(),
        actual: actual.value.trim(),
        status: status.value,
        vendor: vendor.value.trim(),
        notes: notes.value.trim()
      };

      const hasValues =
        entry.budget || entry.actual || entry.vendor || entry.notes || entry.status !== "Not Started";

      return hasValues ? entry : null;
    })
    .filter(Boolean);
}

async function initDashboardPage() {
  const createPanel = document.getElementById("create-job-panel");
  const createButton = document.getElementById("create-job-button");
  const cancelButton = document.getElementById("create-job-cancel");
  const form = document.getElementById("job-create-form");

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

  renderLineItems("create-line-items-body");

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("create-job-message", "Saving job...");

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.lineItems = collectLineItems("create-line-items-body");

      try {
        const created = await createJob(payload);
        setMessage("create-job-message", "Job created.");
        if (created && created.id) {
          window.location.href = `job.html?jobId=${encodeURIComponent(created.id)}`;
        } else {
          form.reset();
        }
      } catch (error) {
        console.error("Failed to create job.", error);
        setMessage("create-job-message", "Failed to create job. Check API setup.", true);
      }
    });
  }

  try {
    const jobs = await fetchJobs();
    renderSummary(jobs);
    renderJobsTable(jobs);
  } catch (error) {
    console.error("Failed to initialize dashboard.", error);
    renderSummary([]);
    renderJobsTable([]);
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

  setText("glance-status", job.status);
  setText("glance-phase", job.phase);
  setText("glance-start", formatDate(job.startDate));
  setText("glance-target", formatDate(job.targetCompletion));
  setText("glance-client", job.client);
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
    (job.milestones || []).forEach((milestone) => {
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
  form.stage.value = job.stage || "Preconstruction";
  form.type.value = job.type || "";
  form.status.value = job.status || "";
  form.startDate.value = job.startDate || "";
  form.targetCompletion.value = job.targetCompletion || "";
  form.primaryContact.value = job.primaryContact || "";
  form.health.value = job.health || "On Track";
}

async function loadDocuments(jobId) {
  try {
    const documents = await fetchJobDocuments(jobId);
    renderDocuments(jobId, documents || []);
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
    const item = document.createElement("li");
    item.innerHTML = `
      <a href="${doc.url || "#"}" target="_blank" rel="noopener">${doc.name || "Document"}</a>
      <button class="kh-link" data-doc-id="${doc.id}">Remove</button>
    `;
    item.querySelector("button").addEventListener("click", async () => {
      try {
        await deleteDocument(jobId, doc.id);
        loadDocuments(jobId);
      } catch (error) {
        console.error("Failed to delete document.", error);
        setMessage("documents-message", "Unable to remove document.", true);
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

  const editPanel = document.getElementById("edit-job-panel");
  const editButton = document.getElementById("edit-job-button");
  const editCancel = document.getElementById("edit-job-cancel");
  const editForm = document.getElementById("job-edit-form");
  const deleteButton = document.getElementById("delete-job-button");
  const saveLineItemsButton = document.getElementById("save-line-items");

  if (editButton && editPanel) {
    editButton.addEventListener("click", () => {
      editPanel.hidden = false;
      editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (editCancel && editPanel) {
    editCancel.addEventListener("click", () => {
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
    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("edit-job-message", "Saving changes...");
      const formData = new FormData(editForm);
      const payload = Object.fromEntries(formData.entries());
      try {
        const updated = await updateJob(jobId, payload);
        setMessage("edit-job-message", "Job updated.");
        editPanel.hidden = true;
        renderJobDetail(updated || payload);
      } catch (error) {
        console.error("Failed to update job.", error);
        setMessage("edit-job-message", "Failed to update job.", true);
      }
    });
  }

  if (saveLineItemsButton) {
    saveLineItemsButton.addEventListener("click", async () => {
      setMessage("line-items-message", "Saving line items...");
      const lineItems = collectLineItems("line-items-body");
      try {
        await saveJobLineItems(jobId, lineItems);
        setMessage("line-items-message", "Line items saved.");
      } catch (error) {
        console.error("Failed to save line items.", error);
        setMessage("line-items-message", "Unable to save line items.", true);
      }
    });
  }

  const uploadInput = document.getElementById("document-upload");
  if (uploadInput) {
    uploadInput.addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      setMessage("documents-message", "Uploading document...");
      try {
        const response = await requestDocumentUpload(jobId, file);
        await fetch(response.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });
        setMessage("documents-message", "Document uploaded.");
        uploadInput.value = "";
        await loadDocuments(jobId);
      } catch (error) {
        console.error("Failed to upload document.", error);
        setMessage("documents-message", "Unable to upload document.", true);
      }
    });
  }

  try {
    const job = await fetchJobById(jobId);
    if (!job) {
      showJobNotFound();
      return;
    }
    renderJobDetail(job);
    fillEditForm(job);

    try {
      const lineItems = await fetchJobLineItems(jobId);
      renderLineItems("line-items-body", lineItems || []);
    } catch (error) {
      console.error("Failed to load line items.", error);
      renderLineItems("line-items-body", []);
      setMessage("line-items-message", "Unable to load line items.", true);
    }

    await loadDocuments(jobId);
  } catch (error) {
    console.error("Failed to load job detail.", error);
    showJobNotFound();
  }
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

const authReady = initLoginFlow();
if (authReady) {
  if (isJobDetailPage()) {
    initJobDetailPage();
  } else {
    initDashboardPage();
  }
}
