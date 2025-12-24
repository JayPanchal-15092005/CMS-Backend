// import express from "express";
// import cors from "cors";
// import dotenv from "dotenv";
// import { Pool } from "pg";
// import { clerkMiddleware, requireAuth } from "@clerk/express";
// import twilio from "twilio";
// import { Expo } from "expo-server-sdk";

// dotenv.config();

// const app = express();
// const expo = new Expo();

// // This isAdmin code i comment because in the admin i am no longer use the clerk because when i am use the clerk then there is bunch of the error is come so i can not use the clerk and so comment this function.
// // const isAdmin = (req, res, next) => {
// //   try {
// //     const claims = req.auth?.sessionClaims;

// //     // Check both paths to be safe
// //     const role = claims?.role || claims?.public_metadata?.role;

// //     if (role === "admin") {
// //       return next();
// //     }

// //     return res.status(403).json({ error: "Admin only" });
// //   } catch (err) {
// //     return res.status(500).json({ error: "Internal server error" });
// //   }
// // };

// /* =========================
//    MIDDLEWARE
// ========================= */
// app.use(cors());
// app.use(express.json());
// // 🟢 Keep this! It's needed for the Employee App
// app.use(clerkMiddleware());

// /* =========================
//    DATABASE
// ========================= */
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false },
// });

// pool
//   .query("SELECT 1")
//   .then(() => console.log("✅ Database connected"))
//   .catch((err) => console.error("❌ DB connection error:", err.message));

// /* =========================
//    TWILIO SETUP
// ========================= */
// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );

// /* =========================
//    HEALTH CHECK
// ========================= */
// app.get("/health", (req, res) => {
//   res.json({ status: "ok", time: new Date().toISOString() });
// });

// /* =========================
//    SUBMIT COMPLAINT
// ========================= */

// app.post("/api/complaints", requireAuth(), async (req, res) => {
//   console.log("\n=== SUBMIT COMPLAINT ===");

//   try {
//     const clerkUserId = req.auth.userId; // if the error is come in the submit COMPLAINT then use req.auth().userId
//     console.log("User ID:", clerkUserId);

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

//     // ✅ Validation
//     if (!department || !complain_detail) {
//       return res.status(400).json({
//         error: "department and complain_detail are required",
//       });
//     }

//     console.log("✅ Inserting complaint to database...");

//     // 1️⃣ SAVE COMPLAINT
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
//         // submitter_name || "Anonymous",
//         submitter_name && submitter_name.trim() !== ""
//           ? submitter_name.trim()
//           : "Anonymous",
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
//     console.log("✅ Complaint saved, ID:", complaint.id);

//     // 2️⃣ SEND WHATSAPP (NON-BLOCKING)
//     if (
//       process.env.TWILIO_ACCOUNT_SID &&
//       process.env.TWILIO_AUTH_TOKEN &&
//       process.env.TWILIO_WHATSAPP_FROM &&
//       process.env.MANAGER_WHATSAPP
//     ) {
//       (async () => {
//         try {
//           console.log("📲 Sending WhatsApp notification...");

//           const message = `
// 🆕 *New Complaint Submitted*

// 🆔 ID: ${complaint.id}
// 🏢 Department: ${department}
// ⚠️ Priority: ${priority || "Medium"}
// 👤 Submitted by: ${submitter_name || "Anonymous"}

// 📝 Details:
// ${complain_detail}

// 📍 Location: ${complain_location || "Not provided"}
// 👷 Assigned to: ${to_whom || "Not assigned"}
//           `.trim();

//           const fromNumber = process.env.TWILIO_WHATSAPP_FROM.startsWith(
//             "whatsapp:"
//           )
//             ? process.env.TWILIO_WHATSAPP_FROM
//             : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

//           const toNumber = process.env.MANAGER_WHATSAPP.startsWith("whatsapp:")
//             ? process.env.MANAGER_WHATSAPP
//             : `whatsapp:${process.env.MANAGER_WHATSAPP}`;

//           await twilioClient.messages.create({
//             from: fromNumber,
//             to: toNumber,
//             body: message,
//           });

//           console.log("✅ WhatsApp sent");
//         } catch (twilioErr) {
//           console.error("⚠️ WhatsApp failed:", twilioErr.message);
//         }
//       })();
//     } else {
//       console.log("⚠️ Twilio not configured, skipping WhatsApp");
//     }

//     // 3️⃣ RESPONSE
//     res.status(201).json({
//       success: true,
//       id: complaint.id,
//       created_at: complaint.created_at,
//       status: complaint.status,
//       message: "Complaint submitted successfully",
//     });
//   } catch (err) {
//     console.error("❌ Submit complaint error:", err);
//     res.status(500).json({
//       error: "internal_server_error",
//       message: err.message,
//     });
//   }
// });

// app.get("/api/admin/complaints", async (req, res) => {
//   try {
//     const result = await pool.query(`
//       SELECT
//         id,
//         department,
//         complain_detail,
//         status,
//         clerk_user_id,
//         created_at
//       FROM complaints
//       ORDER BY created_at DESC
//     `);

//     res.json({ complaints: result.rows });
//   } catch (err) {
//     console.error("❌ Admin complaints error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });
// // app.get("/api/admin/complaints", requireAuth(), isAdmin, async (req, res) => {
// //   try {
// //     if (!isAdmin(req)) {
// //       return res.status(403).json({ error: "Admin access required" });
// //     }

// //     const result = await pool.query(`
// //       SELECT
// //         id,
// //         department,
// //         complain_detail,
// //         status,
// //         clerk_user_id,
// //         created_at
// //       FROM complaints
// //       ORDER BY created_at DESC
// //     `);

// //     res.json({ complaints: result.rows });
// //   } catch (err) {
// //     console.error("❌ Admin complaints error:", err);
// //     res.status(500).json({ error: "internal_server_error" });
// //   }
// // });

// /* =========================
//    Save Expo Push Token
// ========================= */

// app.post("/api/devices/register", requireAuth(), async (req, res) => {
//   try {
//     const clerkUserId = req.auth.userId;
//     const { expoPushToken } = req.body;

//     if (!Expo.isExpoPushToken(expoPushToken)) {
//       return res.status(400).json({ error: "Invalid Expo push token" });
//     }

//     await pool.query(
//       `
//       INSERT INTO user_devices (clerk_id, expo_push_token)
//       VALUES ($1, $2)
//       ON CONFLICT DO NOTHING
//       `,
//       [clerkUserId, expoPushToken]
//     );

//     res.json({ success: true });
//   } catch (err) {
//     console.error("❌ Register device error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

// /* =========================
//    MY COMPLAINT HISTORY
// ========================= */

// app.get("/api/complaints/my-history", requireAuth(), async (req, res) => {
//   try {
//     const clerkUserId = req.auth.userId;
//     console.log("📜 History for user:", clerkUserId);

//     const result = await pool.query(
//       `
//       SELECT id, department, complain_detail, status, created_at
//       FROM complaints
//       WHERE clerk_user_id = $1
//       ORDER BY created_at DESC
//       `,
//       [clerkUserId]
//     );

//     res.json({
//       total: result.rows.length,
//       complaints: result.rows,
//     });
//   } catch (err) {
//     console.error("❌ History error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

// /* =========================
//    ADMIN: ALL COMPLAINTS
// ========================= */
// app.get("/api/complaints", async (req, res) => {
//   console.log("\n=== GET ALL COMPLAINTS ===");

//   try {
//     const result = await pool.query(
//       `SELECT *
//        FROM complaints
//        ORDER BY created_at DESC
//        LIMIT 100`
//     );

//     console.log(`✅ Found ${result.rows.length} complaints`);

//     res.json({
//       total: result.rows.length,
//       complaints: result.rows,
//     });
//   } catch (err) {
//     console.error("❌ Get all complaints error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });
// // app.get("/api/complaints", requireAuth(), async (req, res) => {
// //   console.log("\n=== GET ALL COMPLAINTS ===");

// //   try {
// //     const result = await pool.query(
// //       `SELECT *
// //        FROM complaints
// //        ORDER BY created_at DESC
// //        LIMIT 100`
// //     );

// //     console.log(`✅ Found ${result.rows.length} complaints`);

// //     res.json({
// //       total: result.rows.length,
// //       complaints: result.rows,
// //     });
// //   } catch (err) {
// //     console.error("❌ Get all complaints error:", err);
// //     res.status(500).json({ error: "internal_server_error" });
// //   }
// // });
// app.get("/api/complaints", requireAuth(), async (req, res) => {
//   console.log("\n=== GET ALL COMPLAINTS ===");

//   try {
//     const result = await pool.query(
//       `SELECT *
//        FROM complaints
//        ORDER BY created_at DESC
//        LIMIT 100`
//     );

//     console.log(`✅ Found ${result.rows.length} complaints`);

//     res.json({
//       total: result.rows.length,
//       complaints: result.rows,
//     });
//   } catch (err) {
//     console.error("❌ Get all complaints error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

// /* =========================
//    COMPLAINT DETAILS (EMPLOYEE)
// ========================= */
// app.get("/api/complaints/:id", async (req, res) => {
//   try {
//     // const clerkUserId = req.auth.userId;
//     // const complaintId = req.params.id;

//     const result = await pool.query(
//       `
//       SELECT
//         id,
//         department,
//         complain_detail,
//         complain_location,
//         assets,
//         priority,
//         status,
//         created_at
//       FROM complaints
//       WHERE id = $1 AND clerk_user_id = $2
//       `,
//       [complaintId, clerkUserId]
//     );

//     if (!result.rows.length) {
//       return res.status(404).json({ error: "Complaint not found" });
//     }

//     res.json({ complaint: result.rows[0] });
//   } catch (err) {
//     console.error("❌ Complaint details error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

// app.post("/api/complaints/:id/resolve", async (req, res) => {
//   try {

//     const complaintId = req.params.id;

//     // 1️⃣ Update complaint
//     const result = await pool.query(
//       `
//       UPDATE complaints
//       SET status = 'Resolved'
//       WHERE id = $1
//       RETURNING clerk_user_id
//       `,
//       [complaintId]
//     );

//     if (!result.rows.length) {
//       return res.status(404).json({ error: "Complaint not found" });
//     }

//     const clerkUserId = result.rows[0].clerk_user_id;

//     // 2️⃣ Fetch employee devices
//     const devices = await pool.query(
//       `SELECT expo_push_token FROM user_devices WHERE clerk_id = $1`,
//       [clerkUserId]
//     );

//     // 3️⃣ Send notifications
//     const messages = devices.rows.map((d) => ({
//       to: d.expo_push_token,
//       sound: "default",
//       title: "Complaint Resolved ✅",
//       body: "Your complaint has been resolved. Tap to view details.",
//       data: {
//         screen: "complaint-details",
//         complaintId,
//       },
//     }));

//     if (messages.length > 0) {
//       await expo.sendPushNotificationsAsync(messages);
//     }

//     res.json({ success: true });
//   } catch (err) {
//     console.error("❌ Resolve error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

// /* =========================
//    TEST ENDPOINT
// ========================= */
// app.get("/api/test", (req, res) => {
//   res.json({
//     message: "Backend is working!",
//     timestamp: new Date().toISOString(),
//     config: {
//       clerk: !!process.env.CLERK_SECRET_KEY,
//       database: !!process.env.DATABASE_URL,
//       twilio: !!process.env.TWILIO_ACCOUNT_SID,
//     },
//   });
// });

// app.use((req, res) => {
//   res.status(404).json({
//     error: "not_found",
//     path: req.originalUrl,
//   });
// });

// /* =========================
//    START SERVER
// ========================= */
// const PORT = process.env.PORT || 4000;

// app.listen(PORT, "0.0.0.0", () => {
//   console.log("\n🚀 ================================");
//   console.log("🚀 SERVER STARTED");
//   console.log("🚀 ================================");
//   console.log(`📍 Port: ${PORT}`);
//   console.log(`🔐 Clerk Secret: ${process.env.CLERK_SECRET_KEY ? "✅" : "❌"}`);
//   console.log(`🗄️ Database: ${process.env.DATABASE_URL ? "✅" : "❌"}`);
//   console.log(`📲 Twilio SID: ${process.env.TWILIO_ACCOUNT_SID ? "✅" : "❌"}`);
//   console.log(`📲 Twilio Auth: ${process.env.TWILIO_AUTH_TOKEN ? "✅" : "❌"}`);
//   console.log(
//     `📱 WhatsApp From: ${process.env.TWILIO_WHATSAPP_FROM || "❌ Not set"}`
//   );
//   console.log(
//     `📱 Manager WhatsApp: ${process.env.MANAGER_WHATSAPP || "❌ Not set"}`
//   );
//   console.log("🚀 ================================\n");
// });

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
app.post("/api/complaints", requireAuth(), async (req, res) => {
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
      return res
        .status(400)
        .json({ error: "department and complain_detail required" });
    }

    const result = await pool.query(
      `
      INSERT INTO complaints (
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
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'Pending',NOW())
      RETURNING *
      `,
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
Department: ${department}
Priority: ${priority || "Medium"}
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
 
   if (!Expo.isExpoPushToken(expoPushToken)) {
     return res.status(400).json({ error: "Invalid Expo token" });
   }
 
   await pool.query(
     `
     INSERT INTO user_devices (clerk_user_id, expo_push_token)
     VALUES ($1, $2)
     ON CONFLICT (expo_push_token) DO NOTHING
     `,
     [clerkUserId, expoPushToken]
   );
 
   res.json({ success: true });
  
 } catch (error) {
    console.error("❌ Register device error:", error);
    res.status(500).json({ error: "internal_server_error" });
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
     console.log("📲 Sending to tokens:", devices.rows)

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
        created_at
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
