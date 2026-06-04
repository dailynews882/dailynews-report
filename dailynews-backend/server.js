require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./db");

const authRoutes = require("./routes/authRoute");
const walletRoutes = require("./routes/walletRoute");

console.log("authRoutes type:", typeof authRoutes);

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Daily News Backend API is running.");
});

app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});