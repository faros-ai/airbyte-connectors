#!/usr/bin/env node

/**
 * Test script to pull and display a single record from each Gerrit stream
 * Usage: node test-sample.js [config-file]
 */

const fs = require('fs');
const path = require('path');

// Import our built source
const { GerritSource } = require('./lib/index');
const { AirbyteSourceLogger, AirbyteLogLevel } = require('faros-airbyte-cdk');

const DEFAULT_CONFIG_FILE = 'gerrit-config.json';

// Sample config template
const CONFIG_TEMPLATE = {
  url: "https://gerrit.example.com",
  authentication: {
    type: "git_cookie",
    git_cookie_value: "gerrit.example.com\tFALSE\t/\tTRUE\t0\to\tgit-username.example.com=1//0XXXXXXXXXX"
  },
  projects: ["your-project-name"],
  cutoff_days: 7,
  page_size: 5
};

async function createConfigTemplate() {
  const configFile = 'gerrit-config.template.json';
  
  if (!fs.existsSync(configFile)) {
    console.log(`📝 Creating config template: ${configFile}`);
    fs.writeFileSync(configFile, JSON.stringify(CONFIG_TEMPLATE, null, 2));
    console.log('✅ Template created! Edit with your Gerrit details.\n');
  }
  
  return configFile;
}

async function loadConfig(configFile) {
  if (!fs.existsSync(configFile)) {
    console.error(`❌ Config file not found: ${configFile}`);
    console.log('\nTo create a config file:');
    console.log('1. Go to your Gerrit instance → Settings → HTTP Credentials');
    console.log('2. Click "Generate Password" or "HTTP Password"');
    console.log('3. Copy the cookie line from the bash script');
    console.log('4. Edit gerrit-config.template.json with your details');
    console.log('5. Rename to gerrit-config.json\n');
    process.exit(1);
  }
  
  try {
    const configContent = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`❌ Failed to parse config file: ${error.message}`);
    process.exit(1);
  }
}

async function testStream(source, streamName, config) {
  console.log(`\n🔍 Testing stream: ${streamName}`);
  console.log('=' + '='.repeat(50));
  
  try {
    // Get the stream instance
    const streams = source.streams(config);
    const stream = streams.find(s => s.name === streamName);
    
    if (!stream) {
      console.log(`❌ Stream '${streamName}' not found`);
      return;
    }
    
    // Read one record
    const recordGenerator = stream.readRecords('full_refresh');
    const { value: record, done } = await recordGenerator.next();
    
    if (done || !record) {
      console.log(`⚠️  No records found for stream '${streamName}'`);
      return;
    }
    
    console.log('✅ Sample record:');
    console.log(JSON.stringify(record, null, 2));
    
  } catch (error) {
    console.log(`❌ Error testing stream '${streamName}': ${error.message}`);
    
    // Show more details for debugging
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
      console.log(`   Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

async function main() {
  const configFile = process.argv[2] || DEFAULT_CONFIG_FILE;
  
  console.log('🚀 Gerrit Connector Sample Data Test');
  console.log('====================================\n');
  
  // Create config template if needed
  await createConfigTemplate();
  
  // Load configuration
  const config = await loadConfig(configFile);
  console.log(`📁 Using config: ${configFile}`);
  console.log(`🌐 Gerrit URL: ${config.url}`);
  console.log(`🔐 Auth type: ${config.authentication.type}`);
  
  if (config.projects?.length) {
    console.log(`📂 Projects: ${config.projects.join(', ')}`);
  } else {
    console.log('📂 Projects: All visible projects');
  }
  
  // Initialize source
  const logger = new AirbyteSourceLogger(AirbyteLogLevel.INFO);
  const source = new GerritSource(logger);
  
  // Test connection first
  console.log('\n🔌 Testing connection...');
  try {
    const [success, error] = await source.checkConnection(config);
    if (!success) {
      console.error(`❌ Connection failed: ${error.message}`);
      console.log('\nTroubleshooting:');
      console.log('- Check your Gerrit URL is correct');
      console.log('- Verify your authentication credentials');
      console.log('- Ensure you have access to the specified projects');
      process.exit(1);
    }
    console.log('✅ Connection successful!');
  } catch (error) {
    console.error(`❌ Connection test failed: ${error.message}`);
    process.exit(1);
  }
  
  // Test each stream
  const streamNames = ['faros_projects', 'faros_changes', 'faros_accounts'];
  
  for (const streamName of streamNames) {
    await testStream(source, streamName, config);
  }
  
  console.log('\n🎉 Test completed!');
  console.log('\nNext steps:');
  console.log('- Review the sample data above');
  console.log('- Run full sync: node lib/index.js read --config gerrit-config.json --catalog catalog.json');
  console.log('- Check data quality and field mappings');
}

// Run the test
if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { main };