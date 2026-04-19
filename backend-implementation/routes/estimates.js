/**
 * Estimates routes — multiple estimates per job, each with its own line items,
 * revisions, publish state, and optional Accept (which appends to job-costing
 * line_items and bumps contract_value).
 *
 * Three routers exported:
 *   jobScoped      mounted at /jobs/:jobId/estimates   (list + create)
 *   singleScoped   mounted at /estimates/:estimateId   (per-estimate ops)
 *   legacyJobEstimate mounted at /jobs/:jobId/estimate (backward-compat shim;
 *                    resolves to the job's primary estimate, delegates to the
 *                    same internal functions)
 *
 * Until the frontend is fully migrated to the /estimates/:id surface, the
 * legacy shim keeps the existing Estimating tab working. Internally, all
 * storage is the post-migration-012 schema (estimates + estimate_line_items
 * with estimate_id). The shim auto-creates an estimate on first PUT if none
 * exists.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const { getPool } = require('../db');
const logger = require('../logger');

const PREPARERS = {
  kelli:  { name: 'Kelli Gaenz',  title: 'Owner',            email: 'kelli@kellihomes.com',  phone: '(425) 478-6058' },
  justin: { name: 'Justin Lowe',  title: 'Project Manager',  email: 'justin@kellihomes.com', phone: '(206) 321-8902' },
  arne:   { name: 'Arne Gaenz',   title: 'Special Projects', email: 'arne@kellihomes.com',   phone: '(425) 478-6057' },
};
const BUSINESS = {
  name: 'Kelli Homes',
  address: '1020 Bell St, Edmonds, WA 98020',
  license: 'KELLIHL929MJ',
  website: 'kellihomes.com',
};

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

function genId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function markupMultiplier(percent) {
  const n = parseFloat(percent) || 0;
  return 1 + (n / 100);
}

function lineItemsEqual(a, b) {
  return (a.code || '') === (b.code || '') &&
         (a.name || '') === (b.name || '') &&
         (a.description || '') === (b.description || '') &&
         parseFloat(a.cost || 0) === parseFloat(b.cost || 0);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════════════════
// Core DB operations (pool-level; take explicit estimateId / jobId)
// ══════════════════════════════════════════════════════════════════════════

async function fetchEstimateRow(pool, estimateId) {
  const result = await pool.query(
    `SELECT id, job_id AS "jobId", label, status, description,
            markup_mode AS "markupMode", markup_percent AS "markupPercent",
            prepared_by AS "preparedBy", ai_prompt AS "aiPrompt",
            ai_verbose AS "aiVerbose", current_version AS "currentVersion",
            sent_at AS "sentAt", accepted_at AS "acceptedAt",
            accepted_total AS "acceptedTotal", sort_order AS "sortOrder",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM estimates WHERE id = $1`,
    [estimateId]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    ...r,
    markupPercent: parseFloat(r.markupPercent) || 30,
    acceptedTotal: r.acceptedTotal != null ? parseFloat(r.acceptedTotal) : null,
  };
}

async function fetchEstimateWithItems(pool, estimateId) {
  const estimate = await fetchEstimateRow(pool, estimateId);
  if (!estimate) return null;
  const items = await pool.query(
    `SELECT id, code, name, description, cost,
            group_code AS "groupCode", sort_order AS "sortOrder"
     FROM estimate_line_items
     WHERE estimate_id = $1
     ORDER BY sort_order, code, name`,
    [estimateId]
  );
  return {
    ...estimate,
    lineItems: items.rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      cost: parseFloat(r.cost) || 0,
      groupCode: r.groupCode,
      sortOrder: r.sortOrder,
    })),
  };
}

async function listEstimatesForJob(pool, jobId) {
  const rows = await pool.query(
    `SELECT e.id, e.label, e.status, e.markup_mode AS "markupMode",
            e.markup_percent AS "markupPercent", e.current_version AS "currentVersion",
            e.sent_at AS "sentAt", e.accepted_at AS "acceptedAt",
            e.accepted_total AS "acceptedTotal", e.sort_order AS "sortOrder",
            e.updated_at AS "updatedAt",
            COALESCE(SUM(eli.cost), 0) AS "totalCost",
            COUNT(eli.id) AS "itemCount"
     FROM estimates e
     LEFT JOIN estimate_line_items eli ON eli.estimate_id = e.id
     WHERE e.job_id = $1
     GROUP BY e.id
     ORDER BY e.sort_order, e.created_at`,
    [jobId]
  );
  return rows.rows.map(r => {
    const cost = parseFloat(r.totalCost) || 0;
    const mult = markupMultiplier(r.markupPercent);
    return {
      id: r.id,
      label: r.label,
      status: r.status,
      markupMode: r.markupMode,
      markupPercent: parseFloat(r.markupPercent) || 30,
      currentVersion: r.currentVersion || 0,
      sentAt: r.sentAt,
      acceptedAt: r.acceptedAt,
      acceptedTotal: r.acceptedTotal != null ? parseFloat(r.acceptedTotal) : null,
      itemCount: parseInt(r.itemCount, 10) || 0,
      totalCost: cost,
      totalBid: cost * mult,
      updatedAt: r.updatedAt,
    };
  });
}

async function createEstimate(pool, jobId, label) {
  const jobRes = await pool.query(`SELECT id FROM jobs WHERE id = $1`, [jobId]);
  if (jobRes.rows.length === 0) return null;

  const id = genId('est');
  const nextSortRes = await pool.query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM estimates WHERE job_id = $1`,
    [jobId]
  );
  const sortOrder = parseInt(nextSortRes.rows[0].next, 10) || 0;

  await pool.query(
    `INSERT INTO estimates (id, job_id, label, status, sort_order)
     VALUES ($1, $2, $3, 'draft', $4)`,
    [id, jobId, label || 'New Estimate', sortOrder]
  );
  return fetchEstimateWithItems(pool, id);
}

/**
 * Legacy-shim helper: given a jobId, return the "primary" estimate for it —
 * the oldest non-archived estimate, creating one if none exists. Used by the
 * /jobs/:jobId/estimate shim so the old frontend keeps working against the
 * new schema.
 */
async function findOrCreatePrimaryEstimate(pool, jobId) {
  const existing = await pool.query(
    `SELECT id FROM estimates
     WHERE job_id = $1 AND status <> 'archived'
     ORDER BY sort_order, created_at
     LIMIT 1`,
    [jobId]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await createEstimate(pool, jobId, 'Estimate');
  return created?.id || null;
}

async function updateEstimate(pool, estimateId, payload) {
  const { label, status, description, markupMode, markupPercent,
          preparedBy, aiPrompt, aiVerbose, lineItems } = payload;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE estimates SET
         label          = COALESCE($1, label),
         status         = COALESCE($2, status),
         description    = COALESCE($3, description),
         markup_mode    = COALESCE($4, markup_mode),
         markup_percent = COALESCE($5, markup_percent),
         prepared_by    = COALESCE($6, prepared_by),
         ai_prompt      = COALESCE($7, ai_prompt),
         ai_verbose     = COALESCE($8, ai_verbose),
         updated_at     = NOW()
       WHERE id = $9`,
      [
        label != null ? label : null,
        status != null ? status : null,
        description != null ? description : null,
        markupMode != null ? markupMode : null,
        markupPercent != null ? parseFloat(markupPercent) : null,
        preparedBy !== undefined ? preparedBy : null,
        aiPrompt != null ? aiPrompt : null,
        typeof aiVerbose === 'boolean' ? aiVerbose : null,
        estimateId,
      ]
    );

    if (Array.isArray(lineItems)) {
      // Pull job_id from the estimate so we can keep estimate_line_items.job_id
      // populated for backward-compat with the old schema during transition.
      const jobRes = await client.query(
        `SELECT job_id FROM estimates WHERE id = $1`,
        [estimateId]
      );
      if (jobRes.rows.length === 0) throw new Error('Estimate not found');
      const jobId = jobRes.rows[0].job_id;

      await client.query(
        `DELETE FROM estimate_line_items WHERE estimate_id = $1`,
        [estimateId]
      );

      for (let i = 0; i < lineItems.length; i += 1) {
        const item = lineItems[i];
        await client.query(
          `INSERT INTO estimate_line_items
           (id, job_id, estimate_id, code, name, description, cost, group_code, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            genId('eli'),
            jobId,
            estimateId,
            item.code || null,
            item.name || '(unnamed)',
            item.description || '',
            parseFloat(item.cost) || 0,
            item.groupCode || null,
            typeof item.sortOrder === 'number' ? item.sortOrder : i,
          ]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return fetchEstimateWithItems(pool, estimateId);
}

async function listRevisions(pool, estimateId) {
  const result = await pool.query(
    `SELECT id, version, published_at AS "publishedAt",
            published_by AS "publishedBy", prepared_by AS "preparedBy",
            description_snapshot AS "description",
            markup_mode_snapshot AS "markupMode",
            markup_percent_snapshot AS "markupPercent",
            total_cost_snapshot AS "totalCost",
            total_bid_snapshot AS "totalBid"
     FROM estimate_revisions
     WHERE estimate_id = $1
     ORDER BY version DESC`,
    [estimateId]
  );
  return result.rows.map(r => ({
    ...r,
    markupPercent: parseFloat(r.markupPercent) || 0,
    totalCost: parseFloat(r.totalCost) || 0,
    totalBid: parseFloat(r.totalBid) || 0,
  }));
}

async function computePublishPreview(pool, estimateId) {
  const draftRes = await pool.query(
    `SELECT id, code, name, description, cost
     FROM estimate_line_items WHERE estimate_id = $1`,
    [estimateId]
  );
  const draft = draftRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));

  const latestRevRes = await pool.query(
    `SELECT id, version FROM estimate_revisions
     WHERE estimate_id = $1 ORDER BY version DESC LIMIT 1`,
    [estimateId]
  );
  const hasPrior = latestRevRes.rows.length > 0;

  let priorItems = [];
  if (hasPrior) {
    const priorRes = await pool.query(
      `SELECT code, name, description, cost FROM estimate_revision_items
       WHERE revision_id = $1`,
      [latestRevRes.rows[0].id]
    );
    priorItems = priorRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));
  }

  const keyOf = (x) => x.code ? `C:${x.code}` : `N:${x.name}`;
  const priorMap = new Map(priorItems.map(i => [keyOf(i), i]));
  const draftMap = new Map(draft.map(i => [keyOf(i), i]));

  const added = [];
  const changed = [];
  const unchanged = [];
  for (const d of draft) {
    const p = priorMap.get(keyOf(d));
    if (!p) { added.push(d); continue; }
    if (!lineItemsEqual(d, p)) changed.push({ before: p, after: d });
    else unchanged.push(d);
  }
  const removed = priorItems.filter(p => !draftMap.has(keyOf(p)));

  return {
    hasPrior,
    nextVersion: (latestRevRes.rows[0]?.version || 0) + 1,
    added, changed, removed, unchanged,
  };
}

/**
 * Publish/Send — freeze the current draft as a new revision. Marks the
 * estimate 'sent'. Does NOT touch line_items or contract_value — that's
 * what Accept does.
 */
async function publishEstimate(pool, estimateId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const estRes = await client.query(
      `SELECT id, job_id, label, description, markup_mode, markup_percent,
              prepared_by
       FROM estimates WHERE id = $1 FOR UPDATE`,
      [estimateId]
    );
    if (estRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'notfound', status: 404, message: 'Estimate not found' };
    }
    const est = estRes.rows[0];

    const draftRes = await client.query(
      `SELECT code, name, description, cost,
              group_code AS "groupCode", sort_order AS "sortOrder"
       FROM estimate_line_items WHERE estimate_id = $1
       ORDER BY sort_order, code, name`,
      [estimateId]
    );
    const draft = draftRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));

    if (draft.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'empty', status: 400, message: 'Cannot publish an empty estimate' };
    }

    const latestRevRes = await client.query(
      `SELECT version FROM estimate_revisions
       WHERE estimate_id = $1 ORDER BY version DESC LIMIT 1`,
      [estimateId]
    );
    const nextVersion = (latestRevRes.rows[0]?.version || 0) + 1;

    const markupPct = parseFloat(est.markup_percent) || 0;
    const mult = markupMultiplier(markupPct);
    const totalCost = draft.reduce((s, i) => s + i.cost, 0);
    const totalBid = draft.reduce((s, i) => s + (i.cost * mult), 0);

    const revisionId = genId('rev');
    await client.query(
      `INSERT INTO estimate_revisions
       (id, job_id, estimate_id, version, published_by, prepared_by,
        description_snapshot, markup_mode_snapshot, markup_percent_snapshot,
        total_cost_snapshot, total_bid_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        revisionId, est.job_id, estimateId, nextVersion,
        user?.username || 'unknown', est.prepared_by,
        est.description || '', est.markup_mode, markupPct, totalCost, totalBid,
      ]
    );

    for (let i = 0; i < draft.length; i += 1) {
      const d = draft[i];
      await client.query(
        `INSERT INTO estimate_revision_items
         (id, revision_id, code, name, description, cost, group_code, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [genId('rli'), revisionId, d.code || null, d.name, d.description || '',
         d.cost, d.groupCode || null, d.sortOrder || i]
      );
    }

    await client.query(
      `UPDATE estimates SET
         current_version = $1,
         status = CASE WHEN status IN ('draft') THEN 'sent' ELSE status END,
         sent_at = COALESCE(sent_at, NOW()),
         updated_at = NOW()
       WHERE id = $2`,
      [nextVersion, estimateId]
    );

    await client.query('COMMIT');
    return { version: nextVersion, revisionId, totalCost, totalBid };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Accept — this estimate becomes part of the job's contract. Line items
 * are appended to line_items (matching codes get budget-increase deltas;
 * new codes get inserted fresh). contract_value accumulates. Status flips
 * to 'accepted'. One-way — no revert.
 */
async function acceptEstimate(pool, estimateId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const estRes = await client.query(
      `SELECT id, job_id, label, status, markup_mode, markup_percent
       FROM estimates WHERE id = $1 FOR UPDATE`,
      [estimateId]
    );
    if (estRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'notfound', status: 404, message: 'Estimate not found' };
    }
    const est = estRes.rows[0];

    if (['accepted', 'declined', 'archived'].includes(est.status)) {
      await client.query('ROLLBACK');
      return { error: 'terminal', status: 409,
        message: `Estimate is ${est.status} — cannot accept.` };
    }

    const draftRes = await client.query(
      `SELECT code, name, description, cost, group_code AS "groupCode"
       FROM estimate_line_items WHERE estimate_id = $1
       ORDER BY sort_order, code, name`,
      [estimateId]
    );
    const items = draftRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));
    if (items.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'empty', status: 400, message: 'Cannot accept an empty estimate' };
    }

    const today = new Date().toISOString().slice(0, 10);
    const reasonBase = `Accepted ${est.label || 'estimate'}`;

    // Append to line_items: match by code (primary) then by name.
    // Matching row → budget increase delta. New row → fresh insert.
    for (const d of items) {
      const existingRes = await client.query(
        d.code
          ? `SELECT id, budget, budget_history FROM line_items
             WHERE job_id = $1 AND code = $2 LIMIT 1`
          : `SELECT id, budget, budget_history FROM line_items
             WHERE job_id = $1 AND name = $2 LIMIT 1`,
        [est.job_id, d.code || d.name]
      );

      if (existingRes.rows.length > 0) {
        const li = existingRes.rows[0];
        const history = li.budget_history || [];
        history.push({ amount: d.cost, date: today, reason: `${reasonBase} — added to scope` });
        const newBudget = parseFloat(li.budget) + d.cost;
        await client.query(
          `UPDATE line_items SET budget = $1, budget_history = $2::jsonb WHERE id = $3`,
          [newBudget, JSON.stringify(history), li.id]
        );
      } else {
        const history = [{ amount: d.cost, date: today, reason: `${reasonBase} — new line` }];
        await client.query(
          `INSERT INTO line_items
           (job_id, code, name, budget, actual, budget_history, schedule, notes_text, status, vendor)
           VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb, '', 'Not Started', '')`,
          [
            est.job_id, d.code || null, d.name, d.cost,
            JSON.stringify(history),
            JSON.stringify({ startDate: null, endDate: null, actualStartDate: null, actualEndDate: null }),
          ]
        );
      }
    }

    const markupPct = parseFloat(est.markup_percent) || 0;
    const mult = markupMultiplier(markupPct);
    const acceptedTotal = items.reduce((s, i) => s + (i.cost * mult), 0);

    await client.query(
      `UPDATE estimates SET
         status = 'accepted',
         accepted_at = NOW(),
         accepted_total = $1,
         updated_at = NOW()
       WHERE id = $2`,
      [acceptedTotal, estimateId]
    );

    // contract_value = sum of all accepted estimate totals for this job
    await client.query(
      `UPDATE jobs SET
         contract_value = COALESCE((
           SELECT SUM(accepted_total) FROM estimates
           WHERE job_id = $1 AND status = 'accepted'
         ), 0),
         active_estimate_id = COALESCE(active_estimate_id, $2),
         updated_at = NOW()
       WHERE id = $1`,
      [est.job_id, estimateId]
    );

    await client.query('COMMIT');
    return { status: 'accepted', acceptedTotal };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setEstimateStatus(pool, estimateId, newStatus) {
  const validTransitions = {
    declined: ['draft', 'sent'],
    archived: ['draft', 'sent', 'declined'],
  };
  const allowedFrom = validTransitions[newStatus];
  if (!allowedFrom) return { error: 'invalid', status: 400, message: 'Invalid status transition' };

  const res = await pool.query(
    `UPDATE estimates SET status = $1, updated_at = NOW()
     WHERE id = $2 AND status = ANY($3::text[])
     RETURNING id, status`,
    [newStatus, estimateId, allowedFrom]
  );
  if (res.rows.length === 0) {
    return { error: 'forbidden', status: 409,
      message: `Cannot transition to ${newStatus} from current state` };
  }
  return { status: newStatus };
}

async function generateScope(pool, estimateId, context, verbose) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'config', status: 500, message: 'ANTHROPIC_API_KEY not configured' };
  }

  await pool.query(
    `UPDATE estimates SET ai_prompt = $1, ai_verbose = $2, updated_at = NOW() WHERE id = $3`,
    [context || '', !!verbose, estimateId]
  );

  const estRes = await pool.query(
    `SELECT e.job_id, e.label, j.name, j.type, j.location, j.target_completion, j.stage
     FROM estimates e LEFT JOIN jobs j ON j.id = e.job_id WHERE e.id = $1`,
    [estimateId]
  );
  if (estRes.rows.length === 0) {
    return { error: 'notfound', status: 404, message: 'Estimate not found' };
  }
  const job = estRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT code, name, description, cost FROM estimate_line_items
     WHERE estimate_id = $1 ORDER BY sort_order, code, name`,
    [estimateId]
  );
  const items = itemsRes.rows;

  const itemList = items.length
    ? items.map(i => `  - ${i.code ? i.code + ' ' : ''}${i.name}${i.description ? ' — ' + i.description : ''}`).join('\n')
    : '  (no line items yet)';

  const userPrompt = `Write a scope of work for a Kelli Homes construction bid.

THE SCOPE IS DEFINED BY EXACTLY TWO SOURCES. USE NOTHING ELSE:

(1) Contractor description:
${context ? `"${context}"` : '(none provided)'}

(2) Line items on the estimate:
${itemList}

Job metadata you may reference for context only (job name, location, completion date):
- ${job.name || '(unnamed)'}${job.location ? ' · ' + job.location : ''}${job.target_completion ? ' · target ' + job.target_completion : ''}

RULES:
1. Describe ONLY work present in sources (1) and (2) for the core scope description. Do NOT invent additional scope items.
2. Output flowing prose only. No markdown (no #, no **bold**), no bullets, no numbered lists, no headings of any kind.
3. ${verbose ? '2-3 paragraphs. 180-260 words. You MAY include a short closing paragraph with standard Kelli Homes clauses: quality workmanship commitment, a brief "contractor responsibilities" sentence (permits, site protection, cleanup), and a note that the work will meet applicable building codes. Keep this closing paragraph to ~3-4 short sentences — do not pad.' : '1-2 short paragraphs. 60-140 words. Tight and factual. Do NOT add closing boilerplate: no "committed to quality," no "contractor is responsible for...," no "meets code," no filler.'}
4. No dollar amounts, markup, or pricing.
5. Plain English. Write like a skilled contractor explaining the job to a homeowner.
6. If both sources are effectively empty, reply with one honest sentence: "Add line items or a project description, then regenerate."

Return ONLY the scope paragraphs — no preamble, no signoff.`;

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: verbose ? 700 : 400,
    messages: [{ role: 'user', content: userPrompt }],
  });
  let text = msg.content?.[0]?.text || '';
  text = text
    .replace(/^#+\s.*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\n)[-*•]\s+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { scope: text };
}

async function renderBidPdf(pool, estimateId) {
  const estRes = await pool.query(
    `SELECT e.id, e.job_id, e.label, e.description, e.markup_mode, e.markup_percent,
            e.prepared_by, e.status, e.current_version,
            j.name AS job_name, j.location, j.client, j.client_email, j.client_phone,
            j.type, j.target_completion, j.start_date
     FROM estimates e LEFT JOIN jobs j ON j.id = e.job_id WHERE e.id = $1`,
    [estimateId]
  );
  if (estRes.rows.length === 0) {
    return { error: 'notfound', status: 404, message: 'Estimate not found' };
  }
  const est = estRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT code, name, description, cost, group_code AS "groupCode"
     FROM estimate_line_items WHERE estimate_id = $1
     ORDER BY sort_order, code, name`,
    [estimateId]
  );
  if (itemsRes.rows.length === 0) {
    return { error: 'empty', status: 400, message: 'No line items to bid' };
  }

  const preparedBy = PREPARERS[est.prepared_by] || PREPARERS.arne;
  const markupPct = parseFloat(est.markup_percent) || 0;
  const mult = markupMultiplier(markupPct);
  const isFixed = (est.markup_mode || 'fixed') === 'fixed';

  const groups = new Map();
  for (const it of itemsRes.rows) {
    const g = it.groupCode || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  let logoDataUri = '';
  const logoCandidates = [
    path.join(__dirname, '..', 'assets', 'kh-logo.png'),
    path.join(__dirname, '..', '..', 'assets', 'kh-logo.png'),
  ];
  for (const candidate of logoCandidates) {
    try {
      const logoBytes = await fs.readFile(candidate);
      logoDataUri = `data:image/png;base64,${logoBytes.toString('base64')}`;
      break;
    } catch (err) { /* try next */ }
  }
  if (!logoDataUri) logger.warn('Bid PDF logo not found in any candidate path');

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const validityDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const targetDate = est.target_completion
    ? new Date(est.target_completion).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBD';
  const startDate = est.start_date
    ? new Date(est.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBD';

  const bidNumber = `BID-${est.job_id.split('-').slice(-2).join('-').toUpperCase()}`
    + (est.current_version > 0 ? `-V${est.current_version}` : '');

  let groupsHtml = '';
  let grandTotalBid = 0;
  for (const [groupName, groupItems] of groups) {
    let groupTotal = 0;
    let rowsHtml = '';
    const isSolo = groupItems.length === 1;
    for (const it of groupItems) {
      const clientPrice = (parseFloat(it.cost) || 0) * mult;
      groupTotal += clientPrice;
      rowsHtml += `
        <tr>
          <td class="code">${it.code || ''}</td>
          <td class="desc">
            <div class="item-name">${escapeHtml(it.name)}</div>
            ${it.description ? `<div class="item-desc">${escapeHtml(it.description)}</div>` : ''}
          </td>
          <td class="price${isSolo ? ' price--solo' : ''}">${fmt(clientPrice)}</td>
        </tr>`;
    }
    grandTotalBid += groupTotal;
    const subtotalRow = groupItems.length > 1 ? `
      <tr class="group-total">
        <td></td>
        <td class="subtotal-label">${escapeHtml(groupName)} subtotal</td>
        <td class="price">${fmt(groupTotal)}</td>
      </tr>` : '';
    groupsHtml += `
      <tr class="group-row"><td colspan="3">${escapeHtml(groupName)}</td></tr>
      ${rowsHtml}
      ${subtotalRow}`;
  }

  const pricingLabel = isFixed ? 'Fixed Price' : 'Cost-Plus Contract';
  const estimateLabel = est.label && est.label !== 'Estimate' ? ` — ${est.label}` : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; font-size: 11pt; line-height: 1.5; margin: 0; }
  .header { display: flex; align-items: center; gap: 24px; border-bottom: 2px solid #c2663a; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { width: 84px; height: 84px; flex-shrink: 0; }
  .logo img { width: 100%; height: 100%; object-fit: contain; }
  .biz { flex: 1; }
  .biz-name { font-size: 20pt; font-weight: 700; color: #111827; margin: 0 0 2px 0; letter-spacing: 0.5px; }
  .biz-meta { font-size: 9.5pt; color: #6b7280; line-height: 1.4; }
  .bid-title { text-align: right; }
  .bid-title .title { font-size: 16pt; font-weight: 700; color: #c2663a; letter-spacing: 2px; }
  .bid-title .number { font-size: 9.5pt; color: #6b7280; margin-top: 2px; }
  .bid-title .date { font-size: 9.5pt; color: #6b7280; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 10pt; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  .two-col { display: flex; gap: 24px; }
  .two-col > div { flex: 1; }
  .kv { font-size: 10.5pt; margin: 2px 0; }
  .kv .k { color: #6b7280; display: inline-block; min-width: 80px; }
  .kv .v { color: #111827; font-weight: 500; }
  .scope { font-size: 10.5pt; color: #1f2937; white-space: pre-wrap; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th { font-size: 9pt; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 1.5px solid #c2663a; }
  table.items td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10pt; vertical-align: top; }
  table.items tr { page-break-inside: avoid; }
  table.items td.code { color: #6b7280; font-family: 'SF Mono', Menlo, monospace; font-size: 9pt; width: 70px; white-space: nowrap; }
  table.items td.desc .item-name { font-weight: 500; color: #111827; }
  table.items td.desc .item-desc { font-size: 9.5pt; color: #6b7280; margin-top: 2px; }
  table.items td.price { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 110px; padding-right: 20px; }
  table.items td.price--solo { font-weight: 700; padding-right: 8px; }
  table.items tr.group-total td.price { padding-right: 8px; }
  table.items tr.group-row td { background: #f9fafb; font-weight: 600; font-size: 9.5pt; color: #374151; padding-top: 10px; }
  table.items tr.group-total td { font-weight: 600; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; background: #fafaf9; }
  table.items tr.group-total .subtotal-label { color: #6b7280; font-size: 9.5pt; text-align: right; }
  .grand-total { display: flex; justify-content: flex-end; align-items: baseline; gap: 18px; margin-top: 14px; padding-top: 10px; border-top: 2px solid #c2663a; }
  .grand-total .label { font-size: 10pt; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; }
  .grand-total .amount { font-size: 20pt; font-weight: 700; color: #c2663a; font-variant-numeric: tabular-nums; }
  .pricing-note { text-align: right; font-size: 9.5pt; color: #6b7280; margin-top: 4px; }
  .tax-note { text-align: right; font-size: 9.5pt; color: #6b7280; margin-top: 2px; font-style: italic; }
  .preparer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; }
  .preparer .label { font-size: 9pt; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; margin-bottom: 4px; }
  .preparer .name { font-weight: 600; font-size: 11pt; }
  .preparer .contact { font-size: 10pt; color: #4b5563; margin-top: 2px; }
  .validity { margin-top: 16px; padding: 10px 14px; background: #fef7f1; border-left: 3px solid #c2663a; font-size: 10pt; color: #7c3f1f; }
  .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #9ca3af; text-align: center; }
</style></head><body>

<div class="header">
  <div class="logo">${logoDataUri ? `<img src="${logoDataUri}" alt="Kelli Homes"/>` : ''}</div>
  <div class="biz">
    <div class="biz-name">${BUSINESS.name}</div>
    <div class="biz-meta">
      ${BUSINESS.address}<br/>
      License #${BUSINESS.license} &middot; ${BUSINESS.website}
    </div>
  </div>
  <div class="bid-title">
    <div class="title">PROPOSAL</div>
    <div class="number">${bidNumber}</div>
    <div class="date">${today}</div>
  </div>
</div>

<div class="section">
  <div class="two-col">
    <div>
      <div class="section-title">Prepared for</div>
      <div class="kv"><span class="v" style="font-weight:600;font-size:11pt;">${escapeHtml(est.client || '—')}</span></div>
      ${est.client_email ? `<div class="kv"><span class="v">${escapeHtml(est.client_email)}</span></div>` : ''}
      ${est.client_phone ? `<div class="kv"><span class="v">${escapeHtml(est.client_phone)}</span></div>` : ''}
      ${est.location ? `<div class="kv"><span class="v" style="color:#4b5563;">${escapeHtml(est.location)}</span></div>` : ''}
    </div>
    <div>
      <div class="section-title">Project</div>
      <div class="kv"><span class="k">Name:</span> <span class="v">${escapeHtml((est.job_name || '—') + estimateLabel)}</span></div>
      <div class="kv"><span class="k">Type:</span> <span class="v">${escapeHtml(est.type || '—')}</span></div>
      <div class="kv"><span class="k">Start:</span> <span class="v">${startDate}</span></div>
      <div class="kv"><span class="k">Complete:</span> <span class="v">${targetDate}</span></div>
    </div>
  </div>
</div>

${est.description ? `
<div class="section">
  <div class="section-title">Scope of Work</div>
  <div class="scope">${escapeHtml(est.description)}</div>
</div>` : ''}

<div class="section">
  <div class="section-title">Line Items</div>
  <table class="items">
    <thead>
      <tr>
        <th>Code</th>
        <th>Description</th>
        <th style="text-align:right;">Price</th>
      </tr>
    </thead>
    <tbody>
      ${groupsHtml}
    </tbody>
  </table>
  <div class="grand-total">
    <span class="label">Total</span>
    <span class="amount">${fmt(grandTotalBid)}</span>
  </div>
  <div class="pricing-note">Pricing: ${pricingLabel}</div>
  <div class="tax-note">Sales tax to be added at the time of invoicing.</div>
</div>

<div class="validity">
  This proposal is valid for 30 days (through ${validityDate}).
</div>

<div class="preparer">
  <div class="label">Prepared by</div>
  <div class="name">${escapeHtml(preparedBy.name)}${preparedBy.title ? ' &mdash; ' + escapeHtml(preparedBy.title) : ''}</div>
  <div class="contact">${escapeHtml(preparedBy.email)} &middot; ${escapeHtml(preparedBy.phone)}</div>
</div>

<div class="footer">
  Kelli Homes &middot; ${BUSINESS.address} &middot; License #${BUSINESS.license}
</div>

</body></html>`;

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
      printBackground: true,
    });
    const safeName = ((est.job_name || 'bid') + (est.label && est.label !== 'Estimate' ? '-' + est.label : ''))
      .replace(/[^a-z0-9-]+/gi, '_');
    const pdfBytes = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    return {
      pdfBytes,
      filename: `Bid - ${safeName} - ${new Date().toISOString().slice(0,10)}.pdf`,
    };
  } finally {
    await browser.close();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Router 1: /jobs/:jobId/estimates  — list + create
// ══════════════════════════════════════════════════════════════════════════

const jobScoped = express.Router({ mergeParams: true });

jobScoped.get('/', async (req, res) => {
  try {
    const estimates = await listEstimatesForJob(getPool(), req.params.jobId);
    res.json({ estimates });
  } catch (error) {
    logger.error('Error listing estimates', { error: error.message });
    res.status(500).json({ error: 'Failed to list estimates' });
  }
});

jobScoped.post('/', async (req, res) => {
  try {
    const created = await createEstimate(getPool(), req.params.jobId, req.body?.label);
    if (!created) return res.status(404).json({ error: 'Job not found' });
    res.status(201).json(created);
  } catch (error) {
    logger.error('Error creating estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to create estimate' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Router 2: /estimates/:estimateId  — per-estimate operations
// ══════════════════════════════════════════════════════════════════════════

const singleScoped = express.Router({ mergeParams: true });

singleScoped.get('/', async (req, res) => {
  try {
    const est = await fetchEstimateWithItems(getPool(), req.params.estimateId);
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    res.json(est);
  } catch (error) {
    logger.error('Error fetching estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

singleScoped.put('/', async (req, res) => {
  try {
    const est = await updateEstimate(getPool(), req.params.estimateId, req.body || {});
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    res.json(est);
  } catch (error) {
    logger.error('Error saving estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to save estimate', message: error.message });
  }
});

singleScoped.get('/revisions', async (req, res) => {
  try {
    const revisions = await listRevisions(getPool(), req.params.estimateId);
    res.json(revisions);
  } catch (error) {
    logger.error('Error listing revisions', { error: error.message });
    res.status(500).json({ error: 'Failed to list revisions' });
  }
});

singleScoped.post('/publish/preview', async (req, res) => {
  try {
    const result = await computePublishPreview(getPool(), req.params.estimateId);
    res.json(result);
  } catch (error) {
    logger.error('Error computing publish preview', { error: error.message });
    res.status(500).json({ error: 'Failed to compute preview', message: error.message });
  }
});

singleScoped.post('/publish/confirm', async (req, res) => {
  try {
    const result = await publishEstimate(getPool(), req.params.estimateId, req.user);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Error publishing estimate', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to publish', message: error.message });
  }
});

singleScoped.post('/accept', async (req, res) => {
  try {
    const result = await acceptEstimate(getPool(), req.params.estimateId);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Error accepting estimate', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to accept', message: error.message });
  }
});

singleScoped.post('/decline', async (req, res) => {
  try {
    const result = await setEstimateStatus(getPool(), req.params.estimateId, 'declined');
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Error declining estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to decline' });
  }
});

singleScoped.post('/archive', async (req, res) => {
  try {
    const result = await setEstimateStatus(getPool(), req.params.estimateId, 'archived');
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Error archiving estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to archive' });
  }
});

singleScoped.post('/generate-scope', async (req, res) => {
  try {
    const { context, verbose } = req.body || {};
    const result = await generateScope(getPool(), req.params.estimateId, context, verbose);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Error generating scope', { error: error.message });
    res.status(500).json({ error: 'Failed to generate scope', message: error.message });
  }
});

singleScoped.get('/bid.pdf', async (req, res) => {
  try {
    const result = await renderBidPdf(getPool(), req.params.estimateId);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.pdfBytes.length);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.end(result.pdfBytes);
  } catch (error) {
    logger.error('Error generating bid PDF', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to generate bid PDF', message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Router 3: /jobs/:jobId/estimate  — legacy shim for old frontend
// ══════════════════════════════════════════════════════════════════════════
// Resolves the job's primary estimate (creates one if missing) and delegates
// to the same functions as singleScoped. Keeps the existing Estimating tab
// working unchanged while the new UI is being built.

const legacyJobEstimate = express.Router({ mergeParams: true });

// Middleware: resolve primary estimate id onto req.estimateId. For GETs on a
// job with no estimate yet, leave it null (handler returns defaults). For
// mutations, auto-create so the write has somewhere to land.
legacyJobEstimate.use(async (req, res, next) => {
  try {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT id FROM estimates
       WHERE job_id = $1 AND status <> 'archived'
       ORDER BY sort_order, created_at LIMIT 1`,
      [req.params.jobId]
    );
    if (existing.rows.length > 0) {
      req.estimateId = existing.rows[0].id;
      return next();
    }
    if (req.method === 'GET') {
      req.estimateId = null;
      return next();
    }
    const created = await createEstimate(pool, req.params.jobId, 'Estimate');
    if (!created) return res.status(404).json({ error: 'Job not found' });
    req.estimateId = created.id;
    next();
  } catch (error) {
    logger.error('Legacy shim: failed to resolve estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to resolve estimate' });
  }
});

legacyJobEstimate.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const jobRes = await pool.query(
      `SELECT square_footage AS "squareFootage", contract_value AS "contractValue"
       FROM jobs WHERE id = $1`,
      [req.params.jobId]
    );
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const j = jobRes.rows[0];

    // No estimate yet — return an empty-default shape so the old frontend
    // renders a blank Estimating tab without error.
    if (!req.estimateId) {
      return res.json({
        description: '',
        markupMode: 'fixed',
        markupPercent: 30,
        preparedBy: null,
        currentVersion: 0,
        contractValue: j.contractValue != null ? parseFloat(j.contractValue) : null,
        squareFootage: j.squareFootage != null ? parseFloat(j.squareFootage) : null,
        aiPrompt: '',
        aiVerbose: false,
        lineItems: [],
      });
    }

    const full = await fetchEstimateWithItems(pool, req.estimateId);
    if (!full) return res.status(404).json({ error: 'Estimate not found' });
    res.json({
      description: full.description || '',
      markupMode: full.markupMode || 'fixed',
      markupPercent: full.markupPercent,
      preparedBy: full.preparedBy || null,
      currentVersion: full.currentVersion || 0,
      contractValue: j.contractValue != null ? parseFloat(j.contractValue) : null,
      squareFootage: j.squareFootage != null ? parseFloat(j.squareFootage) : null,
      aiPrompt: full.aiPrompt || '',
      aiVerbose: !!full.aiVerbose,
      lineItems: full.lineItems,
    });
  } catch (error) {
    logger.error('Legacy GET /estimate failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

legacyJobEstimate.put('/', async (req, res) => {
  try {
    // Old payload included squareFootage (a job-level field). Route it to jobs.
    const { squareFootage, ...rest } = req.body || {};
    if (squareFootage !== undefined) {
      await getPool().query(
        `UPDATE jobs SET square_footage = $1, updated_at = NOW() WHERE id = $2`,
        [squareFootage !== '' && squareFootage != null ? parseFloat(squareFootage) : null,
         req.params.jobId]
      );
    }
    await updateEstimate(getPool(), req.estimateId, rest);
    res.json({ message: 'Estimate saved', count: Array.isArray(rest.lineItems) ? rest.lineItems.length : 0 });
  } catch (error) {
    logger.error('Legacy PUT /estimate failed', { error: error.message });
    res.status(500).json({ error: 'Failed to save estimate', message: error.message });
  }
});

legacyJobEstimate.get('/revisions', async (req, res) => {
  try {
    res.json(await listRevisions(getPool(), req.estimateId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

legacyJobEstimate.post('/publish/preview', async (req, res) => {
  try {
    res.json(await computePublishPreview(getPool(), req.estimateId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute preview', message: error.message });
  }
});

/**
 * Legacy publish = Publish + Accept in one call, matching the old button's
 * behavior ("Publish to Line Items"). The new /estimates/:id/* API splits
 * these into two separate actions.
 */
legacyJobEstimate.post('/publish/confirm', async (req, res) => {
  try {
    const pub = await publishEstimate(getPool(), req.estimateId, req.user);
    if (pub.error) return res.status(pub.status).json({ error: pub.error, message: pub.message });
    const acc = await acceptEstimate(getPool(), req.estimateId);
    if (acc.error) return res.status(acc.status).json({ error: acc.error, message: acc.message });
    res.json({
      version: pub.version,
      revisionId: pub.revisionId,
      totalCost: pub.totalCost,
      totalBid: pub.totalBid,
      acceptedTotal: acc.acceptedTotal,
    });
  } catch (error) {
    logger.error('Legacy publish/confirm failed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to publish', message: error.message });
  }
});

legacyJobEstimate.post('/generate-scope', async (req, res) => {
  try {
    const { context, verbose } = req.body || {};
    const result = await generateScope(getPool(), req.estimateId, context, verbose);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.json(result);
  } catch (error) {
    logger.error('Legacy generate-scope failed', { error: error.message });
    res.status(500).json({ error: 'Failed to generate scope', message: error.message });
  }
});

legacyJobEstimate.get('/bid.pdf', async (req, res) => {
  try {
    const result = await renderBidPdf(getPool(), req.estimateId);
    if (result.error) return res.status(result.status).json({ error: result.error, message: result.message });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', result.pdfBytes.length);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.end(result.pdfBytes);
  } catch (error) {
    logger.error('Legacy bid.pdf failed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to generate bid PDF', message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════

module.exports = {
  jobScoped,
  singleScoped,
  legacyJobEstimate,
};
