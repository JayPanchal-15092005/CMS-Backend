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