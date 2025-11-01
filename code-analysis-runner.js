#!/usr/bin/env node
/**
 * Automated Code Analysis Runner
 * Runs twice daily to analyze all h1-aot repositories for code review issues
 * Stores results in JSON format for quick loading
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CodeAnalysisRunner {
  constructor() {
    this.resultsDir = path.join(__dirname, 'analysis-results');
    this.ensureResultsDirectory();
  }

  ensureResultsDirectory() {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }

  executeCommand(command) {
    try {
      return execSync(command, { encoding: 'utf8', timeout: 60000 });
    } catch (error) {
      this.log(`Command failed: ${command}`);
      this.log(`Error: ${error.message}`);
      return null;
    }
  }

  async getAllRepositories() {
    this.log('📁 Fetching all h1-aot repositories...');
    const output = this.executeCommand('gh repo list h1-aot --limit 50 --json name,owner,updatedAt');

    if (!output) return [];

    try {
      return JSON.parse(output);
    } catch (error) {
      this.log(`Failed to parse repositories: ${error.message}`);
      return [];
    }
  }

  async getOpenPRsForRepo(repoName) {
    this.log(`🔍 Checking PRs for ${repoName}...`);
    const command = `gh pr list --repo h1-aot/${repoName} --state open --limit 10 --json number,title,createdAt,author,files`;
    const output = this.executeCommand(command);

    if (!output) return [];

    try {
      return JSON.parse(output);
    } catch (error) {
      this.log(`Failed to parse PRs for ${repoName}: ${error.message}`);
      return [];
    }
  }

  async getPRDiff(repoName, prNumber) {
    this.log(`📄 Getting diff for ${repoName} PR #${prNumber}...`);
    const command = `gh pr diff ${prNumber} --repo h1-aot/${repoName}`;
    const output = this.executeCommand(command);
    return output || '';
  }

  analyzeCode(diff, fileName, repoName, prNumber) {
    const issues = [];
    const lines = diff.split('\n');

    // Security analysis patterns
    const securityPatterns = [
      {
        pattern: /password|secret|key.*=|token.*=/i,
        severity: 'high',
        type: 'fix_required',
        message: 'Potential hardcoded secret detected. Use environment variables or secure vaults.'
      },
      {
        pattern: /exec\(|eval\(|system\(/,
        severity: 'high',
        type: 'fix_required',
        message: 'Dynamic code execution detected. This could be a security risk.'
      },
      {
        pattern: /\.split\(\)\s*$/m,
        severity: 'medium',
        type: 'improvement_needed',
        message: 'Consider using shlex.split() for shell argument parsing to prevent injection.'
      },
      {
        pattern: /except\s*:/,
        severity: 'medium',
        type: 'improvement_needed',
        message: 'Bare except clause catches all exceptions. Use specific exception types.'
      },
      {
        pattern: /0\.0\.0\.0/,
        severity: 'high',
        type: 'fix_required',
        message: 'Binding to 0.0.0.0 exposes service to all interfaces. Consider localhost binding.'
      }
    ];

    // Docker-specific patterns
    const dockerPatterns = [
      {
        pattern: /FROM.*:latest/,
        severity: 'medium',
        type: 'improvement_needed',
        message: 'Using :latest tag is not recommended. Pin to specific version for reproducibility.'
      },
      {
        pattern: /USER\s+root/,
        severity: 'high',
        type: 'fix_required',
        message: 'Running container as root increases security risk. Use non-root user.'
      },
      {
        pattern: /ports:\s*-\s*"\d+:\d+"/,
        severity: 'medium',
        type: 'suggestion',
        message: 'Consider binding to localhost (127.0.0.1:port:port) for local services.'
      }
    ];

    // Database patterns
    const databasePatterns = [
      {
        pattern: /SELECT \* FROM/i,
        severity: 'low',
        type: 'suggestion',
        message: 'SELECT * queries can be inefficient. Specify exact columns needed.'
      },
      {
        pattern: /DROP TABLE|DELETE FROM.*WHERE/i,
        severity: 'high',
        type: 'fix_required',
        message: 'Destructive database operation detected. Ensure proper safeguards exist.'
      }
    ];

    // Combine all patterns
    const allPatterns = [...securityPatterns, ...dockerPatterns, ...databasePatterns];

    lines.forEach((line, index) => {
      // Only analyze added lines (starting with +)
      if (!line.startsWith('+')) return;

      const cleanLine = line.substring(1); // Remove the + prefix

      allPatterns.forEach(pattern => {
        if (pattern.pattern.test(cleanLine)) {
          issues.push({
            repository: repoName,
            prNumber: prNumber,
            file: fileName,
            line: index + 1,
            severity: pattern.severity,
            type: pattern.type,
            message: pattern.message,
            codeSnippet: cleanLine.trim(),
            githubUrl: `https://github.com/h1-aot/${repoName}/pull/${prNumber}/files`,
            detected: new Date().toISOString()
          });
        }
      });
    });

    return issues;
  }

  extractFilesFromDiff(diff) {
    const files = [];
    const lines = diff.split('\n');

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/diff --git a\/(.*?) b\/(.*)/);
        if (match) {
          files.push(match[1]);
        }
      }
    }

    return files;
  }

  async runFullAnalysis() {
    this.log('🚀 Starting automated code analysis...');
    const startTime = Date.now();

    const results = {
      analysisId: `analysis-${Date.now()}`,
      timestamp: new Date().toISOString(),
      repositories: [],
      summary: {
        totalRepositories: 0,
        totalPRs: 0,
        totalIssues: 0,
        issuesBySeverity: { high: 0, medium: 0, low: 0 },
        issuesByType: {}
      }
    };

    try {
      // Get all repositories
      const repositories = await this.getAllRepositories();
      results.summary.totalRepositories = repositories.length;

      for (const repo of repositories) {
        this.log(`\n📊 Analyzing repository: ${repo.name}`);

        const repoData = {
          name: repo.name,
          owner: repo.owner.login,
          lastUpdated: repo.updatedAt,
          pullRequests: [],
          issues: []
        };

        // Get open PRs for this repository
        const prs = await this.getOpenPRsForRepo(repo.name);
        results.summary.totalPRs += prs.length;

        for (const pr of prs) {
          this.log(`  🔍 Analyzing PR #${pr.number}: ${pr.title}`);

          const prData = {
            number: pr.number,
            title: pr.title,
            author: pr.author.login,
            createdAt: pr.createdAt,
            filesChanged: pr.files,
            issues: []
          };

          // Get diff for analysis
          const diff = await this.getPRDiff(repo.name, pr.number);

          if (diff) {
            const files = this.extractFilesFromDiff(diff);

            for (const file of files) {
              const fileIssues = this.analyzeCode(diff, file, repo.name, pr.number);
              prData.issues.push(...fileIssues);
              repoData.issues.push(...fileIssues);
            }
          }

          repoData.pullRequests.push(prData);
        }

        // Update summary statistics
        repoData.issues.forEach(issue => {
          results.summary.totalIssues++;
          results.summary.issuesBySeverity[issue.severity]++;
          results.summary.issuesByType[issue.type] = (results.summary.issuesByType[issue.type] || 0) + 1;
        });

        results.repositories.push(repoData);
      }

      // Save results
      const filename = `analysis-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
      const filepath = path.join(this.resultsDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(results, null, 2));

      // Also save as latest.json for easy access
      const latestPath = path.join(this.resultsDir, 'latest.json');
      fs.writeFileSync(latestPath, JSON.stringify(results, null, 2));

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      this.log('\n✅ Analysis completed successfully!');
      this.log(`📁 Results saved to: ${filename}`);
      this.log(`⏱️  Duration: ${duration} seconds`);
      this.log(`📊 Summary: ${results.summary.totalIssues} issues found across ${results.summary.totalPRs} PRs in ${results.summary.totalRepositories} repositories`);
      this.log(`🚨 High: ${results.summary.issuesBySeverity.high} | ⚠️  Medium: ${results.summary.issuesBySeverity.medium} | ℹ️  Low: ${results.summary.issuesBySeverity.low}`);

      return results;

    } catch (error) {
      this.log(`❌ Analysis failed: ${error.message}`);
      this.log(error.stack);
      return null;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new CodeAnalysisRunner();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Code Analysis Runner - Automated PR Review

Usage:
  node code-analysis-runner.js           Run analysis once
  node code-analysis-runner.js --daemon  Run as daemon (twice daily)
  node code-analysis-runner.js --help    Show this help

Files:
  analysis-results/latest.json           Latest analysis results
  analysis-results/analysis-YYYY-MM-DD-*.json  Archived results
    `);
    process.exit(0);
  }

  if (args.includes('--daemon')) {
    console.log('🔄 Starting daemon mode (runs twice daily at 9 AM and 6 PM)...');

    // Run immediately on start
    runner.runFullAnalysis();

    // Schedule twice daily: 9 AM and 6 PM (in milliseconds)
    const runTwiceDaily = () => {
      const now = new Date();
      const hour = now.getHours();

      // Run at 9 AM and 6 PM
      if (hour === 9 || hour === 18) {
        if (now.getMinutes() === 0) { // Only run at the top of the hour
          runner.runFullAnalysis();
        }
      }
    };

    // Check every minute
    setInterval(runTwiceDaily, 60000);

    // Keep process alive
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down daemon...');
      process.exit(0);
    });

  } else {
    // Run once
    runner.runFullAnalysis().then(() => {
      process.exit(0);
    });
  }
}

module.exports = CodeAnalysisRunner;