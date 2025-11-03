// server.js — FINAL & READY TO DEPLOY — NO CHANGES NEEDED
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// 👇 DON'T TOUCH THESE — SET IN RENDER ENVIRONMENT
const GITHUB_USER = 'Stanley12590';
const REPO_NAME = 'StanyModzkey';
const FILE_PATH = 'Acceckey.json';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Must be set in Render
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SecurePass123!';

if (!GITHUB_TOKEN) {
  console.error('❌ FATAL: GITHUB_TOKEN is missing. Set it in Render environment variables.');
  process.exit(1);
}

app.use(express.static('public'));
app.use(express.json());

let isLoggedIn = false;

const GITHUB_API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${FILE_PATH}`;

// 📥 Fetch keys from GitHub (using raw content)
async function fetchKeysFromGitHub() {
  try {
    const response = await axios.get(GITHUB_API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager',
        Accept: 'application/vnd.github.v3.raw' // ✅ CORRECT FOR FILE CONTENTS
      }
    });
    return JSON.parse(response.data); // Returns array of keys
  } catch (err) {
    console.error('GitHub fetch error:', err.message);
    throw new Error('Failed to load keys from GitHub');
  }
}

// 📤 Update keys on GitHub
async function pushKeysToGitHub(keys) {
  try {
    // Get current file info to get SHA
    const fileInfo = await axios.get(GITHUB_API, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Stany-Key-Manager'
      }
    });
    const sha = fileInfo.data.sha;
    const content = Buffer.from(JSON.stringify(keys, null, 2)).toString('base64');

    await axios.put(
      GITHUB_API,
      {
        message: 'Update via Stany Admin Panel',
        content,
        sha,
        branch: 'main'
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Stany-Key-Manager',
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('GitHub push error:', err.message);
    throw new Error('Failed to update keys on GitHub');
  }
}

// 🔐 Login route
app.post('/api/auth/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    isLoggedIn = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

function requireAuth(req, res, next) {
  if (isLoggedIn) return next();
  res.status(401).json({ error: 'Not logged in' });
}

app.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const keys = await fetchKeysFromGitHub();
    keys.push(req.body);
    await pushKeysToGitHub(keys);
    res.status(201).json({ message: 'Key added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add key' });
  }
});

app.put('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const keys = await fetchKeysFromGitHub();
    const index = keys.findIndex(k => k.username === req.params.username);
    if (index === -1) return res.status(404).json({ error: 'Key not found' });
    keys[index] = { ...keys[index], ...req.body };
    await pushKeysToGitHub(keys);
    res.json({ message: 'Key updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/keys/:username', requireAuth, async (req, res) => {
  try {
    const keys = await fetchKeysFromGitHub();
    const filtered = keys.filter(k => k.username !== req.params.username);
    if (filtered.length === keys.length) {
      return res.status(404).json({ error: 'Key not found' });
    }
    await pushKeysToGitHub(filtered);
    res.json({ message: 'Key deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`✅ Stany Key Manager running on port ${PORT}`);
  console.log(`🔗 Managing: ${GITHUB_USER}/${REPO_NAME}/${FILE_PATH}`);
});
