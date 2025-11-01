# 🚀 GitHub PR Comment Tool

A powerful tool to monitor and manage actionable comments across GitHub pull requests. Built for developers who need to efficiently track feedback, suggestions, and issues in their repositories.

## ✨ Features

- **🔍 Smart Comment Detection**: Automatically identifies actionable comments using intelligent pattern matching
- **📊 Severity Classification**: Categorizes comments by priority (High, Medium, Low)
- **🎯 Action Types**: Classifies comments as Fix Required, Improvement Needed, Suggestions, Questions, or Requests
- **⏰ Automated Data Fetching**: Refreshes data every 3 hours during office hours (9 AM - 6 PM, Mon-Fri)
- **📱 Responsive Web Interface**: Clean, modern UI accessible at port 3611
- **🔗 Direct GitHub Integration**: One-click navigation to comments and file locations
- **📋 Copy-to-Clipboard**: Easy sharing of comment links
- **🔄 Real-time Refresh**: Manual refresh capability for latest PR state
- **💾 Caching System**: Efficient data storage for faster loading

## 🚦 Quick Start

### Prerequisites

1. **Node.js** (v18 or higher)
2. **GitHub CLI** installed and authenticated:
   ```bash
   # Install GitHub CLI
   # macOS
   brew install gh
   # or visit: https://cli.github.com/

   # Authenticate
   gh auth login
   ```

### Installation & Setup

1. **Clone or download the project**
2. **Run the startup script**:
   ```bash
   ./start-all.sh
   ```

That's it! The script will:
- ✅ Check GitHub CLI installation and authentication
- ✅ Install Node.js dependencies
- ✅ Set up data directories
- ✅ Run initial data fetch
- ✅ Start the background data fetcher
- ✅ Launch the web server at http://localhost:3611

## 🎛️ Available Scripts

```bash
# Start everything (recommended)
./start-all.sh

# Manual commands
npm start                # Start web server only
npm run start-fetcher    # Start data fetcher only
npm run fetch-data       # Run one-time data fetch
npm run dev             # Development mode with auto-restart
```

## 🖥️ Using the Tool

### 1. **Repository Overview**
- Sidebar shows all your repositories with recent activity
- Repositories are sorted by last push date
- Only repos with actionable comments are highlighted

### 2. **Pull Request Navigation**
- Click on a repository to see its pull requests
- PRs are sorted by comment count (most actionable first)
- Comment badges show total actionable comments per PR

### 3. **Comment Analysis**
- Select a PR to view all actionable comments
- Comments are classified by:
  - **Severity**: 🚨 High, ⚠️ Medium, ℹ️ Low
  - **Type**: Fix Required, Improvement Needed, Suggestion, Question, Request

### 4. **Taking Action**
- **📋 Copy Link**: Copy direct GitHub link to clipboard
- **🔗 View on GitHub**: Open comment in GitHub
- **📍 Go to Line**: Jump directly to code location (for line comments)

## 🔧 Configuration

### Office Hours
The data fetcher runs every 3 hours during office hours (9 AM - 6 PM, Monday-Friday). To modify:

Edit `data-fetcher.js`:
```javascript
this.officeHours = {
  startHour: 9,      // 9 AM
  endHour: 18,       // 6 PM
  workdays: [1,2,3,4,5] // Mon-Fri
};
```

### Comment Detection Patterns
The tool uses regex patterns to identify actionable comments. Customize in `github-server.js`:

```javascript
// High severity patterns
const highSeverityPatterns = [
  /\b(fix|error|bug|broken|issue|problem|wrong)\b/,
  /\b(security|vulnerability|exploit|dangerous)\b/,
  // Add your patterns...
];
```

## 📁 Project Structure

```
github-pr-comment-tool/
├── github-server.js        # Main web server
├── github-pr-tool.html     # Web interface
├── data-fetcher.js         # Background data fetcher
├── start-all.sh           # Startup script
├── package.json           # Dependencies and scripts
├── data/                  # Cached data directory
│   ├── pr-data.json      # Cached PR and comment data
│   ├── last-update.json  # Update metadata
│   └── fetcher.log       # Data fetcher logs
└── README.md             # This file
```

## 🔄 How It Works

1. **Data Collection**: The background fetcher scans your repositories for recent PRs (last 30 days)
2. **Comment Analysis**: Each comment is analyzed using pattern matching to determine if it's actionable
3. **Classification**: Actionable comments are categorized by severity and type
4. **Caching**: Data is stored locally for fast access
5. **Web Interface**: The tool provides a clean interface to browse and manage comments

## 🎨 Comment Classification

### Severity Levels
- **🚨 High**: Bugs, security issues, performance problems
- **⚠️ Medium**: Required changes, testing needs, documentation
- **ℹ️ Low**: Suggestions, naming improvements, optional enhancements

### Action Types
- **🚨 Fix Required**: Critical issues that must be addressed
- **🔧 Improvement Needed**: Code quality enhancements
- **💡 Suggestion**: Optional improvements
- **❓ Question**: Clarifications needed
- **📝 Request**: Feature requests or changes

## 🔍 API Endpoints

The tool provides several API endpoints:

- `GET /api/repos` - List repositories
- `GET /api/repos/:owner/:repo/prs` - List PRs for a repository
- `GET /api/repos/:owner/:repo/prs/:number/comments` - Get actionable comments
- `POST /api/repos/:owner/:repo/prs/:number/refresh` - Refresh PR data
- `POST /api/fetch-data` - Trigger manual data fetch
- `GET /api/cached-data` - Get all cached data

## 🐛 Troubleshooting

### GitHub CLI Issues
```bash
# Check if gh is installed
gh --version

# Check authentication
gh auth status

# Re-authenticate if needed
gh auth login
```

### Port 3611 Already in Use
```bash
# Find process using port 3611
lsof -ti:3611

# Kill the process
lsof -ti:3611 | xargs kill -9
```

### No Data Appearing
1. Check if you have recent PRs (last 30 days)
2. Verify PRs have comments
3. Run manual fetch: `npm run fetch-data`
4. Check fetcher logs: `tail -f data/fetcher.log`

## 📊 Performance

- **Fast Loading**: Cached data enables sub-second response times
- **Efficient Scanning**: Only processes repositories with recent activity
- **Smart Filtering**: Focuses on actionable content to reduce noise
- **Background Processing**: Non-blocking data updates

## 🤝 Contributing

This tool is designed to be easily customizable. Key areas for enhancement:

1. **Comment Detection**: Improve pattern matching algorithms
2. **UI/UX**: Enhance the web interface
3. **Integrations**: Add Slack, Teams, or email notifications
4. **Analytics**: Add usage statistics and trends
5. **Filters**: More advanced filtering options

## 📄 License

MIT License - feel free to use and modify as needed.

## 🙏 Acknowledgments

Built using:
- [GitHub CLI](https://cli.github.com/) for GitHub integration
- [Express.js](https://expressjs.com/) for the web server
- Modern web standards for the interface

---

**Happy coding! 🎉**

Need help? Check the logs in `data/fetcher.log` or open an issue.