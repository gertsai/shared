#!/bin/bash

echo "🚀 Generating test reports..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Run tests with coverage
echo -e "${BLUE}Running tests with coverage...${NC}"
HAS_REDIS=1 pnpm test -- --reporter=junit --outputFile=reports/junit/api-rlr.xml

# Convert XML to JSON
echo -e "${BLUE}Converting JUnit XML to JSON...${NC}"
node scripts/junit-to-json.mjs reports/junit/api-rlr.xml reports/test-data.json

# Generate compact report from JSON
echo -e "${BLUE}Generating compact HTML report...${NC}"
node scripts/generate-html-report.mjs reports/test-data.json reports/compact-report.html

# Generate beautiful report (if script exists)
if [ -f "scripts/generate-beautiful-report.js" ]; then
    echo -e "${BLUE}Generating beautiful HTML report...${NC}"
    node scripts/generate-beautiful-report.js reports/test-data.json reports/beautiful-report.html
fi

# Convert with xunit-viewer if available
if command -v xunit-viewer &> /dev/null; then
    echo -e "${BLUE}Generating xunit-viewer report...${NC}"
    xunit-viewer -r reports/junit/api-rlr.xml -o reports/xunit-report.html -t "API-RLR Test Report"
fi

# Generate coverage report
echo -e "${BLUE}Generating coverage report...${NC}"
pnpm vitest run --coverage.reporter=html --coverage.enabled

echo -e "${GREEN}✅ All reports generated successfully!${NC}"
echo ""
echo "📊 Available reports:"
echo "  • reports/compact-report.html    - Compact dark theme report"
echo "  • reports/beautiful-report.html  - Beautiful gradient report"
echo "  • reports/github-style-report.html - GitHub Actions style"
echo "  • reports/xunit-report.html      - XUnit viewer report"
echo "  • coverage/index.html            - Code coverage report"
echo "  • reports/test-data.json         - Raw test data"
