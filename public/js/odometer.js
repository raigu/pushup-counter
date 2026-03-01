function getDigitHeight() {
  return window.innerWidth <= 600 ? 44 : 56;
}

function createOdometerHTML(name) {
  const digitSlot = `<div class="digit-slot"><div class="digit-reel">${
    [0,1,2,3,4,5,6,7,8,9].map(d => `<span>${d}</span>`).join('')
  }</div></div>`;
  return `
    <div class="person" data-person="${name}">
      <div class="name">${name}</div>
      <div class="odometer" id="odo-${name}">
        ${digitSlot.repeat(5)}
      </div>
    </div>`;
}

function setOdometer(personId, value) {
  const odo = document.getElementById(`odo-${personId}`);
  if (!odo) return;
  const height = getDigitHeight();
  const digits = String(value).padStart(5, '0').split('');
  const reels = odo.querySelectorAll('.digit-reel');
  reels.forEach((reel, i) => {
    const digit = parseInt(digits[i], 10);
    reel.style.transform = `translateY(-${digit * height}px)`;
  });
}

let knownUsers = null;

async function fetchTotals() {
  try {
    const res = await fetch('/api/challenge/totals');
    const data = await res.json();
    const users = Object.keys(data);

    // Rebuild board if users changed
    if (JSON.stringify(users) !== JSON.stringify(knownUsers)) {
      knownUsers = users;
      const board = document.getElementById('board');
      board.innerHTML = users.length > 0
        ? users.map(name => createOdometerHTML(name)).join('')
        : '<div class="empty">No users yet</div>';
    }

    for (const [person, total] of Object.entries(data)) {
      setOdometer(person, total);
    }
  } catch (e) {
    console.error('Failed to fetch totals:', e);
  }
}

let countdownInterval = null;

async function fetchChallenge() {
  try {
    const res = await fetch('/api/challenge');
    const data = await res.json();
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const start = new Date(data.start + 'T00:00:00');
    const end = new Date(data.end + 'T00:00:00');
    document.getElementById('challenge-dates').textContent =
      start.toLocaleDateString(undefined, opts) + ' – ' + end.toLocaleDateString(undefined, opts);

    document.getElementById('challenge-title').textContent = data.title || '';

    startCountdown(start);
  } catch (e) {
    // silently ignore
  }
}

function startCountdown(startDate) {
  const el = document.getElementById('countdown');
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const now = new Date();
    const diff = startDate - now;
    if (diff <= 0) {
      el.textContent = 'Challenge started!';
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    el.textContent = 'Starts in ' + days + 'd ' + hours + 'h ' + minutes + 'm ' + seconds + 's';
  }

  // Only show countdown if challenge is in the future
  if (startDate > new Date()) {
    tick();
    countdownInterval = setInterval(tick, 1000);
  }
}

// Initial load
fetchTotals();
fetchChallenge();

// Refresh every 30 seconds
setInterval(fetchTotals, 30000);
