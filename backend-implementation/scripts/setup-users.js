/**
 * Database setup script to create users table and add initial users
 * Run this once: node scripts/setup-users.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database setup...');

    // Create users table
    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100),
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);
    console.log('✓ Users table created');

    // Check if users already exist
    const existingUsers = await client.query('SELECT COUNT(*) FROM users');
    if (existingUsers.rows[0].count > 0) {
      console.log('⚠ Users already exist in database. Skipping user creation.');
      console.log('If you want to reset passwords, delete users manually first.');
      return;
    }

    // Create initial users with hashed passwords
    console.log('Creating initial users...');

    const users = [
      {
        username: 'arne',
        password: '$yd3JAC9',
        fullName: 'Arne Gaenz',
        email: 'arne@kellihomes.com'
      },
      {
        username: 'raquel',
        password: 'elizabeth1',
        fullName: 'Raquel',
        email: 'raquel@kellihomes.com'
      },
      {
        username: 'justin',
        password: 'Aryna2026',
        fullName: 'Justin',
        email: 'justin@kellihomes.com'
      }
    ];

    const SALT_ROUNDS = 12;

    for (const user of users) {
      console.log(`Hashing password for ${user.username}...`);
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

      await client.query(
        `INSERT INTO users (username, password_hash, full_name, email)
         VALUES ($1, $2, $3, $4)`,
        [user.username.toLowerCase(), passwordHash, user.fullName, user.email]
      );

      console.log(`✓ Created user: ${user.username}`);
    }

    console.log('\n✅ Database setup complete!');
    console.log('\nInitial users:');
    users.forEach(u => {
      console.log(`  - ${u.username} / ${u.password}`);
    });
    console.log('\n⚠ IMPORTANT: Users should change their passwords after first login!');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run setup
setupDatabase()
  .then(() => {
    console.log('\nSetup completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nSetup failed:', error.message);
    process.exit(1);
  });
