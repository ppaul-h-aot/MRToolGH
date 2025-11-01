#!/bin/bash

echo "🚀 Starting Langfuse Trace Analyzer..."
echo "📁 Server will run at: http://localhost:8000"
echo "🔍 Upload your Langfuse JSON files to analyze traces"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Try different Python versions
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
else
    echo "❌ Python not found. Opening file directly in browser..."
    open json-analyzer.html
fi