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

// Team members — each gets their own personalized daily email.
// Set enabled: false to skip sending (testing phase).
const TEAM = [
  { username: 'arne', email: 'arne@kellihomes.com', enabled: true },
  { username: 'raquel', email: 'raquel@kellihomes.com', enabled: true },
  { username: 'justin', email: 'justin@kellihomes.com', enabled: true },
];
const SENDER = 'noreply@kellihomes.com';
// Weekly digest goes to all enabled team members
const WEEKLY_RECIPIENTS = TEAM.filter((m) => m.enabled).map((m) => m.email);
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
    <td style="width:108px;vertical-align:middle;">
      <img src="${LOGO_URL}" alt="Kelli Homes" width="100" height="100" style="display:block;border-radius:6px;" />
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

async function sendEmail(subject, html, recipients) {
  const toAddresses = Array.isArray(recipients) ? recipients : [recipients];
  const sesClient = createSESClient();
  const command = new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: toAddresses },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  });
  await sesClient.send(command);
}

// ─── DAILY DIGEST (Personalized per team member) ────────────────────

/**
 * Fetch all active tasks with assignees.
 * Active = In Progress, On Hold, or Not Started that should have started / is due.
 */
async function fetchDailyTasks() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      t.id,
      t.title,
      t.description,
      t.job_id AS "jobId",
      j.name AS "jobName",
      t.priority,
      t.status,
      t.start_date AS "startDate",
      t.end_date AS "endDate",
      COALESCE(array_agg(ta.username) FILTER (WHERE ta.username IS NOT NULL), '{}') AS assignees
    FROM tasks t
    LEFT JOIN jobs j ON t.job_id = j.id
    LEFT JOIN task_assignees ta ON ta.task_id = t.id
    WHERE t.status NOT IN ('Complete', 'Cancelled')
      AND (
        t.status IN ('In Progress', 'On Hold')
        OR (
          t.status = 'Not Started'
          AND (
            (t.start_date IS NOT NULL AND t.start_date <= CURRENT_DATE)
            OR (t.end_date IS NOT NULL AND t.end_date <= CURRENT_DATE)
          )
        )
      )
    GROUP BY t.id, j.name
    ORDER BY
      CASE t.priority
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        WHEN 'Low' THEN 4
        ELSE 5
      END,
      t.end_date NULLS LAST,
      t.title
  `);

  return result.rows;
}

/**
 * Fetch calendar items — line items actively on the schedule today.
 * Includes:
 * - Items whose date range covers today (startDate <= today AND endDate >= today)
 * - In Progress items that have started (still active even if past end date)
 * - Not Started items that should have started (overdue start)
 * Excludes Complete items and Closed jobs.
 */
async function fetchDailyCalendar() {
  const pool = getPool();
  const result = await pool.query(`
    SELECT
      j.id AS "jobId",
      j.name AS "jobName",
      li.code,
      li.name,
      li.status,
      li.vendor,
      li.schedule
    FROM line_items li
    JOIN jobs j ON j.id = li.job_id
    WHERE j.stage != 'Closed'
      AND li.status != 'Complete'
      AND li.schedule IS NOT NULL
      AND (li.schedule->>'startDate') IS NOT NULL
      AND (li.schedule->>'startDate')::date <= CURRENT_DATE
    ORDER BY j.name, li.code
  `);

  return result.rows;
}

// Keep fetchDailyData as an alias for backward compat with test script
async function fetchDailyData() {
  return fetchDailyTasks();
}

/**
 * Build personalized daily digest HTML for one team member.
 * Layout: Your Tasks → Teammates → Today's Calendar
 */
function buildDailyHtml(tasks, calendarItems, date, forUsername) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });

  const displayName = forUsername.charAt(0).toUpperCase() + forUsername.slice(1);

  // Split tasks: mine vs teammates vs unassigned
  const myTasks = [];
  const teammateTasks = {}; // { username: [tasks] }
  const unassignedTasks = [];

  for (const task of tasks) {
    const assignees = task.assignees || [];
    if (assignees.length === 0) {
      unassignedTasks.push(task);
    } else if (assignees.includes(forUsername)) {
      myTasks.push(task);
    } else {
      // Group by first assignee for display
      for (const person of assignees) {
        if (!teammateTasks[person]) teammateTasks[person] = [];
        teammateTasks[person].push(task);
      }
    }
  }

  const teammates = Object.keys(teammateTasks).sort();

  // Counts for summary bar
  const myCount = myTasks.length;
  const totalTasks = tasks.length;
  const overdueCount = myTasks.filter((t) => {
    if (!t.endDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(t.endDate) < today;
  }).length;
  const calendarCount = calendarItems.length;

  // ── Build sections ──

  // 1. Your Tasks
  let mySection = '';
  if (myTasks.length > 0) {
    mySection = buildTaskSection(`Your Tasks`, myTasks, true);
  } else {
    mySection = `<tr>
<td style="padding:16px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:15px;font-weight:700;color:${BRAND.dark};padding-bottom:8px;border-bottom:2px solid ${BRAND.taupe};">Your Tasks</td></tr>
  </table>
</td>
</tr>
<tr><td style="padding:8px 32px 16px;color:${BRAND.muted};font-size:14px;">No tasks assigned to you right now.</td></tr>`;
  }

  // 2. Teammates
  let teammateSection = '';
  if (teammates.length > 0) {
    teammateSection = `<tr>
<td style="padding:20px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="font-size:13px;font-weight:700;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;">Teammates</td></tr>
  </table>
</td>
</tr>`;
    for (const mate of teammates) {
      const mateName = mate.charAt(0).toUpperCase() + mate.slice(1);
      teammateSection += buildTaskSection(mateName, teammateTasks[mate], false);
    }
  }

  // Unassigned tasks
  if (unassignedTasks.length > 0) {
    teammateSection += buildTaskSection('Unassigned', unassignedTasks, false);
  }

  // 3. Today's Calendar
  let calendarSection = '';
  if (calendarItems.length > 0) {
    calendarSection = buildCalendarSection(calendarItems);
  }

  const content = `
${emailHeader('Daily Rundown', `${dateStr} — ${displayName}`)}

<!-- Summary Stats -->
<tr>
<td style="padding:20px 32px 12px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${myCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Your Tasks</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${totalTasks}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Team Total</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${overdueCount > 0 ? BRAND.red : BRAND.dark};">${overdueCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Overdue</div>
    </td>
    <td style="text-align:center;padding:8px 4px;">
      <div style="font-size:28px;font-weight:700;color:${BRAND.dark};">${calendarCount}</div>
      <div style="font-size:11px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;">Calendar</div>
    </td>
  </tr>
  </table>
</td>
</tr>

${mySection}
${teammateSection}
${calendarSection}`;

  return emailWrapper(content, `Kelli Homes Daily Rundown for ${displayName} — tasks and calendar for today.`);
}

/**
 * Build a task section with a header and task rows
 */
function buildTaskSection(heading, tasks, isPrimary) {
  const borderColor = isPrimary ? BRAND.taupe : BRAND.border;
  const headingSize = isPrimary ? '15px' : '14px';
  const headingColor = isPrimary ? BRAND.dark : BRAND.dark;
  const taskCount = tasks.length;

  const taskRows = tasks.map((task) => buildTaskRow(task)).join('\n');

  return `<tr>
<td style="padding:16px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:${headingSize};font-weight:700;color:${headingColor};padding-bottom:8px;border-bottom:2px solid ${borderColor};">
      ${escapeHtml(heading)} <span style="font-size:13px;font-weight:400;color:${BRAND.taupe};">(${taskCount})</span>
    </td>
  </tr>
  </table>
</td>
</tr>
<tr>
<td style="padding:0 32px 8px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  ${taskRows}
  </table>
</td>
</tr>`;
}

/**
 * Build a single task row
 */
function buildTaskRow(task) {
  const priorityColors = {
    'Urgent': BRAND.red,
    'High': BRAND.red,
    'Medium': BRAND.amber,
    'Low': BRAND.muted,
  };
  const statusColors = {
    'In Progress': BRAND.taupe,
    'Not Started': BRAND.amber,
    'On Hold': BRAND.red,
  };
  const priorityColor = priorityColors[task.priority] || BRAND.muted;
  const statusColor = statusColors[task.status] || BRAND.muted;

  let dueLine = '';
  if (task.endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(task.endDate);
    if (end < today) {
      const daysOver = Math.ceil((today - end) / (1000 * 60 * 60 * 24));
      dueLine = `<span style="color:${BRAND.red};font-weight:600;">${daysOver}d overdue</span>`;
    } else {
      dueLine = `Due ${formatDateShort(task.endDate)}`;
    }
  }

  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:14px;color:${BRAND.dark};font-weight:400;">
      ${task.priority === 'Urgent' || task.priority === 'High' ? `<span style="color:${priorityColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(task.priority)}</span>&nbsp;&nbsp;` : ''}${escapeHtml(task.title)}
    </td>
    <td style="text-align:right;">
      <span style="display:inline-block;background-color:${statusColor};color:${BRAND.white};font-size:11px;padding:2px 8px;border-radius:3px;letter-spacing:0.5px;">${escapeHtml(task.status)}</span>
    </td>
  </tr>
  <tr>
    <td style="padding-top:4px;font-size:12px;color:${BRAND.muted};">
      ${task.jobName ? escapeHtml(task.jobName) : ''}${task.jobName && dueLine ? ' &middot; ' : ''}${dueLine}
    </td>
    <td></td>
  </tr>
  </table>
</td>
</tr>`;
}

/**
 * Build the calendar section — line items with dates covering today
 */
function buildCalendarSection(items) {
  // Group by job
  const byJob = {};
  for (const item of items) {
    if (!byJob[item.jobId]) {
      byJob[item.jobId] = { name: item.jobName, items: [] };
    }
    byJob[item.jobId].items.push(item);
  }

  let rows = '';
  for (const [jobId, job] of Object.entries(byJob)) {
    const itemLines = job.items.map((item) => {
      const schedule = item.schedule || {};
      const endDate = schedule.actualEndDate || schedule.endDate;
      return `<tr>
<td style="padding:6px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;color:${BRAND.dark};">
  <span style="color:${BRAND.muted};font-size:11px;">${escapeHtml(item.code)}</span>&nbsp;&nbsp;${escapeHtml(item.name)}${item.vendor ? `<span style="color:${BRAND.muted};"> &middot; ${escapeHtml(item.vendor)}</span>` : ''}${endDate ? `<span style="color:${BRAND.muted};"> &middot; Ends ${formatDateShort(endDate)}</span>` : ''}
</td>
</tr>`;
    }).join('\n');

    rows += `<tr>
<td style="padding:8px 0 2px;font-size:13px;font-weight:600;color:${BRAND.dark};">
  <a href="${FRONTEND_URL}/job.html?id=${jobId}" style="color:${BRAND.dark};text-decoration:none;">${escapeHtml(job.name)}</a>
</td>
</tr>
${itemLines}`;
  }

  return `<tr>
<td style="padding:20px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="font-size:13px;font-weight:700;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:1px;padding-bottom:8px;border-bottom:2px solid ${BRAND.border};">
      Today's Calendar
    </td>
  </tr>
  </table>
</td>
</tr>
<tr>
<td style="padding:0 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  ${rows}
  </table>
</td>
</tr>`;
}

/**
 * Send personalized daily digest emails — one per enabled team member.
 */
async function sendDailyDigest() {
  const startTime = Date.now();
  logger.info('Starting personalized daily digest emails');

  try {
    const [tasks, calendarItems] = await Promise.all([
      fetchDailyTasks(),
      fetchDailyCalendar(),
    ]);
    logger.info(`Fetched ${tasks.length} active tasks and ${calendarItems.length} calendar items`);

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });

    const enabledMembers = TEAM.filter((m) => m.enabled);
    const sent = [];

    for (const member of enabledMembers) {
      const html = buildDailyHtml(tasks, calendarItems, now, member.username);
      const subject = `Kelli Homes Daily Rundown — ${dateStr}`;
      await sendEmail(subject, html, member.email);
      sent.push(member.email);
      logger.info(`Daily digest sent to ${member.username} (${member.email})`);
    }

    const duration = Date.now() - startTime;
    logger.info('All daily digest emails sent', {
      recipientCount: sent.length,
      taskCount: tasks.length,
      calendarCount: calendarItems.length,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      taskCount: tasks.length,
      calendarCount: calendarItems.length,
      // backward compat
      itemCount: tasks.length,
      recipients: sent,
    };
  } catch (error) {
    logger.error('Failed to send daily digest emails', {
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

    await sendEmail(`Kelli Homes Weekly Summary — ${dateStr}`, html, WEEKLY_RECIPIENTS);

    const duration = Date.now() - startTime;
    logger.info('Weekly digest email sent successfully', {
      recipients: WEEKLY_RECIPIENTS.length,
      jobCount: jobs.length,
      duration: `${duration}ms`,
    });

    return { success: true, jobCount: jobs.length, recipients: WEEKLY_RECIPIENTS };
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
  fetchDailyTasks,
  fetchDailyCalendar,
  buildDailyHtml,
  sendDailyDigest,
  fetchWeeklyData,
  buildWeeklyHtml,
  sendWeeklyDigest,
  sendDigestEmail,
};
