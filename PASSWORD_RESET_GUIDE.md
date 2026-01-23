# Password Reset Guide

## For Users Who Forgot Their Password

If a user (raquel, justin, or yourself) forgets their password, you can reset it from the server.

### Step 1: SSH to the Server

```bash
ssh ubuntu@44.238.21.97
```

(Or use the Lightsail browser console)

### Step 2: Run the Password Reset Command

```bash
cd /home/ubuntu/kh-jobs-api
node -e "
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const username = 'USERNAME_HERE'; // Change this to: arne, raquel, or justin
const newPassword = 'TEMP_PASSWORD_HERE'; // Change this to a temporary password

bcrypt.hash(newPassword, 12, (err, hash) => {
  if (err) throw err;
  pool.query(
    'UPDATE users SET password_hash = \$1 WHERE username = \$2',
    [hash, username],
    (err, result) => {
      if (err) throw err;
      console.log('✅ Password updated for', username);
      pool.end();
    }
  );
});
"
```

### Step 3: What to Change

Replace these two values in the command:
- `USERNAME_HERE` → The username to reset (arne, raquel, or justin)
- `TEMP_PASSWORD_HERE` → A temporary password to give them

### Example

To reset raquel's password to "TempPass123":

```bash
cd /home/ubuntu/kh-jobs-api
node -e "
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

const username = 'raquel';
const newPassword = 'TempPass123';

bcrypt.hash(newPassword, 12, (err, hash) => {
  if (err) throw err;
  pool.query(
    'UPDATE users SET password_hash = \$1 WHERE username = \$2',
    [hash, username],
    (err, result) => {
      if (err) throw err;
      console.log('✅ Password updated for', username);
      pool.end();
    }
  );
});
"
```

### Step 4: Give User Their New Password

Once you see "✅ Password updated for [username]", tell the user:
1. Their new temporary password
2. They should log in at https://jobs.kellihomes.com
3. They should immediately go to "Change Password" and set their own password

---

## Alternative: Easier Reset Script (Future Enhancement)

If you find yourself doing this often, we can create a simple script where you just run:

```bash
./reset-password.sh raquel TempPass123
```

Let me know if you'd like me to create this!

---

## Current User Accounts

| Username | Email |
|----------|-------|
| arne | arne@kellihomes.com |
| raquel | raquel@kellihomes.com |
| justin | justin@kellihomes.com |

All passwords are hashed with bcrypt (12 rounds) in the database for security.
