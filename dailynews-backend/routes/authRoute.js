const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const {
  isValidUsername,
  detectAccountType,
  isValidPassword
} = require("../utils/validators");

const {
  generateOtp,
  getOtpExpireTime
} = require("../utils/otp");

const { sendEmailOtp } = require("../utils/emailSender");
const { sendSmsOtp } = require("../utils/smsSender");

const router = express.Router();

/**
 * 发送验证码
 * POST /api/auth/send-otp
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { account } = req.body;

    if (!account) {
      return res.status(400).json({
        success: false,
        message: "请输入邮箱或新加坡手机号码"
      });
    }

    const accountType = detectAccountType(account);

    if (!accountType) {
      return res.status(400).json({
        success: false,
        message: "账号格式错误，请输入正确的邮箱或新加坡手机号码"
      });
    }

    const otpCode = generateOtp();
    const expiresAt = getOtpExpireTime();

    db.run(
      `
      INSERT INTO otps (account, otp_code, account_type, expires_at)
      VALUES (?, ?, ?, ?)
      `,
      [account, otpCode, accountType, expiresAt],
      async function (err) {
        if (err) {
          return res.status(500).json({
            success: false,
            message: "验证码保存失败"
          });
        }

        try {
          if (accountType === "email") {
            await sendEmailOtp(account, otpCode);
          } else {
            await sendSmsOtp(account, otpCode);
          }

          return res.json({
            success: true,
            message:
              accountType === "email"
                ? "邮箱验证码已发送"
                : "手机验证码已发送"
          });
        } catch (sendError) {
          return res.status(500).json({
            success: false,
            message: "验证码发送失败",
            error: sendError.message
          });
        }
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
});

/**
 * 会员注册
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  try {
    const { username, account, password, otpCode } = req.body;

    if (!username || !account || !password || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "请填写会员名、账号、密码和验证码"
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: "会员名只能由大小写字母和数字组成，长度 4-20 位"
      });
    }

    const accountType = detectAccountType(account);

    if (!accountType) {
      return res.status(400).json({
        success: false,
        message: "账号格式错误，请输入正确的邮箱或新加坡手机号码"
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "密码长度 8-32 位，必须包含字母和数字，可使用键盘符号"
      });
    }

    db.get(
      `
      SELECT * FROM otps
      WHERE account = ?
      AND otp_code = ?
      AND used = 0
      ORDER BY id DESC
      LIMIT 1
      `,
      [account, otpCode],
      async (otpErr, otpRow) => {
        if (otpErr) {
          return res.status(500).json({
            success: false,
            message: "验证码查询失败"
          });
        }

        if (!otpRow) {
          return res.status(400).json({
            success: false,
            message: "验证码错误或已使用"
          });
        }

        const now = new Date();
        const expiresAt = new Date(otpRow.expires_at);

        if (now > expiresAt) {
          return res.status(400).json({
            success: false,
            message: "验证码已过期，请重新获取"
          });
        }

        db.get(
          `
          SELECT * FROM users
          WHERE username = ? OR account = ?
          `,
          [username, account],
          async (userErr, existingUser) => {
            if (userErr) {
              return res.status(500).json({
                success: false,
                message: "用户查询失败"
              });
            }

            if (existingUser) {
              return res.status(400).json({
                success: false,
                message: "会员名或账号已被注册"
              });
            }

            const passwordHash = await bcrypt.hash(password, 10);

            db.run(
              `
              INSERT INTO users 
              (username, account, account_type, password_hash)
              VALUES (?, ?, ?, ?)
              `,
              [username, account, accountType, passwordHash],
              function (insertErr) {
                if (insertErr) {
                  return res.status(500).json({
                    success: false,
                    message: "注册失败"
                  });
                }

                db.run(
                  `
                  UPDATE otps
                  SET used = 1
                  WHERE id = ?
                  `,
                  [otpRow.id]
                );

                return res.json({
                  success: true,
                  message: "会员注册成功",
                  user: {
                    id: this.lastID,
                    username,
                    account,
                    accountType,
                    memberLevel: "free"
                  }
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
});

/**
 * 会员登录
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

    db.get(
      `
      SELECT * FROM users
      WHERE username = ? OR account = ?
      LIMIT 1
      `,
      [account, account],
      async (err, user) => {
        if (err) {
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

        const isPasswordCorrect = await bcrypt.compare(
          password,
          user.password_hash
        );

        if (!isPasswordCorrect) {
          return res.status(400).json({
            success: false,
            message: "密码错误"
          });
        }

        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            account: user.account,
            memberLevel: user.member_level
          },
          process.env.JWT_SECRET || "dailynews_default_secret",
          {
            expiresIn: "7d"
          }
        );

        return res.json({
          success: true,
          message: "登录成功",
          token,
          user: {
            id: user.id,
            username: user.username,
            account: user.account,
            accountType: user.account_type,
            memberLevel: user.member_level
          }
        });
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
});
/**
 * 验证 Token 中间件
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "未登录，请先登录"
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token 无效"
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dailynews_default_secret"
    );

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "登录已过期，请重新登录"
    });
  }
}

/**
 * 获取当前登录用户信息
 * GET /api/auth/me
 */
router.get("/me", verifyToken, (req, res) => {
  const userId = req.user.id;

  db.get(
    `
    SELECT 
      u.id, 
      u.username, 
      u.account, 
      u.account_type, 
      u.member_level, 
      u.subscription_status,
      u.vip_expire_at,
      u.created_at,
      w.balance
    FROM users u
    LEFT JOIN wallets w ON u.id = w.user_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId],
    (err, user) => {
      if (err) {
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
          memberLevel: user.member_level || "free",
          createdAt: user.created_at,
          walletBalance: Number(user.balance || 0),
          subscriptionStatus: user.subscription_status || "free",
          subscriptionExpireAt: user.vip_expire_at || null
        }
      });
    }
  );
});
module.exports = router;