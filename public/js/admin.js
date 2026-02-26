// Extract secret from URL path
const secret = window.location.pathname.replace('/', '');
let person = null;

async function init() {
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
}

async function submitPushups() {
  const input = document.getElementById('count-input');
  const count = parseInt(input.value, 10);
  const msg = document.getElementById('message');
  const btn = document.getElementById('submit-btn');

  if (!count || count < 1 || count > 250) {
    msg.className = 'message error';
    msg.textContent = 'Enter a number between 1 and 250';
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
    input.value = 50;
  } catch (e) {
    msg.className = 'message error';
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false;
  }
}

init();
