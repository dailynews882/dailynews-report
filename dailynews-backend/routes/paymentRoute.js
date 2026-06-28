const express = require("express");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const db = require("../db");

const router = express.Router();

/*

* Stripe密钥未配置时，不让服务器启动失败。
* 实际调用支付接口时再返回明确错误。
  */
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/*

* =====================================
* SQLite Promise工具函数
* =====================================
  */

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row || null);
    });

  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows || []);
    });

  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });

  });
}

/*

* =====================================
* 登录验证
* =====================================
  */

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "未登录，请先登录"
    });
  }

  const [scheme, token] =
    String(authHeader).split(" ");

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

/*

* =====================================
* 基础配置检查
* =====================================
  */

function getFrontendBaseUrl() {
  return String(
    process.env.FRONTEND_BASE_URL ||
    "http://localhost:5000"
  ).replace(/\/+$/, "");
}

function checkStripeConfiguration() {
  if (!stripe) {
    return "STRIPE_SECRET_KEY尚未配置";
  }

  if (
    !process.env.STRIPE_VIP_MONTHLY_PRICE_ID
  ) {
    return "STRIPE_VIP_MONTHLY_PRICE_ID尚未配置";
  }

  return null;
}

/*

* =====================================
* Stripe对象字段兼容工具
*
* Stripe不同API版本中，部分字段位置可能不同。
* 这些函数同时兼容常见的新旧结构。
* =====================================
  */

function getStripeObjectId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value.id
  ) {
    return value.id;
  }

  return null;
}

function unixToIso(timestamp) {
  const seconds = Number(timestamp);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }

  return new Date(
    seconds * 1000
  ).toISOString();
}

function getSubscriptionPeriod(subscription) {
  if (!subscription) {
    return {
      start: null,
      end: null
    };
  }

  let periodStart =
    subscription.current_period_start;

  let periodEnd =
    subscription.current_period_end;

  /*
  
  * 新版Stripe API可能把周期信息放在订阅项目中。
    */
  const firstItem =
    subscription.items?.data?.[0];

  if (!periodStart && firstItem) {
    periodStart =
      firstItem.current_period_start;
  }

  if (!periodEnd && firstItem) {
    periodEnd =
      firstItem.current_period_end;
  }

  return {
    start: unixToIso(periodStart),
    end: unixToIso(periodEnd)
  };
}

function getInvoiceSubscriptionId(invoice) {
  return (
    getStripeObjectId(invoice?.subscription) ||
    getStripeObjectId(
      invoice?.parent
        ?.subscription_details
        ?.subscription
    ) ||
    null
  );
}

function getInvoicePaymentIntentId(invoice) {
  return (
    getStripeObjectId(
      invoice?.payment_intent
    ) ||
    getStripeObjectId(
      invoice?.payments?.data?.[0]
        ?.payment?.payment_intent
    ) ||
    null
  );
}

function getInvoiceFailureMessage(invoice) {
  if (
    invoice &&
    invoice.last_finalization_error &&
    invoice.last_finalization_error.message
  ) {
    return invoice.last_finalization_error.message;
  }

  if (
    invoice &&
    invoice.last_payment_error &&
    invoice.last_payment_error.message
  ) {
    return invoice.last_payment_error.message;
  }

  return "订阅账单付款失败";
}

/*

* =====================================
* 查询网站用户
* =====================================
  */

async function getUserById(userId) {
  return dbGet(
    `     SELECT
      id,
      username,
      account,
      email,
      phone,
      member_level,
      subscription_status,
      vip_expire_at
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );
}

async function findUserIdBySubscription(
  subscription
) {
  const metadataUserId = Number(
    subscription?.metadata?.userId
  );

  if (
    Number.isInteger(metadataUserId) &&
    metadataUserId > 0
  ) {
    return metadataUserId;
  }

  const subscriptionId =
    getStripeObjectId(subscription);

  if (subscriptionId) {
    const localSubscription = await dbGet(
      `       SELECT user_id
      FROM user_subscriptions
      WHERE stripe_subscription_id = ?
      LIMIT 1
      `,
      [subscriptionId]
    );

    if (localSubscription) {
      return Number(
        localSubscription.user_id
      );
    }

  }

  const customerId = getStripeObjectId(
    subscription?.customer
  );

  if (customerId) {
    const localCustomer = await dbGet(
      `       SELECT user_id
      FROM user_subscriptions
      WHERE stripe_customer_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [customerId]
    );

    if (localCustomer) {
      return Number(
        localCustomer.user_id
      );
    }

  }

  return null;
}

/*

* =====================================
* 保存当前订阅状态
* =====================================
  */

async function upsertUserSubscription(
  userId,
  subscription,
  extra = {}
) {
  const subscriptionId =
    getStripeObjectId(subscription);

  const customerId =
    getStripeObjectId(
      subscription?.customer
    ) ||
    extra.customerId ||
    null;

  const priceId =
    getStripeObjectId(
      subscription?.items
        ?.data?.[0]?.price
    ) ||
    extra.priceId ||
    process.env
      .STRIPE_VIP_MONTHLY_PRICE_ID ||
    null;

  const period =
    getSubscriptionPeriod(subscription);

  const cancelAtPeriodEnd =
    subscription?.cancel_at_period_end
      ? 1
      : 0;

  const canceledAt = unixToIso(
    subscription?.canceled_at
  );

  const status =
    subscription?.status ||
    extra.status ||
    "incomplete";

  await dbRun(
    `     INSERT INTO user_subscriptions (
      user_id,
      provider,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      last_invoice_id,
      last_payment_status,
      updated_at
    )
    VALUES (
      ?,
      'stripe',
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(user_id)
    DO UPDATE SET
      provider = 'stripe',
      stripe_customer_id =
        excluded.stripe_customer_id,
      stripe_subscription_id =
        excluded.stripe_subscription_id,
      stripe_price_id =
        excluded.stripe_price_id,
      status =
        excluded.status,
      current_period_start =
        excluded.current_period_start,
      current_period_end =
        excluded.current_period_end,
      cancel_at_period_end =
        excluded.cancel_at_period_end,
      canceled_at =
        excluded.canceled_at,
      last_invoice_id =
        COALESCE(
          excluded.last_invoice_id,
          user_subscriptions.last_invoice_id
        ),
      last_payment_status =
        COALESCE(
          excluded.last_payment_status,
          user_subscriptions
            .last_payment_status
        ),
      updated_at =
        CURRENT_TIMESTAMP
    `,
    [
      userId,
      customerId,
      subscriptionId,
      priceId,
      status,
      period.start,
      period.end,
      cancelAtPeriodEnd,
      canceledAt,
      extra.invoiceId || null,
      extra.paymentStatus || null
    ]
  );

  return {
    subscriptionId,
    customerId,
    priceId,
    status,
    periodStart: period.start,
    periodEnd: period.end,
    cancelAtPeriodEnd: Boolean(
      cancelAtPeriodEnd
    )
  };
}

/*

* =====================================
* 根据Stripe订阅状态同步会员权限
* =====================================
  */

async function syncUserMembership(
  userId,
  subscription
) {
  const status =
    subscription?.status || "incomplete";

  const period =
    getSubscriptionPeriod(subscription);

  const activeStatuses = [
    "active",
    "trialing"
  ];

  if (activeStatuses.includes(status)) {
    await dbRun(
      `       UPDATE users
      SET
        member_level = 'vip',
        subscription_status = ?,
        vip_expire_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        status,
        period.end,
        userId
      ]
    );

    return;

  }

  if (
    status === "past_due" ||
    status === "incomplete"
  ) {
    /*
    * 扣款失败或仍需验证时，不立即清除已经付款周期内的VIP。
    */
    await dbRun(
      `       UPDATE users
      SET
        subscription_status = ?,
        vip_expire_at = COALESCE(
          ?,
          vip_expire_at
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        status,
        period.end,
        userId
      ]
    );

    return;

  }

  if (
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired" ||
    status === "paused"
  ) {
    await dbRun(
      `       UPDATE users
      SET
        member_level = 'free',
        subscription_status = ?,
        vip_expire_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        status,
        period.end,
        userId
      ]
    );
  }
}

/*

* =====================================
* 获取完整Stripe订阅
* =====================================
  */

async function retrieveSubscription(
  subscriptionId
) {
  if (!subscriptionId) {
    return null;
  }

  return stripe.subscriptions.retrieve(
    subscriptionId,
    {
      expand: [
        "items.data.price"
      ]
    }
  );
}

/*

* =====================================
* 创建Stripe月度订阅Checkout
*
* POST /api/payment/create-subscription-session
* =====================================
  */

router.post(
  "/create-subscription-session",
  verifyToken,
  async (req, res) => {
    try {
      const configError =
        checkStripeConfiguration();

      if (configError) {
        return res.status(500).json({
          success: false,
          message: configError
        });
      }

      const userId = Number(req.user.id);

      const user =
        await getUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "用户不存在"
        });
      }

      /*
       * 防止同一用户重复创建多份有效订阅。
       */
      const existingSubscription =
        await dbGet(
          `
                  SELECT *
                    FROM user_subscriptions
      WHERE user_id = ?
                    LIMIT 1
                      `,
          [userId]
        );

      const blockingStatuses = [
        "active",
        "trialing",
        "past_due",
        "incomplete"
      ];

      if (
        existingSubscription &&
        blockingStatuses.includes(
          existingSubscription.status
        )
      ) {
        return res.status(409).json({
          success: false,
          message:
            "你已经有订阅或待处理订阅，请使用“管理订阅”查看状态",
          subscriptionStatus:
            existingSubscription.status
        });
      }

      let stripeCustomerId =
        existingSubscription
          ?.stripe_customer_id ||
        null;

      /*
       * 没有Stripe Customer时，
       * 为当前网站用户创建一个。
       */
      if (!stripeCustomerId) {
        const customer =
          await stripe.customers.create({
            email:
              user.email ||
              (
                String(user.account || "")
                  .includes("@")
                  ? user.account
                  : undefined
              ),
            name:
              user.username ||
              undefined,
            metadata: {
              userId: String(userId),
              username:
                user.username || ""
            }
          });

        stripeCustomerId = customer.id;
      }

      /*
       * 先创建本地待支付订单。
       */
      const orderResult = await dbRun(
        `
    INSERT INTO subscription_orders(
                        user_id,
                        plan_type,
                        plan_name,
                        amount,
                        currency,
                        status,
                        payment_method,
                        provider,
                        stripe_price_id,
                        updated_at
                      )
                  VALUES(
      ?,
                    'vip_monthly',
                    'VIP月费会员',
                    9.90,
                    'SGD',
                    'pending',
                    'stripe',
                    'stripe',
      ?,
                    CURRENT_TIMESTAMP
                  )
    `,
        [
          userId,
          process.env
            .STRIPE_VIP_MONTHLY_PRICE_ID
        ]
      );

      const orderId =
        orderResult.lastID;

      const frontendBaseUrl =
        getFrontendBaseUrl();

      try {
        const session =
          await stripe.checkout.sessions.create({
            mode: "subscription",

            customer:
              stripeCustomerId,

            line_items: [
              {
                price:
                  process.env
                    .STRIPE_VIP_MONTHLY_PRICE_ID,
                quantity: 1
              }
            ],

            client_reference_id:
              String(orderId),

            metadata: {
              orderId: String(orderId),
              userId: String(userId),
              planType: "vip_monthly"
            },

            subscription_data: {
              metadata: {
                orderId:
                  String(orderId),
                userId:
                  String(userId),
                planType:
                  "vip_monthly"
              }
            },

            success_url:
              `${frontendBaseUrl}` +
              `/subscribe.html` +
              `?payment=success` +
              `&session_id={CHECKOUT_SESSION_ID}`,

            cancel_url:
              `${frontendBaseUrl}` +
              `/subscribe.html` +
              `?payment=cancel` +
              `&orderId=${orderId}`,

            billing_address_collection:
              "auto",

            allow_promotion_codes:
              false
          });

        await dbRun(
          `
      UPDATE subscription_orders
                  SET
                  provider_session_id = ?,
                    updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
                    `,
          [
            session.id,
            orderId
          ]
        );

        await dbRun(
          `
      INSERT INTO user_subscriptions(
                      user_id,
                      provider,
                      stripe_customer_id,
                      stripe_price_id,
                      status,
                      updated_at
                    )
                  VALUES(
        ?,
                    'stripe',
        ?,
        ?,
                    'incomplete',
                    CURRENT_TIMESTAMP
                  )
      ON CONFLICT(user_id)
      DO UPDATE SET
                  provider = 'stripe',
                    stripe_customer_id =
                    excluded.stripe_customer_id,
                    stripe_price_id =
                    excluded.stripe_price_id,
                    status = 'incomplete',
                    updated_at =
                    CURRENT_TIMESTAMP
                      `,
          [
            userId,
            stripeCustomerId,
            process.env
              .STRIPE_VIP_MONTHLY_PRICE_ID
          ]
        );

        return res.json({
          success: true,
          message:
            "Stripe订阅支付页面创建成功",
          checkoutUrl: session.url,
          orderId
        });
      } catch (stripeError) {
        console.error(
          "Stripe subscription Checkout error:",
          stripeError
        );

        await dbRun(
          `
      UPDATE subscription_orders
                  SET
                  status = 'failed',
                    failure_reason = ?,
                    updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
                    `,
          [
            stripeError.message ||
            "Stripe Checkout创建失败",
            orderId
          ]
        );

        return res.status(500).json({
          success: false,
          message:
            "Stripe订阅支付页面创建失败",
          error: stripeError.message
        });
      }
    } catch (error) {
      console.error(
        "Create subscription session error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "创建订阅失败",
        error: error.message
      });
    }

  }
);

/*
 
* =====================================
* 创建Stripe客户门户
*
* 用户可以：
* * 更新银行卡
* * 查看账单
* * 取消自动续费
*
* POST /api/payment/create-customer-portal-session
* =====================================
  */

router.post(
  "/create-customer-portal-session",
  verifyToken,
  async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({
          success: false,
          message:
            "STRIPE_SECRET_KEY尚未配置"
        });
      }

      const userId = Number(req.user.id);

      const subscription =
        await dbGet(
          `
      SELECT stripe_customer_id
      FROM user_subscriptions
      WHERE user_id = ?
                  LIMIT 1
      `,
          [userId]
        );

      if (
        !subscription?.stripe_customer_id
      ) {
        return res.status(404).json({
          success: false,
          message:
            "尚未找到Stripe订阅客户资料"
        });
      }

      const portalSession =
        await stripe.billingPortal.sessions.create({
          customer:
            subscription.stripe_customer_id,

          return_url:
            `${getFrontendBaseUrl()}` +
            `/subscribe.html`
        });

      return res.json({
        success: true,
        message:
          "订阅管理页面创建成功",
        portalUrl: portalSession.url
      });
    } catch (error) {
      console.error(
        "Create customer portal error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "订阅管理页面创建失败",
        error: error.message
      });
    }

  }
);

/*
 
* =====================================
* 查询当前订阅状态
*
* GET /api/payment/subscription-status
* =====================================
  */

router.get(
  "/subscription-status",
  verifyToken,
  async (req, res) => {
    try {
      const userId = Number(req.user.id);

      const user = await getUserById(userId);

      const subscription =
        await dbGet(
          `
                SELECT
                provider,
                  stripe_customer_id,
                  stripe_subscription_id,
                  stripe_price_id,
                  status,
                  current_period_start,
                  current_period_end,
                  cancel_at_period_end,
                  canceled_at,
                  last_invoice_id,
                  last_payment_status,
                  created_at,
                  updated_at
      FROM user_subscriptions
      WHERE user_id = ?
                  LIMIT 1
                    `,
          [userId]
        );

      return res.json({
        success: true,
        user: {
          memberLevel:
            user?.member_level || "free",
          subscriptionStatus:
            user?.subscription_status ||
            "free",
          vipExpireAt:
            user?.vip_expire_at || null
        },
        subscription: subscription
          ? {
            provider:
              subscription.provider,
            customerId:
              subscription
                .stripe_customer_id,
            subscriptionId:
              subscription
                .stripe_subscription_id,
            priceId:
              subscription
                .stripe_price_id,
            status:
              subscription.status,
            currentPeriodStart:
              subscription
                .current_period_start,
            currentPeriodEnd:
              subscription
                .current_period_end,
            cancelAtPeriodEnd:
              Boolean(
                subscription
                  .cancel_at_period_end
              ),
            canceledAt:
              subscription.canceled_at,
            lastInvoiceId:
              subscription
                .last_invoice_id,
            lastPaymentStatus:
              subscription
                .last_payment_status
          }
          : null
      });
    } catch (error) {
      console.error(
        "Get subscription status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "订阅状态查询失败",
        error: error.message
      });
    }

  }
);

/*
 
* =====================================
* Stripe Webhook事件去重
* =====================================
  */

async function claimWebhookEvent(event) {
  try {
    await dbRun(
      `       INSERT INTO stripe_webhook_events (
        event_id,
        event_type,
        status
      )
      VALUES (?, ?, 'processing')
      `,
      [
        event.id,
        event.type
      ]
    );

    return {
      shouldProcess: true
    };

  } catch (error) {
    if (
      !String(error.message).includes(
        "UNIQUE constraint failed"
      )
    ) {
      throw error;
    }

    const existing = await dbGet(
      `
  SELECT status
  FROM stripe_webhook_events
  WHERE event_id = ?
                LIMIT 1
                  `,
      [event.id]
    );

    if (
      existing?.status === "failed"
    ) {
      await dbRun(
        `
    UPDATE stripe_webhook_events
              SET
              status = 'processing',
                error_message = NULL,
                processed_at = NULL
    WHERE event_id = ?
                `,
        [event.id]
      );

      return {
        shouldProcess: true
      };
    }

    return {
      shouldProcess: false
    };

  }
}

async function markWebhookProcessed(eventId) {
  await dbRun(
    `     UPDATE stripe_webhook_events
    SET
      status = 'processed',
      processed_at = CURRENT_TIMESTAMP,
      error_message = NULL
    WHERE event_id = ?
    `,
    [eventId]
  );
}

async function markWebhookFailed(
  eventId,
  error
) {
  await dbRun(
    `     UPDATE stripe_webhook_events
    SET
      status = 'failed',
      error_message = ?,
      processed_at = CURRENT_TIMESTAMP
    WHERE event_id = ?
    `,
    [
      error?.message ||
      String(error),
      eventId
    ]
  );
}

/*
 
* =====================================
* checkout.session.completed
* =====================================
  */

async function handleCheckoutCompleted(
  session
) {
  if (
    session.mode !== "subscription"
  ) {
    return;
  }

  const userId = Number(
    session.metadata?.userId
  );

  const orderId = Number(
    session.metadata?.orderId ||
    session.client_reference_id
  );

  const subscriptionId =
    getStripeObjectId(
      session.subscription
    );

  const customerId =
    getStripeObjectId(
      session.customer
    );

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    throw new Error(
      "Checkout Session缺少有效userId"
    );
  }

  if (!subscriptionId) {
    throw new Error(
      "Checkout Session缺少Subscription ID"
    );
  }

  const subscription =
    await retrieveSubscription(
      subscriptionId
    );

  const saved =
    await upsertUserSubscription(
      userId,
      subscription,
      {
        customerId,
        priceId:
          process.env
            .STRIPE_VIP_MONTHLY_PRICE_ID,
        paymentStatus:
          session.payment_status
      }
    );

  await syncUserMembership(
    userId,
    subscription
  );

  if (
    Number.isInteger(orderId) &&
    orderId > 0
  ) {
    await dbRun(
      `       UPDATE subscription_orders
      SET
        provider = 'stripe',
        provider_session_id = ?,
        provider_subscription_id = ?,
        stripe_price_id = ?,
        status = CASE
          WHEN ? = 'paid'
            THEN 'paid'
          ELSE status
        END,
        paid_at = CASE
          WHEN ? = 'paid'
            THEN COALESCE(
              paid_at,
              CURRENT_TIMESTAMP
            )
          ELSE paid_at
        END,
        period_start = ?,
        period_end = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND user_id = ?
      `,
      [
        session.id,
        subscriptionId,
        saved.priceId,
        session.payment_status,
        session.payment_status,
        saved.periodStart,
        saved.periodEnd,
        orderId,
        userId
      ]
    );
  }
}

/*
 
* =====================================
* invoice.paid
* =====================================
  */

async function handleInvoicePaid(invoice) {
  const subscriptionId =
    getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  const subscription =
    await retrieveSubscription(
      subscriptionId
    );

  const userId =
    await findUserIdBySubscription(
      subscription
    );

  if (!userId) {
    throw new Error(
      `找不到订阅 ${subscriptionId} 对应的网站用户`
    );
  }

  const invoiceId =
    getStripeObjectId(invoice);

  const paymentIntentId =
    getInvoicePaymentIntentId(invoice);

  const amountPaid =
    Number(invoice.amount_paid || 0) /
    100;

  const currency = String(
    invoice.currency || "sgd"
  ).toUpperCase();

  const saved =
    await upsertUserSubscription(
      userId,
      subscription,
      {
        invoiceId,
        paymentStatus: "paid"
      }
    );

  await syncUserMembership(
    userId,
    subscription
  );

  /*
  
  * 防止同一张Invoice重复生成订单。
    */
  const existingInvoiceOrder =
    await dbGet(
      `  SELECT id
   FROM subscription_orders
   WHERE provider_invoice_id = ?
   LIMIT 1
   `,
      [invoiceId]
    );

  if (existingInvoiceOrder) {
    await dbRun(
      `       UPDATE subscription_orders
      SET
        status = 'paid',
        provider_subscription_id = ?,
        provider_payment_id = ?,
        amount = ?,
        currency = ?,
        period_start = ?,
        period_end = ?,
        paid_at = COALESCE(
          paid_at,
          CURRENT_TIMESTAMP
        ),
        failure_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        subscriptionId,
        paymentIntentId,
        amountPaid,
        currency,
        saved.periodStart,
        saved.periodEnd,
        existingInvoiceOrder.id
      ]
    );

    return;

  }

  /*
  
  * 首次Invoice优先更新创建Checkout时的pending订单。
    */
  const pendingOrder =
    await dbGet(
      `  SELECT id
   FROM subscription_orders
   WHERE user_id = ?
     AND (
       provider_subscription_id = ?
       OR (
         provider_subscription_id IS NULL
         AND status = 'pending'
         AND plan_type = 'vip_monthly'
       )
     )
   ORDER BY id DESC
   LIMIT 1
   `,
      [
        userId,
        subscriptionId
      ]
    );

  if (pendingOrder) {
    await dbRun(
      `       UPDATE subscription_orders
      SET
        status = 'paid',
        payment_method = 'stripe',
        provider = 'stripe',
        provider_subscription_id = ?,
        provider_invoice_id = ?,
        provider_payment_id = ?,
        stripe_price_id = ?,
        amount = ?,
        currency = ?,
        period_start = ?,
        period_end = ?,
        paid_at = CURRENT_TIMESTAMP,
        failure_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        subscriptionId,
        invoiceId,
        paymentIntentId,
        saved.priceId,
        amountPaid,
        currency,
        saved.periodStart,
        saved.periodEnd,
        pendingOrder.id
      ]
    );

    return;

  }

  /*
  
  * 后续每月续费成功时，新增一条历史订单。
    */
  await dbRun(
    `     INSERT INTO subscription_orders (
   user_id,
   plan_type,
   plan_name,
   amount,
   currency,
   status,
   payment_method,
   provider,
   provider_subscription_id,
   provider_invoice_id,
   provider_payment_id,
   stripe_price_id,
   period_start,
   period_end,
   paid_at,
   updated_at
      )
      VALUES (
   ?,
   'vip_monthly',
   'VIP月费会员自动续费',
   ?,
   ?,
   'paid',
   'stripe',
   'stripe',
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   CURRENT_TIMESTAMP,
   CURRENT_TIMESTAMP
      )
      `,
    [
      userId,
      amountPaid,
      currency,
      subscriptionId,
      invoiceId,
      paymentIntentId,
      saved.priceId,
      saved.periodStart,
      saved.periodEnd
    ]
  );
}

/*
 
* =====================================
* invoice.payment_failed
* =====================================
  */

async function handleInvoicePaymentFailed(
  invoice
) {
  const subscriptionId =
    getInvoiceSubscriptionId(invoice);

  if (!subscriptionId) {
    return;
  }

  const subscription =
    await retrieveSubscription(
      subscriptionId
    );

  const userId =
    await findUserIdBySubscription(
      subscription
    );

  if (!userId) {
    throw new Error(
      `找不到失败订阅 ${subscriptionId} 对应的用户`
    );
  }

  const invoiceId =
    getStripeObjectId(invoice);

  const failureReason =
    getInvoiceFailureMessage(invoice);

  await upsertUserSubscription(
    userId,
    subscription,
    {
      invoiceId,
      paymentStatus: "failed"
    }
  );

  await syncUserMembership(
    userId,
    subscription
  );

  await dbRun(
    `     UPDATE users
    SET
      subscription_status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [
      subscription.status ||
      "past_due",
      userId
    ]
  );

  const existingOrder = await dbGet(
    `     SELECT id
    FROM subscription_orders
    WHERE provider_invoice_id = ?
    LIMIT 1
    `,
    [invoiceId]
  );

  if (existingOrder) {
    await dbRun(
      `       UPDATE subscription_orders
      SET
        status = 'failed',
        failure_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        failureReason,
        existingOrder.id
      ]
    );
    return;

  }

  await dbRun(
    `     INSERT INTO subscription_orders (
      user_id,
      plan_type,
      plan_name,
      amount,
      currency,
      status,
      payment_method,
      provider,
      provider_subscription_id,
      provider_invoice_id,
      stripe_price_id,
      failure_reason,
      updated_at
    )
    VALUES (
      ?,
      'vip_monthly',
      'VIP月费会员续费失败',
      ?,
      ?,
      'failed',
      'stripe',
      'stripe',
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP
    )
    `,
    [
      userId,
      Number(
        invoice.amount_due || 0
      ) / 100,
      String(
        invoice.currency || "sgd"
      ).toUpperCase(),
      subscriptionId,
      invoiceId,
      process.env
        .STRIPE_VIP_MONTHLY_PRICE_ID,
      failureReason
    ]
  );
}

/*
 
* =====================================
* customer.subscription.updated
* customer.subscription.deleted
* =====================================
  */

async function handleSubscriptionChanged(
  subscription
) {
  const userId =
    await findUserIdBySubscription(
      subscription
    );

  if (!userId) {
    throw new Error(
      `找不到Stripe订阅 ${subscription.id} 对应的网站用户`
    );
  }

  await upsertUserSubscription(
    userId,
    subscription
  );

  await syncUserMembership(
    userId,
    subscription
  );
}

/*
 
* =====================================
* checkout.session.expired
* =====================================
  */

async function handleCheckoutExpired(
  session
) {
  const orderId = Number(
    session.metadata?.orderId ||
    session.client_reference_id
  );

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0
  ) {
    return;
  }

  await dbRun(
    `     UPDATE subscription_orders
    SET
      status = 'expired',
      failure_reason =
        'Stripe Checkout Session已过期',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND status = 'pending'
    `,
    [orderId]
  );
}

/*
 
* =====================================
* Stripe Webhook主处理函数
* =====================================
  */

async function webhookHandler(
  req,
  res
) {
  if (!stripe) {
    return res.status(500).send(
      "STRIPE_SECRET_KEY未配置"
    );
  }

  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send(
      "STRIPE_WEBHOOK_SECRET未配置"
    );
  }

  const signature =
    req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).send(
      "缺少Stripe签名"
    );
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error(
      "Stripe Webhook签名验证失败:",
      error.message
    );

    return res.status(400).send(
      `Webhook签名验证失败：${error.message}`
    );

  }

  try {
    const claim =
      await claimWebhookEvent(event);

    if (!claim.shouldProcess) {
      return res.json({
        received: true,
        duplicate: true
      });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object
        );
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(
          event.data.object
        );
        break;

      case "invoice.paid":
        await handleInvoicePaid(
          event.data.object
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object
        );
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChanged(
          event.data.object
        );
        break;

      default:
        console.log(
          "未处理的Stripe事件:",
          event.type
        );
    }

    await markWebhookProcessed(
      event.id
    );

    return res.json({
      received: true
    });

  } catch (error) {
    console.error(
      "Stripe Webhook处理失败:",
      event.type,
      error
    );

    try {
      await markWebhookFailed(
        event.id,
        error
      );
    } catch (databaseError) {
      console.error(
        "Webhook失败状态保存失败:",
        databaseError
      );
    }

    return res.status(500).json({
      received: false,
      message:
        "Webhook事件处理失败"
    });

  }
}

/*
 
* 将Webhook处理函数挂载到router对象，
* 供server.js中的原始请求体路由调用。
  */
router.webhookHandler =
  webhookHandler;

module.exports = router;
