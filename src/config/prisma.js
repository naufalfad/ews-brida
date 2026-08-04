import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Prisma automatically handles connection pooling.
// The connection pool size can be configured in the DATABASE_URL environment variable 
// using the `connection_limit` parameter (e.g., `postgresql://user:pass@host:port/db?connection_limit=10`).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Test connection on startup
try {
  await prisma.$connect();
  console.log('Successfully connected to the PostgreSQL database via Prisma (Connection Pooling Active).');
} catch (error) {
  console.error('Failed to connect to the PostgreSQL database on startup:', error.message);
}

export default prisma;
