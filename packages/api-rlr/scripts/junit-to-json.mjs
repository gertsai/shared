#!/usr/bin/env node

import fs from 'fs';

import xml2js from 'xml2js';

const { parseStringPromise } = xml2js;

/**
 * Convert JUnit XML to structured JSON
 */
async function convertJUnitToJSON(xmlPath) {
  try {
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    const result = await parseStringPromise(xmlContent);
    
    const testsuites = result.testsuites || { testsuite: [result.testsuite] };
    const suites = testsuites.testsuite || [];
    
    const summary = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      time: 0,
      timestamp: new Date().toISOString(),
      suites: []
    };
    
    for (const suite of suites) {
      const suiteData = {
        name: suite.$.name,
        tests: parseInt(suite.$.tests || 0),
        failures: parseInt(suite.$.failures || 0),
        errors: parseInt(suite.$.errors || 0),
        skipped: parseInt(suite.$.skipped || 0),
        time: parseFloat(suite.$.time || 0),
        timestamp: suite.$.timestamp,
        testcases: []
      };
      
      if (suite.testcase) {
        for (const testcase of suite.testcase) {
          const test = {
            name: testcase.$.name,
            classname: testcase.$.classname,
            time: parseFloat(testcase.$.time || 0),
            status: 'passed',
            steps: []
          };
          
          // Parse test name to extract steps (e.g., "describe > it > should...")
          const nameParts = test.name.split(' > ');
          if (nameParts.length > 1) {
            test.describe = nameParts[0];
            test.testName = nameParts.slice(1).join(' > ');
            // Generate mock steps based on test name
            test.steps = generateTestSteps(test.testName);
          }
          
          if (testcase.failure) {
            test.status = 'failed';
            test.failure = {
              message: testcase.failure[0]?.$.message || testcase.failure[0]?.message || '',
              type: testcase.failure[0]?.$.type || testcase.failure[0]?.type || '',
              text: testcase.failure[0]?._ || testcase.failure[0] || '',
              stackTrace: extractStackTrace(testcase.failure[0]?._ || testcase.failure[0] || '')
            };
            // Mark last step as failed
            if (test.steps.length > 0) {
              test.steps[test.steps.length - 1].status = 'failed';
              test.steps[test.steps.length - 1].error = test.failure.message;
            }
          } else if (testcase.error) {
            test.status = 'error';
            test.error = {
              message: testcase.error[0]?.$.message || testcase.error[0]?.message || '',
              type: testcase.error[0]?.$.type || testcase.error[0]?.type || '',
              text: testcase.error[0]?._ || testcase.error[0] || '',
              stackTrace: extractStackTrace(testcase.error[0]?._ || testcase.error[0] || '')
            };
            // Mark last step as error
            if (test.steps.length > 0) {
              test.steps[test.steps.length - 1].status = 'error';
              test.steps[test.steps.length - 1].error = test.error.message;
            }
          } else if (testcase.skipped) {
            test.status = 'skipped';
            const skipMessage = Array.isArray(testcase.skipped) && testcase.skipped[0] 
              ? (testcase.skipped[0].$ ? testcase.skipped[0].$.message : testcase.skipped[0].message) || ''
              : '';
            test.skipped = {
              message: skipMessage
            };
            test.steps = [{ name: 'Test skipped', status: 'skipped' }];
          }
          
          // System output (stdout/stderr)
          if (testcase['system-out']) {
            test.systemOut = testcase['system-out'][0];
          }
          if (testcase['system-err']) {
            test.systemErr = testcase['system-err'][0];
          }
          
          suiteData.testcases.push(test);
        }
      }
      
      // Update summary
      summary.totalTests += suiteData.tests;
      summary.passed += suiteData.tests - suiteData.failures - suiteData.errors - suiteData.skipped;
      summary.failed += suiteData.failures;
      summary.errors += suiteData.errors;
      summary.skipped += suiteData.skipped;
      summary.time += suiteData.time;
      
      summary.suites.push(suiteData);
    }
    
    // Calculate percentages
    summary.successRate = summary.totalTests > 0 
      ? ((summary.passed / summary.totalTests) * 100).toFixed(2) 
      : 0;
    
    // Group tests by category
    summary.categories = groupTestsByCategory(summary.suites);
    
    return summary;
  } catch (error) {
    console.error('Error parsing XML:', error);
    throw error;
  }
}

/**
 * Generate test steps from test name
 */
function generateTestSteps(testName) {
  const steps = [];
  
  // Common test patterns and their steps
  if (testName.includes('validates') || testName.includes('validation')) {
    steps.push(
      { name: 'Setup validation context', status: 'passed' },
      { name: 'Execute validation logic', status: 'passed' },
      { name: 'Assert validation result', status: 'passed' }
    );
  } else if (testName.includes('throws') || testName.includes('error')) {
    steps.push(
      { name: 'Setup error condition', status: 'passed' },
      { name: 'Execute operation', status: 'passed' },
      { name: 'Verify error thrown', status: 'passed' }
    );
  } else if (testName.includes('returns') || testName.includes('should return')) {
    steps.push(
      { name: 'Prepare test data', status: 'passed' },
      { name: 'Call function', status: 'passed' },
      { name: 'Verify return value', status: 'passed' }
    );
  } else if (testName.includes('creates') || testName.includes('generates')) {
    steps.push(
      { name: 'Initialize creator', status: 'passed' },
      { name: 'Execute creation', status: 'passed' },
      { name: 'Validate created object', status: 'passed' }
    );
  } else if (testName.includes('handles') || testName.includes('processes')) {
    steps.push(
      { name: 'Setup handler', status: 'passed' },
      { name: 'Process input', status: 'passed' },
      { name: 'Check output', status: 'passed' }
    );
  } else {
    // Generic steps
    steps.push(
      { name: 'Arrange', status: 'passed' },
      { name: 'Act', status: 'passed' },
      { name: 'Assert', status: 'passed' }
    );
  }
  
  return steps;
}

/**
 * Extract stack trace from error text
 */
function extractStackTrace(errorText) {
  const lines = errorText.split('\n');
  const stackLines = [];
  let inStack = false;
  
  for (const line of lines) {
    if (line.includes('at ') || line.includes('Error:')) {
      inStack = true;
    }
    if (inStack && stackLines.length < 5) {
      stackLines.push(line.trim());
    }
  }
  
  return stackLines.join('\n');
}

/**
 * Group tests by category based on file paths
 */
function groupTestsByCategory(suites) {
  const categories = {
    unit: {
      name: 'Unit Tests',
      icon: '🧪',
      tests: [],
      count: 0,
      time: 0
    },
    integration: {
      name: 'Integration Tests',
      icon: '🔗',
      tests: [],
      count: 0,
      time: 0
    },
    e2e: {
      name: 'E2E Tests',
      icon: '🌐',
      tests: [],
      count: 0,
      time: 0
    }
  };
  
  for (const suite of suites) {
    let category = 'unit'; // default
    
    if (suite.name.includes('integration') || suite.name.includes('__tests__')) {
      category = 'integration';
    } else if (suite.name.includes('e2e') || suite.name.includes('end-to-end')) {
      category = 'e2e';
    }
    
    categories[category].tests.push(suite);
    categories[category].count += suite.tests;
    categories[category].time += suite.time;
  }
  
  // Remove empty categories
  return Object.values(categories).filter(cat => cat.count > 0);
}

// CLI usage
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: node junit-to-json.mjs <xml-file> [output-json-file]');
    process.exit(1);
  }
  
  const xmlPath = args[0];
  const jsonPath = args[1] || xmlPath.replace('.xml', '.json');
  
  convertJUnitToJSON(xmlPath)
    .then(json => {
      fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
      console.log(`✅ Converted ${xmlPath} to ${jsonPath}`);
      console.log(`📊 Summary: ${json.totalTests} tests, ${json.successRate}% success rate`);
    })
    .catch(error => {
      console.error('❌ Conversion failed:', error.message);
      process.exit(1);
    });
}

export { convertJUnitToJSON };
