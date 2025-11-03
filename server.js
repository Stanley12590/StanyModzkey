// server.js — PREMIUM MULTI-ADMIN VERSION
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

// 👇 GitHub Configuration
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const KEYS_FILE = 'Acceckey.json';
const ADMINS_FILE = 'Admins.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MAIN_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecurePass123!';

if (!GITHUB_TOKEN) {
  console.error('❌ FATAL: GITHUB_TOKEN is missing.');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

// Session storage (in production use Redis)
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
    isActive: true
  }
];

// 📥 Fetch data from GitHub
async function fetchFromGitHub(url, isRaw = true) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Stany-Key-Manager',
        ...(isRaw ? {} : { Authorization: `token ${GITHUB_TOKEN}` })
      },
      timeout: 15000
    });
    
    if (isRaw) {
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    }
    return response.data;
  } catch (err) {
    console.error('GitHub fetch error:', err.message);
    throw err;
  }
}

// 📤 Push data to GitHub
async function pushToGitHub(apiUrl, data, message) {
  try {
    const fileInfo = await axios.get(apiUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager'
      }
    });

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    await axios.put(apiUrl, {
      message,
      content,
      sha: fileInfo.data.sha,
      branch: 'main'
    }, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager'
      }
    });

    return true;
  } catch (err) {
    console.error('GitHub push error:', err.message);
    throw err;
  }
}

// 🔐 Authentication functions
async function verifyAdmin(username, password) {
  try {
    const admins = await fetchFromGitHub(ADMINS_RAW);
    const admin = admins.find(a => a.username === username && a.isActive);
    
    if (admin && admin.password === password) {
      return { ...admin, password: undefined };
    }
    return null;
  } catch (err) {
    // If admins file doesn't exist, check main admin
    if (username === "MainAdmin" && password === MAIN_ADMIN_PASSWORD) {
      return defaultAdmins[0];
    }
    return null;
  }
}

async function initializeAdminsFile() {
  try {
    await pushToGitHub(ADMINS_API, defaultAdmins, 'Initialize admins file');
    console.log('✅ Admins file initialized');
  } catch (err) {
    console.log('Admins file already exists or error:', err.message);
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
    const admins = await fetchFromGitHub(ADMINS_RAW);
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
    let admins;
    try {
      admins = await fetchFromGitHub(ADMINS_RAW);
    } catch (err) {
      admins = defaultAdmins;
    }

    if (admins.find(a => a.username === username)) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Generate secure password
    const password = crypto.randomBytes(8).toString('hex');
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

    // Create WhatsApp message
    const appUrl = `https://${req.get('host')}`;
    const whatsappMessage = `Hello ${username}! You've been invited as ${role} to StanyModz Key Manager. Login: ${appUrl} Username: ${username} Password: ${password}`;
    const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

    res.json({
      success: true,
      admin: { ...newAdmin, password: undefined },
      whatsappUrl,
      credentials: { username, password } // Only returned once
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

app.put('/api/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const admins = await fetchFromGitHub(ADMINS_RAW);
    const index = admins.findIndex(a => a.id === id);
    
    if (index === -1) return res.status(404).json({ error: 'Admin not found' });
    if (admins[index].role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot modify superadmin' });
    }

    admins[index] = { ...admins[index], ...updates };
    await pushToGitHub(ADMINS_API, admins, `Update admin: ${admins[index].username}`);

    res.json({ success: true, admin: { ...admins[index], password: undefined } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

app.delete('/api/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const admins = await fetchFromGitHub(ADMINS_RAW);
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

// 🔑 KEY MANAGEMENT ROUTES (same as before but with requireAuth)
app.get('/api/keys', requireAuth, async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW);
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load keys' });
  }
});

app.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW);
    const newKey = {
      "Device Id": req.body.deviceId || "",
      "username": req.body.username,
      "password": req.body.password,
      "expiry": req.body.expiry || "",
      "createdBy": req.admin.username,
      "createdAt": new Date().toISOString()
    };

    keys.push(newKey);
    await pushToGitHub(KEYS_API, keys, `Add key: ${req.body.username}`);

    res.status(201).json({ success: true, key: newKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add key' });
  }
});

app.put('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW);
    const index = keys.findIndex(k => k.username === req.params.username);
    
    if (index === -1) return res.status(404).json({ error: 'Key not found' });
    
    keys[index] = { ...keys[index], ...req.body };
    await pushToGitHub(KEYS_API, keys, `Update key: ${req.params.username}`);

    res.json({ success: true, key: keys[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update key' });
  }
});

app.delete('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const keys = await fetchFromGitHub(KEYS_RAW);
    const filtered = keys.filter(k => k.username !== req.params.username);
    
    if (filtered.length === keys.length) {
      return res.status(404).json({ error: 'Key not found' });
    }

    await pushToGitHub(KEYS_API, filtered, `Delete key: ${req.params.username}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete key' });
  }
});

// 🚀 Initialize and start server
initializeAdminsFile();

app.listen(PORT, () => {
  console.log(`✅ StanyModz Premium running on port ${PORT}`);
  console.log(`🔗 Repository: ${GITHUB_USER}/${REPO_NAME}`);
});
