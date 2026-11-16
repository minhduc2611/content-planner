import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// node-postgres lets ?sslmode in the URL override our ssl settings, so we read it and pass TLS options ourselves
const dbUrl = new URL(process.env.DATABASE_URL);
const sslmode = dbUrl.searchParams.get('sslmode');
dbUrl.searchParams.delete('sslmode');
let ssl = false;
if (process.env.DATABASE_CA_CERT) ssl = { ca: process.env.DATABASE_CA_CERT }; // encrypted + server identity verified
else if (sslmode && sslmode !== 'disable') {
  console.warn('DATABASE_CA_CERT not set: database traffic is encrypted but the server certificate is not verified');
  ssl = { rejectUnauthorized: false };
}
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl.toString(), ssl }) });
