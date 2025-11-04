// server.js — COMPLETE WORKING VERSION
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// 👇 GitHub Configuration
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const KEYS_FILE = 'Accesskey.json';
const ADMINS_FILE = 'Admins.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MAIN_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecurePass123!';

if (!GITHUB_TOKEN) {
  console.error('❌ FATAL: GITHUB_TOKEN is missing.');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

// Session storage
const sessions = new Map();
const generateSessionId = () => crypto.randomBytes(16).toString('hex');

// GitHub URLs
const KEYS_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${KEYS_FILE}`;
const KEYS_RAW = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/${KEYS_FILE}`;
const ADMINS_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${ADMINS_FILE}`;
const ADMINS_RAW = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/${ADMINS_FILE}`;

// Default admins structure
const defaultAdmins = [
  {
    id: "main",
    username: "MainAdmin",
    password: MAIN_ADMIN_PASSWORD,
    role: "superadmin",
    phone: "",
    createdAt: new Date().toISOString(),
    isActive: true,
    invitedBy: "system"
  }
];

// 📥 Fetch data from GitHub - FIXED 404 HANDLING
async function fetchFromGitHub(url, isRaw = true) {
  try {
    console.log(`🔍 Fetching from: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Stany-Key-Manager',
        ...(isRaw ? {} : { Authorization: `token ${GITHUB_TOKEN}` })
      },
      timeout: 15000
    });
    
    if (isRaw) {
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      console.log(`✅ Successfully fetched ${Array.isArray(data) ? data.length : 'data'}`);
      return data;
    }
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log(`📭 File not found (404): ${url}`);
      return null;
    }
    console.error('❌ GitHub fetch error:', err.message);
    throw err;
  }
}

// 📤 Push data to GitHub - FIXED CREATE/UPDATE
async function pushToGitHub(apiUrl, data, message) {
  try {
    let sha = null;
    
    // Try to get existing file SHA
    try {
      const fileInfo = await axios.get(apiUrl, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Stany-Key-Manager'
        }
      });
      sha = fileInfo.data.sha;
      console.log('📁 Existing file found, updating...');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('📄 Creating new file...');
        sha = null;
      } else {
        throw error;
      }
    }

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const payload = {
      message: message,
      content: content,
      branch: 'main'
    };

    if (sha) {
      payload.sha = sha;
    }

    await axios.put(apiUrl, payload, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager',
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Successfully pushed to GitHub');
    return true;
  } catch (err) {
    console.error('❌ GitHub push error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', err.response.data);
    }
    throw err;
  }
}

// 🔐 Authentication functions - FIXED
async function verifyAdmin(username, password) {
  try {
    const admins = await fetchFromGitHub(ADMINS_RAW) || [];
    const admin = admins.find(a => a.username === username && a.isActive);
    
    if (admin && admin.password === password) {
      return { ...admin, password: undefined };
    }
    
    // Fallback to main admin
    if (username === "MainAdmin" && password === MAIN_ADMIN_PASSWORD) {
      return defaultAdmins[0];
    }
    
    return null;
  } catch (err) {
    console.log('⚠️ Using fallback admin verification');
    if (username === "MainAdmin" && password === MAIN_ADMIN_PASSWORD) {
      return defaultAdmins[0];
    }
    return null;
  }
}

// 🏁 Initialize admins file - SIMPLIFIED
async function initializeAdminsFile() {
  try {
    const existingAdmins = await fetchFromGitHub(ADMINS_RAW);
    if (existingAdmins === null) {
      console.log('📝 Creating Admins.json file...');
      await pushToGitHub(ADMINS_API, defaultAdmins, 'Initialize admins file');
      console.log('✅ Admins.json created successfully!');
    } else {
      console.log('✅ Admins.json already exists');
    }
  } catch (err) {
    console.log('⚠️ Admins initialization skipped:', err.message);
  }
}

// Middleware
async function requireAuth(req, res, next) {
  const sessionId = req.headers.authorization?.replace('Bearer ', '');
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = sessions.get(sessionId);
  if (session.expires < Date.now()) {
    sessions.delete(sessionId);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.admin = session.admin;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.admin.role === 'superadmin') return next();
  res.status(403).json({ error: 'Superadmin access required' });
}

// 🌐 AUTH ROUTES
app.post('/api/auth/login', async (req, res) => {
  const { username, password, rememberMe } = req.body;

  try {
    const admin = await verifyAdmin(username, password);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionId = generateSessionId();
    const expires = rememberMe ? Date.now() + (30 * 24 * 60 * 60 * 1000) : Date.now() + (2 * 60 * 60 * 1000);
    
    sessions.set(sessionId, { admin, expires });
    
    res.json({
      success: true,
      sessionId,
      admin: { username: admin.username, role: admin.role }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers.authorization?.replace('Bearer ', '');
  if (sessionId) sessions.delete(sessionId);
  res.json({ success: true });
});

// 👑 ADMIN MANAGEMENT ROUTES
app.get('/api/admins', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await fetchFromGitHub(ADMINS_RAW) || [];
    res.json(admins.map(a => ({ ...a, password: undefined })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load admins' });
  }
});

app.post('/api/admins', requireAuth, requireSuperAdmin, async (req, res) => {
  const { username, phone, role = 'admin' } = req.body;

  if (!username || !phone) {
    return res.status(400).json({ error: 'Username and phone are required' });
  }

  try {
    let admins = await fetchFromGitHub(ADMINS_RAW) || defaultAdmins;

    if (admins.find(a => a.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Generate secure password
    const password = crypto.randomBytes(6).toString('hex');
    const newAdmin = {
      id: crypto.randomBytes(8).toString('hex'),
      username,
      password,
      role,
      phone,
      createdAt: new Date().toISOString(),
      isActive: true,
      invitedBy: req.admin.username
    };

    admins.push(newAdmin);
    await pushToGitHub(ADMINS_API, admins, `Add admin: ${username}`);

    // ✅ FIXED WHATSAPP LINK - Opens directly in chat
    const appUrl = `https://${req.get('host')}`;
    const cleanPhone = phone.replace(/\D/g, '');
    
    // WhatsApp message template
    const message = `🔐 *STANYMODZ ADMIN INVITATION*\n\nHello ${username}! You have been invited as ${role} to StanyModz Key Manager.\n\n📱 *Login Details:*\n🌐 Website: ${appUrl}\n👤 Username: ${username}\n🔑 Password: ${password}\n\nPlease login and change your password immediately.`;
    
    // Direct WhatsApp chat link
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

    res.json({
      success: true,
      admin: { ...newAdmin, password: undefined },
      whatsappUrl,
      credentials: { username, password },
      directMessage: `WhatsApp invitation ready for ${cleanPhone}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add admin: ' + err.message });
  }
});

app.delete('/api/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    let admins = await fetchFromGitHub(ADMINS_RAW) || [];
    const admin = admins.find(a => a.id === id);
    
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    if (admin.role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete superadmin' });
    }

    const filtered = admins.filter(a => a.id !== id);
    await pushToGitHub(ADMINS_API, filtered, `Remove admin: ${admin.username}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// 🔑 KEY MANAGEMENT ROUTES - ALL FIXED
app.get('/api/keys', requireAuth, async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW) || [];
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load keys' });
  }
});

app.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const { deviceId, username, password, expiry } = req.body;

    console.log(`➕ Adding new key: ${username}`);

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const keys = await fetchFromGitHub(KEYS_RAW) || [];
    
    // Check for duplicate username
    if (keys.some(k => k.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const newKey = {
      "Device Id": deviceId || "",
      "username": username.trim(),
      "password": password,
      "expiry": expiry || "",
      "createdBy": req.admin.username,
      "createdAt": new Date().toISOString(),
      "status": "active"
    };

    keys.push(newKey);
    await pushToGitHub(KEYS_API, keys, `Add key: ${username}`);

    console.log(`✅ Key added successfully: ${username}`);
    res.status(201).json({ 
      success: true, 
      message: 'Key added successfully',
      key: newKey 
    });

  } catch (err) {
    console.error('❌ Add key error:', err.message);
    res.status(500).json({ error: 'Failed to add key: ' + err.message });
  }
});

// 🔑 EDIT KEY - NEW ENDPOINT
app.put('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const { password, expiry, deviceId, status } = req.body;

    console.log(`✏️ Editing key: ${username}`);

    const keys = await fetchFromGitHub(KEYS_RAW) || [];
    const keyIndex = keys.findIndex(k => k.username === username);

    if (keyIndex === -1) {
      return res.status(404).json({ error: 'Key not found' });
    }

    // Update fields
    if (password) keys[keyIndex].password = password;
    if (expiry) keys[keyIndex].expiry = expiry;
    if (deviceId) keys[keyIndex]["Device Id"] = deviceId;
    if (status) keys[keyIndex].status = status;

    keys[keyIndex].updatedAt = new Date().toISOString();
    keys[keyIndex].updatedBy = req.admin.username;

    await pushToGitHub(KEYS_API, keys, `Update key: ${username}`);

    res.json({ 
      success: true, 
      message: 'Key updated successfully',
      key: keys[keyIndex]
    });

  } catch (err) {
    console.error('❌ Edit key error:', err.message);
    res.status(500).json({ error: 'Update failed: ' + err.message });
  }
});

// 🔑 DELETE KEY - FIXED
app.delete('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    console.log(`🗑️ Attempting to delete key: ${username}`);

    const keys = await fetchFromGitHub(KEYS_RAW) || [];
    console.log(`📊 Current keys: ${keys.length}`);
    
    const filteredKeys = keys.filter(k => k.username !== username);
    
    if (filteredKeys.length === keys.length) {
      console.log(`❌ Key not found: ${username}`);
      return res.status(404).json({ error: 'Key not found' });
    }

    console.log(`✅ Key found, deleting: ${username}`);
    await pushToGitHub(KEYS_API, filteredKeys, `Delete key: ${username}`);
    
    res.json({ 
      success: true, 
      message: 'Key deleted successfully',
      deletedKey: username
    });
    
  } catch (err) {
    console.error('❌ Delete key error:', err.message);
    res.status(500).json({ error: 'Delete failed: ' + err.message });
  }
});

// 🚀 Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW) || [];
    const admins = await fetchFromGitHub(ADMINS_RAW) || [];
    
    res.json({ 
      status: 'healthy', 
      keysCount: keys.length,
      adminsCount: admins.length,
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

// 🚀 Initialize and start server
app.listen(PORT, async () => {
  console.log(`✅ StanyModz Premium running on port ${PORT}`);
  console.log(`🔗 Repository: ${GITHUB_USER}/${REPO_NAME}`);
  
  // Initialize admins file on startup
  setTimeout(async () => {
    await initializeAdminsFile();
  }, 2000);
});
