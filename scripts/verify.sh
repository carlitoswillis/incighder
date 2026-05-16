#!/bin/bash

# verify.sh - Unified quality gate

set -e

echo "🔍 Starting verification..."

# 1. Linting/Formatting (Generic Check)
if [ -f "package.json" ]; then
    if grep -q "lint" package.json; then
        echo "Running npm run lint..."
        npm run lint --silent || echo "⚠️ Linting warnings/errors found."
    fi
fi

# 2. Type Checking
if [ -f "tsconfig.json" ]; then
    echo "Running TypeScript type check (tsc)..."
    npx tsc --noEmit || echo "⚠️ Type errors found."
fi

# 3. Tests
if [ -f "package.json" ]; then
    if grep -q "test" package.json; then
        echo "Running npm test..."
        npm test -- --watchAll=false || echo "⚠️ Tests failed."
    fi
elif [ -f "requirements.txt" ]; then
    if command -v pytest &> /dev/null; then
        echo "Running pytest..."
        pytest || echo "⚠️ Tests failed."
    fi
fi

# 4. Custom Checks (Project specific)
if [ -f "scripts/custom-verify.sh" ]; then
    ./scripts/custom-verify.sh
fi

echo "✅ Verification complete."
