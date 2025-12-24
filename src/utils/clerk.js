// src/utils/clerk.js
import fetch from "node-fetch";
import crypto from "crypto";

const CLERK_API_BASE = "https://api.clerk.com"; // Clerk Admin API base
const CLERK_API_KEY = process.env.CLERK_API_KEY;
const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

/**
 * Fetch Clerk user by id using Clerk Admin API and server API key.
 * Returns user object or throws on error.
 */
export async function fetchClerkUser(clerkUserId) {
  if (!CLERK_API_KEY) throw new Error("CLERK_API_KEY not set");
  const url = `${CLERK_API_BASE}/v1/users/${encodeURIComponent(clerkUserId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CLERK_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Clerk Admin API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Verify webhook signature from Clerk.
 * Clerk sends an `Clerk-Signature` header and request body is the raw bytes.
 * This function computes HMAC-SHA256 using your secret and compares.
 * NOTE: validate with actual Clerk doc if their header includes timestamp or different format.
 */
export function verifyClerkWebhookSignature(rawBodyBuffer, headerSignature) {
  if (!WEBHOOK_SECRET) {
    console.warn("No CLERK_WEBHOOK_SECRET configured, webhook signature not verified.");
    return false;
  }
  if (!headerSignature) return false;

  // Clerk webhook signature format may vary; this is a generic HMAC check.
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBodyBuffer).digest("hex");
  // headerSignature might be "t=...,v1=...." - if so you need to parse and compare v1 part
  // If header is simple hex string, this will work.
  if (headerSignature === expected) return true;

  // If Clerk uses a scheme like: t=...,v1=signature, try to parse v1
  const m = /v1=([a-f0-9]+)/i.exec(headerSignature);
  if (m && m[1] === expected) return true;

  return false;
}
