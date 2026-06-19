require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

require("./db");

const authRoutes = require("./routes/authRoute");
const walletRoutes = require("./routes/walletRoute");
const subscriptionRoutes = require("./routes/subscriptionRoute");
const paymentRoutes = require("./routes/paymentRoute");
const newsRoutes = require("./routes/newsRoute");

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 当前前端页面位于 dailynews-backend 根目录
app.use(express.static(path.join(__dirname, "public")));

// 后端状态测试
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Daily News Backend API is running"
  });
});

// 首页
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API 路由
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/payment", paymentRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "接口或页面不存在"
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  res.status(500).json({
    success: false,
    message: "服务器内部错误"
  });
});

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});