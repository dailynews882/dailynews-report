const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
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

const emailSender = require("../utils/emailSender");
const { sendSmsOtp } = require("../utils/smsSender");

const router = express.Router();

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
  const forwardedIp = req.headers["x-forwarded-for"];

  if (forwardedIp) {
    return String(forwardedIp).split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "";
}

/**
 * 创建登录Token。
 */
function createToken(user) {
  if (!process.env.JWT_SECRET) {
    console.warn(
      "Warning: JWT_SECRET is not configured. Please configure it in .env."
    );
  }

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      account: user.account,
      memberLevel: user.member_level || "free"
    },
    process.env.JWT_SECRET || "dailynews_default_secret",
    {
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
async function sendOtpHandler(req, res, forcedAccountType = null) {
  try {
    const { account } = req.body;

    if (!account) {
      return res.status(400).json({
        success: false,
        message: "请输入邮箱或新加坡手机号码"
      });
    }

    const detectedType = detectAccountType(account);
    const accountType = forcedAccountType || detectedType;

    if (!detectedType) {
      return res.status(400).json({
        success: false,
        message: "账号格式错误，请输入正确的邮箱或新加坡手机号码"
      });
    }

    if (
      forcedAccountType &&
      detectedType !== forcedAccountType
    ) {
      return res.status(400).json({
        success: false,
        message:
          forcedAccountType === "email"
            ? "请输入正确的邮箱地址"
            : "请输入正确的新加坡手机号码"
      });
    }

    const normalizedAccount = normalizeAccount(
      account,
      accountType
    );

    /*
     * 检查该邮箱或手机号是否已经注册。
     */
    db.get(
      `
      SELECT id
      FROM users
      WHERE account = ?
         OR email = ?
         OR phone = ?
      LIMIT 1
      `,
      [
        normalizedAccount,
        accountType === "email" ? normalizedAccount : null,
        accountType === "phone" ? normalizedAccount : null
      ],
      (userErr, existingUser) => {
        if (userErr) {
          console.error("User lookup error:", userErr);

          return res.status(500).json({
            success: false,
            message: "账号查询失败"
          });
        }

        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "该邮箱或手机号码已经注册"
          });
        }

        /*
         * 60秒内不允许重复发送。
         */
        db.get(
          `
          SELECT id, created_at, last_sent_at
          FROM otps
          WHERE account = ?
            AND account_type = ?
            AND purpose = 'register'
          ORDER BY id DESC
          LIMIT 1
          `,
          [normalizedAccount, accountType],
          (lastOtpErr, lastOtp) => {
            if (lastOtpErr) {
              console.error(
                "OTP rate-limit lookup error:",
                lastOtpErr
              );

              return res.status(500).json({
                success: false,
                message: "验证码状态查询失败"
              });
            }

            if (lastOtp) {
              const lastSentTime = new Date(
                lastOtp.last_sent_at ||
                lastOtp.created_at
              ).getTime();

              const secondsPassed = Math.floor(
                (Date.now() - lastSentTime) / 1000
              );

              if (
                Number.isFinite(secondsPassed) &&
                secondsPassed < 60
              ) {
                return res.status(429).json({
                  success: false,
                  message: `请等待 ${
                    60 - secondsPassed
                  } 秒后重新发送验证码`
                });
              }
            }

            const requestIp = getRequestIp(req);

            /*
             * 单个账号每天最多发送5次验证码。
             */
            db.get(
              `
              SELECT COUNT(*) AS count
              FROM otps
              WHERE account = ?
                AND purpose = 'register'
                AND created_at >= datetime('now', '-1 day')
              `,
              [normalizedAccount],
              (accountCountErr, accountCountRow) => {
                if (accountCountErr) {
                  console.error(
                    "OTP daily account count error:",
                    accountCountErr
                  );

                  return res.status(500).json({
                    success: false,
                    message: "验证码发送次数检查失败"
                  });
                }

                if (
                  Number(accountCountRow?.count || 0) >= 5
                ) {
                  return res.status(429).json({
                    success: false,
                    message:
                      "该账号今天获取验证码次数过多，请明天再试"
                  });
                }

                /*
                 * 单个IP每天最多发送20次验证码。
                 */
                db.get(
                  `
                  SELECT COUNT(*) AS count
                  FROM otps
                  WHERE request_ip = ?
                    AND purpose = 'register'
                    AND created_at >= datetime('now', '-1 day')
                  `,
                  [requestIp],
                  async (ipCountErr, ipCountRow) => {
                    if (ipCountErr) {
                      console.error(
                        "OTP daily IP count error:",
                        ipCountErr
                      );

                      return res.status(500).json({
                        success: false,
                        message: "验证码发送频率检查失败"
                      });
                    }

                    if (
                      Number(ipCountRow?.count || 0) >= 20
                    ) {
                      return res.status(429).json({
                        success: false,
                        message:
                          "当前网络今天获取验证码次数过多，请稍后再试"
                      });
                    }

                    const otpCode = generateOtp();
                    const otpHash = hashOtp(otpCode);
                    const expiresAt = getOtpExpireTime();
                    const nowIso = new Date().toISOString();

                    /*
                     * 先将以前未使用的同类验证码设为已使用，
                     * 保证只有最新验证码有效。
                     */
                    db.run(
                      `
                      UPDATE otps
                      SET used = 1
                      WHERE account = ?
                        AND account_type = ?
                        AND purpose = 'register'
                        AND used = 0
                      `,
                      [normalizedAccount, accountType],
                      (invalidateErr) => {
                        if (invalidateErr) {
                          console.error(
                            "Invalidate old OTP error:",
                            invalidateErr
                          );

                          return res.status(500).json({
                            success: false,
                            message: "验证码初始化失败"
                          });
                        }

                        db.run(
                          `
                          INSERT INTO otps (
                            account,
                            otp_code,
                            account_type,
                            expires_at,
                            used,
                            purpose,
                            attempt_count,
                            request_ip,
                            last_sent_at
                          )
                          VALUES (?, ?, ?, ?, 0, 'register', 0, ?, ?)
                          `,
                          [
                            normalizedAccount,
                            otpHash,
                            accountType,
                            expiresAt,
                            requestIp,
                            nowIso
                          ],
                          async function (insertErr) {
                            if (insertErr) {
                              console.error(
                                "OTP insert error:",
                                insertErr
                              );

                              return res.status(500).json({
                                success: false,
                                message: "验证码保存失败"
                              });
                            }

                            const otpId = this.lastID;

                            try {
                              if (accountType === "email") {
                                if (
                                  typeof sendEmailOtp !==
                                  "function"
                                ) {
                                  throw new Error(
                                    "邮件发送函数没有正确配置"
                                  );
                                }

                                await sendEmailOtp(
                                  normalizedAccount,
                                  otpCode
                                );
                              } else {
                                if (
                                  typeof sendSmsOtp !==
                                  "function"
                                ) {
                                  throw new Error(
                                    "短信发送服务没有正确配置"
                                  );
                                }

                                await sendSmsOtp(
                                  normalizedAccount,
                                  otpCode
                                );
                              }

                              return res.json({
                                success: true,
                                message:
                                  accountType === "email"
                                    ? "邮箱验证码已发送，请检查收件箱"
                                    : "手机验证码已发送",
                                accountType,
                                expiresIn: 300
                              });
                            } catch (sendError) {
                              console.error(
                                "OTP send error:",
                                sendError
                              );

                              /*
                               * 发送失败后删除这条验证码，
                               * 避免占用每日发送次数。
                               */
                              db.run(
                                `
                                DELETE FROM otps
                                WHERE id = ?
                                `,
                                [otpId]
                              );

                              return res.status(500).json({
                                success: false,
                                message:
                                  accountType === "email"
                                    ? "邮箱验证码发送失败"
                                    : "手机验证码发送失败",
                                error: sendError.message
                              });
                            }
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("Send OTP server error:", error);

    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
}

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
 * 会员注册核心处理函数。
 *
 * 同时供以下接口使用：
 * POST /api/auth/register
 * POST /api/auth/email/register
 */
async function registerHandler(
  req,
  res,
  forcedAccountType = null
) {
  try {
    const {
      username,
      account,
      email,
      password,
      otpCode,
      code
    } = req.body;

    /*
     * 新接口可以提交email和code；
     * 旧接口仍然可以提交account和otpCode。
     */
    const rawAccount = account || email;
    const submittedOtp = otpCode || code;

    if (
      !username ||
      !rawAccount ||
      !password ||
      !submittedOtp
    ) {
      return res.status(400).json({
        success: false,
        message: "请填写会员名、账号、密码和验证码"
      });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message:
          "会员名只能由大小写字母和数字组成，长度4-20位"
      });
    }

    const detectedType = detectAccountType(rawAccount);
    const accountType = forcedAccountType || detectedType;

    if (!detectedType) {
      return res.status(400).json({
        success: false,
        message:
          "账号格式错误，请输入正确的邮箱或新加坡手机号码"
      });
    }

    if (
      forcedAccountType &&
      detectedType !== forcedAccountType
    ) {
      return res.status(400).json({
        success: false,
        message: "请输入正确的邮箱地址"
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "密码长度8-32位，必须包含字母和数字，可使用键盘符号"
      });
    }

    const normalizedAccount = normalizeAccount(
      rawAccount,
      accountType
    );

    /*
     * 查询最新且未使用的验证码。
     * 不直接在SQL中匹配验证码，因为数据库保存的是哈希值。
     */
    db.get(
      `
      SELECT *
      FROM otps
      WHERE account = ?
        AND account_type = ?
        AND purpose = 'register'
        AND used = 0
      ORDER BY id DESC
      LIMIT 1
      `,
      [normalizedAccount, accountType],
      async (otpErr, otpRow) => {
        if (otpErr) {
          console.error("OTP lookup error:", otpErr);

          return res.status(500).json({
            success: false,
            message: "验证码查询失败"
          });
        }

        if (!otpRow) {
          return res.status(400).json({
            success: false,
            message: "验证码不存在或已经使用，请重新获取"
          });
        }

        if (
          Number(otpRow.attempt_count || 0) >= 5
        ) {
          db.run(
            `
            UPDATE otps
            SET used = 1
            WHERE id = ?
            `,
            [otpRow.id]
          );

          return res.status(400).json({
            success: false,
            message:
              "验证码错误次数过多，请重新获取验证码"
          });
        }

        const expiresAt = new Date(
          otpRow.expires_at
        ).getTime();

        if (
          !Number.isFinite(expiresAt) ||
          Date.now() > expiresAt
        ) {
          db.run(
            `
            UPDATE otps
            SET used = 1
            WHERE id = ?
            `,
            [otpRow.id]
          );

          return res.status(400).json({
            success: false,
            message: "验证码已过期，请重新获取"
          });
        }

        const otpIsCorrect = verifyOtp(
          submittedOtp,
          otpRow.otp_code
        );

        if (!otpIsCorrect) {
          db.run(
            `
            UPDATE otps
            SET attempt_count = attempt_count + 1
            WHERE id = ?
            `,
            [otpRow.id]
          );

          const remainingAttempts =
            4 - Number(otpRow.attempt_count || 0);

          return res.status(400).json({
            success: false,
            message:
              remainingAttempts > 0
                ? `验证码错误，还可以尝试${remainingAttempts}次`
                : "验证码错误次数过多，请重新获取验证码"
          });
        }

        /*
         * 检查会员名、账号、邮箱或手机号是否已经注册。
         */
        db.get(
          `
          SELECT id
          FROM users
          WHERE username = ?
             OR account = ?
             OR email = ?
             OR phone = ?
          LIMIT 1
          `,
          [
            username,
            normalizedAccount,
            accountType === "email"
              ? normalizedAccount
              : null,
            accountType === "phone"
              ? normalizedAccount
              : null
          ],
          async (userErr, existingUser) => {
            if (userErr) {
              console.error(
                "Existing user lookup error:",
                userErr
              );

              return res.status(500).json({
                success: false,
                message: "用户查询失败"
              });
            }

            if (existingUser) {
              return res.status(400).json({
                success: false,
                message: "会员名或账号已经被注册"
              });
            }

            let passwordHash;

            try {
              passwordHash = await bcrypt.hash(
                password,
                12
              );
            } catch (hashError) {
              console.error(
                "Password hash error:",
                hashError
              );

              return res.status(500).json({
                success: false,
                message: "密码加密失败"
              });
            }

            const emailValue =
              accountType === "email"
                ? normalizedAccount
                : null;

            const phoneValue =
              accountType === "phone"
                ? normalizedAccount
                : null;

            const emailVerified =
              accountType === "email" ? 1 : 0;

            const phoneVerified =
              accountType === "phone" ? 1 : 0;

            db.run(
              `
              INSERT INTO users (
                username,
                account,
                account_type,
                password_hash,
                email,
                phone,
                email_verified,
                phone_verified,
                member_level,
                subscription_status
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free', 'free')
              `,
              [
                username,
                normalizedAccount,
                accountType,
                passwordHash,
                emailValue,
                phoneValue,
                emailVerified,
                phoneVerified
              ],
              function (insertErr) {
                if (insertErr) {
                  console.error(
                    "User insert error:",
                    insertErr
                  );

                  if (
                    insertErr.message.includes(
                      "UNIQUE constraint failed"
                    )
                  ) {
                    return res.status(400).json({
                      success: false,
                      message:
                        "会员名、邮箱或手机号码已经被注册"
                    });
                  }

                  return res.status(500).json({
                    success: false,
                    message: "注册失败"
                  });
                }

                const userId = this.lastID;

                /*
                 * 注册成功后创建钱包。
                 */
                db.run(
                  `
                  INSERT OR IGNORE INTO wallets (
                    user_id,
                    balance,
                    reward_balance,
                    status
                  )
                  VALUES (?, 0, 0, 'active')
                  `,
                  [userId],
                  (walletErr) => {
                    if (walletErr) {
                      console.error(
                        "Wallet creation error:",
                        walletErr
                      );

                      /*
                       * 钱包创建失败时删除刚创建的用户，
                       * 防止出现没有钱包的残缺账户。
                       */
                      db.run(
                        `
                        DELETE FROM users
                        WHERE id = ?
                        `,
                        [userId]
                      );

                      return res.status(500).json({
                        success: false,
                        message:
                          "账户钱包创建失败，请重新注册"
                      });
                    }

                    /*
                     * 验证码标记为已经使用。
                     */
                    db.run(
                      `
                      UPDATE otps
                      SET used = 1
                      WHERE id = ?
                      `,
                      [otpRow.id],
                      (markOtpErr) => {
                        if (markOtpErr) {
                          console.error(
                            "Mark OTP used error:",
                            markOtpErr
                          );
                        }

                        const user = {
                          id: userId,
                          username,
                          account: normalizedAccount,
                          account_type: accountType,
                          member_level: "free"
                        };

                        const token = createToken(user);

                        return res.status(201).json({
                          success: true,
                          message: "会员注册成功",
                          token,
                          user: {
                            id: userId,
                            username,
                            account:
                              normalizedAccount,
                            accountType,
                            email: emailValue,
                            phone: phoneValue,
                            emailVerified:
                              Boolean(
                                emailVerified
                              ),
                            phoneVerified:
                              Boolean(
                                phoneVerified
                              ),
                            memberLevel: "free",
                            walletBalance: 0
                          }
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error("Register server error:", error);

    return res.status(500).json({
      success: false,
      message: "服务器错误",
      error: error.message
    });
  }
}

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
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "未登录，请先登录"
    });
  }

  const [scheme, token] = authHeader.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return res.status(401).json({
      success: false,
      message: "Token格式无效"
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET ||
        "dailynews_default_secret"
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
 * 获取当前登录用户信息。
 *
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