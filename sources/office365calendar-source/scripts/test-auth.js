#!/usr/bin/env node

/**
 * Quick Authentication Test Script
 * 
 * This script provides a simple way to test Office 365 authentication
 * without running the full test suite.
 * 
 * Usage:
 *   npm run build && node scripts/test-auth.js
 *   
 * Or with inline credentials:
 *   O365_TENANT_ID=xxx O365_CLIENT_ID=yyy O365_CLIENT_SECRET=zzz node scripts/test-auth.js
 */

const { Office365Calendar } = require('../lib/office365calendar-sdk-adapter');

function createLogger() {
  return {
    debug: (msg, extra) => console.log(`🔍 DEBUG: ${msg}`, extra || ''),
    info: (msg, extra) => console.log(`ℹ️  INFO: ${msg}`, extra || ''),
    warn: (msg, extra) => console.log(`⚠️  WARN: ${msg}`, extra || ''),
    error: (msg, extra) => console.log(`❌ ERROR: ${msg}`, extra || ''),
    fatal: (msg, extra) => console.log(`💀 FATAL: ${msg}`, extra || ''),
    trace: (msg, extra) => console.log(`🔬 TRACE: ${msg}`, extra || ''),
    child: function() { return this; }
  };
}

function loadConfig() {
  const tenantId = process.env.O365_TENANT_ID;
  const clientId = process.env.O365_CLIENT_ID;
  const clientSecret = process.env.O365_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return {
    tenant_id: tenantId,
    client_id: clientId,
    client_secret: clientSecret
  };
}

async function testAuthentication() {
  console.log('🚀 Office 365 Calendar Authentication Test');
  console.log('==========================================\n');

  const config = loadConfig();
  
  if (!config) {
    console.log('❌ Missing credentials! Please set environment variables:');
    console.log('   O365_TENANT_ID     - Your Azure tenant ID');
    console.log('   O365_CLIENT_ID     - Your Azure app client ID');
    console.log('   O365_CLIENT_SECRET - Your Azure app client secret\n');
    console.log('Example:');
    console.log('   export O365_TENANT_ID="12345678-1234-1234-1234-123456789012"');
    console.log('   export O365_CLIENT_ID="87654321-4321-4321-4321-210987654321"');
    console.log('   export O365_CLIENT_SECRET="your-secret-here"\n');
    process.exit(1);
  }

  const logger = createLogger();
  
  try {
    console.log(`📋 Configuration:`);
    console.log(`   Tenant ID: ${config.tenant_id}`);
    console.log(`   Client ID: ${config.client_id}`);
    console.log(`   Secret: ${'*'.repeat(config.client_secret.length)}\n`);

    console.log('🔧 Creating Office365Calendar instance...');
    const startTime = Date.now();
    
    const office365Calendar = await Office365Calendar.instance(config, logger);
    console.log('✅ Instance created successfully\n');

    console.log('🔐 Testing authentication...');
    const authResult = await office365Calendar.checkConnection();
    
    const duration = Date.now() - startTime;
    
    if (authResult) {
      console.log('🎉 AUTHENTICATION SUCCESSFUL! 🎉');
      console.log(`⏱️  Total time: ${duration}ms`);
      console.log('\n✅ Your Office 365 Calendar connector is ready to use!');
      console.log('\nNext steps:');
      console.log('1. Run: npm run test:real-world:auth (full test suite)');
      console.log('2. Try: npm run test:real-world (all phases)');
      console.log('3. Configure your connector for production use');
    } else {
      console.log('❌ AUTHENTICATION FAILED');
      console.log('Please check your credentials and Azure AD app configuration.');
      process.exit(1);
    }

  } catch (error) {
    console.log('\n💥 AUTHENTICATION ERROR');
    console.log(`Error: ${error.message}`);
    
    if (error.message.includes('AADSTS')) {
      console.log('\n🔧 Azure AD Error - Common solutions:');
      console.log('1. Verify tenant ID is correct');
      console.log('2. Check client ID matches your Azure AD app');
      console.log('3. Ensure client secret is not expired');
      console.log('4. Verify app has required permissions:');
      console.log('   - https://graph.microsoft.com/Calendars.Read');
      console.log('   - https://graph.microsoft.com/User.Read');
    }
    
    process.exit(1);
  }
}

// Run the test
testAuthentication().catch(error => {
  console.error('💀 Unexpected error:', error);
  process.exit(1);
});