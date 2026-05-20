import express from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { Expo } from "expo-server-sdk";
import { sendEmail } from "../utils/emailService.js";
import { getNewComplaintTemplate } from "../utils/emailTemplates.js";
import { google } from "googleapis";
import stream from "stream";
import multer from "multer";

const router = express.Router();
const expo = new Expo();

// Set up Multer to keep the image in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

// 🟢 Authenticate your Google Bot
const KEYFILEPATH = "./google-credentials.json"; // Path to your downloaded JSON file
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    // The replace function fixes the line breaks that environment variables sometimes mess up
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});

const driveService = google.drive({ version: "v3", auth });
const GOOGLE_DRIVE_FOLDER_ID = "0AINzSmTfk3w3Uk9PVA"; // From Phase 2

// SUBMIT COMPLAINT
// router.post("/complaints", requireAuth(), async (req, res) => {
//   try {
//     const userId = req.auth.userId;
//     const {
//       submitter_name,
//       submitter_email,
//       department,
//       assets,
//       complain_detail,
//       complain_location,
//       to_whom,
//       priority,
//       image_url,
//     } = req.body;

//     const result = await pool.query(
//       `INSERT INTO complaints (
//         firebase_uid, 
//         submitter_name, 
//         submitter_email, 
//         department, 
//         assets, 
//         complain_detail, 
//         complain_location, 
//         to_whom, 
//         priority, 
//         status, 
//         image_url
//       ) 
//       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'Pending', $10) 
//       RETURNING *`,
//       [
//         userId, // $1: firebase_uid
//         submitter_name?.trim() || "Anonymous", // $2: submitter_name
//         submitter_email || null, // $3: submitter_email
//         department, // $4: department
//         JSON.stringify(assets || []), // $5: assets
//         complain_detail, // $6: complain_detail
//         complain_location || null, // $7: complain_location
//         to_whom || null, // $8: to_whom
//         priority || "Medium", // $9: priority
//         image_url || null, // $10: image_url
//       ],
//     );

//     const complaint = result.rows[0];

//     // Email Logic
//     try {
//       const htmlContent = getNewComplaintTemplate({
//         email: req.body.submitter_email,
//         name: req.body.submitter_name,
//         department: req.body.department,
//         detail: req.body.complain_detail,
//         location: req.body.complain_location,
//         to_whom: req.body.to_whom,
//         priority: req.body.priority,
//         assets: JSON.stringify(req.body.assets || []),
//       });
//       // Send email (no await to prevent blocking)
//       sendEmail(
//         "Itsupport@gujaratinfotech.com",
//         "New Complaint Received",
//         htmlContent,
//       );
//     } catch (e) {
//       console.error("Email failed", e);
//     }

//     // Push Notification Logic
//     try {
//       const adminDevices = await pool.query(
//         "SELECT expo_push_token FROM admin_devices",
//       );
//       const messages = [];

//       for (const device of adminDevices.rows) {
//         if (!Expo.isExpoPushToken(device.expo_push_token)) continue;

//         messages.push({
//           to: device.expo_push_token,
//           sound: "default",
//           title: "🚨 New Complaint Received",
//           body: `New ${complaint.priority} priority task for ${complaint.department}.`,
//           data: { complaintId: complaint.id, screen: "admin-details" },
//         });
//       }

//       if (messages.length > 0) {
//         await expo.sendPushNotificationsAsync(messages);
//         console.log(`✅ Sent ${messages.length} notifications to Admins`);
//       }
//     } catch (error) {
//       console.error("❌ Notification Error:", notifError);
//     }

//     // Gupshup Logic
// //     if (process.env.GUPSHUP_API_KEY && process.env.MANAGER_WHATSAPP) {
// //       try {
// //         // 🟢 Build the dynamic message content
// //         const complaintText = `
// // 🆕 *New Complaint Received*
// // *Name*: ${submitter_name}
// // *Email*: ${submitter_email}
// // *Department:* ${department}
// // *Priority:* ${priority || "Medium"}
// // *Issue:* ${complain_detail}
// // *Location:* ${complain_location || "N/A"}
// //     `.trim();

// //         const messagePayload = {
// //           type: "text",
// //           text: complaintText,
// //         };

// //         // 🟢 Set up the URL-encoded parameters
// //         const params = new URLSearchParams();
// //         params.append("channel", "whatsapp");
// //         params.append("source", "917834811114"); // Gupshup Sandbox Number
// //         params.append("destination", process.env.MANAGER_WHATSAPP); // e.g., 918347039945
// //         params.append("message", JSON.stringify(messagePayload));
// //         params.append("src.name", "cmsttee"); // Your App Name

// //         // 🟢 Send the POST request to Gupshup API
// //         const response = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
// //           method: "POST",
// //           headers: {
// //             "Content-Type": "application/x-www-form-urlencoded",
// //             apikey: process.env.GUPSHUP_API_KEY,
// //           },
// //           body: params,
// //         });

// //         const data = await response.json();

// //         if (response.ok && data.status === "submitted") {
// //           console.log(
// //             "✅ Gupshup notification sent successfully. ID:",
// //             data.messageId,
// //           );
// //         } else {
// //           console.error("❌ Gupshup API Error:", data);
// //         }
// //       } catch (error) {
// //         console.error("❌ Gupshup Integration Failed:", error.message);
// //       }
// //     }

//     res
//       .status(201)
//       .json({ success: true, id: complaint.id, status: complaint.status });
//   } catch (err) {
//     console.error("Submit error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

router.post("/complaints", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      submitter_name,
      submitter_email,
      department,
      assets,
      complain_detail,
      complain_location,
      to_whom,
      priority,
      image_url,
    } = req.body;

    // Database Insert Logic
    const result = await pool.query(
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
        userId, // $1
        submitter_name?.trim() || "Anonymous", // $2
        submitter_email || null, // $3
        department, // $4
        JSON.stringify(assets || []), // $5
        complain_detail, // $6
        complain_location || null, // $7
        to_whom || null, // $8
        priority || "Medium", // $9
        image_url || null, // $10
      ],
    );

    const complaint = result.rows[0];

    // Email Logic
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
      await sendEmail(
        "Itsupport@gujaratinfotech.com",
        "New Complaint Received",
        htmlContent,
      );
    } catch (e) {
      console.error("Email failed", e);
    }

    // Push Notification Logic
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

    // 🟢 NEW: n8n WhatsApp Alert Logic
    try {
      sendN8nWhatsAppAlert({
        name: submitter_name,
        email: submitter_email,
        department: department,
        priority: priority,
        detail: complain_detail,
        location: complain_location
      });
    } catch (e) {
      console.error("❌ n8n WhatsApp trigger failed", e);
    }

    res
      .status(201)
      .json({ success: true, id: complaint.id, status: complaint.status });
  } catch (err) {
    console.error("Submit error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// GET MY COMPLAINTS
router.get("/complaints", requireAuth(), async (req, res) => {
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

// GET COMPLAINT DETAILS
router.get("/complaints/:id", requireAuth(), async (req, res) => {
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

// REGISTER DEVICE
router.post("/devices/register", requireAuth(), async (req, res) => {
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
  } catch (error) {
    console.error("❌ DB Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST: Submit Daily Report
// router.post("/daily-reports", requireAuth(), async (req, res) => {
//   try {
//     const userId = req.auth.userId;
//     const { employee_name, work_details } = req.body;
//     const employee_email = req.userEmail; // Safely pulled from Firebase token!

//     if (!work_details) {
//       return res.status(400).json({ error: "Work details are required" });
//     }

//     const result = await pool.query(
//       `INSERT INTO daily_reports (firebase_uid, employee_name, employee_email, work_details) 
//        VALUES ($1, $2, $3, $4) RETURNING *`,
//       [userId, employee_name || "Employee", employee_email, work_details],
//     );

//     res.status(201).json({ success: true, report: result.rows[0] });
//   } catch (err) {
//     console.error("Daily Report Submit Error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

router.post("/daily-reports", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { employee_name, work_details } = req.body;
    const employee_email = req.userEmail; // Safely pulled from Firebase token!

    if (!work_details) {
      return res.status(400).json({ error: "Work details are required" });
    }

    const result = await pool.query(
      `INSERT INTO daily_reports (firebase_uid, employee_name, employee_email, work_details) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, employee_name || "Employee", employee_email, work_details],
    );

    const report = result.rows[0];

    // 🟢 NEW: Push Notification Logic
    try {
      const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
      const messages = [];

      for (const device of adminDevices.rows) {
        if (!Expo.isExpoPushToken(device.expo_push_token)) continue;

        messages.push({
          to: device.expo_push_token,
          sound: "default",
          title: "📄 New Daily Report",
          body: `A new daily report was submitted by ${employee_name || "Employee"}.`,
          data: { id: report.id, screen: "daily-report-details" },
        });
      }

      if (messages.length > 0) {
        await expo.sendPushNotificationsAsync(messages);
        console.log(`✅ Sent ${messages.length} Daily Report notifications to Admins`);
      }
    } catch (notifError) {
      console.error("❌ Notification Error:", notifError);
    }

    res.status(201).json({ success: true, report: report });
  } catch (err) {
    console.error("Daily Report Submit Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// GET: Employee Daily Reports History
// GET: Employee Daily Reports History
router.get("/daily-reports", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    // 🟢 FIX: We added "AT TIME ZONE 'UTC'" to the created_at column.
    // This forces Postgres to attach the exact global timezone so your local laptop doesn't misread it!
    const result = await pool.query(
      `SELECT id, work_details, created_at AT TIME ZONE 'UTC' as created_at 
       FROM daily_reports 
       WHERE firebase_uid = $1 
       ORDER BY created_at DESC`,
      [userId],
    );

    res.json({ reports: result.rows });
  } catch (err) {
    console.error("Fetch Daily Reports Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// POST: Submit a stationery request (with transactional line items)
// router.post("/stationery-requests", requireAuth(), async (req, res) => {
//   let client;
//   try {
//     client = await pool.connect();
//     await client.query("BEGIN"); // 🟢 Start transactional commit

//     const userId = req.auth.userId;
//     const { items, employee_name } = req.body; // Array of { name, quantity }
//     const employee_email = req.userEmail;

//     if (!items || items.length === 0) {
//       await client.query("ROLLBACK"); // Cancel if no items
//       return res.status(400).json({ error: "At least one item is required." });
//     }

//     // 1. Create the main request entry
//     const requestResult = await client.query(
//       `INSERT INTO stationery_requests (firebase_uid, employee_name, employee_email)
//        VALUES ($1, $2, $3) RETURNING id`,
//       [userId, employee_name, employee_email],
//     );
//     const requestId = requestResult.rows[0].id;

//     // 2. Insert all the items for this request
//     const itemQueries = items.map((item) =>
//       client.query(
//         `INSERT INTO stationery_request_items (request_id, item_name, quantity) 
//            VALUES ($1, $2, $3)`,
//         [requestId, item.name, parseInt(item.quantity)],
//       ),
//     );
//     await Promise.all(itemQueries); // Run all item inserts

//     await client.query("COMMIT"); // 🟢 Securely save all changes
//     res.status(201).json({ success: true, requestId });
//   } catch (err) {
//     if (client) await client.query("ROLLBACK"); // Abort on any error
//     console.error("Stationery Request Error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   } finally {
//     if (client) client.release();
//   }
// });

router.post("/stationery-requests", requireAuth(), async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN"); // 🟢 Start transactional commit

    const userId = req.auth.userId;
    const { items, employee_name } = req.body; // Array of { name, quantity }
    const employee_email = req.userEmail;

    if (!items || items.length === 0) {
      await client.query("ROLLBACK"); // Cancel if no items
      return res.status(400).json({ error: "At least one item is required." });
    }

    // 1. Create the main request entry
    const requestResult = await client.query(
      `INSERT INTO stationery_requests (firebase_uid, employee_name, employee_email)
       VALUES ($1, $2, $3) RETURNING id`,
      [userId, employee_name, employee_email],
    );
    const requestId = requestResult.rows[0].id;

    // 2. Insert all the items for this request
    const itemQueries = items.map((item) =>
      client.query(
        `INSERT INTO stationery_request_items (request_id, item_name, quantity) 
            VALUES ($1, $2, $3)`,
        [requestId, item.name, parseInt(item.quantity)],
      ),
    );
    await Promise.all(itemQueries); // Run all item inserts

    await client.query("COMMIT"); // 🟢 Securely save all changes

    // 🟢 NEW: Push Notification Logic
    try {
      const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
      const messages = [];

      for (const device of adminDevices.rows) {
        if (!Expo.isExpoPushToken(device.expo_push_token)) continue;

        messages.push({
          to: device.expo_push_token,
          sound: "default",
          title: "✏️ New Stationery Request",
          body: `A new stationery form was filled by ${employee_name || "Employee"}.`,
          data: { id: requestId, screen: "stationery-details" },
        });
      }

      if (messages.length > 0) {
        await expo.sendPushNotificationsAsync(messages);
        console.log(`✅ Sent ${messages.length} Stationery notifications to Admins`);
      }
    } catch (notifError) {
      console.error("❌ Notification Error:", notifError);
    }

    res.status(201).json({ success: true, requestId });
  } catch (err) {
    if (client) await client.query("ROLLBACK"); // Abort on any error
    console.error("Stationery Request Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  } finally {
    if (client) client.release();
  }
});

// GET: Fetch Stationery Request History for an Employee
// GET: Fetch Stationery Request History for an Employee
router.get("/stationery-requests", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    // 🟢 FIX: We use TO_CHAR to force Postgres to output a strict ISO-8601 UTC string.
    // This stops Node.js from "guessing" the timezone and messing it up before it reaches the phone.
    const result = await pool.query(
      `SELECT r.id, TO_CHAR(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at, r.status, 
                ARRAY_AGG(JSON_BUILD_OBJECT('name', i.item_name, 'quantity', i.quantity)) AS items
         FROM stationery_requests r
         JOIN stationery_request_items i ON r.id = i.request_id
         WHERE r.firebase_uid = $1
         GROUP BY r.id, r.created_at, r.status
         ORDER BY r.created_at DESC`,
      [userId],
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error("Fetch Stationery History Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// POST: Submit a Mobile Recharge Request
// router.post("/mob-recharges", requireAuth(), async (req, res) => {
//   try {
//     const userId = req.auth.userId;
//     const employee_email = req.userEmail;
    
//     // Grabbing all the fields sent from the phone app
//     const { 
//       employee_name, mobile_no, operator, recharge_amount, 
//       department, approved_by_hr, last_recharge_date 
//     } = req.body;

//     if (!mobile_no || !recharge_amount) {
//       return res.status(400).json({ error: "Mobile number and amount are required" });
//     }

//     const result = await pool.query(
//       `INSERT INTO mob_recharge_requests 
//         (firebase_uid, employee_name, employee_email, mobile_no, operator, recharge_amount, department, approved_by_hr, last_recharge_date) 
//        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
//       [userId, employee_name, employee_email, mobile_no, operator, recharge_amount, department, approved_by_hr, last_recharge_date]
//     );

//     // 🟢 FIRE THE WHATSAPP ALERT AUTOMATICALLY
//     // Pass the destination phone number and the exact message you want them to see
//     const alertMessage = `New Mobile Recharge Request!\nEmployee: ${employee_name}\nAmount: ₹${recharge_amount}`;
    
//     // Replace with your verified Meta test phone number (e.g., "919876543210")
//     await sendN8nWhatsAppAlert("918347039945", alertMessage);

//     res.status(201).json({ success: true, requestId: result.rows[0].id });

    
//   } catch (err) {
//     console.error("Mob Recharge Submit Error:", err);
//     res.status(500).json({ error: "internal_server_error" });
//   }
// });

router.post("/mob-recharges", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const employee_email = req.userEmail;
    
    // Grabbing all the fields sent from the phone app
    const { 
      employee_name, mobile_no, operator, recharge_amount, 
      department, approved_by_hr, last_recharge_date 
    } = req.body;

    if (!mobile_no || !recharge_amount) {
      return res.status(400).json({ error: "Mobile number and amount are required" });
    }

    const result = await pool.query(
      `INSERT INTO mob_recharge_requests 
        (firebase_uid, employee_name, employee_email, mobile_no, operator, recharge_amount, department, approved_by_hr, last_recharge_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [userId, employee_name, employee_email, mobile_no, operator, recharge_amount, department, approved_by_hr, last_recharge_date]
    );

    const requestId = result.rows[0].id;

    // 🟢 FIRE THE WHATSAPP ALERT AUTOMATICALLY
    const alertMessage = `New Mobile Recharge Request!\nEmployee: ${employee_name}\nAmount: ₹${recharge_amount}`;
    
    try {
      await sendN8nWhatsAppAlert("918347039945", alertMessage);
    } catch (whatsappError) {
      console.error("WhatsApp trigger failed:", whatsappError);
    }

    // 🟢 NEW: Push Notification Logic
    try {
      const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
      const messages = [];

      for (const device of adminDevices.rows) {
        if (!Expo.isExpoPushToken(device.expo_push_token)) continue;

        messages.push({
          to: device.expo_push_token,
          sound: "default",
          title: "📱 Mobile Recharge Request",
          body: `A new mobile recharge form was filled for ${employee_name || "Employee"}.`,
          data: { id: requestId, screen: "recharge-details" },
        });
      }

      if (messages.length > 0) {
        await expo.sendPushNotificationsAsync(messages);
        console.log(`✅ Sent ${messages.length} Mob Recharge notifications to Admins`);
      }
    } catch (notifError) {
      console.error("❌ Notification Error:", notifError);
    }

    res.status(201).json({ success: true, requestId: requestId });

  } catch (err) {
    console.error("Mob Recharge Submit Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// GET: Fetch Mobile Recharge History (With bulletproof Timezone fix!)
router.get("/mob-recharges", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    const result = await pool.query(
      `SELECT id, mobile_no, operator, recharge_amount, status, 
              TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at 
       FROM mob_recharge_requests 
       WHERE firebase_uid = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error("Fetch Mob Recharge Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// 🟢 The secure n8n Webhook Caller
async function sendN8nWhatsAppAlert(data) {
  const N8N_WEBHOOK_URL = "https://somatopleuric-wynona-leonine.ngrok-free.dev/webhook/3ed71335-4d3b-45a6-9587-8df9743d0cf8";
  // const N8N_WEBHOOK_URL = "https://somatopleuric-wynona-leonine.ngrok-free.dev/webhook-test/3ed71335-4d3b-45a6-9587-8df9743d0cf8";

  try {
    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: data.name || "Unknown",
        email: data.email || "No Email",
        department: data.department || "General",
        priority: data.priority || "Medium",
        issue: data.detail || "No details provided",
        location: data.location || "Not specified"
      }),
    });
    console.log("WhatsApp alert payload sent to n8n!");
  } catch (webhookerror) {
    console.error("Error triggering WhatsApp:", webhookerror);
  }
}

router.post("/upload-image", upload.single("image"), async(req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    // Convert the image buffer into a readable stream for Google Drive
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    // 1. Upload the file to Google Drive
    const { data } = await driveService.files.create({
      media: {
        mimeType: req.file.mimetype,
        body: bufferStream,
      },
      requestBody: {
        name: `complaint_${Date.now()}_${req.file.originalname}`,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
      fields: "id",
      supportsAllDrives: true
    });

    // 2. Make the file readable so the Admin App can display it
    await driveService.permissions.create({
      fileId: data.id,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true
    });

    // 3. Generate the magic direct-display URL
    const directImageUrl = `https://drive.google.com/uc?id=${data.id}`;

    // Send this URL back to save in your Neon database!
    res.json({ success: true, imageUrl: directImageUrl });
  } catch (error) {
    console.error("Google Drive Upload Error:", error);
    res.status(500).json({ error: "Failed to upload image to Drive" });
  }
})

router.post("/send-quotation", upload.single("pdfDoc"), async (req ,res) => {
  try {
    const { clientName, address, model, size, qty, unitPrice, totalPrice } = req.body;
    const pdfFile = req.file;

    if (!pdfFile) {
      return res.status(400).json({ error: "No PDF file received" });
    }

    // 1. Setup the Email Details
    // Replace this with your Sir's actual email, or put it in your .env file!
    const managerEmail = process.env.MANAGER_EMAIL || "itsupport@gujaratinfotech.com"; 
    const subject = `New Quotation Generated: ${clientName}`;

    // 2. Format a professional HTML Email body
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">
          New Quotation Alert
        </h2>
        <p style="font-size: 16px;">Hello Bhargav Sir,</p>
        <p style="font-size: 15px;">
          A new BenQ Interactive Panel quotation has just been generated for <strong>${clientName}</strong>.
        </p>
        <p style="font-size: 15px;">
          Please find the official Purchase Order document attached to this email for your review.
        </p>
        <br/>
        <p style="font-size: 14px; color: #555;">
          Best regards,<br/>
          <strong>GIL IT Support App (CMS)</strong>
        </p>
      </div>
    `;

    // 3. Package the PDF Attachment
    const attachments = [
      {
        filename: decodeURIComponent(pdfFile.originalname), // This will be "BenQ Po 05-05-2026.pdf"
        content: pdfFile.buffer,        // The raw file data
        contentType: "application/pdf",
      },
    ];

    // 4. Send the email using your updated service!
    await sendEmail(managerEmail, subject, htmlContent, attachments);

    // 🟢 3. SAVE TO NEON DATABASE
    const insertQuery = `
      INSERT INTO quotations (customer_name, address, model, size, quantity, unit_price, total_price, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
    `;
    const values = [clientName, address, model, size, qty, unitPrice, totalPrice];
    
    await pool.query(insertQuery, values);

    // 5. Send success response back to the mobile app
    res.status(200).json({ success: true, message: "Email sent & Data Saved!" });
  } catch (error) {
    console.error("Error sending quotation:", error);
    res.status(500).json({ success: false, error: "Failed to send quotation email" });
  }
})

export default router;
