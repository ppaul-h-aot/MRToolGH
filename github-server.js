const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const GitHubDataFetcher = require('./data-fetcher');

const app = express();
const PORT = 3611;

// Initialize data fetcher
const dataFetcher = new GitHubDataFetcher();

// Security configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Utility function to execute gh CLI commands
function executeGhCommand(command) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return JSON.parse(result);
  } catch (error) {
    console.error(`Error executing gh command: ${command}`, error.message);
    throw new Error(`GitHub CLI error: ${error.message}`);
  }
}

// Get cached data summary
app.get('/api/cached-data', async (req, res) => {
  try {
    const cachedData = dataFetcher.loadCachedData();
    const lastUpdate = dataFetcher.getLastUpdateInfo();

    if (cachedData) {
      res.json({
        success: true,
        data: cachedData,
        lastUpdate,
        fromCache: true
      });
    } else {
      res.json({
        success: false,
        error: 'No cached data available. Please wait for the next data fetch or trigger a manual fetch.',
        lastUpdate: null,
        fromCache: false
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all repositories accessible to the user
app.get('/api/repos', async (req, res) => {
  try {
    // Try to use cached data first
    const cachedData = dataFetcher.loadCachedData();
    if (cachedData && req.query.use_cache !== 'false') {
      const repos = cachedData.repositories.map(repo => ({
        name: repo.name,
        owner: { login: repo.owner },
        url: repo.url,
        updatedAt: repo.lastPush || new Date().toISOString()
      }));

      return res.json({
        success: true,
        repos: repos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
        fromCache: true,
        lastUpdate: cachedData.lastUpdate
      });
    }

    // Fallback to live data - check all h1-aot repositories
    const reposToCheck = [
      'h1-aot/agent_manager',
      'h1-aot/aot-base',
      'h1-aot/aot-frontend-api',
      'h1-aot/agent0management-service',
      'h1-aot/aot-user-ui',
      'h1-aot/masp',
      'h1-aot/cveasts',
      'h1-aot/offsec-benchmarks',
      'h1-aot/github-aws-tests',
      'h1-aot/aot-terraform',
      'ppaul-h-aot/MRToolGH'
    ];

    const repos = [];
    for (const repoName of reposToCheck) {
      try {
        const repoData = executeGhCommand(`gh repo view ${repoName} --json name,owner,url,updatedAt`);
        repos.push(repoData);
      } catch (error) {
        console.error(`Error accessing repository ${repoName}:`, error.message);
      }
    }

    // Sort repos by recent activity
    const sortedRepos = repos.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    res.json({
      success: true,
      repos: sortedRepos,
      fromCache: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get PRs for a specific repository
app.get('/api/repos/:owner/:repo/prs', async (req, res) => {
  const { owner, repo } = req.params;
  const { state = 'open' } = req.query;

  try {
    // Try to use cached data first
    const cachedData = dataFetcher.loadCachedData();
    if (cachedData && req.query.use_cache !== 'false') {
      const repoData = cachedData.repositories.find(r => r.owner === owner && r.name === repo);
      if (repoData) {
        const prs = repoData.pullRequests.map(pr => ({
          ...pr,
          totalComments: pr.actionableCount,
          commentCount: pr.actionableCount,
          reviewCommentCount: 0
        }));

        return res.json({
          success: true,
          prs: prs.sort((a, b) => b.totalComments - a.totalComments),
          fromCache: true,
          lastUpdate: cachedData.lastUpdate
        });
      }
    }

    // Fallback to live data
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const prs = executeGhCommand(
      `gh pr list --repo ${owner}/${repo} --state ${state} --json number,title,author,createdAt,updatedAt,url,reviewDecision,isDraft --limit 100`
    );

    // Filter PRs to last 30 days
    const filteredPrs = prs.filter(pr => new Date(pr.createdAt) >= new Date(thirtyDaysAgo));

    // Get comment counts for each PR
    const prsWithComments = await Promise.all(
      filteredPrs.map(async pr => {
        try {
          const comments = executeGhCommand(
            `gh pr view ${pr.number} --repo ${owner}/${repo} --json comments`
          );

          const reviewComments = executeGhCommand(
            `gh api repos/${owner}/${repo}/pulls/${pr.number}/comments --paginate`
          );

          return {
            ...pr,
            commentCount: (comments.comments || []).length,
            reviewCommentCount: reviewComments.length,
            totalComments: (comments.comments || []).length + reviewComments.length
          };
        } catch (error) {
          console.error(`Error getting comments for PR ${pr.number}:`, error.message);
          return {
            ...pr,
            commentCount: 0,
            reviewCommentCount: 0,
            totalComments: 0
          };
        }
      })
    );

    res.json({
      success: true,
      prs: prsWithComments.sort((a, b) => b.totalComments - a.totalComments),
      fromCache: false
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get actionable comments for a specific PR
app.get('/api/repos/:owner/:repo/prs/:number/comments', async (req, res) => {
  const { owner, repo, number } = req.params;

  try {
    // Try to use cached data first
    const cachedData = dataFetcher.loadCachedData();
    if (cachedData && req.query.use_cache !== 'false') {
      const repoData = cachedData.repositories.find(r => r.owner === owner && r.name === repo);
      if (repoData) {
        const prData = repoData.pullRequests.find(pr => pr.number === parseInt(number));
        if (prData) {
          return res.json({
            success: true,
            pr: prData,
            actionableComments: prData.actionableComments || [],
            stats: {
              total: prData.actionableCount || 0,
              byType: prData.actionableComments?.reduce((acc, comment) => {
                acc[comment.actionType] = (acc[comment.actionType] || 0) + 1;
                return acc;
              }, {}) || {},
              bySeverity: prData.severityCounts || { high: 0, medium: 0, low: 0 }
            },
            fromCache: true,
            lastUpdate: cachedData.lastUpdate
          });
        }
      }
    }
    // Get PR details
    const prDetails = executeGhCommand(
      `gh pr view ${number} --repo ${owner}/${repo} --json number,title,body,author,createdAt,url,files,reviewDecision,isDraft`
    );

    // Get general comments
    const generalComments = executeGhCommand(
      `gh pr view ${number} --repo ${owner}/${repo} --json comments`
    ).comments || [];

    // Get review comments (line-specific)
    const reviewComments = executeGhCommand(
      `gh api repos/${owner}/${repo}/pulls/${number}/comments --paginate`
    );

    // Get PR reviews
    const reviews = executeGhCommand(
      `gh api repos/${owner}/${repo}/pulls/${number}/reviews --paginate`
    );

    // Process and categorize comments as actionable
    const actionableComments = [];

    // Process review comments (these are line-specific and more actionable)
    reviewComments.forEach(comment => {
      const isActionable = isCommentActionable(comment.body);
      if (isActionable.actionable) {
        actionableComments.push({
          id: comment.id,
          type: 'review_comment',
          author: comment.user.login,
          body: comment.body,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          path: comment.path,
          line: comment.original_line || comment.line,
          diffHunk: comment.diff_hunk,
          url: comment.html_url,
          prUrl: `https://github.com/${owner}/${repo}/pull/${number}#discussion_r${comment.id}`,
          actionType: isActionable.type,
          severity: isActionable.severity,
          copyableLink: `https://github.com/${owner}/${repo}/pull/${number}/files#discussion_r${comment.id}`,
          fileLineUrl: comment.path ? `https://github.com/${owner}/${repo}/pull/${number}/files#diff-${Buffer.from(comment.path).toString('hex')}R${comment.line}` : null
        });
      }
    });

    // Process general comments
    generalComments.forEach(comment => {
      const isActionable = isCommentActionable(comment.body);
      if (isActionable.actionable) {
        actionableComments.push({
          id: comment.id,
          type: 'general_comment',
          author: comment.author.login,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          url: `https://github.com/${owner}/${repo}/pull/${number}#issuecomment-${comment.id}`,
          prUrl: `https://github.com/${owner}/${repo}/pull/${number}#issuecomment-${comment.id}`,
          actionType: isActionable.type,
          severity: isActionable.severity,
          copyableLink: `https://github.com/${owner}/${repo}/pull/${number}#issuecomment-${comment.id}`,
          fileLineUrl: null
        });
      }
    });

    // Process reviews for actionable content
    reviews.forEach(review => {
      if (review.body && review.state !== 'COMMENTED') {
        const isActionable = isCommentActionable(review.body);
        if (isActionable.actionable) {
          actionableComments.push({
            id: review.id,
            type: 'review',
            author: review.user.login,
            body: review.body,
            createdAt: review.submitted_at,
            updatedAt: review.submitted_at,
            state: review.state,
            url: review.html_url,
            prUrl: review.html_url,
            actionType: isActionable.type,
            severity: isActionable.severity,
            copyableLink: review.html_url,
            fileLineUrl: null
          });
        }
      }
    });

    // Sort by creation date (newest first)
    actionableComments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      pr: prDetails,
      actionableComments,
      stats: {
        total: actionableComments.length,
        byType: actionableComments.reduce((acc, comment) => {
          acc[comment.actionType] = (acc[comment.actionType] || 0) + 1;
          return acc;
        }, {}),
        bySeverity: actionableComments.reduce((acc, comment) => {
          acc[comment.severity] = (acc[comment.severity] || 0) + 1;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Refresh data for a specific PR (gets latest state)
app.post('/api/repos/:owner/:repo/prs/:number/refresh', async (req, res) => {
  const { owner, repo, number } = req.params;

  try {
    // Force fresh data by using gh API directly
    const prData = executeGhCommand(
      `gh api repos/${owner}/${repo}/pulls/${number}`
    );

    // Get fresh comments
    const freshComments = executeGhCommand(
      `gh api repos/${owner}/${repo}/pulls/${number}/comments --paginate`
    );

    res.json({
      success: true,
      message: 'PR data refreshed successfully',
      pr: prData,
      commentCount: freshComments.length,
      lastRefresh: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Trigger manual data fetch
app.post('/api/fetch-data', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Data fetch started in background',
      timestamp: new Date().toISOString()
    });

    // Start fetch in background
    dataFetcher.fetchAllData().catch(error => {
      console.error('❌ Background fetch failed:', error.message);
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Function to determine if a comment is actionable
function isCommentActionable(commentBody) {
  if (!commentBody) return { actionable: false };

  const body = commentBody.toLowerCase();

  // High severity actionable patterns
  const highSeverityPatterns = [
    /\b(fix|error|bug|broken|issue|problem|wrong)\b/,
    /\b(security|vulnerability|exploit|dangerous)\b/,
    /\b(performance|slow|inefficient|optimize)\b/,
    /\b(memory leak|deadlock|race condition)\b/
  ];

  // Medium severity actionable patterns
  const mediumSeverityPatterns = [
    /\b(should|must|need to|have to|required)\b/,
    /\b(refactor|restructure|reorganize|cleanup)\b/,
    /\b(test|testing|unit test|integration test)\b/,
    /\b(documentation|docs|comment|explain)\b/,
    /\b(style|format|convention|standard)\b/
  ];

  // Low severity actionable patterns
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
      return {
        actionable: true,
        type: 'fix_required',
        severity: 'high'
      };
    }
  }

  for (const pattern of mediumSeverityPatterns) {
    if (pattern.test(body)) {
      return {
        actionable: true,
        type: 'improvement_needed',
        severity: 'medium'
      };
    }
  }

  for (const pattern of lowSeverityPatterns) {
    if (pattern.test(body)) {
      return {
        actionable: true,
        type: 'suggestion',
        severity: 'low'
      };
    }
  }

  for (const pattern of questionPatterns) {
    if (pattern.test(body)) {
      return {
        actionable: true,
        type: 'question',
        severity: 'medium'
      };
    }
  }

  for (const pattern of requestPatterns) {
    if (pattern.test(body)) {
      return {
        actionable: true,
        type: 'request',
        severity: 'medium'
      };
    }
  }

  return { actionable: false };
}

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'github-pr-tool.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'GitHub PR Comment Tool'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GitHub PR Comment Tool running on port ${PORT}`);
  console.log(`📊 Access at: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;