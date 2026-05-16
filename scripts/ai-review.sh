#!/bin/bash

# ai-review.sh - Prepares a review report for the current diff

set -e

REPORT_FILE=".ai/reports/review-$(date +%Y%m%d-%H%M).md"
mkdir -p .ai/reports

echo "Analyzing current changes..."

{
    echo "# AI Review Report"
    echo "Date: $(date)"
    echo ""
    echo "## Summary of Changes"
    git diff --stat HEAD
    echo ""
    echo "## Detailed Diff"
    echo "\`\`\`diff"
    git diff HEAD
    echo "\`\`\`"
    echo ""
    echo "## Potential Issues to Address"
    echo "- [ ] Check for architectural consistency with ARCHITECTURE.md"
    echo "- [ ] Verify that AGENTS.md constraints were followed"
    echo "- [ ] Ensure tests were added for new functionality"
} > "$REPORT_FILE"

echo "✅ Review report generated at $REPORT_FILE"
echo "You can now share this report with your AI assistant for a deeper analysis."
