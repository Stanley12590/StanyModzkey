// server.js — FIXED 404 ERROR VERSION
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 👇 GitHub Configuration - FIXED PATHS
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const FILE_PATH = 'Acceckey.json'; // Make sure case matches exactly
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecurePass123!';

// Validate environment variables
if (!GITHUB_TOKEN) {
  console.error('❌ FATAL: GITHUB_TOKEN is missing. Set it in Render environment variables.');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

let isLoggedIn = false;

// GitHub URLs - FIXED
const GITHUB_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${FILE_PATH}`;
const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/${FILE_PATH}`;

console.log('🔗 GitHub URLs configured:');
console.log('API URL:', GITHUB_API);
console.log('Raw URL:', RAW_URL);

// 📥 Fetch keys from GitHub - COMPLETELY REWRITTEN
async function fetchKeysFromGitHub() {
  try {
    console.log('🔍 Attempting to fetch from Raw URL...');
    
    // Try multiple approaches
    let keysData;
    
    // APPROACH 1: Direct raw URL (most reliable)
    try {
      const response = await axios.get(RAW_URL, {
        headers: {
          'User-Agent': 'Stany-Key-Manager',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      });

      console.log('✅ Raw URL success. Data type:', typeof response.data);
      
      if (typeof response.data === 'string') {
        keysData = JSON.parse(response.data);
      } else {
        keysData = response.data;
      }
    } catch (rawError) {
      console.log('❌ Raw URL failed, trying GitHub API...');
      
      // APPROACH 2: GitHub API with base64 decoding
      const apiResponse = await axios.get(GITHUB_API, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Stany-Key-Manager',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      // Decode base64 content from GitHub API
      const contentBase64 = apiResponse.data.content;
      const content = Buffer.from(contentBase64, 'base64').toString('utf8');
      keysData = JSON.parse(content);
    }

    // Validate the data
    if (!keysData) {
      throw new Error('No data received from GitHub');
    }

    if (!Array.isArray(keysData)) {
      console.error('❌ Data is not an array. Received:', typeof keysData, keysData);
      // Try to convert object to array if needed
      if (typeof keysData === 'object' && keysData !== null) {
        keysData = [keysData];
      } else {
        throw new Error('Invalid data format from GitHub - expected array');
      }
    }

    console.log(`✅ Successfully loaded ${keysData.length} keys`);
    return keysData;

  } catch (err) {
    console.error('❌ GitHub fetch error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
      if (err.response.data) {
        console.error('Response data:', JSON.stringify(err.response.data, null, 2));
      }
    }
    throw new Error('Failed to load keys from GitHub: ' + err.message);
  }
}

// 📤 Update keys on GitHub
async function pushKeysToGitHub(keys) {
  try {
    console.log('📤 Starting push to GitHub...');
    
    // First, get the current file to obtain SHA
    const fileInfo = await axios.get(GITHUB_API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const sha = fileInfo.data.sha;
    const content = Buffer.from(JSON.stringify(keys, null, 2)).toString('base64');

    console.log('🔄 Updating file with SHA:', sha);

    // Update the file
    const updateResponse = await axios.put(
      GITHUB_API,
      {
        message: `Update keys via Stany Admin Panel - ${new Date().toISOString()}`,
        content: content,
        sha: sha,
        branch: 'main'
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Stany-Key-Manager',
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    console.log('✅ Successfully updated keys on GitHub');
    return updateResponse.data;

  } catch (err) {
    console.error('❌ GitHub push error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    throw new Error('Failed to update keys on GitHub: ' + err.message);
  }
}

// 🔐 Authentication Middleware
function requireAuth(req, res, next) {
  if (isLoggedIn) return next();
  res.status(401).json({ error: 'Authentication required. Please login first.' });
}

// 🔑 Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (password === ADMIN_PASSWORD) {
    isLoggedIn = true;
    console.log('✅ Admin logged in successfully');
    res.json({ 
      success: true, 
      message: 'Login successful' 
    });
  } else {
    console.log('❌ Failed login attempt');
    res.status(401).json({ error: 'Invalid password' });
  }
});

// 🔑 Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  isLoggedIn = false;
  console.log('✅ Admin logged out');
  res.json({ success: true, message: 'Logout successful' });
});

// 🌐 API Routes

// Get all keys
app.get('/api/keys', requireAuth, async (req, res) => {
  try {
    console.log('📥 Fetching keys for admin...');
    const keys = await fetchKeysFromGitHub();
    res.json(keys);
  } catch (err) {
    console.error('❌ Error in /api/keys:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add new key
app.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const { username, password, deviceId = '', expiry = '' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    console.log(`➕ Adding new key for user: ${username}`);

    const keys = await fetchKeysFromGitHub();
    
    // Check if username already exists
    if (keys.some(k => k.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const newKey = {
      "Device Id": deviceId,
      "username": username,
      "password": password,
      "expiry": expiry
    };

    keys.push(newKey);
    await pushKeysToGitHub(keys);

    console.log(`✅ Key added successfully for: ${username}`);
    res.status(201).json({ 
      success: true, 
      message: 'Key added successfully',
      key: newKey 
    });

  } catch (err) {
    console.error('❌ Error adding key:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update key
app.put('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const updates = req.body;

    console.log(`✏️ Updating key for: ${username}`);

    const keys = await fetchKeysFromGitHub();
    const keyIndex = keys.findIndex(k => k.username === username);

    if (keyIndex === -1) {
      return res.status(404).json({ error: 'Key not found' });
    }

    // Update the key
    keys[keyIndex] = { ...keys[keyIndex], ...updates };
    await pushKeysToGitHub(keys);

    console.log(`✅ Key updated successfully: ${username}`);
    res.json({ 
      success: true, 
      message: 'Key updated successfully',
      key: keys[keyIndex]
    });

  } catch (err) {
    console.error('❌ Error updating key:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete key
app.delete('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;

    console.log(`🗑️ Deleting key for: ${username}`);

    const keys = await fetchKeysFromGitHub();
    const filteredKeys = keys.filter(k => k.username !== username);

    if (filteredKeys.length === keys.length) {
      return res.status(404).json({ error: 'Key not found' });
    }

    await pushKeysToGitHub(filteredKeys);

    console.log(`✅ Key deleted successfully: ${username}`);
    res.json({ 
      success: true, 
      message: 'Key deleted successfully' 
    });

  } catch (err) {
    console.error('❌ Error deleting key:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint - IMPROVED
app.get('/api/health', async (req, res) => {
  try {
    // Test both GitHub access methods
    const testRaw = await axios.get(RAW_URL, { timeout: 10000 });
    const keys = await fetchKeysFromGitHub();
    
    res.json({ 
      status: 'healthy', 
      keysCount: keys.length,
      repository: `${GITHUB_USER}/${REPO_NAME}`,
      rawUrlAccess: 'success',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: err.message,
      repository: `${GITHUB_USER}/${REPO_NAME}`,
      rawUrl: RAW_URL,
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint to debug GitHub access
app.get('/api/debug-github', async (req, res) => {
  try {
    console.log('🔧 Debugging GitHub access...');
    
    // Test 1: Direct raw URL
    const rawTest = await axios.get(RAW_URL, { 
      timeout: 10000,
      headers: { 'User-Agent': 'Stany-Key-Manager' }
    });
    
    // Test 2: GitHub API
    const apiTest = await axios.get(GITHUB_API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager'
      }
    });

    res.json({
      rawUrl: RAW_URL,
      apiUrl: GITHUB_API,
      rawStatus: 'accessible',
      apiStatus: 'accessible',
      rawDataLength: rawTest.data.length,
      apiData: {
        sha: apiTest.data.sha,
        size: apiTest.data.size,
        name: apiTest.data.name
      }
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      rawUrl: RAW_URL,
      apiUrl: GITHUB_API,
      response: err.response?.data
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log('🚀 StanyModz Key Manager Server Started');
  console.log('=========================================');
  console.log(`✅ Port: ${PORT}`);
  console.log(`✅ GitHub User: ${GITHUB_USER}`);
  console.log(`✅ Repository: ${REPO_NAME}`);
  console.log(`✅ File: ${FILE_PATH}`);
  console.log(`✅ Raw URL: ${RAW_URL}`);
  console.log(`✅ API URL: ${GITHUB_API}`);
  console.log('✅ Server is ready and waiting for requests...');
  
  // Test GitHub connection on startup
  setTimeout(async () => {
    try {
      console.log('🔍 Testing GitHub connection...');
      const test = await axios.get(RAW_URL, { timeout: 10000 });
      console.log('✅ GitHub connection test: SUCCESS');
    } catch (err) {
      console.log('❌ GitHub connection test: FAILED');
      console.log('Error:', err.message);
    }
  }, 2000);
});
