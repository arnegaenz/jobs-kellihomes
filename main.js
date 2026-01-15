import { fetchJobs, fetchJobById } from "./api.js";

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

function stageClass(stage) {
  return "kh-pill--stage";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value || "—";
  }
}

function renderSummary(jobs) {
  const active = jobs.filter((job) =>
    ["construction", "punch"].includes(String(job.stage).toLowerCase())
  ).length;
  const precon = jobs.filter((job) =>
    ["design", "estimating"].includes(String(job.stage).toLowerCase())
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

  jobs.forEach((job) => {
    const row = document.createElement("tr");
    row.className = "kh-table__row";
    row.dataset.jobId = job.id;

    const jobCell = document.createElement("td");
    jobCell.innerHTML = `
      <div class="kh-job">
        <div class="kh-job__name">${job.name}</div>
        <div class="kh-job__meta">${job.location}</div>
      </div>
    `;

    const clientCell = document.createElement("td");
    clientCell.textContent = job.client;

    const stageCell = document.createElement("td");
    stageCell.appendChild(createPill(job.stage, stageClass(job.stage)));

    const typeCell = document.createElement("td");
    typeCell.textContent = job.type;

    const startCell = document.createElement("td");
    startCell.textContent = formatDate(job.startDate);

    const targetCell = document.createElement("td");
    targetCell.textContent = formatDate(job.targetCompletion);

    const healthCell = document.createElement("td");
    healthCell.appendChild(createPill(job.health, healthClass(job.health)));

    row.append(jobCell, clientCell, stageCell, typeCell, startCell, targetCell, healthCell);

    row.addEventListener("click", () => {
      window.location.href = `job.html?jobId=${encodeURIComponent(job.id)}`;
    });

    tableBody.appendChild(row);
  });
}

async function initDashboardPage() {
  try {
    const jobs = await fetchJobs();
    renderSummary(jobs);
    renderJobsTable(jobs);
  } catch (error) {
    console.error("Failed to initialize dashboard.", error);
  }
}

function renderJobDetail(job) {
  setText("job-title", job.name);
  setText("job-subtitle", `${job.location} · ${job.type} · Kelli Homes`);

  const stagePill = document.getElementById("job-stage-pill");
  if (stagePill) {
    stagePill.textContent = job.stage;
    stagePill.className = `kh-pill ${stageClass(job.stage)}`;
  }

  setText("glance-status", job.status);
  setText("glance-phase", job.phase);
  setText("glance-start", formatDate(job.startDate));
  setText("glance-target", formatDate(job.targetCompletion));
  setText("glance-client", job.client);
  setText("glance-contact", job.primaryContact);

  setText("fin-contract", job.financials.contractValue);
  setText("fin-supplements", job.financials.supplements);
  setText("fin-costs", job.financials.costsToDate);
  setText("fin-margin", job.financials.projectedMargin);

  const marginStatus = document.getElementById("fin-margin-status");
  if (marginStatus) {
    marginStatus.textContent = job.financials.marginStatus;
    marginStatus.className = `kh-pill ${healthClass(job.financials.marginStatus)}`;
  }

  const milestonesList = document.getElementById("milestones-list");
  if (milestonesList) {
    milestonesList.innerHTML = "";
    job.milestones.forEach((milestone) => {
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

async function initJobDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("jobId");

  if (!jobId) {
    showJobNotFound();
    return;
  }

  try {
    const job = await fetchJobById(jobId);
    if (!job) {
      showJobNotFound();
      return;
    }
    renderJobDetail(job);
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

if (isJobDetailPage()) {
  initJobDetailPage();
} else {
  initDashboardPage();
}
