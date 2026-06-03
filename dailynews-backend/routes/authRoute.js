const express = require("express");
const bcrypt = require("bcrypt");
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

module.exports = router;