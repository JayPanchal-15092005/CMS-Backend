// import express from "express";

// const router = express.Router();
// const complaintController = require('../controllers/complaintController');

// // Complaint routes
// router.post('/complaints', complaintController.createComplaint);
// router.get('/complaints', complaintController.getAllComplaints);
// router.get('/complaints/statistics', complaintController.getStatistics);
// router.get('/complaints/:id', complaintController.getComplaintById);
// router.put('/complaints/:id', complaintController.updateComplaint);
// router.delete('/complaints/:id', complaintController.deleteComplaint);

// export default router;

// src/routes/complaints.js
import express from "express";
import { pool } from "../config/database.js";
import { requireClerk } from "../middleware/requireClerk.js"; // adapt path

const router = express.Router();

router.post("/", requireClerk, async (req, res) => {
  try {
    const {
      submitter_name,
      submitter_email,
      department,
      assets,
      complain_detail,
      complain_location,
      to_whom,
      priority,
      send_copy
    } = req.body;

    if (!department || !complain_detail) {
      return res.status(400).json({ error: "department and complain_detail are required" });
    }

    const query = `
      INSERT INTO complaints
        (submitter_name, submitter_email, department, assets, complain_detail, complain_location, to_whom, priority, send_copy, user_id, meta)
      VALUES
        ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING id, created_at;
    `;
    const meta = { ip: req.ip, userAgent: req.get("User-Agent") };

    // use req.userId (DB user id) — if webhook hasn't created user yet, userId may be null
    const values = [
      submitter_name || null,
      submitter_email || null,
      department,
      JSON.stringify(assets || []),
      complain_detail,
      complain_location || null,
      to_whom || null,
      priority || null,
      !!send_copy,
      req.userId || null,
      JSON.stringify(meta)
    ];

    const { rows } = await pool.query(query, values);
    return res.status(201).json({
      success: true,
      id: rows[0].id,
      created_at: rows[0].created_at,
      clerk_user_id: req.clerkUserId || null
    });
  } catch (err) {
    console.error("Insert complaint error", err);
    return res.status(500).json({ error: "internal_server_error" });
  }
});

export default router;
