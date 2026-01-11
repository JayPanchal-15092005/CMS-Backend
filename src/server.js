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

async function initDatabase() {
  try {
    // Create admin_devices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_devices (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        device_info JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_devices_email ON admin_devices(email);
      CREATE INDEX IF NOT EXISTS idx_admin_devices_token ON admin_devices(expo_push_token);
    `);

    console.log('✅ Admin devices table ready');
  } catch (error) {
    console.error('❌ Database init error:', error);
  }
}

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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
// app.post("/api/complaints", requireAuth(), async (req, res) => {
//   try {
//     const clerkUserId = req.auth.userId;

//     const {
//       submitter_name,
//       submitter_email,
//       department,
//       assets,
//       complain_detail,
//       complain_location,
//       to_whom,
//       priority,
//     } = req.body;

//     if (!department || !complain_detail) {
//       return res
//         .status(400)
//         .json({ error: "department and complain_detail required" });
//     }

//     const result = await pool.query(
//       `
//       INSERT INTO complaints (
//         clerk_user_id,
//         submitter_name,
//         submitter_email,
//         department,
//         assets,
//         complain_detail,
//         complain_location,
//         to_whom,
//         priority,
//         status,
//         created_at
//       )
//       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'Pending',NOW())
//       RETURNING *
//       `,
//       [
//         clerkUserId,
//         submitter_name?.trim() || "Anonymous",
//         submitter_email || null,
//         department,
//         JSON.stringify(assets || []),
//         complain_detail,
//         complain_location || null,
//         to_whom || null,
//         priority || "Medium",
//       ]
//     );

//     const complaint = result.rows[0];

//     (async () => {
//   try {
//     const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
    
//     const adminMessages = adminDevices.rows.map(admin => ({
//       to: admin.expo_push_token,
//       sound: "default",
//       title: "🚨 New Complaint Received",
//       body: `New ${complaint.priority} priority task for ${complaint.department}.`,
//       data: { complaintId: complaint.id, screen: "admin-details" },
//     }));

//     if (adminMessages.length > 0) {
//       await expo.sendPushNotificationsAsync(adminMessages);
//       console.log("🔔 Admins notified of new complaint");
//     }
//   } catch (err) {
//     console.error("❌ Admin notification failed:", err);
//   }
// })();

//     // WhatsApp (non-blocking)
//     if (
//       process.env.TWILIO_ACCOUNT_SID &&
//       process.env.TWILIO_WHATSAPP_FROM &&
//       process.env.MANAGER_WHATSAPP
//     ) {
//       (async () => {
//         try {
//           const message = `
//                 🆕 New Complaint
//                 ID: ${complaint.id}
//                 Email: ${submitter_email || "N/A"}
//                 Name: ${submitter_name || "Anonymous"}
//                 Complaint: ${complain_detail}
//                 Department: ${department}
//                 Priority: ${priority || "Medium"}
//                 Location: ${complain_location || "N/A"}
//                 To whom: ${to_whom || "N/A"}          
//                 `.trim();
                

//           await twilioClient.messages.create({
//             from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
//             to: `whatsapp:${process.env.MANAGER_WHATSAPP}`,
//             body: message,
//           });
//         } catch (e) {
//           console.error("⚠️ WhatsApp failed:", e.message);
//         }
//       })();
//     }

//     res.status(201).json({
//       success: true,
//       id: complaint.id,
//       status: complaint.status,
//     });
//   } catch (err) {
//     console.error("❌ Submit complaint error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });


// Submit Complaint with Push Notifications
app.post("/api/complaints", requireAuth(), async (req, res) => {
  console.log("\n📝 ========================================");
  console.log("📝 NEW COMPLAINT SUBMITTED");
  console.log("📝 ========================================\n");
  
  try {
    const clerkUserId = req.auth.userId;

    const {
      submitter_name,
      submitter_email,
      department,
      assets,
      complain_detail,
      complain_location,
      to_whom,
      priority,
    } = req.body;

    if (!department || !complain_detail) {
      return res.status(400).json({ 
        error: "department and complain_detail required" 
      });
    }

    // Insert complaint
    const result = await pool.query(
      `INSERT INTO complaints (
        clerk_user_id,
        submitter_name,
        submitter_email,
        department,
        assets,
        complain_detail,
        complain_location,
        to_whom,
        priority,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',NOW())
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
    console.log("✅ Complaint ID:", complaint.id);
    console.log("✅ Department:", department);
    console.log("✅ Priority:", priority);

    // Send Push Notifications (Non-blocking)
    setImmediate(async () => {
      try {
        console.log("\n🔔 ========================================");
        console.log("🔔 SENDING PUSH NOTIFICATIONS");
        console.log("🔔 ========================================\n");

        // Get all admin devices
        const adminDevices = await pool.query(
          "SELECT expo_push_token, email, device_info FROM admin_devices"
        );

        console.log(`📱 Found ${adminDevices.rows.length} admin device(s)`);

        if (adminDevices.rows.length === 0) {
          console.log("⚠️  No admin devices registered!");
          console.log("   Make sure admin app is installed and opened at least once.");
          return;
        }

        // Log each device
        adminDevices.rows.forEach((device, index) => {
          console.log(`\nDevice ${index + 1}:`);
          console.log("  Email:", device.email);
          console.log("  Token:", device.expo_push_token);
        });

        // Prepare messages
        const messages = [];
        for (const device of adminDevices.rows) {
          if (!Expo.isExpoPushToken(device.expo_push_token)) {
            console.error(`❌ Invalid token for ${device.email}:`, device.expo_push_token);
            continue;
          }

          messages.push({
            to: device.expo_push_token,
            sound: "default",
            title: "🚨 New Complaint",
            body: `${priority || 'Medium'} priority - ${department}`,
            data: { 
              complaintId: complaint.id,
              department: department,
              priority: priority,
            },
            priority: "high",
            channelId: "default",
          });
        }

        console.log(`\n📤 Preparing to send ${messages.length} notification(s)...`);

        if (messages.length === 0) {
          console.log("⚠️  No valid tokens to send to");
          return;
        }

        // Send in chunks
        const chunks = expo.chunkPushNotifications(messages);
        console.log(`📦 Split into ${chunks.length} chunk(s)`);

        for (let i = 0; i < chunks.length; i++) {
          try {
            console.log(`\n📤 Sending chunk ${i + 1}/${chunks.length}...`);
            const ticketChunk = await expo.sendPushNotificationsAsync(chunks[i]);
            
            console.log(`✅ Chunk ${i + 1} sent`);
            console.log("Tickets:", ticketChunk);

            // Check for errors
            ticketChunk.forEach((ticket, idx) => {
              if (ticket.status === 'error') {
                console.error(`❌ Ticket ${idx} error:`, ticket.message);
                if (ticket.details) {
                  console.error("   Details:", ticket.details);
                }
              } else {
                console.log(`✅ Ticket ${idx} success:`, ticket.id);
              }
            });
          } catch (error) {
            console.error(`❌ Error sending chunk ${i + 1}:`, error);
          }
        }

        console.log("\n✅ ========================================");
        console.log("✅ NOTIFICATIONS SENT!");
        console.log("✅ ========================================\n");
      } catch (err) {
        console.error("\n❌ ========================================");
        console.error("❌ NOTIFICATION SENDING FAILED!");
        console.error("❌ ========================================\n");
        console.error("Error:", err);
      }
    });

    // Send WhatsApp Message to Manager (Non-blocking)
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.MANAGER_WHATSAPP
    ) {
      setImmediate(async () => {
        try {
          console.log("\n📱 ========================================");
          console.log("📱 SENDING WHATSAPP MESSAGE");
          console.log("📱 ========================================\n");

          const message = `
🆕 *New Complaint Received*

📋 *Complaint ID:* ${complaint.id}
👤 *Submitted by:* ${submitter_name || "Anonymous"}
📧 *Email:* ${submitter_email || "N/A"}

🏢 *Department:* ${department}
⚠️ *Priority:* ${priority || "Medium"}
📍 *Location:* ${complain_location || "N/A"}
👷 *Assigned to:* ${to_whom || "N/A"}

📝 *Complaint Details:*
${complain_detail}

🔗 Check admin dashboard for more details.
          `.trim();

          console.log("📤 Sending to:", process.env.MANAGER_WHATSAPP);

          await twilioClient.messages.create({
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
            to: `whatsapp:${process.env.MANAGER_WHATSAPP}`,
            body: message,
          });

          console.log("\n✅ ========================================");
          console.log("✅ WHATSAPP MESSAGE SENT!");
          console.log("✅ ========================================\n");
        } catch (e) {
          console.error("\n❌ ========================================");
          console.error("❌ WHATSAPP MESSAGE FAILED!");
          console.error("❌ ========================================\n");
          console.error("Error:", e.message);
          if (e.code) console.error("Code:", e.code);
          if (e.moreInfo) console.error("More Info:", e.moreInfo);
        }
      });
    } else {
      console.log("\n⚠️  WhatsApp not configured");
      console.log("   Set these environment variables:");
      console.log("   - TWILIO_ACCOUNT_SID");
      console.log("   - TWILIO_WHATSAPP_FROM");
      console.log("   - MANAGER_WHATSAPP\n");
    }

    res.status(201).json({
      success: true,
      id: complaint.id,
      status: complaint.status,
    });
  } catch (err) {
    console.error("❌ Submit complaint error:", err);
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

// app.post("/api/admin/devices/register", async (req, res) => {
//   const { email, expoPushToken } = req.body;
//   try {
//     await pool.query(
//       `INSERT INTO admin_devices (email, expo_push_token)
//        VALUES ($1, $2)
//        ON CONFLICT (expo_push_token) DO UPDATE SET email = EXCLUDED.email`,
//       [email, expoPushToken]
//     );
//     res.json({ success: true });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.post("/api/admin/devices/register", async (req, res) => {
  console.log("\n📱 ========================================");
  console.log("📱 ADMIN DEVICE REGISTRATION REQUEST");
  console.log("📱 ========================================\n");
  
  try {
    const { email, password, expoPushToken, deviceInfo } = req.body;

    console.log("📧 Email:", email);
    console.log("📱 Token:", expoPushToken);

    // Validate required fields
    if (!email || !expoPushToken) {
      console.error("❌ Missing required fields");
      return res.status(400).json({ 
        error: "Email and expoPushToken are required" 
      });
    }

    // ✅ FIXED: Check if credentials match ANY admin in the array
    const isValidAdmin = ADMIN_USERS.some(
      admin => admin.email === email && admin.password === password
    );

    if (!isValidAdmin) {
      console.error("❌ Invalid admin credentials");
      return res.status(401).json({ 
        error: "Invalid admin credentials" 
      });
    }

    console.log("✅ Admin credentials verified:", email);

    // Validate token format
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error("❌ Invalid Expo Push Token format");
      return res.status(400).json({ 
        error: "Invalid Expo Push Token format" 
      });
    }

    console.log("✅ Token format valid");

    // Save to database
    const result = await pool.query(
      `INSERT INTO admin_devices (email, expo_push_token, device_info, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (expo_push_token) 
       DO UPDATE SET 
         email = EXCLUDED.email,
         device_info = EXCLUDED.device_info,
         updated_at = NOW()
       RETURNING *`,
      [email, expoPushToken, JSON.stringify(deviceInfo || {})]
    );

    console.log("✅ Device registered:", result.rows[0].id);

    res.json({ 
      success: true, 
      message: "Device registered successfully",
      device: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ 
      error: "Registration failed",
      message: error.message 
    });
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
