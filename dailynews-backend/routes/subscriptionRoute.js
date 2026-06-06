const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();

/**
 * 验证 Token
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
 * 套餐配置
 */
function getPlan(planType) {
  const plans = {
    vip_monthly: {
      planType: "vip_monthly",
      planName: "VIP 月费会员",
      amount: 9.9,
      days: 30
    },
    vip_yearly: {
      planType: "vip_yearly",
      planName: "VIP 年费会员",
      amount: 99,
      days: 365
    }
  };

  return plans[planType] || null;
}

/**
 * 如果用户没有钱包，自动创建钱包
 */
function ensureWallet(userId, callback) {
  db.get(
    `
    SELECT * FROM wallets
    WHERE user_id = ?
    LIMIT 1
    `,
    [userId],
    (err, wallet) => {
      if (err) {
        return callback(err);
      }

      if (wallet) {
        return callback(null, wallet);
      }

      db.run(
        `
        INSERT INTO wallets
        (user_id, balance, reward_balance, total_recharge, total_spend, withdrawable_balance)
        VALUES (?, 0, 0, 0, 0, 0)
        `,
        [userId],
        function (insertErr) {
          if (insertErr) {
            return callback(insertErr);
          }

          db.get(
            `
            SELECT * FROM wallets
            WHERE user_id = ?
            LIMIT 1
            `,
            [userId],
            callback
          );
        }
      );
    }
  );
}

/**
 * 计算 VIP 到期时间
 */
function calculateVipExpireAt(days) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString();
}

/**
 * 钱包购买 VIP
 * POST /api/subscription/buy-with-wallet
 */
router.post("/buy-with-wallet", verifyToken, (req, res) => {
  const userId = req.user.id;
  const { planType } = req.body;

  const plan = getPlan(planType);

  if (!plan) {
    return res.status(400).json({
      success: false,
      message: "会员套餐无效"
    });
  }

  ensureWallet(userId, (walletErr, wallet) => {
    if (walletErr) {
      return res.status(500).json({
        success: false,
        message: "钱包初始化失败"
      });
    }

    const currentBalance = Number(wallet.balance || 0);

    if (currentBalance < plan.amount) {
      return res.status(400).json({
        success: false,
        message: `钱包余额不足。当前余额 SGD ${currentBalance.toFixed(2)}，需要 SGD ${plan.amount.toFixed(2)}`
      });
    }

    const vipExpireAt = calculateVipExpireAt(plan.days);

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run(
        `
        INSERT INTO subscription_orders
        (user_id, plan_type, plan_name, amount, currency, status, payment_method, paid_at)
        VALUES (?, ?, ?, ?, 'SGD', 'paid', 'wallet', CURRENT_TIMESTAMP)
        `,
        [userId, plan.planType, plan.planName, plan.amount],
        function (orderErr) {
          if (orderErr) {
            db.run("ROLLBACK");
            return res.status(500).json({
              success: false,
              message: "订阅订单创建失败"
            });
          }

          const orderId = this.lastID;

          db.run(
            `
            UPDATE wallets
            SET 
              balance = balance - ?,
              total_spend = total_spend + ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            `,
            [plan.amount, plan.amount, userId],
            function (walletUpdateErr) {
              if (walletUpdateErr) {
                db.run("ROLLBACK");
                return res.status(500).json({
                  success: false,
                  message: "钱包扣款失败"
                });
              }

              db.run(
                `
                INSERT INTO wallet_transactions
                (user_id, type, amount, status, description)
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                  userId,
                  "subscription_payment",
                  plan.amount,
                  "success",
                  `钱包支付购买 ${plan.planName}`
                ],
                function (transactionErr) {
                  if (transactionErr) {
                    db.run("ROLLBACK");
                    return res.status(500).json({
                      success: false,
                      message: "钱包交易记录写入失败"
                    });
                  }

                  db.run(
                    `
                    UPDATE users
                    SET 
                      member_level = 'vip',
                      subscription_status = 'active',
                      vip_expire_at = ?
                    WHERE id = ?
                    `,
                    [vipExpireAt, userId],
                    function (userUpdateErr) {
                      if (userUpdateErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({
                          success: false,
                          message: "会员状态更新失败"
                        });
                      }

                      db.run("COMMIT");

                      return res.json({
                        success: true,
                        message: `${plan.planName}购买成功，已从钱包扣除 SGD ${plan.amount.toFixed(2)}`,
                        order: {
                          id: orderId,
                          planType: plan.planType,
                          planName: plan.planName,
                          amount: plan.amount,
                          status: "paid",
                          vipExpireAt
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
    });
  });
});

/**
 * 我的订阅订单
 * GET /api/subscription/my-orders
 */
router.get("/my-orders", verifyToken, (req, res) => {
  const userId = req.user.id;

  db.all(
    `
    SELECT id, plan_type, plan_name, amount, currency, status, payment_method, created_at, paid_at
    FROM subscription_orders
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 50
    `,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "订阅订单查询失败"
        });
      }

      return res.json({
        success: true,
        message: "获取订阅订单成功",
        orders: rows || []
      });
    }
  );
});

module.exports = router;