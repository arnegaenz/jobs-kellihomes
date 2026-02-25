/**
 * Digest Routes
 * Manual trigger for daily and weekly digest emails
 */

const express = require('express');
const router = express.Router();
const { sendDailyDigest, sendWeeklyDigest } = require('../services/emailDigest');

/**
 * POST /digest/daily
 * Manually trigger the daily digest email
 */
router.post('/daily', async (req, res) => {
  try {
    const result = await sendDailyDigest();
    res.json({
      message: 'Daily digest email sent successfully',
      itemCount: result.itemCount,
      recipients: result.recipients,
    });
  } catch (error) {
    console.error('Error sending daily digest:', error);
    res.status(500).json({
      error: 'Failed to send daily digest email',
      message: error.message,
    });
  }
});

/**
 * POST /digest/weekly
 * Manually trigger the weekly digest email
 */
router.post('/weekly', async (req, res) => {
  try {
    const result = await sendWeeklyDigest();
    res.json({
      message: 'Weekly digest email sent successfully',
      jobCount: result.jobCount,
      recipients: result.recipients,
    });
  } catch (error) {
    console.error('Error sending weekly digest:', error);
    res.status(500).json({
      error: 'Failed to send weekly digest email',
      message: error.message,
    });
  }
});

/**
 * POST /digest/send (backward compat — sends weekly)
 */
router.post('/send', async (req, res) => {
  try {
    const result = await sendWeeklyDigest();
    res.json({
      message: 'Digest email sent successfully',
      jobCount: result.jobCount,
      recipients: result.recipients,
    });
  } catch (error) {
    console.error('Error sending digest:', error);
    res.status(500).json({
      error: 'Failed to send digest email',
      message: error.message,
    });
  }
});

module.exports = router;
