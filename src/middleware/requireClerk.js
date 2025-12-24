// src/middleware/requireClerk.js
import fetch from "node-fetch";
import { pool } from "../config/database.js";

const CLERK_API_BASE = "https://api.clerk.com";
const CLERK_API_KEY = process.env.CLERK_API_KEY;

export async function requireClerk(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "missing_token" });
    const token = auth.split(" ")[1];

    // Try to verify session token with Clerk - endpoint may vary by Clerk version.
    // Some Clerk accounts have `POST /v1/sessions/token/verify` or similar.
    // We'll use a safe fallback: call Clerk's "verify session" by passing token to the sessions endpoint.
    // If your Clerk account requires a different verify flow, replace with Clerk SDK verify.

    const verifyUrl = `${CLERK_API_BASE}/v1/sessions/verify`;
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CLERK_API_KEY}` // server key
      },
      body: JSON.stringify({ token })
    });

    if (response.ok) {
      const payload = await response.json();
      // payload should include user_id or user object
      const clerkUserId = payload?.user_id || payload?.user?.id || payload?.userId;
      if (!clerkUserId) {
        console.warn("Clerk verify returned no user id", payload);
        return res.status(401).json({ error: "invalid_session" });
      }
      // find the local user id by clerk_user_id
      const query = "SELECT id FROM users WHERE clerk_user_id=$1 LIMIT 1";
      const { rows } = await pool.query(query, [clerkUserId]);
      const dbUserId = rows[0]?.id || null;
      req.clerkUserId = clerkUserId;
      req.userId = dbUserId;
      next();
      return;
    }

    // if session verify failed, return 401
    const text = await response.text().catch(() => "");
    console.warn("Clerk verify failed", response.status, text);
    return res.status(401).json({ error: "invalid_session" });
  } catch (err) {
    console.error("requireClerk error", err);
    return res.status(500).json({ error: "server_error" });
  }
}
