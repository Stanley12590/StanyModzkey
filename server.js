// server.js — Premium Backend for StanyModz
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 GitHub & Auth Config (set via Render env vars)
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const FILE_PATH = 'Acceckey.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Required
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecurePass123!';

if (!GITHUB_TOKEN) {
  console.error('❌ FATAL: GITHUB_TOKEN environment variable is missing.');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

let isAuthenticated = false;

const GITHUB_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${FILE_PATH}`;

// 🔐 Auth
app.post('/api/auth/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    isAuthenticated = true;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

function requireAuth(req, res, next) {
  if (isAuthenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// 📥 Fetch keys from GitHub
async function fetchKeysFromGitHub() {
  const response = await axios.get(GITHUB_API, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Stany-Key-Manager/1.0',
      Accept: 'application/vnd.github.v3+json'
    }
  });
  const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
  return { keys: JSON.parse(content), sha: response.data.sha };
}

// 📤 Push updated keys to GitHub
async function pushKeysToGitHub(keys, sha) {
  const content = Buffer.from(JSON.stringify(keys, null, 2)).toString('base64');
  await axios.put(
    GITHUB_API,
    {
      message: 'Key update via Stany Admin Panel',
      content,
      sha,
      branch: 'main'
    },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager/1.0',
        Accept: 'application/vnd.github.v3+json'
      }
    }
  );
}

// 🌐 API Routes
app.get('/api/keys', requireAuth, async (req, res) => {
  try {
    const { keys } = await fetchKeysFromGitHub();
    res.json(keys);
  } catch (err) {
    console.error('GitHub fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load keys' });
  }
});

app.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const { keys, sha } = await fetchKeysFromGitHub();
    keys.push(req.body);
    await pushKeysToGitHub(keys, sha);
    res.status(201).json({ message: 'Key added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add key' });
  }
});

app.put('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { keys, sha } = await fetchKeysFromGitHub();
    const index = keys.findIndex(k => k.username === req.params.username);
    if (index === -1) return res.status(404).json({ error: 'Key not found' });
    keys[index] = { ...keys[index], ...req.body };
    await pushKeysToGitHub(keys, sha);
    res.json({ message: 'Key updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const { keys, sha } = await fetchKeysFromGitHub();
    const filtered = keys.filter(k => k.username !== req.params.username);
    if (filtered.length === keys.length) {
      return res.status(404).json({ error: 'Key not found' });
    }
    await pushKeysToGitHub(filtered, sha);
    res.json({ message: 'Key deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Stany Key Admin is live on port ${PORT}`);
  console.log(`🔗 Managing: ${GITHUB_USER}/${REPO_NAME}/${FILE_PATH}`);
});
