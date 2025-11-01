#!/bin/bash

# GitHub PR Comment Tool - Startup Script
# This script starts both the web server and the data fetcher

echo "🚀 Starting GitHub PR Comment Tool..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if gh CLI is installed and authenticated
check_gh_cli() {
    echo -e "${BLUE}🔍 Checking GitHub CLI...${NC}"

    if ! command -v gh &> /dev/null; then
        echo -e "${RED}❌ GitHub CLI (gh) is not installed.${NC}"
        echo -e "${YELLOW}Please install it from: https://cli.github.com/${NC}"
        exit 1
    fi

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        echo -e "${RED}❌ GitHub CLI is not authenticated.${NC}"
        echo -e "${YELLOW}Please run: gh auth login${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ GitHub CLI is installed and authenticated${NC}"
}

# Function to install dependencies
install_deps() {
    echo -e "${BLUE}📦 Installing dependencies...${NC}"
    if npm install; then
        echo -e "${GREEN}✅ Dependencies installed${NC}"
    else
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
}

# Function to create data directory
setup_data_dir() {
    echo -e "${BLUE}📁 Setting up data directory...${NC}"
    mkdir -p data
    echo -e "${GREEN}✅ Data directory ready${NC}"
}

# Function to start the data fetcher in background
start_fetcher() {
    echo -e "${BLUE}🔄 Starting data fetcher...${NC}"

    # Kill any existing data fetcher process
    pkill -f "node data-fetcher.js" 2>/dev/null || true

    # Start data fetcher in background
    nohup node data-fetcher.js > data/fetcher.log 2>&1 &
    FETCHER_PID=$!

    echo -e "${GREEN}✅ Data fetcher started (PID: $FETCHER_PID)${NC}"
    echo -e "${YELLOW}📋 Logs: tail -f data/fetcher.log${NC}"
}

# Function to start the web server
start_server() {
    echo -e "${BLUE}🌐 Starting web server on port 3611...${NC}"

    # Kill any existing server process on port 3611
    lsof -ti:3611 | xargs kill -9 2>/dev/null || true

    echo -e "${GREEN}✅ Web server starting...${NC}"
    echo -e "${YELLOW}🔗 Access at: http://localhost:3611${NC}"
    echo -e "${YELLOW}📊 Health check: http://localhost:3611/health${NC}"
    echo ""
    echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"
    echo ""

    # Start the server (this will block)
    node github-server.js
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down services...${NC}"

    # Kill data fetcher
    pkill -f "node data-fetcher.js" 2>/dev/null || true

    # Kill any server processes on port 3611
    lsof -ti:3611 | xargs kill -9 2>/dev/null || true

    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Handle Ctrl+C
trap cleanup SIGINT SIGTERM

# Main execution
main() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   GitHub PR Comment Tool                     ║"
    echo "║          Monitor actionable comments across repos            ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    check_gh_cli
    install_deps
    setup_data_dir

    # Run initial data fetch if no cached data exists
    if [ ! -f "data/pr-data.json" ]; then
        echo -e "${BLUE}🔄 Running initial data fetch...${NC}"
        if node data-fetcher.js --fetch-now; then
            echo -e "${GREEN}✅ Initial data fetch completed${NC}"
        else
            echo -e "${YELLOW}⚠️  Initial data fetch failed, continuing anyway...${NC}"
        fi
    else
        echo -e "${GREEN}✅ Using existing cached data${NC}"
    fi

    start_fetcher

    # Give fetcher a moment to start
    sleep 2

    start_server
}

# Run main function
main