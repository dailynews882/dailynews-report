"use strict";

const bcrypt = require("bcrypt");
const { withAuthTransaction } = require("../utils/authTransaction");
const { generateOtp, getOtpExpireTime } = require("../utils/otp");
const { detectAccountType, isValidUsername, isValidPassword } = require("../utils/validators");

// Dependencies are supplied by authRoute; no server, schema initialization or
// mail transport is started by importing this module.
module.exports = function registrationHandlers(db, helpers) {
  const { hashOtp, verifyOtp, normalizeAccount, getRequestIp, createToken, sendEmailOtp, sendSmsOtp } = helpers;
  const reject = (status, message) => ({ status, body: { success: false, message } });
  const respond = (res, result) => res.status(result.status).json(result.body);
  function failure(res, error) {
    console.error("Registration operation failed:", error.code || error.name);
    const duplicate = error.code === "SQLITE_CONSTRAINT" && /UNIQUE constraint failed/.test(error.message);
    return respond(res, reject(duplicate ? 400 : error.code === "SQLITE_BUSY" ? 503 : 500,
      duplicate ? "会员名、邮箱或手机号码已经被注册" : "操作失败，请稍后重试"));
  }

  async function sendOtpHandler(req, res, forcedType = null) {
    const account = req.body?.account;
    if (typeof account !== "string") return respond(res, reject(400, "请输入正确的邮箱或新加坡手机号码"));
    const type = detectAccountType(account.trim());
    if (!type || (forcedType && forcedType !== type)) return respond(res, reject(400, "账号格式错误"));
    const normalized = normalizeAccount(account, type);
    const code = generateOtp();
    let otpId;
    try {
      const result = await withAuthTransaction(db, async ({ get, run }) => {
        const user = await get("SELECT id FROM users WHERE account=? OR email=? OR phone=? LIMIT 1", [normalized, normalized, normalized]);
        if (user) return reject(400, "该邮箱或手机号码已经注册");
        const last = await get("SELECT created_at,last_sent_at FROM otps WHERE account=? AND account_type=? AND purpose='register' ORDER BY id DESC LIMIT 1", [normalized, type]);
        const sentAt = last && Date.parse(last.last_sent_at || last.created_at);
        if (Number.isFinite(sentAt) && Date.now() - sentAt < 60000) return reject(429, "请等待60秒后重新发送验证码");
        const count = await get("SELECT COUNT(*) AS count FROM otps WHERE account=? AND purpose='register' AND julianday(created_at)>=julianday('now','-1 day')", [normalized]);
        if (count.count >= 5) return reject(429, "该账号获取验证码次数过多，请稍后再试");
        const ip = getRequestIp(req);
        const ipCount = await get("SELECT COUNT(*) AS count FROM otps WHERE request_ip=? AND purpose='register' AND julianday(created_at)>=julianday('now','-1 day')", [ip]);
        if (ipCount.count >= 20) return reject(429, "当前网络获取验证码次数过多，请稍后再试");
        await run("UPDATE otps SET used=1 WHERE account=? AND account_type=? AND purpose='register' AND used=0", [normalized, type]);
        const inserted = await run("INSERT INTO otps (account,otp_code,account_type,expires_at,used,purpose,attempt_count,request_ip,last_sent_at) VALUES (?,?,?,?,0,'register',0,?,?)",
          [normalized, hashOtp(code), type, getOtpExpireTime(), ip, new Date().toISOString()]);
        return { otpId: inserted.lastID };
      });
      if (result.status) return respond(res, result);
      otpId = result.otpId;
      // Never hold a database write lock during external delivery.
      if (type === "email") await sendEmailOtp(normalized, code);
      else await sendSmsOtp(normalized, code);
      return res.json({ success: true, message: type === "email" ? "邮箱验证码已发送，请检查收件箱" : "手机验证码已发送", accountType: type, expiresIn: 300 });
    } catch (error) {
      if (otpId) {
        try {
          await withAuthTransaction(db, ({ run }) => run("DELETE FROM otps WHERE id=? AND used=0", [otpId]));
        } catch (_) { console.error("Failed to remove undelivered OTP reservation"); }
      }
      return failure(res, error);
    }
  }

  async function registerHandler(req, res, forcedType = null) {
    const { username, account, email, password, otpCode, code } = req.body || {};
    const rawAccount = account || email;
    const submitted = otpCode || code;
    if (typeof username !== "string" || !isValidUsername(username)) return respond(res, reject(400, "会员名只能由大小写字母和数字组成，长度4-20位"));
    if (typeof rawAccount !== "string" || typeof password !== "string" || typeof submitted !== "string" || !/^\d{6}$/.test(submitted)) return respond(res, reject(400, "账号、密码或验证码格式错误"));
    const type = detectAccountType(rawAccount.trim());
    if (!type || (forcedType && forcedType !== type)) return respond(res, reject(400, "账号格式错误"));
    if (!isValidPassword(password)) return respond(res, reject(400, "密码长度8-32位，必须包含字母和数字，可使用键盘符号"));
    const normalized = normalizeAccount(rawAccount, type);
    try {
      // Expensive work is outside the write lock; all decisions below are reread
      // under BEGIN IMMEDIATE on a connection dedicated to this request.
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await withAuthTransaction(db, async ({ get, run }) => {
        const otp = await get("SELECT * FROM otps WHERE account=? AND account_type=? AND purpose='register' AND used=0 ORDER BY id DESC LIMIT 1", [normalized, type]);
        if (!otp) return reject(400, "验证码不存在或已经使用，请重新获取");
        if (Number(otp.attempt_count || 0) >= 5 || !Number.isFinite(Date.parse(otp.expires_at)) || Date.parse(otp.expires_at) <= Date.now()) {
          await run("UPDATE otps SET used=1 WHERE id=?", [otp.id]);
          return reject(400, "验证码已过期或错误次数过多，请重新获取");
        }
        if (!verifyOtp(submitted, otp.otp_code)) {
          const attempts = Number(otp.attempt_count || 0) + 1;
          await run("UPDATE otps SET attempt_count=?,used=? WHERE id=?", [attempts, attempts >= 5 ? 1 : 0, otp.id]);
          // Return normally so failed attempts are committed, not rolled back.
          return reject(400, attempts >= 5 ? "验证码错误次数过多，请重新获取" : `验证码错误，还可以尝试${5 - attempts}次`);
        }
        const emailValue = type === "email" ? normalized : null;
        const phoneValue = type === "phone" ? normalized : null;
        const existing = await get("SELECT id FROM users WHERE username=? OR account=? OR email=? OR phone=? LIMIT 1", [username, normalized, emailValue, phoneValue]);
        if (existing) return reject(400, "会员名或账号已经被注册");
        const consumed = await run("UPDATE otps SET used=1 WHERE id=? AND used=0 AND COALESCE(attempt_count,0)<5 AND julianday(expires_at)>julianday('now')", [otp.id]);
        if (consumed.changes !== 1) return reject(400, "验证码已失效，请重新获取");
        const inserted = await run("INSERT INTO users (username,account,account_type,password_hash,email,phone,email_verified,phone_verified,member_level,subscription_status) VALUES (?,?,?,?,?,?,?,?,'free','free')",
          [username, normalized, type, passwordHash, emailValue, phoneValue, emailValue ? 1 : 0, phoneValue ? 1 : 0]);
        const userId = inserted.lastID;
        // Keep the established wallet initialization fields and values.
        await run("INSERT INTO wallets (user_id,balance,reward_balance,status) VALUES (?,0,0,'active')", [userId]);
        const user = await get("SELECT id,username,account,member_level,auth_version FROM users WHERE id=?", [userId]);
        const token = createToken(user); // Signing errors roll back every write.
        return { status: 201, body: {
          success: true, message: "会员注册成功", token,
          user: { id: userId, username, account: normalized, accountType: type, email: emailValue, phone: phoneValue,
            emailVerified: Boolean(emailValue), phoneVerified: Boolean(phoneValue), memberLevel: "free", walletBalance: 0 }
        } };
      });
      return respond(res, result);
    } catch (error) { return failure(res, error); }
  }

  return { sendOtpHandler, registerHandler };
};
