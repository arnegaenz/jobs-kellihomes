#!/usr/bin/env node

/**
 * Test script for email digests
 *
 * Usage:
 *   npm run test-digest                              # Preview Arne's daily digest HTML
 *   npm run test-digest -- --user=raquel             # Preview Raquel's daily digest
 *   npm run test-digest -- --weekly                  # Preview weekly digest HTML
 *   npm run test-digest -- --send                    # Send daily digest emails via SES
 *   npm run test-digest -- --weekly --send           # Send weekly digest email via SES
 *
 * Examples:
 *   npm run test-digest > /tmp/daily.html && open /tmp/daily.html
 *   npm run test-digest -- --user=justin > /tmp/daily-justin.html && open /tmp/daily-justin.html
 *   npm run test-digest -- --weekly > /tmp/weekly.html && open /tmp/weekly.html
 *   npm run test-digest -- --send
 */

require('dotenv').config();
const { initializePool, closePool } = require('../db');
const {
  fetchDailyTasks,
  fetchDailyCalendar,
  buildDailyHtml,
  sendDailyDigest,
  fetchWeeklyData,
  buildWeeklyHtml,
  sendWeeklyDigest,
} = require('../services/emailDigest');

const shouldSend = process.argv.includes('--send');
const isWeekly = process.argv.includes('--weekly');
// --user=arne to preview a specific person's email (default: arne)
const userArg = process.argv.find((a) => a.startsWith('--user='));
const forUser = userArg ? userArg.split('=')[1] : 'arne';
const type = isWeekly ? 'weekly' : 'daily';

async function main() {
  initializePool();

  try {
    if (shouldSend) {
      console.error(`Sending ${type} digest email...`);
      if (isWeekly) {
        const result = await sendWeeklyDigest();
        console.error(`Done! Sent to ${result.recipients.length} recipients with ${result.jobCount} jobs.`);
      } else {
        const result = await sendDailyDigest();
        console.error(`Done! Sent to ${result.recipients.length} recipients with ${result.itemCount} items.`);
      }
    } else {
      if (isWeekly) {
        const jobs = await fetchWeeklyData();
        console.error(`Fetched ${jobs.length} active jobs`);
        const html = buildWeeklyHtml(jobs, new Date());
        process.stdout.write(html);
      } else {
        const [tasks, calendarItems] = await Promise.all([
          fetchDailyTasks(),
          fetchDailyCalendar(),
        ]);
        console.error(`Fetched ${tasks.length} tasks and ${calendarItems.length} calendar items for ${forUser}`);
        const html = buildDailyHtml(tasks, calendarItems, new Date(), forUser);
        process.stdout.write(html);
      }
      console.error(`\nHTML written to stdout. Pipe to a file to preview:`);
      console.error(`  npm run test-digest${isWeekly ? ' -- --weekly' : ''} > /tmp/${type}.html && open /tmp/${type}.html`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
