import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { clerkMiddleware, requireAuth } from "@clerk/express";
// import twilio from "twilio";
import { Expo } from "expo-server-sdk";
import { sendEmail } from "./utils/emailService.js";
import { getNewComplaintTemplate, getResolvedTemplate } from "./utils/emailTemplates.js";
import bodyParser from "body-parser";
import { Webhook } from "svix";

dotenv.config();

const app = express();
const expo = new Expo();

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

// clerk webhooks
app.post("/api/webhooks", async (req, res) => {
  try {
    // CRITICAL: We use req.rawBody here, which we saved above
    const payloadString = req.rawBody; 
    const svixHeaders = req.headers;

    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);

    // Verify using the raw string
    const evt = wh.verify(payloadString, {
      "svix-id": svixHeaders["svix-id"],
      "svix-timestamp": svixHeaders["svix-timestamp"],
      "svix-signature": svixHeaders["svix-signature"],
    });

    const eventType = evt.type;
    console.log(`✅ Webhook verified: ${eventType}`);

    if (eventType === "user.created" || eventType === "user.updated") {
      const { id, email_addresses, first_name, last_name } = evt.data;
      const email = email_addresses[0]?.email_address;

      await pool.query(
        `INSERT INTO users (clerk_user_id, email, first_name, last_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (clerk_user_id) 
         DO UPDATE SET email = $2, first_name = $3, last_name = $4`,
        [id, email, first_name, last_name]
      );
      console.log(`✅ User ${id} synced to Neon`);
    }

    res.status(200).json({ success: true, message: "Webhook received" });
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
});

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
// app.use(express.json());
app.use(express.json({
  verify: (req, res, buf) => {
    // If the URL is for webhooks, save the raw buffer to a new property
    if (req.originalUrl.startsWith('/api/webhooks')) {
      req.rawBody = buf.toString();
    }
  }
}));

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
    (admin) => admin.email === email.trim() && admin.password === password,
  );

  if (!isValidAdmin) {
    return res.status(403).json({ error: "Unauthorized admin" });
  }

  next();
};

/* =========================
   TWILIO SETUP
========================= */
// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN,
// );

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

//     const result = await pool.query(
//       `INSERT INTO complaints (
//         clerk_user_id, submitter_name, submitter_email, department,
//         assets, complain_detail, complain_location, to_whom,
//         priority, status, created_at
//       )
//       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'Pending',NOW())
//       RETURNING *`,
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
//       ],
//     );

//     const complaint = result.rows[0];
//     console.log("✅ Complaint created:", complaint.id);

//     // ✅ FIXED: Proper async notification sending with detailed logging
//     (async () => {
//       try {
//         console.log("\n🔔 ===== SENDING PUSH NOTIFICATIONS =====");

//         const adminDevices = await pool.query(
//           "SELECT expo_push_token, email FROM admin_devices",
//         );

//         console.log(`📱 Found ${adminDevices.rows.length} admin device(s)`);

//         if (adminDevices.rows.length === 0) {
//           console.error("❌ NO ADMIN DEVICES REGISTERED!");
//           console.error("   Make sure admin app was opened at least once");
//           return;
//         }

//         // Log each device
//         adminDevices.rows.forEach((device, i) => {
//           console.log(`Device ${i + 1}:`, device.email, device.expo_push_token);
//         });

//         // Filter and validate tokens
//         const validMessages = [];
//         for (const device of adminDevices.rows) {
//           if (!Expo.isExpoPushToken(device.expo_push_token)) {
//             console.error(
//               `❌ Invalid token for ${device.email}:`,
//               device.expo_push_token,
//             );
//             continue;
//           }

//           validMessages.push({
//             to: device.expo_push_token,
//             sound: "default",
//             // title: "🚨 New Complaint",
//             // body: `${priority || "Medium"} priority - ${department}`,
//              title: "🚨 New Complaint Received",
//             body: `New ${complaint.priority} priority task for ${complaint.department}.`,
//             data: {
//               complaintId: complaint.id,
//               department: department,
//               priority: priority,
//               screen: "admin-details",
//             },
//             priority: "high",
//             channelId: "default",
//           });
//         }

//         if (validMessages.length === 0) {
//           console.error("❌ No valid tokens to send to!");
//           return;
//         }

//         console.log(`📤 Sending ${validMessages.length} notification(s)...`);

//         // Send notifications
//         const chunks = expo.chunkPushNotifications(validMessages);
//         const tickets = [];

//         for (const chunk of chunks) {
//           try {
//             const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
//             tickets.push(...ticketChunk);
//             console.log("✅ Chunk sent, tickets:", ticketChunk);
//           } catch (error) {
//             console.error("❌ Send chunk error:", error);
//           }
//         }

//         // Check ticket results
//         tickets.forEach((ticket, idx) => {
//           if (ticket.status === "error") {
//             console.error(`❌ Ticket ${idx} ERROR:`, ticket.message);
//             if (ticket.details) {
//               console.error("   Details:", ticket.details);
//             }
//           } else {
//             console.log(`✅ Ticket ${idx} SUCCESS:`, ticket.id);
//           }
//         });

//         console.log("🔔 ===== NOTIFICATIONS COMPLETE =====\n");
//       } catch (err) {
//         console.error("❌ ===== NOTIFICATION FAILED =====");
//         console.error("Error:", err.message);
//         console.error("Stack:", err.stack);
//       }
//     })();

//     // WhatsApp (non-blocking)
//     if (
//       process.env.TWILIO_ACCOUNT_SID &&
//       process.env.TWILIO_WHATSAPP_FROM &&
//       process.env.MANAGER_WHATSAPP
//     ) {
//       (async () => {
//         try {
//           const message = `
// 🆕 New Complaint
// ID: ${complaint.id}
// Name: ${submitter_name || "Anonymous"}
// Email: ${submitter_email || "N/A"}
// Department: ${department}
// Priority: ${priority || "Medium"}
// Location: ${complain_location || "N/A"}
// Assigned: ${to_whom || "N/A"}

// Details: ${complain_detail}
//           `.trim();

//           await twilioClient.messages.create({
//             from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
//             to: `whatsapp:${process.env.MANAGER_WHATSAPP}`,
//             body: message,
//           });
//           console.log("✅ WhatsApp sent");
//         } catch (e) {
//           console.error("⚠️ WhatsApp failed:", e.message);
//         }
//       })();
//     }

//     res.status(201).json({ success: true, id: complaint.id });
//   } catch (err) {
//     console.error("❌ Submit error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

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

    console.log("\n📝 ===== NEW COMPLAINT SUBMISSION =====");
    console.log("From:", submitter_name, submitter_email);
    console.log("Department:", department);

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
      ],
    );

    const complaint = result.rows[0];
    console.log("✅ Complaint saved, ID:", complaint.id);

    // Email Logic
    const htmlContent = getNewComplaintTemplate({
      email: req.body.submitter_email,
      name: req.body.submitter_name,
      department: req.body.department,
      detail: req.body.complain_detail,
      location: req.body.complain_location,
      to_whom: req.body.to_whom,
      priority: req.body.priority,
      assets: JSON.stringify(req.body.assets || [])
    });

    await sendEmail("Itsupport@gujaratinfotech.com", "New Complaint Received", htmlContent);

    // ✅ CRITICAL: Send notification IMMEDIATELY (not in setImmediate)
    try {
      console.log("\n🔔 ===== SENDING PUSH NOTIFICATION NOW =====");

      const adminDevices = await pool.query(
        "SELECT expo_push_token, email FROM admin_devices",
      );

      console.log(`📱 Admin devices found: ${adminDevices.rows.length}`);

      if (adminDevices.rows.length === 0) {
        console.error("❌ NO ADMIN DEVICES! App not registered.");
        // Continue anyway - don't block response
      } else {
        // Validate and prepare messages
        const messages = [];
        for (const device of adminDevices.rows) {
          console.log(
            `Checking device: ${device.email} - ${device.expo_push_token}`,
          );

          if (!Expo.isExpoPushToken(device.expo_push_token)) {
            console.error(`❌ Invalid token for ${device.email}`);
            continue;
          }

          messages.push({
            to: device.expo_push_token,
            sound: "default",
            title: "🚨 New Complaint Received",
            body: `New ${complaint.priority} priority task for ${complaint.department}.`,
            data: {
              complaintId: complaint.id,
              department: department,
              priority: priority,
            },
            priority: "high",
            channelId: "default",
          });
        }

        console.log(`📤 Sending ${messages.length} notification(s)...`);

        if (messages.length > 0) {
          // Send in chunks
          const chunks = expo.chunkPushNotifications(messages);

          for (const chunk of chunks) {
            const tickets = await expo.sendPushNotificationsAsync(chunk);

            console.log("📬 Tickets received:", tickets);

            // Check for errors
            tickets.forEach((ticket, idx) => {
              if (ticket.status === "error") {
                console.error(`❌ Ticket ${idx} ERROR:`, ticket.message);
                if (ticket.details) {
                  console.error("Details:", ticket.details);
                }
              } else {
                console.log(`✅ Ticket ${idx} SUCCESS:`, ticket.id);
              }
            });
          }

          console.log("✅ Push notifications sent successfully!");
        } else {
          console.error("❌ No valid messages to send");
        }
      }
    } catch (notifError) {
      console.error("❌ NOTIFICATION ERROR:");
      console.error(notifError);
      // Don't fail the request if notification fails
    }

    console.log("📝 ===== COMPLAINT SUBMISSION COMPLETE =====\n");

    // WhatsApp notification (non-blocking)
    // WhatsApp (non-blocking)
//     if (
//       process.env.TWILIO_ACCOUNT_SID &&
//       process.env.TWILIO_AUTH_TOKEN && // Ensure Auth Token is checked too
//       process.env.TWILIO_WHATSAPP_FROM &&
//       process.env.MANAGER_WHATSAPP
//     ) {
//       try {
//         const messageBody = `
// 🆕 *New Complaint Received*
// *ID:* ${complaint.id}
// *Name:* ${submitter_name || "Anonymous"}
// *Dept:* ${department}
// *Priority:* ${priority || "Medium"}
// *Issue:* ${complain_detail}
// *Location:* ${complain_location || "N/A"}
//     `.trim();

//     // 🟢 CRITICAL: Use await here so Vercel doesn't kill the process
//     const twilioResponse = await twilioClient.messages.create({
//       from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
//       to: `whatsapp:${process.env.MANAGER_WHATSAPP}`,
//       body: messageBody,
//     });

//     console.log("✅ WhatsApp sent via Twilio. SID:", twilioResponse.sid);
//       } catch (error) {
//         console.error("❌ Twilio WhatsApp Error:", error.message);  
//         // Log the full error to Vercel logs to see if it's a Twilio config issue
//     console.error("Twilio Details:", error);
//       }

//     }

/* =========================
   FINAL GUPSHUP INTEGRATION
========================= */
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
      text: complaintText
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
        "apikey": process.env.GUPSHUP_API_KEY
      },
      body: params,
    });

    const data = await response.json();
    
    if (response.ok && data.status === "submitted") {
      console.log("✅ Gupshup notification sent successfully. ID:", data.messageId);
    } else {
      console.error("❌ Gupshup API Error:", data);
    }
  } catch (e) {
    console.error("❌ Gupshup Integration Failed:", e.message);
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
  const clerkUserId = req.auth.userId;

  const result = await pool.query(
    `
    SELECT id, department, complain_detail, status, created_at
    FROM complaints
    WHERE clerk_user_id = $1
    ORDER BY created_at DESC
    `,
    [clerkUserId],
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
    [complaintId, clerkUserId],
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
      [clerkUserId, expoPushToken],
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
    `,
  );

  res.json({ complaints: result.rows });
});

/* =========================
   ADMIN: RESOLVE COMPLAINT
========================= */
// app.post("/api/complaints/:id/resolve", async (req, res) => {
//   try {
//     const complaintId = req.params.id;
//     const { remarks } = req.body;

//     // 1️⃣ Update complaint
//     const result = await pool.query(
//       `
//       UPDATE complaints
//       SET status = 'Resolved'
//       WHERE id = $1
//       RETURNING clerk_user_id
//       `,
//       [complaintId],
//     );

//     if (!result.rows.length) {
//       return res.status(404).json({ error: "Complaint not found" });
//     }

//     const clerkUserId = result.rows[0].clerk_user_id;

//     // 2️⃣ Fetch employee devices
//     const devices = await pool.query(
//       `SELECT expo_push_token FROM user_devices WHERE clerk_user_id = $1`,
//       [clerkUserId],
//     );

//     if (devices.rows.length === 0) {
//       console.warn("⚠️ No device registered for clerk_user_id:", clerkUserId);
//     }

//     console.log("📲 Sending to tokens:", devices.rows);

//     // 3️⃣ Prepare notifications
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

//     // 4️⃣ Send notifications
//     if (messages.length > 0) {
//       await expo.sendPushNotificationsAsync(messages);
//     }

//     res.json({ success: true });
//   } catch (err) {
//     console.error("❌ Resolve error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });  // Do not remove this source code because there is the logic of the Employee app Notification.

// app.post("/api/complaints/:id/resolve", async (req, res) => {
//   try {
//     const complaintId = req.params.id;
//     const { remarks } = req.body; // 🟢 Captured from the frontend TextInput

//     // 1️⃣ Update complaint with status and remarks
//     const result = await pool.query(
//       `UPDATE complaints 
//        SET status = 'Resolved', admin_remarks = $1 
//        WHERE id = $2 
//        RETURNING clerk_user_id`,
//       [remarks || null, complaintId]
//     );

//     if (result.rowCount === 0) {
//       return res.status(404).json({ error: "Complaint not found" });
//     }

//     const clerkUserId = result.rows[0].clerk_user_id;

//     // 2️⃣ Fetch employee devices
//     const devices = await pool.query(
//       `SELECT expo_push_token FROM user_devices WHERE clerk_user_id = $1`,
//       [clerkUserId],
//     );

//     if (devices.rows.length === 0) {
//       console.warn("⚠️ No device registered for clerk_user_id:", clerkUserId);
//     }

//     // 3️⃣ Prepare notifications
//     const messages = devices.rows.map((d) => ({
//       to: d.expo_push_token,
//       sound: "default",
//       title: "Complaint Resolved ✅",
//       body: remarks ? `Resolved: ${remarks}` : "Your complaint has been resolved.", // 🟢 Optional: Include remarks in notification
//       data: {
//         screen: "complaint-details",
//         complaintId,
//       },
//     }));

//     // 4️⃣ Send notifications
//     if (messages.length > 0) {
//       await expo.sendPushNotificationsAsync(messages);
//     }

//     res.json({ success: true, message: "Complaint resolved with remarks" });
//   } catch (err) {
//     console.error("❌ Resolve error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });  // Use this source code if the error is come in the Employee app notificaton 

/* ======================================================
   RESOLVE COMPLAINT ROUTE (With Email & Push Notification)
====================================================== */
app.post("/api/complaints/:id/resolve", async (req, res) => {
  try {
    const complaintId = req.params.id;
    const { remarks } = req.body; 

    // 🟢 1. UPDATE DB: Changed "RETURNING clerk_user_id" to "RETURNING *"
    // This fetches the email, name, and details needed for the email template.
    const result = await pool.query(
      `UPDATE complaints 
       SET status = 'Resolved', admin_remarks = $1 
       WHERE id = $2 
       RETURNING *`, 
      [remarks || null, complaintId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    // 🟢 Now we have the full complaint object!
    const complaint = result.rows[0]; 
    const clerkUserId = complaint.clerk_user_id;

    // 🟢 2. EMAIL NOTIFICATION (New Addition)
    if (complaint.submitter_email) {
      try {
        const htmlContent = getResolvedTemplate({
          email: complaint.submitter_email,
          name: complaint.submitter_name,
          detail: complaint.complain_detail,
          remarks: remarks, 
          location: complaint.complain_location
        });

        // Send email (no await, so it doesn't slow down the response)
        await sendEmail(complaint.submitter_email, "Complaint Resolved", htmlContent);
        console.log(`📧 Resolved email sent to: ${complaint.submitter_email}`);
      } catch (emailErr) {
        console.error("⚠️ Email failed:", emailErr);
      }
    }

    // 3️⃣ FETCH DEVICES (Existing Push Notification Logic)
    const devices = await pool.query(
      `SELECT expo_push_token FROM user_devices WHERE clerk_user_id = $1`,
      [clerkUserId],
    );

    if (devices.rows.length === 0) {
      console.warn("⚠️ No device registered for clerk_user_id:", clerkUserId);
    }

    // 4️⃣ PREPARE PUSH NOTIFICATIONS
    const messages = devices.rows.map((d) => ({
      to: d.expo_push_token,
      sound: "default",
      title: "Complaint Resolved ✅",
      body: remarks ? `Resolved: ${remarks}` : "Your complaint has been resolved.",
      data: {
        screen: "complaint-details",
        complaintId,
      },
    }));

    // 5️⃣ SEND PUSH NOTIFICATIONS
    if (messages.length > 0) {
      await expo.sendPushNotificationsAsync(messages);
    }

    res.json({ success: true, message: "Complaint resolved with remarks" });
  } catch (err) {
    console.error("❌ Resolve error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

app.post("/api/admin/devices/register", async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;

    // 1. Validation
    if (!email || !expoPushToken) {
      return res.status(400).json({ error: "Missing email or token" });
    }

    // 2. Check credentials (from your hardcoded list)
    const isValidAdmin = ADMIN_USERS.some(
      (admin) => admin.email === email && admin.password === password,
    );

    if (!isValidAdmin) {
      return res.status(401).json({ error: "Unauthorized admin credentials" });
    }

    // 3. Database Operation with error handling
    const result = await pool.query(
      `INSERT INTO admin_devices (email, expo_push_token, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (expo_push_token) 
       DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()
       RETURNING *`,
      [email, expoPushToken],
    );

    res.json({ success: true, device: result.rows[0] });
  } catch (error) {
    console.error("❌ Registration error:", error.message);
    // Send the error message back to see it in Vercel logs
    res
      .status(500)
      .json({ error: "Database registration failed", details: error.message });
  }
});

/* =========================
   ADMIN: ANALYTICS REPORTS
========================= */

/* =========================
   ADMIN: ANALYTICS REPORTS
========================= */
// app.get("/api/admin/reports", adminAuth, async (req, res) => {
//   try {
//     const { startDate, endDate } = req.query;

//     // 1. Summary Stats (Total, High Priority, Status counts)
//     const summary = await pool.query(
//       `SELECT 
//   COUNT(*) as total,
//   COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
//   COUNT(*) FILTER (WHERE status = 'Pending') as pending,
//   COUNT(*) FILTER (WHERE priority = 'High') as high_priority,
//   COUNT(*) FILTER (WHERE priority = 'Medium') as medium_priority,
//   COUNT(*) FILTER (WHERE priority = 'Low') as low_priority
// FROM complaints 
// WHERE created_at::date BETWEEN $1 AND $2`,
//       [startDate, endDate],
//     );

//     // 2. ADVANCED: Full Department Breakdown
//     const deptStats = await pool.query(
//       `SELECT 
//         department, 
//         COUNT(*) as total,
//         COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
//         COUNT(*) FILTER (WHERE priority = 'High') as high_priority
//        FROM complaints 
//        WHERE created_at::date BETWEEN $1 AND $2
//        GROUP BY department
//        ORDER BY total DESC`,
//       [startDate, endDate],
//     );

//     res.json({
//       summary: summary.rows[0],
//       deptStats: deptStats.rows,
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.get("/api/admin/reports", adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    let queryParams = [startDate, endDate];
    let filterClause = "WHERE created_at::date BETWEEN $1 AND $2";

    // 🟢 Add department filter if selected
    if (department && department !== 'All') {
      filterClause += " AND department = $3";
      queryParams.push(department);
    }

    const summary = await pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending,
        COUNT(*) FILTER (WHERE priority = 'High') as high_priority,
        COUNT(*) FILTER (WHERE priority = 'Medium') as medium_priority,
        COUNT(*) FILTER (WHERE priority = 'Low') as low_priority
       FROM complaints ${filterClause}`,
      queryParams
    );

    const deptStats = await pool.query(
      `SELECT department, COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'Resolved') as resolved
       FROM complaints ${filterClause}
       GROUP BY department ORDER BY total DESC`,
      queryParams
    );

    res.json({
      summary: summary.rows[0],
      deptStats: deptStats.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/* =========================
   ADMIN COMPLAINT DETAILS
========================= */
// app.get("/api/admin/complaints/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

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
//         created_at,
//         submitter_name,
//          submitter_email
//       FROM complaints
//       WHERE id = $1
//       `,
//       [id],
//     );

//     if (!result.rows.length) {
//       return res.status(404).json({ error: "Complaint not found" });
//     }

//     res.json({ complaint: result.rows[0] });
//   } catch (err) {
//     console.error("❌ Admin complaint details error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

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
        submitter_email,
        admin_remarks -- 🟢 FIXED: Added this column to show saved remarks
      FROM complaints
      WHERE id = $1
      `,
      [id],
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
    `📱 WhatsApp From: ${process.env.TWILIO_WHATSAPP_FROM || "❌ Not set"}`,
  );
  console.log(
    `📱 Manager WhatsApp: ${process.env.MANAGER_WHATSAPP || "❌ Not set"}`,
  );
  console.log("🚀 ================================\n");
});
