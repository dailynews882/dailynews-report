require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./db");

const authRoutes = require("./routes/authRoute");
const walletRoutes = require("./routes/walletRoute");
const subscriptionRoutes = require("./routes/subscriptionRoute");
const paymentRoutes = require("./routes/paymentRoute");

console.log("authRoutes type:", typeof authRoutes);
console.log("walletRoutes type:", typeof walletRoutes);
console.log("subscriptionRoutes type:", typeof subscriptionRoutes);
console.log("paymentRoutes type:", typeof paymentRoutes);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Daily News Backend API is running.");
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/payment", paymentRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});