function getDigitHeight() {
  return window.innerWidth <= 600 ? 44 : 56;
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

async function fetchTotals() {
  try {
    const res = await fetch('/api/totals');
    const data = await res.json();
    for (const [person, total] of Object.entries(data)) {
      setOdometer(person, total);
    }
  } catch (e) {
    console.error('Failed to fetch totals:', e);
  }
}

// Initial load
fetchTotals();

// Refresh every 30 seconds
setInterval(fetchTotals, 30000);

// Handle resize
window.addEventListener('resize', updateDigitHeight);
