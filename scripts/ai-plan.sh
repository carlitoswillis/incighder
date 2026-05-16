#!/bin/bash

# ai-plan.sh - Scaffolds a new implementation plan

set -e

PLAN_NAME=$1
DATE=$(date +%Y-%m-%d)

if [ -z "$PLAN_NAME" ]; then
    echo "Usage: ./scripts/ai-plan.sh <plan-name>"
    exit 1
fi

PLAN_FILE=".ai/plans/${DATE}-${PLAN_NAME}.md"
mkdir -p .ai/plans

if [ -f "$PLAN_FILE" ]; then
    echo "❌ Plan already exists: $PLAN_FILE"
    exit 1
fi

{
    echo "# Plan: $PLAN_NAME"
    echo ""
    echo "PURPOSE: Implementation strategy for $PLAN_NAME."
    echo ""
    echo "## Objective"
    echo "[What are we trying to achieve?]"
    echo ""
    echo "## Proposed Changes"
    echo "- [ ] File A: Change X"
    echo "- [ ] File B: Change Y"
    echo ""
    echo "## Verification Strategy"
    echo "- [ ] Test Case 1"
    echo "- [ ] Manual Check 2"
    echo ""
    echo "## Risks & Considerations"
    echo "- [ ] Potential side effect Z"
} > "$PLAN_FILE"

echo "✅ Created plan template at $PLAN_FILE"
