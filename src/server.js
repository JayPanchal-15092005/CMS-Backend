import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { Expo } from "expo-server-sdk";
import { sendEmail } from "./utils/emailService.js";
import {
  getNewComplaintTemplate,
  getResolvedTemplate,
} from "./utils/emailTemplates.js";
import admin from "firebase-admin";
// import serviceAccount from "../firebase-service-account.json"; // Ensure path is correct
import ImageKit from "imagekit";
dotenv.config();

const app = express();
const expo = new Expo();

// 🟢 2. Initialize ImageKit (Put this near your database connection code)
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// 🟢 1. Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🟢 2. Firebase Middleware (Replaces Clerk)
const requireAuth = () => async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // 🟢 Save the Firebase UID as 'userId'
    req.auth = { userId: decodedToken.uid };
    req.userEmail = decodedToken.email;

    next();
  } catch (error) {
    console.error("Auth Error:", error);
    return res.status(403).json({ error: "Unauthorized: Invalid token" });
  }
};

// 🟢 3. Add the Auth Route (This gives the frontend permission to upload)
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

// 🟢 3. Database Init (Updated Column Names)
async function initDatabase() {
  try {
    // Admin Devices
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

    // User Devices (Renamed clerk_user_id -> firebase_uid)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) NOT NULL, 
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_uid ON user_devices(firebase_uid);
    `);

    console.log("✅ All database tables ready");
  } catch (error) {
    console.error("❌ Database init error:", error);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

initDatabase();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

/* =========================
   DATABASE CONNECTION TEST
========================= */
pool
  .query("SELECT 1")
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ DB connection error:", err.message));

/* =========================
   ADMIN AUTH (Hardcoded)
========================= */
const ADMIN_USERS = [
  { email: "jayp93393@gmail.com", password: "JayPanchal15092005" },
  {
    email: "itsupport@gujaratinfotech.com",
    password: "itsupport@gujaratinfotech.com",
  },
  { email: "gujaratinfotech.com", password: "gujaratinfotech.com" },
];

const adminAuth = (req, res, next) => {
  const email = req.headers["x-admin-email"];
  const password = req.headers["x-admin-password"];

  if (!email || !password)
    return res.status(401).json({ error: "Missing credentials" });

  const isValidAdmin = ADMIN_USERS.some(
    (admin) => admin.email === email.trim() && admin.password === password,
  );

  if (!isValidAdmin)
    return res.status(403).json({ error: "Unauthorized admin" });
  next();
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
    const userId = req.auth.userId; // This is the Firebase UID
    const {
      submitter_name,
      submitter_email,
      department,
      assets,
      complain_detail,
      complain_location,
      to_whom,
      priority,
      image_url
    } = req.body;

    console.log(`\n📝 New Complaint from ${submitter_name} (UID: ${userId})`);

    // 🟢 UPDATED SQL: Using firebase_uid
    const result = await pool.query(
      // `INSERT INTO complaints (
      //   firebase_uid, submitter_name, submitter_email, department,
      //   assets, complain_detail, complain_location, to_whom,
      //   priority, status, created_at
      // )
      // VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'Pending',NOW())
      // RETURNING *`,
      `INSERT INTO complaints (
        firebase_uid, 
        submitter_name, 
        submitter_email, 
        department, 
        assets, 
        complain_detail, 
        complain_location, 
        to_whom, 
        priority, 
        status, 
        image_url
      ) 
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'Pending', $10) 
      RETURNING *`,
      [
        userId,                                // $1: firebase_uid
        submitter_name?.trim() || "Anonymous", // $2: submitter_name
        submitter_email || null,               // $3: submitter_email
        department,                            // $4: department
        JSON.stringify(assets || []),          // $5: assets
        complain_detail,                       // $6: complain_detail
        complain_location || null,             // $7: complain_location
        to_whom || null,                       // $8: to_whom
        priority || "Medium",                  // $9: priority
        image_url || null                      // $10: image_url
      ]
    );

    const complaint = result.rows[0];
    console.log("✅ Complaint saved, ID:", complaint.id);

    // --- EMAIL LOGIC ---
    try {
      const htmlContent = getNewComplaintTemplate({
        email: req.body.submitter_email,
        name: req.body.submitter_name,
        department: req.body.department,
        detail: req.body.complain_detail,
        location: req.body.complain_location,
        to_whom: req.body.to_whom,
        priority: req.body.priority,
        assets: JSON.stringify(req.body.assets || []),
      });
      // Send email (no await to prevent blocking)
      sendEmail(
        "Itsupport@gujaratinfotech.com",
        "New Complaint Received",
        htmlContent,
      );
    } catch (e) {
      console.error("Email failed", e);
    }

    // --- PUSH NOTIFICATION (ADMIN) ---
    try {
      const adminDevices = await pool.query(
        "SELECT expo_push_token FROM admin_devices",
      );
      const messages = [];

      for (const device of adminDevices.rows) {
        if (!Expo.isExpoPushToken(device.expo_push_token)) continue;

        messages.push({
          to: device.expo_push_token,
          sound: "default",
          title: "🚨 New Complaint Received",
          body: `New ${complaint.priority} priority task for ${complaint.department}.`,
          data: { complaintId: complaint.id, screen: "admin-details" },
        });
      }

      if (messages.length > 0) {
        await expo.sendPushNotificationsAsync(messages);
        console.log(`✅ Sent ${messages.length} notifications to Admins`);
      }
    } catch (notifError) {
      console.error("❌ Notification Error:", notifError);
    }

    if (process.env.GUPSHUP_API_KEY && process.env.MANAGER_WHATSAPP) {
      try {
        // 🟢 Build the dynamic message content
        const complaintText = `
🆕 *New Complaint Received*
*Name*: ${submitter_name}
*Email*: ${submitter_email}
*Department:* ${department}
*Priority:* ${priority || "Medium"}
*Issue:* ${complain_detail}
*Location:* ${complain_location || "N/A"}
    `.trim();

        const messagePayload = {
          type: "text",
          text: complaintText,
        };

        // 🟢 Set up the URL-encoded parameters
        const params = new URLSearchParams();
        params.append("channel", "whatsapp");
        params.append("source", "917834811114"); // Gupshup Sandbox Number
        params.append("destination", process.env.MANAGER_WHATSAPP); // e.g., 918347039945
        params.append("message", JSON.stringify(messagePayload));
        params.append("src.name", "cmsttee"); // Your App Name

        // 🟢 Send the POST request to Gupshup API
        const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            apikey: process.env.GUPSHUP_API_KEY,
          },
          body: params,
        });

        const data = await response.json();

        if (response.ok && data.status === "submitted") {
          console.log(
            "✅ Gupshup notification sent successfully. ID:",
            data.messageId,
          );
        } else {
          console.error("❌ Gupshup API Error:", data);
        }
      } catch (error) {
        console.error("❌ Gupshup Integration Failed:", error.message);
      }
    }

    res
      .status(201)
      .json({ success: true, id: complaint.id, status: complaint.status });
  } catch (err) {
    console.error("❌ Submit error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/* =========================
   EMPLOYEE: MY COMPLAINTS
========================= */
app.get("/api/employee/complaints", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  // 🟢 UPDATED SQL: Using firebase_uid
  const result = await pool.query(
    `SELECT id, department, complain_detail, status, created_at
     FROM complaints
     WHERE firebase_uid = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  res.json({ complaints: result.rows });
});

/* =========================
   EMPLOYEE: COMPLAINT DETAILS
========================= */
app.get("/api/employee/complaints/:id", requireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const complaintId = req.params.id;

  // 🟢 UPDATED SQL: Using firebase_uid
  const result = await pool.query(
    `SELECT * FROM complaints WHERE id = $1 AND firebase_uid = $2`,
    [complaintId, userId],
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "Complaint not found" });
  }

  res.json({ complaint: result.rows[0] });
});

/* =========================
   SAVE EXPO PUSH TOKEN (EMPLOYEE)
========================= */
app.post("/api/devices/register", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { expoPushToken, email } = req.body; // Added email if available

    if (!userId || !expoPushToken) {
      return res.status(400).json({ error: "Missing data" });
    }

    // 🟢 UPDATED SQL: Using firebase_uid
    await pool.query(
      `INSERT INTO user_devices (firebase_uid, expo_push_token, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (expo_push_token) 
       DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid, created_at = NOW()`,
      [userId, expoPushToken, email || null],
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
    `SELECT id, department, complain_detail, status, created_at
     FROM complaints
     ORDER BY created_at DESC`,
  );
  res.json({ complaints: result.rows });
});

/* =========================
   ADMIN: RESOLVE COMPLAINT
========================= */

app.post("/api/complaints/:id/resolve", async (req, res) => {
  // 🟢 Define these OUTSIDE the try block so 'catch' can see them
  let userId = null;
  let devices = { rows: [] };

  try {
    const complaintId = req.params.id;
    const { remarks } = req.body;

    console.log(`\n🔍 Resolving Complaint ID: ${complaintId}`);

    // 1. Update Complaint
    const result = await pool.query(
      `UPDATE complaints 
       SET status = 'Resolved', admin_remarks = $1 
       WHERE id = $2 
       RETURNING *`,
      [remarks || null, complaintId],
    );

    if (result.rowCount === 0) {
      console.log("❌ Complaint not found in DB");
      return res.status(404).json({ error: "Complaint not found" });
    }

    const complaint = result.rows[0];

    // 🟢 SAFETY CHECK: Handle both column names
    // If you renamed the column, it is firebase_uid. If not, it is clerk_user_id.
    userId = complaint.firebase_uid || complaint.clerk_user_id;

    console.log(`👤 User ID found for complaint: ${userId}`);

    if (!userId) {
      console.warn(
        "⚠️ WARNING: No User ID found in this complaint row. Cannot send notification.",
      );
    }

    // 2. Send Email (Keep your existing logic)
    if (complaint.submitter_email) {
      try {
        const htmlContent = getResolvedTemplate({
          email: complaint.submitter_email,
          name: complaint.submitter_name,
          detail: complaint.complain_detail,
          remarks: remarks,
          location: complaint.complain_location,
        });
        await sendEmail(
          complaint.submitter_email,
          "Complaint Resolved",
          htmlContent,
        ).catch((err) => console.error("Email Error:", err));
      } catch (e) {}
    }

    // 3. Fetch Device by userId
    // 🟢 UPDATED QUERY: Matches your table structure
    devices = await pool.query(
      `SELECT expo_push_token FROM user_devices WHERE firebase_uid = $1`,
      [userId],
    );

    console.log(`📱 Devices found for user: ${devices.rows.length}`);

    // 4. Send Notification
    if (devices.rows.length > 0) {
      const messages = devices.rows.map((d) => ({
        to: d.expo_push_token,
        sound: "default",
        title: "Complaint Resolved ✅",
        body: remarks
          ? `Resolved: ${remarks}`
          : "Your complaint has been resolved.",
        data: { screen: "complaint-details", complaintId },
      }));

      console.log("🚀 Sending Push Notification to Expo...");
      await expo.sendPushNotificationsAsync(messages);
      console.log("✅ Notification Sent!");
    } else {
      console.log("📭 No device token found. Skipping notification.");
    }

    res.json({ success: true, message: "Resolved successfully" });
  } catch (err) {
    console.error("❌ RESOLVE API ERROR:", err);
    // Now these logs will work without crashing
    console.log("Last UserID:", userId);
    console.log("Last Devices Count:", devices?.rows?.length);
    res.status(500).json({ error: "internal_server_error" });
  }
});

/* =========================
   ADMIN: REGISTER DEVICE
========================= */
app.post("/api/admin/devices/register", async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;
    if (!email || !expoPushToken)
      return res.status(400).json({ error: "Missing data" });

    const isValidAdmin = ADMIN_USERS.some(
      (admin) => admin.email === email && admin.password === password,
    );

    if (!isValidAdmin) return res.status(401).json({ error: "Unauthorized" });

    await pool.query(
      `INSERT INTO admin_devices (email, expo_push_token, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (expo_push_token) 
       DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
      [email, expoPushToken],
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

/* =========================
   ADMIN: REPORTS
========================= */
app.get("/api/admin/reports", adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    let queryParams = [startDate, endDate];
    let filterClause = "WHERE created_at::date BETWEEN $1 AND $2";

    if (department && department !== "All") {
      filterClause += " AND department = $3";
      queryParams.push(department);
    }

    const summary = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending,
        COUNT(*) FILTER (WHERE priority = 'High') as high_priority
       FROM complaints ${filterClause}`,
      queryParams,
    );

    const deptStats = await pool.query(
      `SELECT department, COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'Resolved') as resolved
       FROM complaints ${filterClause}
       GROUP BY department ORDER BY total DESC`,
      queryParams,
    );

    res.json({ summary: summary.rows[0], deptStats: deptStats.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   ADMIN: COMPLAINT DETAILS
========================= */
app.get("/api/admin/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM complaints WHERE id = $1`, [
      id,
    ]);

    if (!result.rows.length)
      return res.status(404).json({ error: "Not found" });
    res.json({ complaint: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "internal_server_error" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
