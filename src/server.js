import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ImageKit from "imagekit";
import { pool, initDatabase } from "./config/db.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();

// Initialize ImageKit
let imagekit;
try {
  if (process.env.IMAGEKIT_PUBLIC_KEY) {
    imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
    });
  }
} catch (err) {
  console.error("❌ ImageKit init failed:", err.message);
}

// Middleware
app.use(cors());
app.use(express.json());

// Initialize DB
initDatabase();
pool.query("SELECT 1").then(() => console.log("✅ Database connected"));

// =========================
// PUBLIC ROUTES
// =========================
app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.get("/api/imagekit/auth", (req, res) => {
  try {
    if (!imagekit) return res.status(500).json({ error: "ImageKit missing" });
    const authenticationParameters = imagekit.getAuthenticationParameters();
    res.json(authenticationParameters);
  } catch (err) {
    console.error("ImageKit Auth Error:", err);
    res.status(500).json({ error: "Could not generate auth parameters" });
  }
});

// =========================
// MOUNTED ROUTES
// =========================
app.use("/api/employee", employeeRoutes);
app.use("/api/admin", adminRoutes);

// *Note: Because we moved the routes, you need to update your Frontend API calls 
// from `/api/complaints` to `/api/employee/complaints` (or similar) where necessary!*

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});