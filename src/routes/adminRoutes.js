import express from "express";
import { pool } from "../config/db.js";
import { adminAuth, ADMIN_USERS } from "../middleware/auth.js";
import { sendEmail } from "../utils/emailService.js";
import { getResolvedTemplate } from "../utils/emailTemplates.js";
import { Expo } from "expo-server-sdk";

const router = express.Router();
const expo = new Expo();

// GET ALL COMPLAINTS
router.get("/complaints", adminAuth, async (req, res) => {
    const result = await pool.query(
    `SELECT id, department, complain_detail, status, created_at
     FROM complaints
     ORDER BY created_at DESC`,
  );
  res.json({ complaints: result.rows });
});

// GET COMPLAINT DETAILS
router.get("/complaints/:id", async (req, res) => {
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

// RESOLVE COMPLAINT
router.post("/complaints/:id/resolve", async (req, res) => {
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

router.post("/devices/register", async (req, res) => {
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
})

// GET REPORTS
router.get("/reports", adminAuth, async (req, res) => {
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

// GET All Daily Reports for Admin
router.get("/daily-reports", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM daily_reports ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching daily reports:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// GET All Stationery Requests with their Items
router.get("/stationery-requests", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sr.*, 
        COALESCE(json_agg(sri.*) FILTER (WHERE sri.id IS NOT NULL), '[]') as items
       FROM stationery_requests sr
       LEFT JOIN stationery_request_items sri ON sr.id = sri.request_id
       GROUP BY sr.id
       ORDER BY sr.created_at DESC`
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching stationery requests:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

// GET All Mobile Recharges for Admin
router.get("/mob-recharges", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM mob_recharge_requests ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching mob recharges:", err);
    res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;