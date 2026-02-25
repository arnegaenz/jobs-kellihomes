/**
 * Email Digest Service
 *
 * Two digest types:
 * - Daily: Today's active line items across all jobs (what's happening today)
 * - Weekly: High-level job summary with budgets, timelines, progress
 *
 * Both sent via Amazon SES with Kelli Homes branding.
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { getPool } = require('../db');
const logger = require('../logger');

// Testing: send only to Arne for now. Add raquel/justin once confirmed working.
const RECIPIENTS = [
  'arne@kellihomes.com',
];
const SENDER = 'noreply@kellihomes.com';
const FRONTEND_URL = 'https://jobs.kellihomes.com';
const LOGO_URL = 'https://jobs.kellihomes.com/assets/kh-logo.png';

// Kelli Homes brand colors
const BRAND = {
  dark: '#161616',
  taupe: '#a68a79',
  taupeLight: '#c4a490',
  offWhite: '#f7f7f7',
  white: '#ffffff',
  green: '#38a169',
  red: '#c53030',
  amber: '#d69e2e',
  muted: '#8a8a8a',
  border: '#e8e0db',
};

// Stage display order for grouping
const STAGE_ORDER = [
  'In Construction',
  'Punch List',
  'Groundbreaking',
  'Permitting',
  'Preconstruction',
  'Warranty',
];

// ─── Shared Utilities ───────────────────────────────────────────────

function formatCurrency(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function emailWrapper(content, footerText) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BRAND.offWhite};font-family:Lato,'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.offWhite};padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background-color:${BRAND.white};border-radius:4px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
${content}
<!-- Footer -->
<tr>
<td style="padding:24px 32px;border-top:1px solid ${BRAND.border};text-align:center;">
  <a href="${FRONTEND_URL}" style="display:inline-block;background-color:${BRAND.dark};color:${BRAND.offWhite};text-decoration:none;padding:10px 24px;border-radius:3px;font-size:14px;font-weight:400;letter-spacing:0.5px;">Open Dashboard</a>
  <p style="color:${BRAND.muted};font-size:12px;margin-top:16px;">${footerText}</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function emailHeader(title, subtitle) {
  return `<!-- Header -->
<tr>
<td style="background-color:${BRAND.dark};padding:24px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="width:48px;vertical-align:middle;">
      <img src="${LOGO_URL}" alt="Kelli Homes" width="40" height="40" style="display:block;border-radius:4px;" />
    </td>
    <td style="vertical-align:middle;padding-left:12px;">
      <div style="color:${BRAND.offWhite};font-size:20px;font-weight:700;letter-spacing:0.5px;">${title}</div>
      <div style="color:${BRAND.taupe};font-size:13px;padding-top:2px;">${subtitle}</div>
    </td>
  </tr>
  </table>
</td>
</tr>`;
}

function createSESClient() {
  return new SESClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

async function sendEmail(subject, html) {
  const sesClient = createSESClient();
  const command = new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: RECIPIENTS },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });
  await sesClient.send(command);
}

// ─── DAILY DIGEST ───────────────────────────────────────────────────

/**
 * Fetch line items that are active today:
 * - Status is In Progress or On Hold (regardless of dates), OR
 * - Status is Not Started but scheduled to start today or earlier
 * Excludes Complete items and Closed jobs.
 */
async function fetchDailyData() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      j.id AS "jobId",
      j.name AS "jobName",
      j.location AS "jobLocation",
      j.stage AS "jobStage",
      li.code,
      li.name,
      li.status,
      li.vendor,
      li.budget,
      li.actual,
      li.schedule,
      li.notes_text AS "notes"
    FROM line_items li
    JOIN jobs j ON j.id = li.job_id
    WHERE j.stage != 'Closed'
      AND li.status != 'Complete'
      AND (
        li.status IN ('In Progress', 'On Hold')
        OR (
          li.status = 'Not Started'
          AND li.schedule IS NOT NULL
          AND (li.schedule->>'startDate') IS NOT NULL
          AND (li.schedule->>'startDate')::date <= CURRENT_DATE
        )
      )
    ORDER BY j.name, li.code
  `);

  return result.rows;
}

/**
 * Build the daily digest HTML — today's active items grouped by job
 */
function buildDailyHtml(items, date) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // Group by job
  const byJob = {};
  for (const item of items) {
    if (!byJob[item.jobId]) {
      byJob[item.jobId] = {
        name: item.jobName,
        location: item.jobLocation,
        stage: item.jobStage,
        items: [],
      };
    }
    byJob[item.jobId].items.push(item);
  }

  const jobIds = Object.keys(byJob);

  // Summary counts
  const totalItems = items.length;
  const activeJobs = jobIds.length;
  const inProgressCount = items.filter((i) => i.status === 'In Progress').length;
  const notStartedCount = items.filter((i) => i.status === 'Not Started').length;

  // Build job sections
  const jobSections = jobIds
    .map((jobId) => buildDailyJobSection(jobId, byJob[jobId]))
    .join('\n');

  // Empty state
  const emptyMessage = totalItems === 0
    ? `<tr><td style="padding:24px 32px;text-align:center;color:${BRAND.muted};font-size:15px;">No line items scheduled for today.</td></tr>`
    : '';

  const content = `
${emailHeader('Daily Rundown', dateStr)}

<!-- Summary Stats -->
<tr>
<td style="padding:20px 32px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${totalItems}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Active Items</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${activeJobs}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Jobs</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${inProgressCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">In Progress</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${notStartedCount > 0 ? BRAND.amber : BRAND.dark};">${notStartedCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Not Started</div>
    </td>
  </tr>
  </table>
</td>
</tr>

${emptyMessage}
${jobSections}`;

  return emailWrapper(content, 'Kelli Homes Daily Rundown — items active today across all jobs.');
}

function buildDailyJobSection(jobId, job) {
  const itemRows = job.items.map((item) => {
    const schedule = item.schedule || {};
    const endDate = schedule.actualEndDate || schedule.endDate;
    const budget = parseFloat(item.budget) || 0;
    const actual = parseFloat(item.actual) || 0;
    const variance = budget - actual;

    const statusColors = {
      'In Progress': BRAND.taupe,
      'Not Started': BRAND.amber,
      'On Hold': BRAND.red,
    };
    const statusColor = statusColors[item.status] || BRAND.muted;

    return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:14px;color:${BRAND.dark};font-weight:400;">
      <span style="color:${BRAND.muted};font-size:12px;">${escapeHtml(item.code)}</span>&nbsp;&nbsp;${escapeHtml(item.name)}
    </td>
    <td style="text-align:right;">
      <span style="display:inline-block;background-color:${statusColor};color:${BRAND.white};font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:0.5px;">${escapeHtml(item.status)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding-top:4px;font-size:12px;color:${BRAND.muted};">
      ${item.vendor ? 'Vendor: ' + escapeHtml(item.vendor) : ''}${item.vendor && endDate ? ' &middot; ' : ''}${endDate ? 'Ends ' + formatDateShort(endDate) : ''}
    </td>
    <td style="text-align:right;padding-top:4px;font-size:12px;color:${variance >= 0 ? BRAND.muted : BRAND.red};">
      ${budget > 0 ? formatCurrency(actual) + ' / ' + formatCurrency(budget) : ''}
    </td>
  </tr>
  </table>
</td>
</tr>`;
  }).join('\n');

  return `<tr>
<td style="padding:16px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <a href="${FRONTEND_URL}/job.html?id=${jobId}" style="font-size:15px;font-weight:700;color:${BRAND.dark};text-decoration:none;">${escapeHtml(job.name)}</a>
      <span style="font-size:12px;color:${BRAND.taupe};padding-left:8px;">${escapeHtml(job.stage)}</span>
    </td>
  </tr>
  ${job.location ? `<tr><td style="font-size:12px;color:${BRAND.muted};padding-top:2px;">${escapeHtml(job.location)}</td></tr>` : ''}
  </table>
</td>
</tr>
<tr>
<td style="padding:0 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  ${itemRows}
  </table>
</td>
</tr>`;
}

/**
 * Send the daily digest email
 */
async function sendDailyDigest() {
  const startTime = Date.now();
  logger.info('Starting daily digest email generation');

  try {
    const items = await fetchDailyData();
    logger.info(`Fetched ${items.length} active line items for daily digest`);

    const now = new Date();
    const html = buildDailyHtml(items, now);

    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });

    await sendEmail(`Kelli Homes Daily Rundown — ${dateStr}`, html);

    const duration = Date.now() - startTime;
    logger.info('Daily digest email sent successfully', {
      recipients: RECIPIENTS.length,
      itemCount: items.length,
      duration: `${duration}ms`,
    });

    return { success: true, itemCount: items.length, recipients: RECIPIENTS };
  } catch (error) {
    logger.error('Failed to send daily digest email', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// ─── WEEKLY DIGEST ──────────────────────────────────────────────────

/**
 * Fetch all non-Closed jobs with aggregated line item data
 */
async function fetchWeeklyData() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      j.id,
      j.name,
      j.location,
      j.stage,
      j.primary_contact AS "primaryContact",
      j.start_date AS "startDate",
      j.target_completion AS "targetCompletion",
      j.actual_completion AS "actualCompletion",
      COALESCE(li.total_budget, 0) AS "totalBudget",
      COALESCE(li.total_actual, 0) AS "totalActual",
      COALESCE(li.item_count, 0) AS "lineItemCount",
      COALESCE(li.completed_count, 0) AS "completedCount",
      COALESCE(li.in_progress_count, 0) AS "inProgressCount"
    FROM jobs j
    LEFT JOIN (
      SELECT
        job_id,
        SUM(budget) AS total_budget,
        SUM(actual) AS total_actual,
        COUNT(*) AS item_count,
        COUNT(*) FILTER (WHERE status = 'Complete') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'In Progress') AS in_progress_count
      FROM line_items
      GROUP BY job_id
    ) li ON li.job_id = j.id
    WHERE j.stage != 'Closed'
    ORDER BY j.stage, j.name
  `);

  return result.rows;
}

/**
 * Build the weekly digest HTML — job summary with budgets and timelines
 */
function buildWeeklyHtml(jobs, date) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  // Summary stats
  const activeJobs = jobs.length;
  const totalBudget = jobs.reduce((s, j) => s + parseFloat(j.totalBudget), 0);
  const totalSpent = jobs.reduce((s, j) => s + parseFloat(j.totalActual), 0);
  const today = new Date();
  const overdueCount = jobs.filter((j) => {
    if (!j.targetCompletion || j.actualCompletion) return false;
    return new Date(j.targetCompletion) < today;
  }).length;
  const overBudgetCount = jobs.filter(
    (j) => parseFloat(j.totalActual) > parseFloat(j.totalBudget) && parseFloat(j.totalBudget) > 0
  ).length;

  // Group jobs by stage
  const grouped = {};
  for (const job of jobs) {
    const stage = job.stage || 'Other';
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(job);
  }

  const stageSections = [];
  for (const stage of STAGE_ORDER) {
    if (!grouped[stage]) continue;
    stageSections.push(buildWeeklyStageSection(stage, grouped[stage], today));
    delete grouped[stage];
  }
  for (const [stage, stageJobs] of Object.entries(grouped)) {
    stageSections.push(buildWeeklyStageSection(stage, stageJobs, today));
  }

  const content = `
${emailHeader('Weekly Summary', dateStr)}

<!-- Summary Stats -->
<tr>
<td style="padding:20px 32px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:24px;font-weight:700;color:${BRAND.dark};">${activeJobs}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Active Jobs</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:24px;font-weight:700;color:${BRAND.dark};">${formatCurrency(totalBudget)}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Total Budget</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:24px;font-weight:700;color:${BRAND.dark};">${formatCurrency(totalSpent)}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Total Spent</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:24px;font-weight:700;color:${overdueCount > 0 ? BRAND.red : BRAND.green};">${overdueCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Overdue</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:24px;font-weight:700;color:${overBudgetCount > 0 ? BRAND.red : BRAND.green};">${overBudgetCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Over Budget</div>
    </td>
  </tr>
  </table>
</td>
</tr>

${stageSections.join('\n')}`;

  return emailWrapper(content, 'Kelli Homes Weekly Summary — all active jobs at a glance.');
}

function buildWeeklyStageSection(stage, jobs, today) {
  const jobRows = jobs.map((job) => buildWeeklyJobRow(job, today)).join('\n');

  return `<tr>
<td style="padding:16px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:13px;font-weight:700;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:2px solid ${BRAND.taupe};">
      ${escapeHtml(stage)} (${jobs.length})
    </td>
  </tr>
  </table>
</td>
</tr>
<tr>
<td style="padding:0 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  ${jobRows}
  </table>
</td>
</tr>`;
}

function buildWeeklyJobRow(job, today) {
  const budget = parseFloat(job.totalBudget);
  const actual = parseFloat(job.totalActual);
  const variance = budget - actual;
  const budgetPct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
  const budgetBarColor = variance >= 0 ? BRAND.green : BRAND.red;

  let timelineHtml = '';
  if (job.actualCompletion) {
    timelineHtml = `<span style="color:${BRAND.green};font-weight:600;">Completed</span>`;
  } else if (job.targetCompletion) {
    const target = new Date(job.targetCompletion);
    const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      timelineHtml = `<span style="color:${BRAND.red};font-weight:600;">${Math.abs(diffDays)}d overdue</span>`;
    } else if (diffDays <= 14) {
      timelineHtml = `<span style="color:${BRAND.amber};font-weight:600;">${diffDays}d remaining</span>`;
    } else {
      timelineHtml = `<span style="color:${BRAND.muted};">${diffDays}d remaining</span>`;
    }
  } else {
    timelineHtml = `<span style="color:${BRAND.muted};">No target date</span>`;
  }

  const total = parseInt(job.lineItemCount) || 0;
  const completed = parseInt(job.completedCount) || 0;
  const inProgress = parseInt(job.inProgressCount) || 0;
  let progressHtml = '';
  if (total > 0) {
    progressHtml = `<span style="color:${BRAND.muted};font-size:12px;">${completed}/${total} complete, ${inProgress} in progress</span>`;
  }

  return `<tr>
<td style="padding:12px 0;border-bottom:1px solid ${BRAND.border};">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td>
      <a href="${FRONTEND_URL}/job.html?id=${job.id}" style="color:${BRAND.dark};font-weight:600;font-size:15px;text-decoration:none;">${escapeHtml(job.name)}</a>
    </td>
    <td style="text-align:right;">
      ${timelineHtml}
    </td>
  </tr>
  <tr>
    <td style="padding-top:4px;color:${BRAND.muted};font-size:13px;">
      ${escapeHtml(job.location || '')}${job.primaryContact ? ' &middot; ' + escapeHtml(job.primaryContact) : ''}
    </td>
    <td style="text-align:right;padding-top:4px;">
      ${progressHtml}
    </td>
  </tr>
  ${budget > 0 ? `<tr>
    <td colspan="2" style="padding-top:8px;">
      <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:12px;color:${BRAND.muted};">${formatCurrency(actual)} of ${formatCurrency(budget)} (${budgetPct}%)</td>
        <td style="text-align:right;font-size:12px;color:${budgetBarColor};font-weight:600;">${variance >= 0 ? '+' : ''}${formatCurrency(variance)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:4px;">
          <div style="background-color:${BRAND.border};border-radius:3px;height:5px;overflow:hidden;">
            <div style="background-color:${budgetBarColor};height:5px;width:${Math.min(budgetPct, 100)}%;border-radius:3px;"></div>
          </div>
        </td>
      </tr>
      </table>
    </td>
  </tr>` : ''}
  </table>
</td>
</tr>`;
}

/**
 * Send the weekly digest email
 */
async function sendWeeklyDigest() {
  const startTime = Date.now();
  logger.info('Starting weekly digest email generation');

  try {
    const jobs = await fetchWeeklyData();
    logger.info(`Fetched ${jobs.length} active jobs for weekly digest`);

    const now = new Date();
    const html = buildWeeklyHtml(jobs, now);

    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });

    await sendEmail(`Kelli Homes Weekly Summary — ${dateStr}`, html);

    const duration = Date.now() - startTime;
    logger.info('Weekly digest email sent successfully', {
      recipients: RECIPIENTS.length,
      jobCount: jobs.length,
      duration: `${duration}ms`,
    });

    return { success: true, jobCount: jobs.length, recipients: RECIPIENTS };
  } catch (error) {
    logger.error('Failed to send weekly digest email', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// ─── Backward compat: sendDigestEmail = sendWeeklyDigest ────────────

const sendDigestEmail = sendWeeklyDigest;

module.exports = {
  fetchDailyData,
  buildDailyHtml,
  sendDailyDigest,
  fetchWeeklyData,
  buildWeeklyHtml,
  sendWeeklyDigest,
  sendDigestEmail,
};
