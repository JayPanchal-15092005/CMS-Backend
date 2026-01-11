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

    (async () => {
  try {
    const adminDevices = await pool.query("SELECT expo_push_token FROM admin_devices");
    
    const adminMessages = adminDevices.rows.map(admin => ({
      to: admin.expo_push_token,
      sound: "default",
      title: "🚨 New Complaint Received",
      body: `New ${complaint.priority} priority task for ${complaint.department}.`,
      data: { complaintId: complaint.id, screen: "admin-details" },
    }));

    if (adminMessages.length > 0) {
      await expo.sendPushNotificationsAsync(adminMessages);
      console.log("🔔 Admins notified of new complaint");
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