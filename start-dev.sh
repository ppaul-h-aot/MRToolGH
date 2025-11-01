#!/bin/bash

# 🚀 GitHub PR Comment Tool - Development Mode with Hot Reload
echo "🚀 Starting GitHub PR Comment Tool in Development Mode..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               GitHub PR Comment Tool - DEV MODE              ║"
echo "║          Monitor actionable comments across repos            ║"
echo "║                    With Hot Reload!                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if GitHub CLI is installed and authenticated
echo -e "${BLUE}🔍 Checking GitHub CLI...${NC}"
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is not installed. Please install it first:${NC}"
    echo "   macOS: brew install gh"
    echo "   Other: https://cli.github.com/"
    exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI is not authenticated. Please run:${NC}"
    echo "   gh auth login"
    exit 1
fi

echo -e "${GREEN}✅ GitHub CLI is installed and authenticated${NC}"

# Install dependencies if needed
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install > /dev/null 2>&1
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Create data directory
echo -e "${BLUE}📁 Setting up data directory...${NC}"
mkdir -p data
echo -e "${GREEN}✅ Data directory ready${NC}"

# Kill any existing processes on port 3611
echo -e "${BLUE}🔄 Cleaning up existing processes...${NC}"
lsof -ti:3611 | xargs kill -9 2>/dev/null || true
echo -e "${GREEN}✅ Port 3611 is available${NC}"

# Start data fetcher in background
echo -e "${BLUE}🔄 Starting data fetcher...${NC}"
node data-fetcher.js > data/fetcher.log 2>&1 &
FETCHER_PID=$!
echo -e "${GREEN}✅ Data fetcher started (PID: $FETCHER_PID)${NC}"
echo -e "${YELLOW}📋 Logs: tail -f data/fetcher.log${NC}"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${BLUE}🛑 Shutting down services...${NC}"
    kill $FETCHER_PID 2>/dev/null || true
    lsof -ti:3611 | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Set trap to cleanup on exit
trap cleanup SIGTERM SIGINT

# Start web server with hot reload
echo -e "${BLUE}🌐 Starting web server with hot reload...${NC}"
echo -e "${GREEN}✅ Web server starting with nodemon...${NC}"
echo -e "${YELLOW}🔗 Access at: http://localhost:3611${NC}"
echo -e "${YELLOW}📊 Health check: http://localhost:3611/health${NC}"
echo ""
echo -e "${BLUE}🔥 Hot reload is enabled - changes will auto-restart the server${NC}"
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"
echo ""

# Start with nodemon for hot reload
npx nodemon --watch github-server.js --watch github-pr-tool.html --watch data-fetcher.js github-server.js