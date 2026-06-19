const crypto = require("crypto");

/**
 * 生成6位数字验证码
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * 对验证码进行哈希，避免数据库保存明文
 */
function hashVerificationCode(code) {
  return crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");
}

/**
 * 比较验证码
 */
function verifyCode(code, storedHash) {
  const inputHash = hashVerificationCode(code);

  const inputBuffer = Buffer.from(inputHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (inputBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(inputBuffer, storedBuffer);
}

module.exports = {
  generateVerificationCode,
  hashVerificationCode,
  verifyCode,
};