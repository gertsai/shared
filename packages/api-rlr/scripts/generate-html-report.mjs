#!/usr/bin/env node

import fs from 'fs';

/**
 * Generate compact HTML report from JSON test data
 */
function generateHTMLReport(jsonData) {
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${data.totalTests} tests</title>
    <style>
        :root {
            --bg: #0d1117;
            --bg-secondary: #161b22;
            --border: #30363d;
            --text: #c9d1d9;
            --text-muted: #8b949e;
            --success: #3fb950;
            --danger: #f85149;
            --warning: #d29922;
            --accent: #58a6ff;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            font-size: 24px;
            margin-bottom: 10px;
        }
        
        .stats {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
        }
        
        .stat {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .stat-value {
            font-weight: 600;
            font-size: 18px;
        }
        
        .stat-label {
            color: var(--text-muted);
            font-size: 14px;
        }
        
        .stat.success .stat-value { color: var(--success); }
        .stat.danger .stat-value { color: var(--danger); }
        .stat.warning .stat-value { color: var(--warning); }
        
        .category {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            margin-bottom: 16px;
            overflow: hidden;
        }
        
        .category-header {
            padding: 12px 16px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            transition: background 0.2s;
        }
        
        .category-header:hover {
            background: rgba(139, 148, 158, 0.1);
        }
        
        .category-title {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 500;
        }
        
        .category-stats {
            display: flex;
            gap: 15px;
            font-size: 14px;
            color: var(--text-muted);
        }
        
        .chevron {
            width: 16px;
            height: 16px;
            transition: transform 0.2s;
            color: var(--text-muted);
        }
        
        .category.expanded .chevron {
            transform: rotate(90deg);
        }
        
        .test-list {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            border-top: 1px solid var(--border);
        }
        
        .category.expanded .test-list {
            max-height: 2000px;
        }
        
        .test-suite {
            border-bottom: 1px solid var(--border);
        }
        
        .test-suite:last-child {
            border-bottom: none;
        }
        
        .suite-header {
            padding: 10px 16px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s;
        }
        
        .suite-header:hover {
            background: rgba(139, 148, 158, 0.05);
        }
        
        .suite-name {
            font-size: 14px;
            color: var(--accent);
        }
        
        .suite-time {
            font-size: 12px;
            color: var(--text-muted);
        }
        
        .test-cases {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            background: rgba(13, 17, 23, 0.5);
        }
        
        .test-suite.expanded .test-cases {
            max-height: 1000px;
        }
        
        .test-case {
            font-size: 13px;
            border-bottom: 1px solid rgba(48, 54, 61, 0.5);
            cursor: pointer;
        }
        
        .test-case:last-child {
            border-bottom: none;
        }
        
        .test-case-header {
            padding: 8px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s;
        }
        
        .test-case:hover .test-case-header {
            background: rgba(139, 148, 158, 0.03);
        }
        
        .test-name {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            word-break: break-word;
        }
        
        .test-status {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }
        
        .test-status.passed { color: var(--success); }
        .test-status.failed { color: var(--danger); }
        .test-status.error { color: var(--danger); }
        .test-status.skipped { color: var(--warning); }
        
        .test-steps {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            background: rgba(13, 17, 23, 0.3);
            padding: 0;
        }
        
        .test-case.expanded .test-steps {
            max-height: 500px;
            padding: 8px 24px 8px 40px;
        }
        
        .test-step {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            font-size: 12px;
            color: var(--text-muted);
        }
        
        .test-step.failed,
        .test-step.error {
            color: var(--danger);
            font-weight: 500;
        }
        
        .step-icon {
            width: 14px;
            height: 14px;
        }
        
        .error-message {
            background: rgba(248, 81, 73, 0.1);
            border: 1px solid var(--danger);
            border-radius: 4px;
            padding: 8px;
            margin-top: 8px;
            font-size: 12px;
            color: var(--danger);
            font-family: 'Monaco', 'Courier New', monospace;
        }
        
        .test-duration {
            color: var(--text-muted);
            font-size: 12px;
            margin-left: auto;
            padding-left: 10px;
        }
        
        .progress-bar {
            height: 4px;
            background: var(--border);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 10px;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--success);
            transition: width 0.5s ease;
        }
        
        .mini-chart {
            display: inline-block;
            width: 60px;
            height: 20px;
            margin-left: 10px;
        }
        
        .mini-chart svg {
            width: 100%;
            height: 100%;
        }
        
        .sparkline {
            fill: none;
            stroke: var(--accent);
            stroke-width: 2;
        }
        
        .pie-chart {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: inline-block;
            vertical-align: middle;
            margin-left: 8px;
        }
        
        @media (max-width: 768px) {
            .stats { flex-direction: column; gap: 10px; }
            .category-stats { flex-direction: column; gap: 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Test Report</h1>
            <div class="stats">
                <div class="stat success">
                    <span class="stat-value">${data.passed}</span>
                    <span class="stat-label">passed</span>
                </div>
                <div class="stat danger">
                    <span class="stat-value">${data.failed}</span>
                    <span class="stat-label">failed</span>
                </div>
                <div class="stat warning">
                    <span class="stat-value">${data.skipped}</span>
                    <span class="stat-label">skipped</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${data.totalTests}</span>
                    <span class="stat-label">total</span>
                    <span class="pie-chart" style="background: conic-gradient(
                        var(--success) 0deg ${data.passed / data.totalTests * 360}deg,
                        var(--danger) ${data.passed / data.totalTests * 360}deg ${(data.passed + data.failed) / data.totalTests * 360}deg,
                        var(--warning) ${(data.passed + data.failed) / data.totalTests * 360}deg
                    )"></span>
                </div>
                <div class="stat">
                    <span class="stat-value">${data.time.toFixed(2)}s</span>
                    <span class="stat-label">duration</span>
                </div>
                <div class="stat success">
                    <span class="stat-value">${data.successRate}%</span>
                    <span class="stat-label">success</span>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${data.successRate}%"></div>
            </div>
        </div>
        
        ${data.categories.map(category => `
        <div class="category" onclick="toggleCategory(this)">
            <div class="category-header">
                <div class="category-title">
                    <span>${category.icon}</span>
                    <span>${category.name}</span>
                    <svg class="chevron" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
                    </svg>
                </div>
                <div class="category-stats">
                    <span>✓ ${category.count} tests</span>
                    <span>${category.time.toFixed(2)}s</span>
                </div>
            </div>
            <div class="test-list">
                ${category.tests.map(suite => `
                <div class="test-suite" onclick="toggleSuite(event, this)">
                    <div class="suite-header">
                        <span class="suite-name">${suite.name}</span>
                        <span class="suite-time">${suite.time.toFixed(3)}s</span>
                    </div>
                    <div class="test-cases">
                        ${suite.testcases.map(test => `
                        <div class="test-case" onclick="toggleTestCase(event, this)">
                            <div class="test-case-header">
                                <div class="test-name">
                                    <span class="test-status ${test.status}">
                                        ${test.status === 'passed' ? '✓' : test.status === 'failed' || test.status === 'error' ? '✗' : '○'}
                                    </span>
                                    <span>${test.name}</span>
                                </div>
                                <span class="test-duration">${(test.time * 1000).toFixed(0)}ms</span>
                            </div>
                            ${test.steps && test.steps.length > 0 ? `
                            <div class="test-steps">
                                ${test.steps.map(step => `
                                <div class="test-step ${step.status || ''}">
                                    <span class="step-icon">
                                        ${step.status === 'passed' ? '✓' : step.status === 'failed' || step.status === 'error' ? '✗' : '→'}
                                    </span>
                                    <span>${step.name}</span>
                                </div>
                                ${step.error ? `<div class="error-message">${step.error}</div>` : ''}
                                `).join('')}
                                ${test.failure ? `
                                <div class="error-message">
                                    <strong>Failure:</strong> ${test.failure.message}<br>
                                    ${test.failure.stackTrace ? `<pre>${test.failure.stackTrace}</pre>` : ''}
                                </div>
                                ` : ''}
                                ${test.error ? `
                                <div class="error-message">
                                    <strong>Error:</strong> ${test.error.message}<br>
                                    ${test.error.stackTrace ? `<pre>${test.error.stackTrace}</pre>` : ''}
                                </div>
                                ` : ''}
                            </div>
                            ` : ''}
                        </div>
                        `).join('')}
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        `).join('')}
    </div>
    
    <script>
        function toggleCategory(element) {
            element.classList.toggle('expanded');
        }
        
        function toggleSuite(event, element) {
            event.stopPropagation();
            element.classList.toggle('expanded');
        }
        
        function toggleTestCase(event, element) {
            event.stopPropagation();
            element.classList.toggle('expanded');
        }
        
        // Auto-expand first category
        window.addEventListener('load', () => {
            setTimeout(() => {
                const firstCategory = document.querySelector('.category');
                if (firstCategory) {
                    firstCategory.classList.add('expanded');
                    // Auto-expand first suite
                    setTimeout(() => {
                        const firstSuite = firstCategory.querySelector('.test-suite');
                        if (firstSuite) {
                            firstSuite.classList.add('expanded');
                        }
                    }, 200);
                }
            }, 300);
            
            // Animate pie charts
            const pieCharts = document.querySelectorAll('.pie-chart');
            pieCharts.forEach(chart => {
                chart.style.animation = 'spin 0.5s ease-in-out';
            });
        });
        
        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.expanded').forEach(el => {
                    el.classList.remove('expanded');
                });
            } else if (e.key === 'Enter' && e.ctrlKey) {
                // Expand all failed tests
                document.querySelectorAll('.test-case').forEach(testCase => {
                    const status = testCase.querySelector('.test-status.failed, .test-status.error');
                    if (status) {
                        testCase.classList.add('expanded');
                    }
                });
            }
        });
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    </script>
</body>
</html>`;
  
  return html;
}

// CLI usage
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node generate-html-report.mjs <json-file> [output-html-file]');
    process.exit(1);
  }
  
  const jsonPath = args[0];
  const htmlPath = args[1] || jsonPath.replace('.json', '-report.html');
  
  try {
    const jsonData = fs.readFileSync(jsonPath, 'utf-8');
    const html = generateHTMLReport(jsonData);
    
    fs.writeFileSync(htmlPath, html);
    console.log(`✅ Generated HTML report: ${htmlPath}`);
  } catch (error) {
    console.error('❌ Failed to generate report:', error.message);
    process.exit(1);
  }
}

export { generateHTMLReport };
