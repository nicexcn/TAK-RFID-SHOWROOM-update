// Create (or reset) an admin user so you can log in.
//   npm run setup:admin                         → admin / admin1234 (super_admin)
//   node scripts/create-user.js <user> <pass> [role]
// Idempotent: re-running resets that user's password. Change it later in Settings → Account.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const [, , username = "admin", password = "admin1234", role = "super_admin"] = process.argv;

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { username },
    update: { password: hash, role },
    create: { username, firstName: "Admin", lastName: "User", password: hash, role },
  });
  console.log(`✓ ${user.username} ready (role: ${role}) — password: ${password}`);
  console.log("  Log in at /login, then change the password in Settings → Account.");
}

main()
  .catch((e) => { console.error("Failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
