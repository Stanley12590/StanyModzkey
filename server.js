// server.js — COMPLETE FIXED VERSION
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 👇 GitHub Configuration - SET IN RENDER
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const FILE_PATH = 'Acceckey.json';
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

// GitHub URLs
const GITHUB_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${FILE_PATH}`;
const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/${FILE_PATH}`;

// 📥 Fetch keys from GitHub - FIXED
async function fetchKeysFromGitHub() {
  try {
    console.log('🔍 Fetching keys from:', RAW_URL);
    
    const response = await axios.get(RAW_URL, {
      headers: {
        'User-Agent': 'Stany-Key-Manager',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });

    console.log('✅ Raw data received, length:', response.data.length);
    
    // Parse JSON data
    let keysData;
    if (typeof response.data === 'string') {
      keysData = JSON.parse(response.data);
    } else {
      keysData = response.data;
    }

    if (!Array.isArray(keysData)) {
      console.error('❌ Data is not an array:', keysData);
      throw new Error('Invalid data format from GitHub');
    }

    console.log(`✅ Successfully loaded ${keysData.length} keys`);
    return keysData;

  } catch (err) {
    console.error('❌ GitHub fetch error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    throw new Error('Failed to load keys from GitHub: ' + err.message);
  }
}

// 📤 Update keys on GitHub - FIXED
async function pushKeysToGitHub(keys) {
  try {
    console.log('📤 Starting push to GitHub...');
    
    // Get current file info to get SHA
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

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const keys = await fetchKeysFromGitHub();
    res.json({ 
      status: 'healthy', 
      keysCount: keys.length,
      repository: `${GITHUB_USER}/${REPO_NAME}`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: err.message 
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
  console.log(`✅ GitHub: ${GITHUB_USER}/${REPO_NAME}`);
  console.log(`✅ File: ${FILE_PATH}`);
  console.log(`✅ Raw URL: ${RAW_URL}`);
  console.log('✅ Server is ready and waiting for requests...');
});
