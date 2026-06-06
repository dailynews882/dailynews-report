const express = require("express");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const db = require("../db");

const router = express.Router();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "");

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
 * 创建钱包充值 Stripe Checkout Session
 * POST /api/payment/create-wallet-topup-session
 */
router.post("/create-wallet-topup-session", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = Number(req.body.amount);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "充值金额无效"
      });
    }

    if (amount < 1) {
      return res.status(400).json({
        success: false,
        message: "最低充值金额为 SGD 1"
      });
    }

    if (amount > 1000) {
      return res.status(400).json({
        success: false,
        message: "单次充值不能超过 SGD 1000"
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: "Stripe 密钥未配置"
      });
    }

    db.run(
      `
      INSERT INTO payment_orders
      (user_id, provider, amount, currency, status, description)
      VALUES (?, 'stripe', ?, 'SGD', 'pending', ?)
      `,
      [userId, amount, `Stripe 钱包充值 SGD ${amount.toFixed(2)}`],
      async function (insertErr) {
        if (insertErr) {
          return res.status(500).json({
            success: false,
            message: "支付订单创建失败"
          });
        }

        const orderId = this.lastID;
        const frontendBaseUrl =
          process.env.FRONTEND_BASE_URL || "http://localhost:5500/dailynews-backend";

        try {
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "sgd",
                  product_data: {
                    name: "Daily News 钱包充值"
                  },
                  unit_amount: Math.round(amount * 100)
                },
                quantity: 1
              }
            ],
            success_url: `${frontendBaseUrl}/wallet.html?payment=success&orderId=${orderId}`,
            cancel_url: `${frontendBaseUrl}/wallet.html?payment=cancel&orderId=${orderId}`,
            metadata: {
              orderId: String(orderId),
              userId: String(userId),
              type: "wallet_topup"
            }
          });

          db.run(
            `
            UPDATE payment_orders
            SET provider_session_id = ?
            WHERE id = ?
            `,
            [session.id, orderId]
          );

          return res.json({
            success: true,
            message: "Stripe 支付页面创建成功",
            checkoutUrl: session.url,
            orderId
          });
        } catch (stripeErr) {
          console.error("Stripe Checkout Error:", stripeErr);
          
          return res.status(500).json({
            success: false,
            message: "Stripe 支付页面创建失败",
            error: stripeErr.message
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

module.exports = router;