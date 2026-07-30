require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

/*

* 加载并初始化数据库。
  */
require("./db");

/*

* 加载API路由。
  */
const authRoutes =
  require("./routes/authRoute");

const walletRoutes =
  require("./routes/walletRoute");

const subscriptionRoutes =
  require("./routes/subscriptionRoute");

const paymentRoutes =
  require("./routes/paymentRoute");

const newsRoutes =
  require("./routes/newsRoute");

const commentRoute = require("./routes/commentRoute");
const adminCommentRoute = require("./routes/adminCommentRoute");
const adminAuthRoute = require("./routes/adminAuthRoute");
const adminSettingsRoute = require("./routes/adminSettingsRoute");
const adminNewsImportRoute = require("./routes/adminNewsImportRoute");

const {
  startGNewsAutoFetchScheduler,
  stopGNewsAutoFetchScheduler,
} = require("./services/gnewsAutoFetchScheduler");

const app = express();

/*

* 网站位于Nginx和DigitalOcean代理后面。
* 启用trust proxy后，可以正确读取访问者IP和HTTPS状态。
  */
app.set("trust proxy", 1);

/*

* 跨域设置。
*
* 当前允许同源网站和开发环境访问API。
  */
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

/*

* =====================================
* Stripe Webhook
* =====================================
*
* 这个路由必须放在express.json()之前。
*
* Stripe签名验证必须使用未经JSON解析的
* 原始请求体Buffer。
  */
app.post(
  "/api/payment/webhook",
  express.raw({
    type: "application/json"
  }),
  (req, res, next) => {
    /*
  
    * 下一步修改paymentRoute.js后，
    * paymentRoutes.webhookHandler会正式存在。
    *
    * 现在先保留安全检查，
    * 避免server.js因为旧支付路由而启动失败。
      */
    if (
      typeof paymentRoutes.webhookHandler !==
      "function"
    ) {
      return res.status(503).json({
        success: false,
        message:
          "Stripe Webhook处理程序尚未完成配置"
      });
    }

    return paymentRoutes.webhookHandler(
      req,
      res,
      next
    );
  }
);

/*

* =====================================
* 普通请求体解析
* =====================================
*
* 必须放在Stripe Webhook路由之后。
  */
app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

/*

* =====================================
* 网站静态文件
* =====================================
*
* 浏览器可以直接访问public文件夹里的文件。
*
* 例如：
* public/index.html
* public/subscribe.html
* public/wallet.html
  */
app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.use(
  "/admin",
  express.static(
    path.join(__dirname, "admin")
  )
);

/*

* =====================================
* 后端状态测试接口
* =====================================
  */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message:
      "Daily News Backend API is running",
    timestamp: new Date().toISOString()
  });
});

/*

* =====================================
* 网站首页
* =====================================
  */
app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/*

* =====================================
* 普通API路由
* =====================================
  */
app.use("/api/auth", authRoutes);

app.use("/api/wallet", walletRoutes);

app.use("/api/news", newsRoutes);

app.use("/api/comments", commentRoute);
app.use("/api/admin/auth", adminAuthRoute);
app.use("/api/admin/comments", adminCommentRoute);
app.use("/api/site-settings", adminSettingsRoute);
app.use("/api/admin/news-import", adminNewsImportRoute);

app.use("/api/subscription", subscriptionRoutes);

app.use("/api/payment", paymentRoutes);

/*

* =====================================
* 404处理
* =====================================
  */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "接口或页面不存在"
  });
});

/*

* =====================================
* 全局错误处理
* =====================================
  */
app.use((err, req, res, next) => {
  console.error(
    "Unhandled server error:",
    err
  );

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    success: false,
    message: "服务器内部错误"
  });
});

/*

* =====================================
* 启动服务器
* =====================================
  */
const PORT =
  Number(process.env.PORT) || 5000;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    );

    console.log(
      "Stripe Webhook endpoint:",
      "/api/payment/webhook"
    );

    startGNewsAutoFetchScheduler()
      .then((result) => {
        console.log(
          "[GNews Scheduler] Startup result:",
          {
            reason: result.reason,
            nextRunAt: result.nextRunAt,
          }
        );
      })
      .catch((error) => {
        console.error(
          "[GNews Scheduler] Startup error:",
          error
        );
      });

  }
);

function shutdownServer(signal) {
  console.log(
    `[Server] Received ${signal}, shutting down`
  );

  stopGNewsAutoFetchScheduler();
  process.exit(0);
}

process.once("SIGINT", () => {
  shutdownServer("SIGINT");
});

process.once("SIGTERM", () => {
  shutdownServer("SIGTERM");
});