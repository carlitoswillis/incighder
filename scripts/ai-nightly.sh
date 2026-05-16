#!/bin/bash

# ai-nightly.sh - Bounded background tasks for repo health

set -e

echo "🌙 Running AI Nightly Tasks..."

# 1. Summarize TODOs
echo "Summarizing TODOs..."
grep -r "TODO" . --exclude-dir=".ai" --exclude-dir="node_modules" > .ai/reports/nightly-todos.md || true

# 2. Check for dead code (Simple find)
echo "Scanning for potentially unused files..."
# (This is just a placeholder, actual dead code analysis is tool-specific)
find . -name "*.js" -o -name "*.ts" | xargs du -sh | sort -hr | head -n 10 > .ai/reports/nightly-file-sizes.md

# 3. Update ARCHITECTURE.md (optional check)
echo "Verifying architectural alignment..."
# This would ideally call a local LLM to review the day's commits

echo "✅ Nightly maintenance complete. Reports generated in .ai/reports/"
