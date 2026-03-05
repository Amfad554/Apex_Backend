// backend/seedAdmin.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const adminUsername = "admin_apex"; 
  const adminPassword = "SuperSecretPassword123"; 
  
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  // Use superAdmin (camelCase) to match Prisma's generation rules
  const admin = await prisma.superAdmin.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      passwordHash: hashedPassword,
    },
  });

  console.log("✅ Super Admin created/verified:", admin.username);
}

main()
  .catch((e) => {
    console.error("❌ Seed Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });