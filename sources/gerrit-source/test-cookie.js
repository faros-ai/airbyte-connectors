#!/usr/bin/env node

/**
 * Quick script to test if your Gerrit cookie is working
 * Usage: node test-cookie.js
 */

const axios = require('axios');

// Test configurations - modify these with your details
const TEST_CONFIGS = [
  {
    name: "Google Public Gerrit (no auth needed)",
    url: "https://gerrit-review.googlesource.com",
    cookie: null
  },
  {
    name: "Your Gerrit with Git Cookie",
    url: "https://your-gerrit-instance.com", // CHANGE THIS
    cookie: "your-gerrit.com\tFALSE\t/\tTRUE\t0\to\tgit-username.company.com=1//0REPLACE_WITH_YOUR_TOKEN" // CHANGE THIS
  }
];

function parseCookie(cookieValue) {
  if (!cookieValue) return null;
  
  if (cookieValue.includes('\t')) {
    // .gitcookies format
    const parts = cookieValue.split('\t');
    if (parts.length >= 7) {
      const cookieName = parts[5];
      const cookieValuePart = parts[6];
      return `${cookieName}=${cookieValuePart}`;
    }
  } else if (cookieValue.includes('=')) {
    // Direct cookie format
    return cookieValue;
  }
  
  return null;
}

async function testGerritConnection(config) {
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log(`📡 URL: ${config.url}`);
  
  try {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    if (config.cookie) {
      const parsedCookie = parseCookie(config.cookie);
      if (parsedCookie) {
        headers['Cookie'] = parsedCookie;
        console.log(`🍪 Cookie: ${parsedCookie.substring(0, 50)}...`);
      } else {
        console.log('❌ Invalid cookie format');
        return;
      }
    } else {
      console.log('🌐 No authentication (public access)');
    }
    
    // Test projects endpoint
    const response = await axios.get(`${config.url}/a/projects/?n=3`, {
      headers,
      timeout: 10000
    });
    
    // Handle Gerrit's magic prefix
    let data = response.data;
    if (typeof data === 'string' && data.startsWith(')]}\'')) {
      data = JSON.parse(data.slice(4));
    }
    
    const projectCount = Object.keys(data).length;
    console.log(`✅ Success! Found ${projectCount} projects`);
    console.log(`📂 Sample projects: ${Object.keys(data).slice(0, 3).join(', ')}`);
    
    return true;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
      
      if (error.response.status === 401) {
        console.log('   💡 This means authentication failed - check your cookie');
      } else if (error.response.status === 403) {
        console.log('   💡 This means you don\'t have permission to access projects');
      } else if (error.response.status === 404) {
        console.log('   💡 This means the URL or endpoint is wrong');
      }
    }
    
    return false;
  }
}

async function main() {
  console.log('🍪 Gerrit Cookie Tester');
  console.log('========================\n');
  
  console.log('This script tests if your Gerrit cookie is working correctly.');
  console.log('Modify the TEST_CONFIGS above with your Gerrit details.\n');
  
  let successCount = 0;
  
  for (const config of TEST_CONFIGS) {
    const success = await testGerritConnection(config);
    if (success) successCount++;
  }
  
  console.log(`\n🎯 Results: ${successCount}/${TEST_CONFIGS.length} tests passed`);
  
  if (successCount === 0) {
    console.log('\n💡 Troubleshooting tips:');
    console.log('1. Check your Gerrit URL is correct and accessible');
    console.log('2. Generate a fresh cookie from Gerrit → Settings → HTTP Credentials'); 
    console.log('3. Make sure you copy the entire cookie line including tabs');
    console.log('4. Verify you have read access to projects in that Gerrit instance');
  } else {
    console.log('\n🎉 Great! Your cookie is working. You can now use it in the connector.');
  }
}

if (require.main === module) {
  main().catch(console.error);
}