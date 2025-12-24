import { pool, query } from "../config/database.js";

// Create a new complaint
exports.createComplaint = async (req, res) => {
  try {
    const {
      email,
      full_name,
      complaint_type,
      description,
      priority = "Medium",
    } = req.body;

    // Validation
    if (!email || !full_name || !complaint_type || !description) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const validTypes = ["Desktop", "Monitor", "Internet", "Printer"];
    if (!validTypes.includes(complaint_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint type",
      });
    }

    const query = `
      INSERT INTO complaints (email, full_name, complaint_type, description, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [
      email,
      full_name,
      complaint_type,
      description,
      priority,
    ]);

    res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating complaint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create complaint",
      error: error.message,
    });
  }
};

// Get all complaints
exports.getAllComplaints = async (req, res) => {
  try {
    const { status, type, email } = req.query;

    let query = "SELECT * FROM complaints WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND complaint_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (email) {
      query += ` AND email = $${paramIndex}`;
      params.push(email);
      paramIndex++;
    }

    query += " ORDER BY created_at DESC";

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch complaints",
      error: error.message,
    });
  }
};

// Get complaint by ID
exports.getComplaintById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = "SELECT * FROM complaints WHERE id = $1";
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching complaint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch complaint",
      error: error.message,
    });
  }
};

// Update complaint status
exports.updateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, description } = req.body;

    let query = "UPDATE complaints SET";
    const params = [];
    let paramIndex = 1;
    const updates = [];

    if (status) {
      updates.push(` status = $${paramIndex}`);
      params.push(status);
      paramIndex++;

      if (status === "Resolved") {
        updates.push(` resolved_at = CURRENT_TIMESTAMP`);
      }
    }

    if (priority) {
      updates.push(` priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (description) {
      updates.push(` description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    query += updates.join(",") + ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(id);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Complaint updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating complaint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update complaint",
      error: error.message,
    });
  }
};

// Delete complaint
exports.deleteComplaint = async (req, res) => {
  try {
    const { id } = req.params;

    const query = "DELETE FROM complaints WHERE id = $1 RETURNING *";
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Complaint deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting complaint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete complaint",
      error: error.message,
    });
  }
};

// Get statistics
exports.getStatistics = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status = 'Resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed,
        COUNT(CASE WHEN complaint_type = 'Desktop' THEN 1 END) as desktop_complaints,
        COUNT(CASE WHEN complaint_type = 'Monitor' THEN 1 END) as monitor_complaints,
        COUNT(CASE WHEN complaint_type = 'Internet' THEN 1 END) as internet_complaints,
        COUNT(CASE WHEN complaint_type = 'Printer' THEN 1 END) as printer_complaints
      FROM complaints
    `;

    const result = await db.query(statsQuery);

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};
