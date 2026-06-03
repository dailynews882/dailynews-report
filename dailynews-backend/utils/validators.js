function isValidUsername(username) {
  // 会员名只能是大小写字母和数字，长度 4-20 位
  const regex = /^[A-Za-z0-9]{4,20}$/;
  return regex.test(username);
}

function isValidEmail(account) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(account);
}

function isValidSingaporePhone(account) {
  // 新加坡手机号码一般 8 位，常见以 8 或 9 开头
  // 支持：91234567 或 +6591234567
  const regex = /^(\+65)?[89]\d{7}$/;
  return regex.test(account);
}

function detectAccountType(account) {
  if (isValidEmail(account)) {
    return "email";
  }

  if (isValidSingaporePhone(account)) {
    return "phone";
  }

  return null;
}

function isValidPassword(password) {
  /*
    密码规则：
    - 8 到 32 位
    - 至少包含字母和数字
    - 允许大小写字母、数字、键盘符号
  */
  const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]{8,32}$/;
  return regex.test(password);
}

module.exports = {
  isValidUsername,
  detectAccountType,
  isValidPassword
};