require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const centralBankRateRoute = require("./routes/centralBankRateRoute");

require("./db");

const authRoutes = require("./routes/authRoute");
const walletRoutes = require("./routes/walletRoute");
const subscriptionRoutes = require("./routes/subscriptionRoute");
const paymentRoutes = require("./routes/paymentRoute");
const newsRoutes = require("./routes/newsRoute");
const commentRoute = require("./routes/commentRoute");
const adminCommentRoute = require("./routes/adminCommentRoute");
const adminAuthRoute = require("./routes/adminAuthRoute");
const adminSettingsRoute = require("./routes/adminSettingsRoute");
const newsMetadataRoute = require("./routes/newsMetadataRoute");
const adminNewsImportRoute = require("./routes/adminNewsImportRoute");
const adminNewsUploadRoute = require("./routes/adminNewsUploadRoute");
const siteAdsRoute = require("./routes/siteAdsRoute");
const holidayRoute = require("./routes/holidayRoute");
const fxRateRoute = require("./routes/fxRateRoute");
const economicCalendarRoute = require("./routes/economicCalendarRoute");
const storeRoute = require("./routes/storeRoute");

const {
  startGNewsAutoFetchScheduler,
  stopGNewsAutoFetchScheduler,
} = require("./services/gnewsAutoFetchScheduler");

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.post(
  "/api/payment/webhook",
  express.raw({
    type: "application/json"
  }),
  (req, res, next) => {
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

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message:
      "Daily News Backend API is running",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/news-metadata", newsMetadataRoute);
app.use("/api/comments", commentRoute);
app.use("/api/admin/auth", adminAuthRoute);
app.use("/api/admin/comments", adminCommentRoute);
app.use("/api/site-settings", adminSettingsRoute);
app.use("/api/admin/news-import", adminNewsImportRoute);
app.use("/api/admin/news-upload", adminNewsUploadRoute);
app.use("/api/site-ads", siteAdsRoute);
app.use("/api/holidays", holidayRoute);
app.use("/api/fx-rates", fxRateRoute);
app.use("/api/central-bank-rates", centralBankRateRoute);
app.use("/api/economic-calendar", economicCalendarRoute);
app.use("/api/store", storeRoute);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/payment", paymentRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "接口或页面不存在"
  });
});

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