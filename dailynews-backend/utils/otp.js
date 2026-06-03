function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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