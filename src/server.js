import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import twilio from "twilio";
import { Expo } from "expo-server-sdk";

dotenv.config();

const app = express();
const expo = new Expo();

// async function initDatabase() {
//   try {
//     // Create admin_devices table
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS admin_devices (
//         id SERIAL PRIMARY KEY,
//         email VARCHAR(255) NOT NULL,
//         expo_push_token VARCHAR(255) UNIQUE NOT NULL,
//         device_info JSONB,
//         created_at TIMESTAMP DEFAULT NOW(),
//         updated_at TIMESTAMP DEFAULT NOW()
//       );

//       CREATE INDEX IF NOT EXISTS idx_admin_devices_email ON admin_devices(email);
//       CREATE INDEX IF NOT EXISTS idx_admin_devices_token ON admin_devices(expo_push_token);
//     `);

//     console.log('✅ Admin devices table ready');
//   } catch (error) {
//     console.error('❌ Database init error:', error);
//   }
// }

async function initDatabase() {
  try {
    // 1. Create admin_devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_devices (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        device_info JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. FIX: Create user_devices table for Employees
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id SERIAL PRIMARY KEY,
        clerk_user_id VARCHAR(255) NOT NULL,
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_clerk_id ON user_devices(clerk_user_id);
      CREATE INDEX IF NOT EXISTS idx_user_devices_token ON user_devices(expo_push_token);
    `);

    console.log('✅ All database tables ready');
  } catch (error) {
    console.error('❌ Database init error:', error);
  }
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

initDatabase();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

// Clerk is ONLY for Employee App
app.use(clerkMiddleware());

/* =========================
   DATABASE
========================= */

pool
  .query("SELECT 1")
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ DB connection error:", err.message));

const ADMIN_USERS = [
  {
    email: "jayp93393@gmail.com",
    password: "JayPanchal15092005",
  },
  {
    email: "itsupport@gujaratinfotech.com",
    password: "itsupport@gujaratinfotech.com",
  },
  {
    email: "gujaratinfotech.com",
    password: "gujaratinfotech.com",
  },
];

const adminAuth = (req, res, next) => {
  const email = req.headers["x-admin-email"];
  const password = req.headers["x-admin-password"];

  if (!email || !password) {
    return res.status(401).json({ error: "Missing admin credentials" });
  }

  const isValidAdmin = ADMIN_USERS.some(
    (admin) => admin.email === email.trim() && admin.password === password
  );

  if (!isValidAdmin) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }

  next();
};

/* =========================
   TWILIO SETUP
========================= */
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* =========================
   SIMPLE ADMIN AUTH (NO CLERK)
========================= */
const requireAdmin = (req, res, next) => {
  const adminEmail = req.headers["x-admin-email"];
  const adminPassword = req.headers["x-admin-password"];

  if (
    adminEmail === process.env.ADMIN_EMAIL &&
    adminPassword === process.env.ADMIN_PASSWORD
  ) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized admin" });
};

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/* =========================
   EMPLOYEE: SUBMIT COMPLAINT
========================= */

app.post("/api/complaints", requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const {
      submitter_name, submitter_email, department,
      assets, complain_detail, complain_location,
      to_whom, priority,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO complaints (
        clerk_user_id, submitter_name, submitter_email, department,
        assets, complain_detail, complain_location, to_whom,
        priority, status, created_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'Pending',NOW())
      RETURNING *`,
      [
        clerkUserId,
        submitter_name?.trim() || "Anonymous",
        submitter_email || null,
        department,
        JSON.stringify(assets || []),
        complain_detail,
        complain_location || null,
        to_whom || null,
        priority || "Medium",
      ]
    );

    const complaint = result.rows[0];

    // 🟢 FIX 2: Improved Admin Notification Logic
    (async () => {
      try {
        const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
        
        // Filter out invalid tokens to prevent batch errors
        const messages = adminDevices.rows
          .filter(admin => Expo.isExpoPushToken(admin.expo_push_token))
          .map(admin => ({
            to: admin.expo_push_token,
            sound: "default",
            title: "🚨 New Complaint Received",
            body: `New ${complaint.priority} priority task for ${complaint.department}.`,
            data: { 
              complaintId: complaint.id, 
              screen: "admin-details" // Ensure this matches your admin app route
            },
          }));

        if (messages.length > 0) {
          // Use chunking for reliability
          const chunks = expo.chunkPushNotifications(messages);
          for (let chunk of chunks) {
            await expo.sendPushNotificationsAsync(chunk);
          }
          console.log(`🔔 ${messages.length} Admins notified`);
        }
      } catch (err) {
        console.error("❌ Admin notification failed:", err);
      }
    })();

      // WhatsApp (non-blocking)
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.MANAGER_WHATSAPP
    ) {
      (async () => {
        try {
          const message = `
                🆕 New Complaint
                ID: ${complaint.id}
                Email: ${submitter_email || "N/A"}
                Name: ${submitter_name || "Anonymous"}
                Complaint: ${complain_detail}
                Department: ${department}
                Priority: ${priority || "Medium"}
                Location: ${complain_location || "N/A"}
                To whom: ${to_whom || "N/A"}          
                `.trim();
                

          await twilioClient.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
            to: `whatsapp:${process.env.MANAGER_WHATSAPP}`,
            body: message,
          });
        } catch (e) {
          console.error("⚠️ WhatsApp failed:", e.message);
        }
      })();
    }

    res.status(201).json({ success: true, id: complaint.id });
  } catch (err) {
    console.error("❌ Submit error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/* =========================
   EMPLOYEE: MY COMPLAINTS
========================= */
app.get("/api/employee/complaints", requireAuth(), async (req, res) => {
  const clerkUserId = req.auth.userId;

  const result = await pool.query(
    `
    SELECT id, department, complain_detail, status, created_at
    FROM complaints
    WHERE clerk_user_id = $1
    ORDER BY created_at DESC
    `,
    [clerkUserId]
  );

  res.json({ complaints: result.rows });
});

/* =========================
   EMPLOYEE: COMPLAINT DETAILS
========================= */
app.get("/api/employee/complaints/:id", requireAuth(), async (req, res) => {
  const clerkUserId = req.auth.userId;
  const complaintId = req.params.id;

  const result = await pool.query(
    `
      SELECT *
      FROM complaints
      WHERE id = $1 AND clerk_user_id = $2
      `,
    [complaintId, clerkUserId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Complaint not found" });
  }

  res.json({ complaint: result.rows[0] });
});

/* =========================
   SAVE EXPO PUSH TOKEN
========================= */
app.post("/api/devices/register", requireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    const { expoPushToken } = req.body;

    if (!clerkUserId || !expoPushToken) {
      return res.status(400).json({ error: "Missing data" });
    }

    // 🟢 ON CONFLICT ensures that if the token is already in the DB, 
    // it just updates the user_id instead of failing.
    await pool.query(
      `
      INSERT INTO user_devices (clerk_user_id, expo_push_token)
      VALUES ($1, $2)
      ON CONFLICT (expo_push_token) 
      DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id, created_at = NOW()
      `,
      [clerkUserId, expoPushToken]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
/* =========================
   ADMIN: ALL COMPLAINTS
========================= */
app.get("/api/admin/complaints", adminAuth, async (req, res) => {
  const result = await pool.query(
    `
      SELECT id, department, complain_detail, status, created_at
    FROM complaints
    ORDER BY created_at DESC
    `
  );

  res.json({ complaints: result.rows });
});

/* =========================
   ADMIN: RESOLVE COMPLAINT
========================= */
app.post("/api/complaints/:id/resolve", async (req, res) => {
  try {
    const complaintId = req.params.id;

    // 1️⃣ Update complaint
    const result = await pool.query(
      `
      UPDATE complaints
      SET status = 'Resolved'
      WHERE id = $1
      RETURNING clerk_user_id
      `,
      [complaintId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const clerkUserId = result.rows[0].clerk_user_id;

    // 2️⃣ Fetch employee devices
    const devices = await pool.query(
      `SELECT expo_push_token FROM user_devices WHERE clerk_user_id = $1`,
      [clerkUserId]
    );

    if (devices.rows.length === 0) {
      console.warn("⚠️ No device registered for clerk_user_id:", clerkUserId);
    }

    console.log("📲 Sending to tokens:", devices.rows);

    // 3️⃣ Prepare notifications
    const messages = devices.rows.map((d) => ({
      to: d.expo_push_token,
      sound: "default",
      title: "Complaint Resolved ✅",
      body: "Your complaint has been resolved. Tap to view details.",
      data: {
        screen: "complaint-details",
        complaintId,
      },
    }));

    // 4️⃣ Send notifications
    if (messages.length > 0) {
      await expo.sendPushNotificationsAsync(messages);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Resolve error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/admin/devices/register", async (req, res) => {
  const { email, expoPushToken } = req.body;
  try {
    await pool.query(
      `INSERT INTO admin_devices (email, expo_push_token)
       VALUES ($1, $2)
       ON CONFLICT (expo_push_token) DO UPDATE SET email = EXCLUDED.email`,
      [email, expoPushToken]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   ADMIN COMPLAINT DETAILS
========================= */
app.get("/api/admin/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        department,
        complain_detail,
        complain_location,
        assets,
        priority,
        status,
        created_at,
        submitter_name,
         submitter_email
      FROM complaints
      WHERE id = $1
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    res.json({ complaint: result.rows[0] });
  } catch (err) {
    console.error("❌ Admin complaint details error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/* =========================
   FALLBACK
========================= */
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 4000;

// app.listen(PORT, "0.0.0.0", () => {
//   console.log(`🚀 Server running on port ${PORT}`);
// });
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n🚀 ================================");
  console.log("🚀 SERVER STARTED");
  console.log("🚀 ================================");
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔐 Clerk Secret: ${process.env.CLERK_SECRET_KEY ? "✅" : "❌"}`);
  console.log(`🗄️ Database: ${process.env.DATABASE_URL ? "✅" : "❌"}`);
  console.log(`📲 Twilio SID: ${process.env.TWILIO_ACCOUNT_SID ? "✅" : "❌"}`);
  console.log(`📲 Twilio Auth: ${process.env.TWILIO_AUTH_TOKEN ? "✅" : "❌"}`);
  console.log(
    `📱 WhatsApp From: ${process.env.TWILIO_WHATSAPP_FROM || "❌ Not set"}`
  );
  console.log(
    `📱 Manager WhatsApp: ${process.env.MANAGER_WHATSAPP || "❌ Not set"}`
  );
  console.log("🚀 ================================\n");
});
