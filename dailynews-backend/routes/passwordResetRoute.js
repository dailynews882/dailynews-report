"use strict";

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { withAuthTransaction } = require("../utils/authTransaction");
const { isValidPassword, detectAccountType } = require("../utils/validators");
const { generateOtp } = require("../utils/otp");

const GENERIC_SENT = "如果该邮箱符合重置条件，您将收到验证码。请检查收件箱，60秒后可重试。";
const GENERIC_INVALID = "验证码无效或已过期，请重新申请。";
const allowed = user => user && user.email_verified === 1 && ["active", "temporary_ban"].includes(user.account_status);
const normalizeEmail = input => typeof input === "string" ? input.trim().toLowerCase() : "";
const validEmail = email => email.length <= 254 && detectAccountType(email) === "email";
const digest = (email, code) => crypto.createHmac("sha256", process.env.JWT_SECRET)
  .update("dailynews:password-reset:v1:" + email + ":" + code).digest("hex");

module.exports = function passwordResetRoute(db, { sendPasswordResetEmail }) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!process.env.JWT_SECRET) return res.status(503).json({ success: false, code: "AUTH_NOT_CONFIGURED", message: "认证服务未配置" });
    next();
  });
  router.post("/request", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ success: false, message: "请输入正确的邮箱地址。" });
    try {
      const code = generateOtp();
      const result = await withAuthTransaction(db, async ({ get, run }) => {
        // Reserve all valid addresses, including unknown/restricted accounts.
        // This keeps response status, cooldowns and quotas independent of existence.
        const latest = await get("SELECT created_at FROM password_reset_otps WHERE email=? ORDER BY id DESC LIMIT 1", [email]);
        if (latest && Date.now() - Date.parse(latest.created_at) < 60000) return {};
        const count = await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email=? AND julianday(created_at)>=julianday('now','-1 day')", [email]);
        if (count.n >= 5) return {};
        const ip = req.ip || req.socket?.remoteAddress || "";
        const ipCount = await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE request_ip=? AND julianday(created_at)>=julianday('now','-1 day')", [ip]);
        if (ipCount.n >= 20) return {};
        const user = await get("SELECT id,email_verified,account_status,auth_version FROM users WHERE email=? LIMIT 1", [email]);
        const eligible = allowed(user);
        await run("UPDATE password_reset_otps SET used=1 WHERE email=? AND used=0", [email]);
        const inserted = await run(`INSERT INTO password_reset_otps
          (email,user_id,auth_version,code_hash,expires_at,used,attempt_count,request_ip,created_at)
          VALUES (?,?,?,?,?,0,0,?,?)`, [email, eligible ? user.id : null, eligible ? user.auth_version : null,
          digest(email, code), new Date(Date.now() + 300000).toISOString(), ip, new Date().toISOString()]);
        return { id: inserted.lastID, deliver: Boolean(eligible) };
      });
      res.json({ success: true, message: GENERIC_SENT, expiresIn: 300 });
      // Delivery is deliberately outside the request's response timing and DB lock.
      // Never log the recipient, OTP, transport exception or key.
      if (result.deliver) setImmediate(async () => {
        try { await sendPasswordResetEmail(email, code); }
        catch (_) {
          console.error("Password reset delivery failed");
          try { await withAuthTransaction(db, ({ run }) => run("UPDATE password_reset_otps SET used=1 WHERE id=?", [result.id])); }
          catch (_) { console.error("Password reset delivery cleanup failed"); }
        }
      });
    } catch (_) {
      return res.status(503).json({ success: false, message: "密码重置暂时不可用，请稍后重试。" });
    }
  });

  router.post("/confirm", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { code, newPassword } = req.body || {};
    if (!validEmail(email) || typeof code !== "string" || !/^\d{6}$/.test(code) ||
        typeof newPassword !== "string" || !isValidPassword(newPassword)) {
      return res.status(400).json({ success: false, message: "请检查邮箱、六位验证码及新密码（8至32位，包含字母和数字）。" });
    }
    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const reset = await withAuthTransaction(db, async ({ get, run }) => {
        const otp = await get("SELECT * FROM password_reset_otps WHERE email=? ORDER BY id DESC LIMIT 1", [email]);
        if (!otp || otp.used !== 0 || otp.attempt_count >= 5) return false;
        if (!Number.isFinite(Date.parse(otp.expires_at)) || Date.parse(otp.expires_at) <= Date.now()) {
          await run("UPDATE password_reset_otps SET used=1 WHERE id=?", [otp.id]);
          return false;
        }
        const hash = digest(email, code);
        if (!/^[a-f0-9]{64}$/.test(otp.code_hash) || !crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(otp.code_hash, "hex"))) {
          const attempts = otp.attempt_count + 1;
          await run("UPDATE password_reset_otps SET attempt_count=?,used=? WHERE id=?", [attempts, attempts >= 5 ? 1 : 0, otp.id]);
          return false;
        }
        const user = await get("SELECT id,email,email_verified,account_status,auth_version FROM users WHERE id=?", [otp.user_id]);
        if (!allowed(user) || user.email !== email || user.auth_version !== otp.auth_version) {
          await run("UPDATE password_reset_otps SET used=1 WHERE id=?", [otp.id]);
          return false;
        }
        const consumed = await run("UPDATE password_reset_otps SET used=1 WHERE id=? AND used=0 AND attempt_count<5 AND julianday(expires_at)>julianday('now')", [otp.id]);
        if (consumed.changes !== 1) return false;
        const updated = await run(`UPDATE users SET password_hash=?,auth_version=auth_version+1
          WHERE id=? AND email=? AND email_verified=1 AND auth_version=? AND account_status IN ('active','temporary_ban')`,
          [passwordHash, user.id, email, otp.auth_version]);
        if (updated.changes !== 1) throw new Error("Reset state changed");
        await run("UPDATE password_reset_otps SET used=1 WHERE user_id=? OR email=?", [user.id, email]);
        return true;
      });
      if (!reset) return res.status(400).json({ success: false, message: GENERIC_INVALID });
      return res.json({ success: true, message: "密码已重置，请重新登录。" });
    } catch (_) { return res.status(503).json({ success: false, message: "密码重置暂时不可用，请稍后重试。" }); }
  });
  return router;
};
