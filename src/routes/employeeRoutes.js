import express from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { Expo } from "expo-server-sdk";
import { sendEmail } from "../utils/emailService.js";
import { getNewComplaintTemplate } from "../utils/emailTemplates.js";

const router = express.Router();
const expo = new Expo();

// SUBMIT COMPLAINT
router.post("/complaints", requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { submitter_name, submitter_email, department, assets, complain_detail, complain_location, to_whom, priority, image_url } = req.body;

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
      sendEmail(
        "Itsupport@gujaratinfotech.com",
        "New Complaint Received",
        htmlContent,
      );
    } catch (e) { console.error("Email failed", e); }

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
    } catch (error) {
      console.error("❌ Notification Error:", notifError);
    }

    // Gupshup Logic
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

    res.status(201).json({ success: true, id: complaint.id, status: complaint.status });
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
      [userId, employee_name || "Employee", employee_email, work_details]
    );

    res.status(201).json({ success: true, report: result.rows[0] });
  } catch (err) {
    console.error("Daily Report Submit Error:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;