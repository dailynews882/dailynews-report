const crypto = require("crypto");

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function getOtpExpireTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  return now.toISOString();
}

module.exports = {
  generateOtp,
  getOtpExpireTime
};
