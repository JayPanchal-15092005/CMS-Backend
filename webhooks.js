
import { Pool } from 'pg';
import dotenv from "dotenv"

dotenv.config();

async function testSetup() {
  console.log('\n🧪 TESTING YOUR SETUP\n');
  console.log('==========================================\n');

  // Test 1: Check environment variables
  console.log('📋 Step 1: Checking environment variables...');
  const checks = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SECRET: !!process.env.CLERK_WEBHOOK_SECRET,
  };

  Object.entries(checks).forEach(([key, value]) => {
    console.log(`   ${value ? '✅' : '❌'} ${key}`);
  });

  if (!checks.DATABASE_URL) {
    console.log('\n❌ NEON_DATABASE_URL is missing!');
    console.log('   Add it to your .env file:');
    console.log('   NEON_DATABASE_URL=postgresql://user:pass@host/db\n');
    return;
  }

  if (!checks.CLERK_WEBHOOK_SECRET) {
    console.log('\n⚠️  CLERK_WEBHOOK_SECRET is missing!');
    console.log('   Get it from: https://dashboard.clerk.com');
    console.log('   Go to Webhooks → Your Endpoint → Signing Secret\n');
  }

  // Test 2: Database connection
  console.log('\n📊 Step 2: Testing database connection...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log(`   ✅ Connected! Time: ${result.rows[0].current_time}`);
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    await pool.end();
    return;
  }

  // Test 3: Check tables
  console.log('\n🗄️  Step 3: Checking database tables...');
  try {
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const tableNames = tables.rows.map(r => r.table_name);
    console.log(`   Found ${tableNames.length} tables:`, tableNames);
    
    const requiredTables = ['users', 'complaints'];
    requiredTables.forEach(table => {
      const exists = tableNames.includes(table);
      console.log(`   ${exists ? '✅' : '❌'} ${table} table ${exists ? 'exists' : 'MISSING'}`);
    });

    if (!tableNames.includes('users')) {
      console.log('\n   ❌ Users table is missing! Create it with:');
      console.log(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        clerk_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        profile_image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      `);
    }

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 4: Check users table structure
  console.log('\n🔍 Step 4: Checking users table structure...');
  try {
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    if (columns.rows.length > 0) {
      console.log('   Columns:');
      columns.rows.forEach(col => {
        console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });
    } else {
      console.log('   ❌ Users table not found or has no columns');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 5: Check current users
  console.log('\n👥 Step 5: Checking existing users...');
  try {
    const users = await pool.query('SELECT COUNT(*) as count FROM users');
    const count = users.rows[0].count;
    console.log(`   ${count} user(s) in database`);

    if (count > 0) {
      const sample = await pool.query('SELECT clerk_id, email, first_name, last_name FROM users LIMIT 3');
      console.log('   Sample users:');
      sample.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.clerk_id})`);
      });
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 6: Test insert
  console.log('\n✍️  Step 6: Testing database write...');
  const testClerkId = `test_${Date.now()}`;
  try {
    await pool.query(
      'INSERT INTO users (clerk_id, email, first_name, last_name) VALUES ($1, $2, $3, $4)',
      [testClerkId, 'test@example.com', 'Test', 'User']
    );
    console.log('   ✅ Insert successful');

    // Clean up test user
    await pool.query('DELETE FROM users WHERE clerk_id = $1', [testClerkId]);
    console.log('   ✅ Cleanup successful');
  } catch (error) {
    console.log(`   ❌ Insert failed: ${error.message}`);
  }

  await pool.end();

  // Test 7: Check if server is running
  console.log('\n🌐 Step 7: Checking if server is running...');
  try {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: '/api/test',
      method: 'GET',
      timeout: 3000
    };

    await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        console.log(`   ✅ Server is running (HTTP ${res.statusCode})`);
        resolve();
      });

      req.on('error', (error) => {
        console.log(`   ❌ Server not running: ${error.message}`);
        console.log('   Start it with: node server.js');
        resolve();
      });

      req.on('timeout', () => {
        console.log('   ❌ Server timeout');
        req.destroy();
        resolve();
      });

      req.end();
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Summary
  console.log('\n==========================================');
  console.log('✅ TESTING COMPLETE\n');
  console.log('📝 Next steps:');
  console.log('   1. Make sure all checks above are ✅');
  console.log('   2. Start your server: node server.js');
  console.log('   3. Start ngrok: ngrok http 3000');
  console.log('   4. Update Clerk webhook with ngrok URL');
  console.log('   5. Test sign-up in your mobile app');
  console.log('   6. Check server logs for webhook activity');
  console.log('==========================================\n');
}

testSetup().catch(console.error);