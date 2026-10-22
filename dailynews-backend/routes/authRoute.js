const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const emailSender = require("../utils/emailSender");
const { sendSmsOtp } = require("../utils/smsSender");

const router = express.Router();
router.use((req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ success: false, code: "AUTH_NOT_CONFIGURED", message: "认证服务未配置" });
  }
  next();
});
const { verifyUserToken, accountDecision } = require("../middleware/userAuth");
router.use("/password-reset", require("./passwordResetRoute")(db, emailSender));

/*
 * 兼容两种邮件发送函数名称：
 *
 * 旧名称：sendEmailOtp
 * 新名称：sendVerificationEmail
 */
const sendEmailOtp =
  emailSender.sendEmailOtp ||
  emailSender.sendVerificationEmail;

/**
 * 生成验证码哈希。
 *
 * 数据库不保存验证码明文，只保存 SHA-256 哈希值。
 */
function hashOtp(otpCode) {
  return crypto
    .createHash("sha256")
    .update(String(otpCode))
    .digest("hex");
}

/**
 * 安全比较用户输入的验证码和数据库中的哈希值。
 */
function verifyOtp(inputCode, storedValue) {
  if (!inputCode || !storedValue) {
    return false;
  }

  /*
   * 兼容数据库里以前保存的明文验证码。
   * 新验证码会保存为长度为64的SHA-256哈希值。
   */
  if (storedValue.length !== 64) {
    return String(inputCode) === String(storedValue);
  }

  const inputHash = hashOtp(inputCode);

  const inputBuffer = Buffer.from(inputHash, "hex");
  const storedBuffer = Buffer.from(storedValue, "hex");

  if (inputBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(inputBuffer, storedBuffer);
}

/**
 * 标准化邮箱或手机号。
 */
function normalizeAccount(account, accountType) {
  const value = String(account || "").trim();

  if (accountType === "email") {
    return value.toLowerCase();
  }

  return value.replace(/\s+/g, "");
}

/**
 * 获取访问者IP地址。
 */
function getRequestIp(req) {
  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * 创建登录Token。
 */
function createToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("Authentication is not configured");

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      account: user.account,
      auth_version: Number(user.auth_version),
      memberLevel: user.member_level || "free"
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "7d"
    }
  );
}

/**
 * 发送验证码核心处理函数。
 *
 * 同时供以下接口使用：
 * POST /api/auth/send-otp
 * POST /api/auth/email/send-code
 */
const { sendOtpHandler, registerHandler } = require("../services/registrationService")(db, {
  hashOtp, verifyOtp, normalizeAccount, getRequestIp, createToken, sendEmailOtp, sendSmsOtp
});

/**
 * 发送邮箱或手机验证码。
 * 保留旧接口，避免现有前端失效。
 *
 * POST /api/auth/send-otp
 */
router.post("/send-otp", async (req, res) => {
  return sendOtpHandler(req, res);
});

/**
 * 邮箱验证码正式接口。
 *
 * POST /api/auth/email/send-code
 */
router.post("/email/send-code", async (req, res) => {
  return sendOtpHandler(req, res, "email");
});

/**
 * 保留原注册接口，避免现有前端失效。
 *
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  return registerHandler(req, res);
});

/**
 * 正式邮箱注册接口。
 *
 * POST /api/auth/email/register
 */
router.post("/email/register", async (req, res) => {
  return registerHandler(req, res, "email");
});

/**
 * 会员登录。
 *
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { account, password } = req.body;

    if (!account || !password) {
      return res.status(400).json({
        success: false,
        message: "请输入账号和密码"
      });
    }

    const normalizedLoginAccount = String(
      account
    ).trim();

    db.get(
      `
      SELECT *
      FROM users
      WHERE username = ?
         OR account = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [
        normalizedLoginAccount,
        normalizedLoginAccount,
        normalizedLoginAccount.toLowerCase(),
        normalizedLoginAccount.replace(/\s+/g, "")
      ],
      async (err, user) => {
        if (err) {
          console.error("Login user lookup error:", err);

          return res.status(500).json({
            success: false,
            message: "用户查询失败"
          });
        }

        if (!user) {
          return res.status(400).json({
            success: false,
            message: "账号不存在"
          });
        }

        let isPasswordCorrect = false;

        try {
          isPasswordCorrect = await bcrypt.compare(
            password,
            user.password_hash
          );
        } catch (compareError) {
          console.error(
            "Password compare error:",
            compareError
          );

          return res.status(500).json({
            success: false,
            message: "密码验证失败"
          });
        }

        if (!isPasswordCorrect) {
          return res.status(400).json({
            success: false,
            message: "密码错误"
          });
        }

        const restriction = accountDecision(user);
        if (restriction) return res.status(restriction.status).json({ success: false, code: restriction.code, message: restriction.message });
        const token = createToken(user);

        return res.json({
          success: true,
          message: "登录成功",
          token,
          user: {
            id: user.id,
            username: user.username,
            account: user.account,
            accountType: user.account_type,
            email: user.email || null,
            phone: user.phone || null,
            emailVerified: Boolean(
              user.email_verified
            ),
            phoneVerified: Boolean(
              user.phone_verified
            ),
            memberLevel:
              user.member_level || "free",
            subscriptionStatus:
              user.subscription_status ||
              "free",
            subscriptionExpireAt:
              user.vip_expire_at || null
          }
        });
      }
    );
  } catch (error) {
    console.error("Login server error:", error);

    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
});

/**
 * 验证Token中间件。
 */
/**
 * 获取当前登录用户信息。
 *
 * GET /api/auth/me
 */
router.get("/me", verifyUserToken, (req, res) => {
  const userId = req.user.id;

  db.get(
    `
    SELECT
      u.id,
      u.username,
      u.account,
      u.account_type,
      u.email,
      u.phone,
      u.email_verified,
      u.phone_verified,
      u.member_level,
      u.subscription_status,
      u.vip_expire_at,
      u.created_at,
      w.balance,
      w.reward_balance,
      w.status AS wallet_status
    FROM users u
    LEFT JOIN wallets w
      ON u.id = w.user_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId],
    (err, user) => {
      if (err) {
        console.error(
          "Current user lookup error:",
          err
        );

        return res.status(500).json({
          success: false,
          message: "用户信息查询失败"
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      return res.json({
        success: true,
        message: "获取用户信息成功",
        user: {
          id: user.id,
          username: user.username,
          account: user.account,
          accountType: user.account_type,
          email: user.email || null,
          phone: user.phone || null,
          emailVerified: Boolean(
            user.email_verified
          ),
          phoneVerified: Boolean(
            user.phone_verified
          ),
          memberLevel:
            user.member_level || "free",
          createdAt: user.created_at,
          walletBalance: Number(
            user.balance || 0
          ),
          rewardBalance: Number(
            user.reward_balance || 0
          ),
          walletStatus:
            user.wallet_status || "active",
          subscriptionStatus:
            user.subscription_status ||
            "free",
          subscriptionExpireAt:
            user.vip_expire_at || null
        }
      });
    }
  );
});

module.exports = router;
