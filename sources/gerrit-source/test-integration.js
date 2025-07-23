// Quick integration test - run with: node test-integration.js
const axios = require('axios');

async function testGerritAPI() {
  console.log('Testing Gerrit API connection...');
  
  try {
    // Test public Gerrit API (no auth needed for some endpoints)
    const response = await axios.get('https://gerrit-review.googlesource.com/projects/?n=5');
    
    // Handle Gerrit's magic prefix
    let data = response.data;
    if (typeof data === 'string' && data.startsWith(')]}\'')) {
      data = JSON.parse(data.slice(4));
    }
    
    console.log('✅ Connection successful!');
    console.log('Projects found:', Object.keys(data).slice(0, 3));
    
    // Test changes API
    const changesResponse = await axios.get('https://gerrit-review.googlesource.com/changes/?q=project:gerrit&n=3');
    let changesData = changesResponse.data;
    if (typeof changesData === 'string' && changesData.startsWith(')]}\'')) {
      changesData = JSON.parse(changesData.slice(4));
    }
    
    console.log('✅ Changes API working!');
    console.log('Recent changes:', changesData.length);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGerritAPI();