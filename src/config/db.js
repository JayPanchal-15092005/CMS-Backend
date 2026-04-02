import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

export async function initDatabase() {
  try {
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_devices (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(255) NOT NULL, 
        expo_push_token VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_uid ON user_devices(firebase_uid);
    `);
    console.log("✅ All database tables ready");
  } catch (error) {
    console.error("❌ Database init error:", error);
  }
}