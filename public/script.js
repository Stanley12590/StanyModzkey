let isLoggedIn = false;

async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function login() {
  const pass = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ password: pass }) });
    isLoggedIn = true;
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    loadKeys();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function logout() {
  isLoggedIn = false;
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('password').value = '';
}

async function loadKeys() {
  try {
    const keys = await api('/keys');
    const table = document.getElementById('keys-table');
    const countEl = document.getElementById('key-count');
    countEl.textContent = keys.length;

    const today = new Date().toISOString().split('T')[0];
    table.innerHTML = keys.map(key => {
      let statusClass = '', statusText = '';

      if (!key['Device Id']) {
        statusClass = 'status--no-device';
        statusText = '⚠️ No Device';
      } else if (!key.expiry) {
        statusClass = 'status--unlimited';
        statusText = '♾️ Unlimited';
      } else if (key.expiry < today) {
        statusClass = 'status--expired';
        statusText = '❌ Expired';
      } else {
        statusText = '✅ Active';
      }

      return `
        <tr class="${statusClass}">
          <td>${key['Device Id'] || '—'}</td>
          <td>${key.username}</td>
          <td>${key.password}</td>
          <td>${key.expiry || '—'}</td>
          <td>${statusText}</td>
          <td>
            <button class="btn secondary" onclick="editKey('${key.username}')">Edit</button>
            <button class="btn secondary" style="background:#fee2e2;color:#ef4444;" onclick="deleteKey('${key.username}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    alert('Failed to load keys: ' + err.message);
    logout();
  }
}

async function addKey() {
  const key = {
    "Device Id": document.getElementById('deviceId').value || '',
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
    expiry: document.getElementById('expiry').value || ''
  };

  if (!key.username || !key.password) return alert('Username and password are required.');

  try {
    await api('/keys', { method: 'POST', body: JSON.stringify(key) });
    loadKeys();
    document.getElementById('deviceId').value = '';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('expiry').value = '';
  } catch (err) {
    alert('Add failed: ' + err.message);
  }
}

async function editKey(username) {
  const newPass = prompt(`Enter new password for ${username}:`);
  if (newPass === null) return;
  try {
    await api(`/keys/${username}`, { method: 'PUT', body: JSON.stringify({ password: newPass }) });
    loadKeys();
  } catch (err) {
    alert('Update failed: ' + err.message);
  }
}

async function deleteKey(username) {
  if (!confirm(`Permanently delete key for "${username}"?`)) return;
  try {
    await api(`/keys/${username}`, { method: 'DELETE' });
    loadKeys();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}
