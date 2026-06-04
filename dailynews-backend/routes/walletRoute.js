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
 * 获取我的钱包信息
 * GET /api/wallet/me
 */
router.get("/me", verifyToken, (req, res) => {
  const userId = req.user.id;

  db.get(
    `
    SELECT id, username, account, account_type, member_level
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId],
    (userErr, user) => {
      if (userErr) {
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

      ensureWallet(userId, (walletErr, wallet) => {
        if (walletErr) {
          return res.status(500).json({
            success: false,
            message: "钱包信息查询失败"
          });
        }

        return res.json({
          success: true,
          message: "获取钱包成功",
          user: {
            id: user.id,
            username: user.username,
            account: user.account,
            accountType: user.account_type,
            memberLevel: user.member_level
          },
          wallet: {
            balance: wallet.balance || 0,
            rewardBalance: wallet.reward_balance || 0,
            totalRecharge: wallet.total_recharge || 0,
            totalSpend: wallet.total_spend || 0,
            withdrawableBalance: wallet.withdrawable_balance || 0,
            status: wallet.status || "active"
          }
        });
      });
    }
  );
});

/**
 * 获取钱包交易记录
 * GET /api/wallet/transactions
 */
router.get("/transactions", verifyToken, (req, res) => {
  const userId = req.user.id;

  db.all(
    `
    SELECT id, type, amount, status, description, created_at
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 50
    `,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "交易记录查询失败"
        });
      }

      return res.json({
        success: true,
        message: "获取交易记录成功",
        transactions: rows || []
      });
    }
  );
});

/**
 * 模拟充值，真实写入数据库
 * POST /api/wallet/recharge-demo
 */
router.post("/recharge-demo", verifyToken, (req, res) => {
  const userId = req.user.id;
  const amount = Number(req.body.amount || 10);

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "充值金额无效"
    });
  }

  if (amount > 1000) {
    return res.status(400).json({
      success: false,
      message: "单次模拟充值不能超过 SGD 1000"
    });
  }

  ensureWallet(userId, (walletErr) => {
    if (walletErr) {
      return res.status(500).json({
        success: false,
        message: "钱包初始化失败"
      });
    }

    db.run(
      `
      UPDATE wallets
      SET 
        balance = balance + ?,
        total_recharge = total_recharge + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
      `,
      [amount, amount, userId],
      function (updateErr) {
        if (updateErr) {
          return res.status(500).json({
            success: false,
            message: "钱包余额更新失败"
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
            "recharge_demo",
            amount,
            "success",
            "本地模拟充值，已写入数据库"
          ],
          function (insertErr) {
            if (insertErr) {
              return res.status(500).json({
                success: false,
                message: "交易记录写入失败"
              });
            }

            return res.json({
              success: true,
              message: `模拟充值成功：SGD ${amount.toFixed(2)}`,
              transactionId: this.lastID
            });
          }
        );
      }
    );
  });
});

module.exports = router;