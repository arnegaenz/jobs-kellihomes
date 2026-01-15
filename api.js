/*
  API layer for Kelli Homes Job Management.
  TODO: Replace mock fallbacks once AWS endpoints are ready.
*/

const MOCK_JOBS = [
  {
    id: "kh-001",
    name: "963 Main Street",
    location: "Kirkland, WA",
    client: "Mason Family",
    stage: "Construction",
    type: "Custom Build",
    startDate: "2025-02-10",
    targetCompletion: "2025-11-20",
    health: "On Track",
    status: "In Construction",
    phase: "Drywall & Paint",
    primaryContact: "Project Manager - Kelli Homes",
    financials: {
      contractValue: "$1,420,000",
      supplements: "$48,000",
      costsToDate: "$612,500",
      projectedMargin: "24%",
      marginStatus: "On Track"
    },
    milestones: [
      { title: "Foundation", date: "2025-03-18", status: "done" },
      { title: "Framing", date: "2025-05-04", status: "done" },
      { title: "Drywall", date: "2025-07-12", status: "done" },
      { title: "Paint & Trim", date: "2025-08-20", status: "upcoming" },
      { title: "Final Walkthrough", date: "2025-11-10", status: "upcoming" }
    ]
  },
  {
    id: "kh-002",
    name: "Lynnwood Rental Refresh",
    location: "Lynnwood, WA",
    client: "Oakridge Holdings",
    stage: "Estimating",
    type: "Remodel",
    startDate: "2025-03-01",
    targetCompletion: "2025-06-15",
    health: "Watch",
    status: "In Estimating",
    phase: "Scope & Pricing",
    primaryContact: "Owner - Oakridge Holdings",
    financials: {
      contractValue: "$185,000",
      supplements: "$0",
      costsToDate: "$12,500",
      projectedMargin: "18%",
      marginStatus: "Watch"
    },
    milestones: [
      { title: "Initial Walkthrough", date: "2025-03-05", status: "done" },
      { title: "Bid Package", date: "2025-03-18", status: "done" },
      { title: "Client Approval", date: "2025-04-02", status: "upcoming" },
      { title: "Start Construction", date: "2025-04-15", status: "upcoming" }
    ]
  },
  {
    id: "kh-003",
    name: "Edmonds DADU",
    location: "Edmonds, WA",
    client: "Chen Family",
    stage: "Design",
    type: "Custom Build",
    startDate: "2025-01-12",
    targetCompletion: "2025-09-30",
    health: "On Track",
    status: "In Design",
    phase: "Permit Drawings",
    primaryContact: "Architect - Skyline Studio",
    financials: {
      contractValue: "$640,000",
      supplements: "$0",
      costsToDate: "$48,900",
      projectedMargin: "26%",
      marginStatus: "On Track"
    },
    milestones: [
      { title: "Schematic Design", date: "2025-02-02", status: "done" },
      { title: "Design Development", date: "2025-03-04", status: "done" },
      { title: "Permit Submittal", date: "2025-04-08", status: "upcoming" },
      { title: "Permit Approval", date: "2025-05-18", status: "upcoming" }
    ]
  },
  {
    id: "kh-004",
    name: "Maple Valley Restoration",
    location: "Maple Valley, WA",
    client: "State Farm",
    stage: "Closed",
    type: "Insurance Restoration",
    startDate: "2024-04-20",
    targetCompletion: "2024-11-05",
    health: "On Track",
    status: "Closed",
    phase: "Warranty",
    primaryContact: "Adjuster - State Farm",
    financials: {
      contractValue: "$310,000",
      supplements: "$26,000",
      costsToDate: "$278,400",
      projectedMargin: "12%",
      marginStatus: "On Track"
    },
    milestones: [
      { title: "Demo & Mitigation", date: "2024-05-10", status: "done" },
      { title: "Rebuild", date: "2024-08-15", status: "done" },
      { title: "Final Approval", date: "2024-10-22", status: "done" }
    ]
  }
];

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function getApiBaseUrl() {
  if (!window.KH_CONFIG || !window.KH_CONFIG.apiBaseUrl) {
    throw new Error("KH_CONFIG.apiBaseUrl is not set");
  }
  return window.KH_CONFIG.apiBaseUrl.replace(/\/$/, "");
}

export async function fetchJobs() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    return await fetchJson(`${apiBaseUrl}/jobs`);
  } catch (error) {
    console.warn("Falling back to mock jobs data.", error);
    return MOCK_JOBS;
  }
}

export async function fetchJobById(jobId) {
  const apiBaseUrl = getApiBaseUrl();
  try {
    return await fetchJson(`${apiBaseUrl}/jobs/${jobId}`);
  } catch (error) {
    console.warn("Falling back to mock job data.", error);
    return MOCK_JOBS.find((job) => job.id === jobId) || null;
  }
}

export { MOCK_JOBS };
