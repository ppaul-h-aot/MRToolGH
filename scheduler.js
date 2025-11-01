#!/usr/bin/env node
/**
 * Code Analysis Scheduler - Runs twice daily at 9 AM and 6 PM
 */

const cron = require('node-cron');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class AnalysisScheduler {
  constructor() {
    this.logFile = path.join(__dirname, 'analysis-scheduler.log');
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(this.logFile, logMessage);
  }

  async runAnalysis() {
    this.log('🚀 Starting scheduled code analysis...');

    try {
      const result = execSync('node code-analysis-runner.js', {
        cwd: __dirname,
        encoding: 'utf8',
        timeout: 300000 // 5 minutes timeout
      });

      this.log('✅ Analysis completed successfully');
      this.log(result);
    } catch (error) {
      this.log(`❌ Analysis failed: ${error.message}`);
    }
  }

  start() {
    this.log('📅 Starting Code Analysis Scheduler');
    this.log('⏰ Will run at 9:00 AM and 6:00 PM daily');

    // Run at 9 AM daily
    cron.schedule('0 9 * * *', () => {
      this.log('⏰ 9 AM scheduled run starting...');
      this.runAnalysis();
    });

    // Run at 6 PM daily
    cron.schedule('0 18 * * *', () => {
      this.log('⏰ 6 PM scheduled run starting...');
      this.runAnalysis();
    });

    // Run once on startup
    this.log('🔄 Running initial analysis...');
    this.runAnalysis();

    // Keep process alive
    process.on('SIGINT', () => {
      this.log('👋 Shutting down scheduler...');
      process.exit(0);
    });

    this.log('✅ Scheduler started successfully');
  }
}

if (require.main === module) {
  // Check if node-cron is available
  try {
    require('node-cron');
  } catch (error) {
    console.log('Installing node-cron...');
    execSync('npm install node-cron', { stdio: 'inherit' });
  }

  const scheduler = new AnalysisScheduler();
  scheduler.start();
}

module.exports = AnalysisScheduler;