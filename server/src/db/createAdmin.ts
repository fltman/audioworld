import { hashPassword } from '../lib/auth';
import { upsertUser } from '../models/user';
import { applySchema, pool } from './pool';

/** Bootstrap (or reset) an admin account: `npm run create-admin -- <email> <password>`. */
async function main(): Promise<void> {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters');
    process.exit(1);
  }
  await applySchema();
  const user = await upsertUser(email, await hashPassword(password), 'admin');
  console.log(`Admin ready: ${user.email} (role=${user.role})`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('create-admin failed:', err);
  process.exit(1);
});
