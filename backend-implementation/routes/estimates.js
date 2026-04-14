/**
 * Estimates routes — Estimating tab, publish-with-diff flow, bid PDF, AI scope.
 */

const express = require('express');
const router = express.Router({ mergeParams: true });
const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const { getPool } = require('../db');
const logger = require('../logger');

const PREPARERS = {
  kelli:  { name: 'Kelli Gaenz',  title: 'Owner',           email: 'kelli@kellihomes.com',  phone: '(425) 478-6058' },
  justin: { name: 'Justin Lowe',  title: 'Project Manager', email: 'justin@kellihomes.com', phone: '(206) 321-8902' },
  arne:   { name: 'Arne Gaenz',   title: 'Special Projects', email: 'arne@kellihomes.com',  phone: '(425) 478-6057' },
};
const BUSINESS = {
  name: 'Kelli Homes',
  address: '1020 Bell St, Edmonds, WA 98020',
  license: 'KELLIHL929MJ',
  website: 'kellihomes.com',
};

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

// ─── GET /jobs/:jobId/estimate ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { jobId } = req.params;
  try {
    const pool = getPool();
    const job = await pool.query(
      `SELECT estimate_description, estimate_markup_mode, estimate_markup_percent,
              estimate_prepared_by, estimate_current_version, contract_value
       FROM jobs WHERE id = $1`,
      [jobId]
    );
    if (job.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const items = await pool.query(
      `SELECT id, code, name, description, cost, group_code AS "groupCode", sort_order AS "sortOrder"
       FROM estimate_line_items WHERE job_id = $1 ORDER BY sort_order, code, name`,
      [jobId]
    );

    const row = job.rows[0];
    res.json({
      description: row.estimate_description || '',
      markupMode: row.estimate_markup_mode || 'fixed',
      markupPercent: parseFloat(row.estimate_markup_percent) || 30,
      preparedBy: row.estimate_prepared_by || null,
      currentVersion: row.estimate_current_version || 0,
      contractValue: row.contract_value != null ? parseFloat(row.contract_value) : null,
      lineItems: items.rows.map(r => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        cost: parseFloat(r.cost) || 0,
        groupCode: r.groupCode,
        sortOrder: r.sortOrder,
      })),
    });
  } catch (error) {
    logger.error('Error fetching estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

// ─── PUT /jobs/:jobId/estimate ─────────────────────────────────────────────
// Replaces description, markup settings, and the entire line items list in one shot.
router.put('/', async (req, res) => {
  const { jobId } = req.params;
  const { description, markupMode, markupPercent, preparedBy, lineItems } = req.body;
  if (!Array.isArray(lineItems)) return res.status(400).json({ error: 'lineItems must be an array' });

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE jobs SET
         estimate_description = $1,
         estimate_markup_mode = $2,
         estimate_markup_percent = $3,
         estimate_prepared_by = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [
        description || '',
        markupMode || 'fixed',
        markupPercent != null ? parseFloat(markupPercent) : 30,
        preparedBy || null,
        jobId,
      ]
    );

    await client.query('DELETE FROM estimate_line_items WHERE job_id = $1', [jobId]);

    for (let i = 0; i < lineItems.length; i += 1) {
      const item = lineItems[i];
      await client.query(
        `INSERT INTO estimate_line_items
         (id, job_id, code, name, description, cost, group_code, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          genId('eli'),
          jobId,
          item.code || null,
          item.name || '(unnamed)',
          item.description || '',
          parseFloat(item.cost) || 0,
          item.groupCode || null,
          typeof item.sortOrder === 'number' ? item.sortOrder : i,
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Estimate saved', count: lineItems.length });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error saving estimate', { error: error.message });
    res.status(500).json({ error: 'Failed to save estimate', message: error.message });
  } finally {
    client.release();
  }
});

// ─── GET /jobs/:jobId/estimate/revisions ───────────────────────────────────
router.get('/revisions', async (req, res) => {
  const { jobId } = req.params;
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, version, published_at AS "publishedAt", published_by AS "publishedBy",
              prepared_by AS "preparedBy", description_snapshot AS "description",
              markup_mode_snapshot AS "markupMode", markup_percent_snapshot AS "markupPercent",
              total_cost_snapshot AS "totalCost", total_bid_snapshot AS "totalBid"
       FROM estimate_revisions WHERE job_id = $1 ORDER BY version DESC`,
      [jobId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching revisions', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

// ─── POST /jobs/:jobId/estimate/publish/preview ────────────────────────────
// Returns a diff between the current draft and the most recent published revision.
router.post('/publish/preview', async (req, res) => {
  const { jobId } = req.params;
  try {
    const pool = getPool();

    const draftRes = await pool.query(
      `SELECT id, code, name, description, cost
       FROM estimate_line_items WHERE job_id = $1`,
      [jobId]
    );
    const draft = draftRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));

    const latestRevRes = await pool.query(
      `SELECT id, version FROM estimate_revisions
       WHERE job_id = $1 ORDER BY version DESC LIMIT 1`,
      [jobId]
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

    // Match by code (primary) — falls back to exact-name match when code is missing.
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

    res.json({
      hasPrior,
      nextVersion: (latestRevRes.rows[0]?.version || 0) + 1,
      added,
      changed,
      removed,
      unchanged,
    });
  } catch (error) {
    logger.error('Error computing publish preview', { error: error.message });
    res.status(500).json({ error: 'Failed to compute preview', message: error.message });
  }
});

// ─── POST /jobs/:jobId/estimate/publish/confirm ────────────────────────────
// Freezes the current draft as a new revision, applies changes to line_items
// (adds new, creates budget-increase entries for changes), updates contract_value.
router.post('/publish/confirm', async (req, res) => {
  const { jobId } = req.params;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jobRes = await client.query(
      `SELECT estimate_description, estimate_markup_mode, estimate_markup_percent,
              estimate_prepared_by, estimate_current_version
       FROM jobs WHERE id = $1 FOR UPDATE`,
      [jobId]
    );
    if (jobRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Job not found' });
    }
    const j = jobRes.rows[0];

    const draftRes = await client.query(
      `SELECT code, name, description, cost, group_code AS "groupCode", sort_order AS "sortOrder"
       FROM estimate_line_items WHERE job_id = $1 ORDER BY sort_order, code, name`,
      [jobId]
    );
    const draft = draftRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));

    if (draft.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot publish an empty estimate' });
    }

    // Load prior revision (if any)
    const latestRevRes = await client.query(
      `SELECT id, version FROM estimate_revisions
       WHERE job_id = $1 ORDER BY version DESC LIMIT 1`,
      [jobId]
    );
    const prior = latestRevRes.rows[0] || null;
    const nextVersion = (prior?.version || 0) + 1;

    let priorItems = [];
    if (prior) {
      const priorItemsRes = await client.query(
        `SELECT code, name, description, cost FROM estimate_revision_items
         WHERE revision_id = $1`,
        [prior.id]
      );
      priorItems = priorItemsRes.rows.map(r => ({ ...r, cost: parseFloat(r.cost) || 0 }));
    }

    // Totals
    const markupPct = parseFloat(j.estimate_markup_percent) || 0;
    const mult = markupMultiplier(markupPct);
    const totalCost = draft.reduce((s, i) => s + i.cost, 0);
    const totalBid = draft.reduce((s, i) => s + (i.cost * mult), 0);

    // Create revision row
    const revisionId = genId('rev');
    await client.query(
      `INSERT INTO estimate_revisions
       (id, job_id, version, published_by, prepared_by, description_snapshot,
        markup_mode_snapshot, markup_percent_snapshot, total_cost_snapshot, total_bid_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        revisionId,
        jobId,
        nextVersion,
        req.user?.username || 'unknown',
        j.estimate_prepared_by,
        j.estimate_description || '',
        j.estimate_markup_mode,
        markupPct,
        totalCost,
        totalBid,
      ]
    );

    // Snapshot draft items into revision_items
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

    // Apply to line_items (job costing)
    const keyOf = (x) => x.code ? `C:${x.code}` : `N:${x.name}`;
    const priorMap = new Map(priorItems.map(i => [keyOf(i), i]));

    const today = new Date().toISOString().slice(0, 10);
    const reasonBase = `Estimate v${nextVersion} revision`;

    if (!prior) {
      // First publish — create line_items from scratch (DELETE+INSERT pattern)
      await client.query('DELETE FROM line_items WHERE job_id = $1', [jobId]);
      for (const d of draft) {
        await client.query(
          `INSERT INTO line_items
           (job_id, code, name, budget, actual, budget_history, schedule, notes_text, status, vendor)
           VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb, '', 'Not Started', '')`,
          [
            jobId,
            d.code || null,
            d.name,
            d.cost,
            JSON.stringify([]),
            JSON.stringify({ startDate: null, endDate: null, actualStartDate: null, actualEndDate: null }),
          ]
        );
      }
    } else {
      // Re-publish — patch line_items with delta
      for (const d of draft) {
        const p = priorMap.get(keyOf(d));
        if (!p) {
          // New line — insert fresh with budget = cost
          await client.query(
            `INSERT INTO line_items
             (job_id, code, name, budget, actual, budget_history, schedule, notes_text, status, vendor)
             VALUES ($1, $2, $3, $4, 0, $5::jsonb, $6::jsonb, '', 'Not Started', '')`,
            [
              jobId,
              d.code || null,
              d.name,
              d.cost,
              JSON.stringify([{ amount: d.cost, date: today, reason: `${reasonBase} — new line` }]),
              JSON.stringify({ startDate: null, endDate: null, actualStartDate: null, actualEndDate: null }),
            ]
          );
        } else if (d.cost !== p.cost) {
          // Changed cost — add budget increase delta (can be negative)
          const delta = d.cost - p.cost;
          // Find existing line_item row by code/name
          const liRes = await client.query(
            d.code
              ? `SELECT id, budget, budget_history FROM line_items WHERE job_id = $1 AND code = $2 LIMIT 1`
              : `SELECT id, budget, budget_history FROM line_items WHERE job_id = $1 AND name = $2 LIMIT 1`,
            [jobId, d.code || d.name]
          );
          if (liRes.rows.length > 0) {
            const li = liRes.rows[0];
            const history = li.budget_history || [];
            history.push({ amount: delta, date: today, reason: `${reasonBase} — cost change` });
            const newBudget = parseFloat(li.budget) + delta;
            await client.query(
              `UPDATE line_items SET budget = $1, budget_history = $2::jsonb WHERE id = $3`,
              [newBudget, JSON.stringify(history), li.id]
            );
          }
        }
      }
      // Removed lines → zero out budget via negative budget-increase
      const draftMap = new Map(draft.map(i => [keyOf(i), i]));
      for (const rem of priorItems) {
        if (draftMap.has(keyOf(rem))) continue;
        const liRes = await client.query(
          rem.code
            ? `SELECT id, budget, budget_history FROM line_items WHERE job_id = $1 AND code = $2 LIMIT 1`
            : `SELECT id, budget, budget_history FROM line_items WHERE job_id = $1 AND name = $2 LIMIT 1`,
          [jobId, rem.code || rem.name]
        );
        if (liRes.rows.length > 0) {
          const li = liRes.rows[0];
          const history = li.budget_history || [];
          const currentBudget = parseFloat(li.budget);
          history.push({ amount: -currentBudget, date: today, reason: `${reasonBase} — removed from scope` });
          await client.query(
            `UPDATE line_items SET budget = 0, budget_history = $1::jsonb WHERE id = $2`,
            [JSON.stringify(history), li.id]
          );
        }
      }
    }

    // Update job: version, contract value
    await client.query(
      `UPDATE jobs SET estimate_current_version = $1, contract_value = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextVersion, totalBid, jobId]
    );

    await client.query('COMMIT');
    res.json({ version: nextVersion, revisionId, totalCost, totalBid });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error publishing estimate', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to publish estimate', message: error.message });
  } finally {
    client.release();
  }
});

// ─── POST /jobs/:jobId/estimate/generate-scope ─────────────────────────────
router.post('/generate-scope', async (req, res) => {
  const { jobId } = req.params;
  const { context } = req.body || {};

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const pool = getPool();
    const jobRes = await pool.query(
      `SELECT id, name, type, location, target_completion, stage FROM jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT code, name, description, cost FROM estimate_line_items
       WHERE job_id = $1 ORDER BY sort_order, code, name`,
      [jobId]
    );
    const items = itemsRes.rows;

    const itemList = items.length
      ? items.map(i => `  - ${i.code ? i.code + ' ' : ''}${i.name}${i.description ? ' — ' + i.description : ''}`).join('\n')
      : '  (no line items yet)';

    const userPrompt = `You are drafting a construction project scope of work for a client-facing bid from Kelli Homes, a Pacific Northwest home builder.

Job: ${job.name || '(unnamed)'}
Type: ${job.type || 'Not specified'}
Location: ${job.location || 'Not specified'}
Target completion: ${job.target_completion || 'TBD'}

Planned work (line items):
${itemList}
${context ? `\nAdditional context from the contractor: ${context}` : ''}

Write a 2-3 paragraph professional scope of work suitable for a homeowner signing a contract. Plain English, no construction jargon. Start with a one-sentence project overview. Describe the scope in a logical sequence (site prep → structure → finishes → handoff where applicable). Close with a brief statement about Kelli Homes' commitment to quality and workmanship. Do NOT include pricing, dollar amounts, or markup details — that appears in a separate table. Do NOT use headings or bullet lists. Just 2-3 flowing paragraphs.`;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = msg.content?.[0]?.text || '';
    res.json({ scope: text.trim() });
  } catch (error) {
    logger.error('Error generating scope', { error: error.message });
    res.status(500).json({ error: 'Failed to generate scope', message: error.message });
  }
});

// ─── GET /jobs/:jobId/bid.pdf ──────────────────────────────────────────────
router.get('/bid.pdf', async (req, res) => {
  const { jobId } = req.params;
  try {
    const pool = getPool();
    const jobRes = await pool.query(
      `SELECT id, name, location, client, client_email, client_phone,
              type, target_completion, start_date,
              estimate_description, estimate_markup_mode, estimate_markup_percent,
              estimate_prepared_by, contract_value
       FROM jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobRes.rows[0];

    const itemsRes = await pool.query(
      `SELECT code, name, description, cost, group_code AS "groupCode"
       FROM estimate_line_items WHERE job_id = $1 ORDER BY sort_order, code, name`,
      [jobId]
    );
    if (itemsRes.rows.length === 0) return res.status(400).json({ error: 'No line items to bid' });

    const preparedBy = PREPARERS[job.estimate_prepared_by] || PREPARERS.arne;
    const markupPct = parseFloat(job.estimate_markup_percent) || 0;
    const mult = markupMultiplier(markupPct);
    const isFixed = (job.estimate_markup_mode || 'fixed') === 'fixed';

    // Group line items by groupCode for subtotals
    const groups = new Map();
    for (const it of itemsRes.rows) {
      const g = it.groupCode || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }

    const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

    // Logo as base64 data URL
    let logoDataUri = '';
    try {
      const logoPath = path.join(__dirname, '..', '..', 'assets', 'kh-logo.png');
      const logoBytes = await fs.readFile(logoPath);
      logoDataUri = `data:image/png;base64,${logoBytes.toString('base64')}`;
    } catch (err) {
      logger.warn('Bid PDF logo missing', { err: err.message });
    }

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const validityDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const targetDate = job.target_completion
      ? new Date(job.target_completion).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD';
    const startDate = job.start_date
      ? new Date(job.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD';

    const bidNumber = `BID-${jobId.split('-').slice(-2).join('-').toUpperCase()}`;

    let groupsHtml = '';
    let grandTotalBid = 0;
    for (const [groupName, groupItems] of groups) {
      let groupTotal = 0;
      let rowsHtml = '';
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
            <td class="price">${fmt(clientPrice)}</td>
          </tr>`;
      }
      grandTotalBid += groupTotal;
      groupsHtml += `
        <tr class="group-row"><td colspan="3">${escapeHtml(groupName)}</td></tr>
        ${rowsHtml}
        <tr class="group-total">
          <td></td>
          <td class="subtotal-label">${escapeHtml(groupName)} subtotal</td>
          <td class="price">${fmt(groupTotal)}</td>
        </tr>`;
    }

    const pricingLabel = isFixed ? 'Fixed Price' : `Cost + ${markupPct}%`;

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
  table.items td.code { color: #6b7280; font-family: 'SF Mono', Menlo, monospace; font-size: 9pt; width: 70px; white-space: nowrap; }
  table.items td.desc .item-name { font-weight: 500; color: #111827; }
  table.items td.desc .item-desc { font-size: 9.5pt; color: #6b7280; margin-top: 2px; }
  table.items td.price { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 110px; }
  table.items tr.group-row td { background: #f9fafb; font-weight: 600; font-size: 9.5pt; color: #374151; padding-top: 10px; }
  table.items tr.group-total td { font-weight: 600; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; background: #fafaf9; }
  table.items tr.group-total .subtotal-label { color: #6b7280; font-size: 9.5pt; text-align: right; }
  .grand-total { display: flex; justify-content: flex-end; align-items: baseline; gap: 18px; margin-top: 14px; padding-top: 10px; border-top: 2px solid #c2663a; }
  .grand-total .label { font-size: 10pt; text-transform: uppercase; color: #6b7280; letter-spacing: 1px; }
  .grand-total .amount { font-size: 20pt; font-weight: 700; color: #c2663a; font-variant-numeric: tabular-nums; }
  .pricing-note { text-align: right; font-size: 9.5pt; color: #6b7280; margin-top: 4px; }
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
      <div class="kv"><span class="v" style="font-weight:600;font-size:11pt;">${escapeHtml(job.client || '—')}</span></div>
      ${job.client_email ? `<div class="kv"><span class="v">${escapeHtml(job.client_email)}</span></div>` : ''}
      ${job.client_phone ? `<div class="kv"><span class="v">${escapeHtml(job.client_phone)}</span></div>` : ''}
      ${job.location ? `<div class="kv"><span class="v" style="color:#4b5563;">${escapeHtml(job.location)}</span></div>` : ''}
    </div>
    <div>
      <div class="section-title">Project</div>
      <div class="kv"><span class="k">Name:</span> <span class="v">${escapeHtml(job.name || '—')}</span></div>
      <div class="kv"><span class="k">Type:</span> <span class="v">${escapeHtml(job.type || '—')}</span></div>
      <div class="kv"><span class="k">Start:</span> <span class="v">${startDate}</span></div>
      <div class="kv"><span class="k">Complete:</span> <span class="v">${targetDate}</span></div>
    </div>
  </div>
</div>

${job.estimate_description ? `
<div class="section">
  <div class="section-title">Scope of Work</div>
  <div class="scope">${escapeHtml(job.estimate_description)}</div>
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
      ],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
        printBackground: true,
      });
      const safeName = (job.name || 'bid').replace(/[^a-z0-9-]+/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Bid - ${safeName} - ${new Date().toISOString().slice(0,10)}.pdf"`);
      res.send(pdfBuffer);
    } finally {
      await browser.close();
    }
  } catch (error) {
    logger.error('Error generating bid PDF', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to generate bid PDF', message: error.message });
  }
});

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
