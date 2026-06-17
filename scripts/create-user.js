const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin1234', 10);
  const user = await prisma.user.create({
    data: {
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      password: hash,
      role: 'super_admin'
    }
  });
  console.log('✓ Created:', user.username, '/ admin1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());