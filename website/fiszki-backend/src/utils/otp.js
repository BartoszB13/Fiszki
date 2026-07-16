// website/fiszki-backend/src/utils/otp.js
const crypto = require('crypto');

// crypto.randomInt is CSPRNG-backed, unlike Math.random()
function generateOTP() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

module.exports = { generateOTP };