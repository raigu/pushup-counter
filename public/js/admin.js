const secret = window.location.pathname.replace('/', '');
let person = null;
let count = getLastCount();

function getLastCount() {
  const match = document.cookie.match(/(?:^|; )lastPushupCount=(\d+)/);
  const val = match ? parseInt(match[1], 10) : 50;
  return (val >= 1 && val <= 250) ? val : 50;
}

function saveLastCount(val) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `lastPushupCount=${val}; expires=${expires}; path=/; SameSite=Lax`;
}

function updateDisplay() {
  document.getElementById('count-display').textContent = count;
  const btn = document.getElementById('submit-btn');
  btn.textContent = `Submit ${count}`;
  btn.disabled = count < 1 || !person;
}

function adjustCount(delta) {
  count = Math.max(1, Math.min(250, count + delta));
  document.getElementById('message').className = 'message';
  updateDisplay();
}

async function init() {
  try {
    const res = await fetch(`/api/admin-info?secret=${encodeURIComponent(secret)}`);
    if (!res.ok) {
      document.getElementById('person-name').textContent = 'Invalid link';
      document.getElementById('submit-btn').disabled = true;
      return;
    }
    const data = await res.json();
    person = data.person;
    document.getElementById('person-name').textContent = person;
    document.getElementById('current-total').textContent = data.total;
    updateDisplay();
  } catch (e) {
    document.getElementById('person-name').textContent = 'Connection error';
    document.getElementById('submit-btn').disabled = true;
  }
}

async function submitPushups() {
  const msg = document.getElementById('message');
  const btn = document.getElementById('submit-btn');

  if (count < 1 || count > 250) {
    msg.className = 'message error';
    msg.textContent = 'Count must be 1-250';
    return;
  }

  btn.disabled = true;
  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person, count, secret }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.className = 'message error';
      msg.textContent = data.error || 'Error';
      return;
    }
    msg.className = 'message success';
    msg.textContent = `Added ${count} pushups! New total: ${data.total}`;
    document.getElementById('current-total').textContent = data.total;
    saveLastCount(count);
  } catch (e) {
    msg.className = 'message error';
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false;
    updateDisplay();
  }
}

// Event listeners
document.getElementById('tap-area').addEventListener('click', () => adjustCount(1));

document.querySelectorAll('.adjust-btn').forEach(btn => {
  btn.addEventListener('click', () => adjustCount(parseInt(btn.dataset.delta, 10)));
});

document.getElementById('submit-btn').addEventListener('click', submitPushups);

updateDisplay();
init();
