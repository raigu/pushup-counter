function setOdometer(personId, value) {
  const odo = document.getElementById(`odo-${personId}`);
  if (!odo) return;
  const digits = String(value).padStart(5, '0').split('');
  const reels = odo.querySelectorAll('.digit-reel');
  reels.forEach((reel, i) => {
    const digit = parseInt(digits[i], 10);
    reel.style.transform = `translateY(-${digit * 56}px)`;
  });
}

// Adjust digit height for mobile
function updateDigitHeight() {
  const isMobile = window.innerWidth <= 600;
  const height = isMobile ? 44 : 56;
  document.querySelectorAll('.digit-reel').forEach(reel => {
    const digits = reel.querySelectorAll('span');
    const currentDigit = Math.round(
      Math.abs(parseFloat(reel.style.transform?.replace(/[^0-9.-]/g, '') || '0')) / 56
    );
    reel.style.transform = `translateY(-${currentDigit * height}px)`;
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
