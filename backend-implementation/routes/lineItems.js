/**
 * Line Items Routes for Kelli Homes Job Management
 * Handles job costing with budget tracking, schedule, and notes
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams to access :jobId
const { pool } = require('../db');

/**
 * GET /jobs/:jobId/line-items
 * Fetch all line items for a specific job
 */
router.get('/', async (req, res) => {
  const { jobId } = req.params;

  try {
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
    const lineItems = result.rows.map(row => ({
      code: row.code,
      name: row.name,
      originalBudget: row.budget || 0,
      budgetHistory: row.budget_history || [],
      currentBudget: calculateCurrentBudget(row.budget, row.budget_history),
      actual: row.actual || 0,
      variance: calculateVariance(row.budget, row.budget_history, row.actual),
      schedule: row.schedule || { startDate: null, endDate: null },
      notes: row.notes || '',
      status: row.status || 'Not Started',
      vendor: row.vendor || ''
    }));

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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete existing line items for this job
    await client.query('DELETE FROM line_items WHERE job_id = $1', [jobId]);

    // Insert new line items
    if (lineItems.length > 0) {
      const insertPromises = lineItems.map(item => {
        // Calculate current budget from original + increases
        const originalBudget = parseFloat(item.originalBudget) || 0;
        const budgetIncreases = item.budgetHistory || [];
        const totalIncrease = budgetIncreases.reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0);
        const currentBudget = originalBudget + totalIncrease;

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
            JSON.stringify(item.schedule || { startDate: null, endDate: null }),
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

/**
 * Helper: Calculate current budget (original + sum of increases)
 */
function calculateCurrentBudget(originalBudget, budgetHistory) {
  const original = parseFloat(originalBudget) || 0;
  const increases = Array.isArray(budgetHistory)
    ? budgetHistory.reduce((sum, inc) => sum + (parseFloat(inc.amount) || 0), 0)
    : 0;
  return original + increases;
}

/**
 * Helper: Calculate variance (currentBudget - actual)
 * Positive = under budget, Negative = over budget
 */
function calculateVariance(originalBudget, budgetHistory, actual) {
  const currentBudget = calculateCurrentBudget(originalBudget, budgetHistory);
  const actualCost = parseFloat(actual) || 0;
  return currentBudget - actualCost;
}

module.exports = router;
