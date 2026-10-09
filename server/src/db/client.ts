import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient — satu instance dipakai seluruh app.
let _prisma: PrismaClient | null = null;

export function db(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export async function disconnectDb(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
