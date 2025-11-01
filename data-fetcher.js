const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GitHubDataFetcher {
  constructor() {
    this.dataPath = path.join(__dirname, 'data');
    this.prDataFile = path.join(this.dataPath, 'pr-data.json');
    this.lastUpdateFile = path.join(this.dataPath, 'last-update.json');

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Office hours configuration (9 AM to 6 PM, Monday to Friday)
    this.officeHours = {
      startHour: 9,
      endHour: 18,
      workdays: [1, 2, 3, 4, 5] // Monday to Friday
    };
  }

  // Execute GitHub CLI command
  executeGhCommand(command) {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
      return JSON.parse(result);
    } catch (error) {
      console.error(`Error executing gh command: ${command}`, error.message);
      throw new Error(`GitHub CLI error: ${error.message}`);
    }
  }

  // Check if current time is within office hours
  isOfficeHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    return this.officeHours.workdays.includes(day) &&
           hour >= this.officeHours.startHour &&
           hour < this.officeHours.endHour;
  }

  // Get list of repositories to monitor
  async getRepositoriesToMonitor() {
    try {
      // Hardcoded list of repositories to monitor (add more as needed)
      const reposToMonitor = [
        'h1-aot/aot-base',
        'ppaul-h-aot/MRToolGH'
      ];

      const repos = [];

      for (const repoName of reposToMonitor) {
        try {
          const repoData = this.executeGhCommand(
            `gh repo view ${repoName} --json name,owner,url,updatedAt,pushedAt`
          );

          // Check if repo has recent activity (last 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          if (repoData.pushedAt && new Date(repoData.pushedAt) >= thirtyDaysAgo) {
            repos.push(repoData);
          }
        } catch (error) {
          console.error(`Error accessing repository ${repoName}:`, error.message);
        }
      }

      return repos;
    } catch (error) {
      console.error('Error getting repositories:', error.message);
      return [];
    }
  }

  // Get actionable comments for a PR
  async getActionableComments(owner, repo, prNumber) {
    try {
      // Get review comments (line-specific)
      const reviewComments = this.executeGhCommand(
        `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --paginate`
      );

      // Get general comments
      const generalCommentsResult = this.executeGhCommand(
        `gh pr view ${prNumber} --repo ${owner}/${repo} --json comments`
      );
      const generalComments = generalCommentsResult.comments || [];

      // Get PR reviews
      const reviews = this.executeGhCommand(
        `gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --paginate`
      );

      const actionableComments = [];

      // Process review comments
      reviewComments.forEach(comment => {
        const actionable = this.isCommentActionable(comment.body);
        if (actionable.actionable) {
          actionableComments.push({
            id: comment.id,
            type: 'review_comment',
            author: comment.user.login,
            body: comment.body,
            createdAt: comment.created_at,
            path: comment.path,
            line: comment.line,
            url: comment.html_url,
            actionType: actionable.type,
            severity: actionable.severity
          });
        }
      });

      // Process general comments
      generalComments.forEach(comment => {
        const actionable = this.isCommentActionable(comment.body);
        if (actionable.actionable) {
          actionableComments.push({
            id: comment.id,
            type: 'general_comment',
            author: comment.author.login,
            body: comment.body,
            createdAt: comment.createdAt,
            url: `https://github.com/${owner}/${repo}/pull/${prNumber}#issuecomment-${comment.id}`,
            actionType: actionable.type,
            severity: actionable.severity
          });
        }
      });

      // Process reviews
      reviews.forEach(review => {
        if (review.body && review.state !== 'COMMENTED') {
          const actionable = this.isCommentActionable(review.body);
          if (actionable.actionable) {
            actionableComments.push({
              id: review.id,
              type: 'review',
              author: review.user.login,
              body: review.body,
              createdAt: review.submitted_at,
              state: review.state,
              url: review.html_url,
              actionType: actionable.type,
              severity: actionable.severity
            });
          }
        }
      });

      return actionableComments;
    } catch (error) {
      console.error(`Error getting comments for PR ${prNumber}:`, error.message);
      return [];
    }
  }

  // Check if a comment is actionable (same logic as server)
  isCommentActionable(commentBody) {
    if (!commentBody) return { actionable: false };

    const body = commentBody.toLowerCase();

    // High severity patterns
    const highSeverityPatterns = [
      /\b(fix|error|bug|broken|issue|problem|wrong)\b/,
      /\b(security|vulnerability|exploit|dangerous)\b/,
      /\b(performance|slow|inefficient|optimize)\b/,
      /\b(memory leak|deadlock|race condition)\b/
    ];

    // Medium severity patterns
    const mediumSeverityPatterns = [
      /\b(should|must|need to|have to|required)\b/,
      /\b(refactor|restructure|reorganize|cleanup)\b/,
      /\b(test|testing|unit test|integration test)\b/,
      /\b(documentation|docs|comment|explain)\b/,
      /\b(style|format|convention|standard)\b/
    ];

    // Low severity patterns
    const lowSeverityPatterns = [
      /\b(consider|suggest|might|could|perhaps)\b/,
      /\b(improvement|enhancement|better)\b/,
      /\b(question|clarification|understand)\b/,
      /\b(naming|variable|function name)\b/
    ];

    // Question patterns
    const questionPatterns = [
      /\?/,
      /\b(why|how|what|when|where|which)\b/,
      /\b(can you|could you|would you)\b/
    ];

    // Request patterns
    const requestPatterns = [
      /\b(please|add|remove|change|update|modify)\b/,
      /\b(implement|create|build|develop)\b/
    ];

    for (const pattern of highSeverityPatterns) {
      if (pattern.test(body)) {
        return { actionable: true, type: 'fix_required', severity: 'high' };
      }
    }

    for (const pattern of mediumSeverityPatterns) {
      if (pattern.test(body)) {
        return { actionable: true, type: 'improvement_needed', severity: 'medium' };
      }
    }

    for (const pattern of lowSeverityPatterns) {
      if (pattern.test(body)) {
        return { actionable: true, type: 'suggestion', severity: 'low' };
      }
    }

    for (const pattern of questionPatterns) {
      if (pattern.test(body)) {
        return { actionable: true, type: 'question', severity: 'medium' };
      }
    }

    for (const pattern of requestPatterns) {
      if (pattern.test(body)) {
        return { actionable: true, type: 'request', severity: 'medium' };
      }
    }

    return { actionable: false };
  }

  // Fetch data for all repositories and PRs
  async fetchAllData() {
    console.log('🔄 Starting data fetch...');

    const repos = await this.getRepositoriesToMonitor();
    console.log(`📁 Found ${repos.length} active repositories to monitor`);

    const allData = {
      lastUpdate: new Date().toISOString(),
      repositories: []
    };

    for (const repo of repos) {
      console.log(`📊 Processing ${repo.owner.login}/${repo.name}...`);

      try {
        // Get PRs for this repo (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const prs = this.executeGhCommand(
          `gh pr list --repo ${repo.owner.login}/${repo.name} --state all --json number,title,author,createdAt,updatedAt,url,reviewDecision,isDraft --limit 50`
        );

        // Filter PRs to last 30 days
        const recentPrs = prs.filter(pr => new Date(pr.createdAt) >= new Date(thirtyDaysAgo));

        const repoData = {
          owner: repo.owner.login,
          name: repo.name,
          url: repo.url,
          lastPush: repo.pushedAt,
          pullRequests: []
        };

        // Process each PR
        for (const pr of recentPrs) {
          console.log(`  📝 Processing PR #${pr.number}: ${pr.title}`);

          const actionableComments = await this.getActionableComments(
            repo.owner.login,
            repo.name,
            pr.number
          );

          if (actionableComments.length > 0) {
            repoData.pullRequests.push({
              ...pr,
              actionableComments,
              actionableCount: actionableComments.length,
              severityCounts: {
                high: actionableComments.filter(c => c.severity === 'high').length,
                medium: actionableComments.filter(c => c.severity === 'medium').length,
                low: actionableComments.filter(c => c.severity === 'low').length
              }
            });
          }
        }

        // Only include repos with actionable PRs
        if (repoData.pullRequests.length > 0) {
          allData.repositories.push(repoData);
          console.log(`  ✅ Found ${repoData.pullRequests.length} PRs with actionable comments`);
        } else {
          console.log(`  ℹ️  No actionable comments found`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${repo.owner.login}/${repo.name}:`, error.message);
      }
    }

    // Save data to file
    fs.writeFileSync(this.prDataFile, JSON.stringify(allData, null, 2));
    fs.writeFileSync(this.lastUpdateFile, JSON.stringify({
      lastUpdate: allData.lastUpdate,
      repositoryCount: allData.repositories.length,
      totalPRs: allData.repositories.reduce((sum, repo) => sum + repo.pullRequests.length, 0),
      totalActionableComments: allData.repositories.reduce((sum, repo) =>
        sum + repo.pullRequests.reduce((prSum, pr) => prSum + pr.actionableCount, 0), 0)
    }, null, 2));

    console.log(`✅ Data fetch complete! Found actionable comments in ${allData.repositories.length} repositories`);
    return allData;
  }

  // Load cached data
  loadCachedData() {
    try {
      if (fs.existsSync(this.prDataFile)) {
        return JSON.parse(fs.readFileSync(this.prDataFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading cached data:', error.message);
    }
    return null;
  }

  // Get last update info
  getLastUpdateInfo() {
    try {
      if (fs.existsSync(this.lastUpdateFile)) {
        return JSON.parse(fs.readFileSync(this.lastUpdateFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading update info:', error.message);
    }
    return null;
  }

  // Start the scheduled fetcher
  startScheduledFetcher() {
    console.log('🚀 Starting GitHub PR Data Fetcher');
    console.log(`📅 Office hours: ${this.officeHours.startHour}:00 - ${this.officeHours.endHour}:00, Mon-Fri`);

    // Run immediately if in office hours
    if (this.isOfficeHours()) {
      console.log('⏰ Currently in office hours, running initial fetch...');
      this.fetchAllData().catch(error => {
        console.error('❌ Error in initial fetch:', error.message);
      });
    } else {
      console.log('🌙 Currently outside office hours, waiting for next office hour...');
    }

    // Set up interval to check every hour
    setInterval(() => {
      const now = new Date();

      // Only run every 3 hours during office hours
      if (this.isOfficeHours() && now.getHours() % 3 === 0 && now.getMinutes() === 0) {
        console.log('⏰ Time for scheduled data fetch...');
        this.fetchAllData().catch(error => {
          console.error('❌ Error in scheduled fetch:', error.message);
        });
      }
    }, 60 * 1000); // Check every minute

    console.log('✅ Scheduler started. Data will be fetched every 3 hours during office hours.');
  }
}

// Export for use as module
module.exports = GitHubDataFetcher;

// If run directly, start the scheduler
if (require.main === module) {
  const fetcher = new GitHubDataFetcher();

  // Handle command line arguments
  const args = process.argv.slice(2);

  if (args.includes('--fetch-now')) {
    console.log('🔄 Running immediate data fetch...');
    fetcher.fetchAllData().then(() => {
      console.log('✅ Fetch complete!');
      process.exit(0);
    }).catch(error => {
      console.error('❌ Fetch failed:', error.message);
      process.exit(1);
    });
  } else {
    fetcher.startScheduledFetcher();
  }
}