import { prisma } from "../src/db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- user@example.com");
  process.exit(1);
}

const result = await prisma.user.updateMany({
  where: { email },
  data: { role: "ADMIN" },
});
console.log(result.count === 1 ? `${email} is now ADMIN` : "No user with that email");
await prisma.$disconnect();