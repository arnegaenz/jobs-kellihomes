/**
 * Line Items Routes for Kelli Homes Job Management
 * Handles job costing with budget tracking, schedule, and notes
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :jobId
const { getPool } = require('../db');

/**
 * GET /jobs/:jobId/line-items
 * Fetch all line items for a specific job
 */
router.get('/', async (req, res) => {
  const { jobId } = req.params;

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
        code,
        name,
        budget,
        actual,
        budget_history,
        schedule,
        notes_text as notes,
        status,
        vendor
      FROM line_items
      WHERE job_id = $1
      ORDER BY code ASC`,
      [jobId]
    );

    // Transform database rows to frontend format
    const lineItems = result.rows.map(row => {
      // budget_history is a running ledger of every change to the budget.
      // Entries: { amount, type: 'initial' | 'adjustment', date, reason }
      // The current budget always equals the sum of all entry amounts.
      const budgetHistory = row.budget_history || [];
      const initialTotal = budgetHistory
        .filter(e => e.type === 'initial')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const adjustmentsTotal = budgetHistory
        .filter(e => e.type !== 'initial')
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const storedBudget = parseFloat(row.budget) || 0;

      return {
        code: row.code,
        name: row.name,
        originalBudget: initialTotal,
        budgetHistory: budgetHistory,
        currentBudget: storedBudget,
        actual: row.actual || 0,
        variance: storedBudget - (parseFloat(row.actual) || 0),
        schedule: row.schedule || { startDate: null, endDate: null, actualStartDate: null, actualEndDate: null },
        notes: row.notes || '',
        status: row.status || 'Not Started',
        vendor: row.vendor || ''
      };
    });

    res.json(lineItems);
  } catch (error) {
    console.error('Error fetching line items:', error);
    res.status(500).json({
      error: 'Failed to fetch line items',
      message: error.message
    });
  }
});

/**
 * PUT /jobs/:jobId/line-items
 * Replace all line items for a job
 * Body: { lineItems: [...] }
 */
router.put('/', async (req, res) => {
  const { jobId } = req.params;
  const { lineItems } = req.body;

  if (!Array.isArray(lineItems)) {
    return res.status(400).json({
      error: 'lineItems must be an array'
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete existing line items for this job
    await client.query('DELETE FROM line_items WHERE job_id = $1', [jobId]);

    // Insert new line items
    if (lineItems.length > 0) {
      const insertPromises = lineItems.map(item => {
        // Current budget = sum of all history entries (initial + adjustments).
        // Frontend is the source of truth for the history array.
        const budgetHistory = item.budgetHistory || [];
        const currentBudget = budgetHistory.reduce(
          (sum, e) => sum + (parseFloat(e.amount) || 0),
          0
        );

        return client.query(
          `INSERT INTO line_items (
            job_id,
            code,
            name,
            budget,
            actual,
            budget_history,
            schedule,
            notes_text,
            status,
            vendor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            jobId,
            item.code,
            item.name,
            currentBudget, // Store calculated current budget
            parseFloat(item.actual) || 0,
            JSON.stringify(item.budgetHistory || []),
            JSON.stringify(item.schedule || { startDate: null, endDate: null, actualStartDate: null, actualEndDate: null }),
            item.notes || '',
            item.status || 'Not Started',
            item.vendor || ''
          ]
        );
      });

      await Promise.all(insertPromises);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Line items saved successfully',
      count: lineItems.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving line items:', error);
    res.status(500).json({
      error: 'Failed to save line items',
      message: error.message
    });
  } finally {
    client.release();
  }
});

module.exports = router;
