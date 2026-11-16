// Usage: npm run set-role -- someone@example.com admin   (or: user)
import { prisma } from './db.js';

const [email, role] = process.argv.slice(2);
if (!email || !['user', 'admin'].includes(role)) {
  console.error('Usage: npm run set-role -- <email> <user|admin>');
  process.exit(1);
}
const r = await prisma.user.updateMany({ where: { email: email.trim().toLowerCase() }, data: { role } });
console.log(r.count ? `${email} is now ${role}` : `No account with email ${email}`);
await prisma.$disconnect();
process.exit(r.count ? 0 : 1);
