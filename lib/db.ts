import "server-only";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & { cliqoPool?: Pool };

export function getDb() {
  const connectionString = process.env.CLIQO_DATABASE_URL;
  if (!connectionString) throw new Error("CLIQO_DATABASE_URL is missing.");
  if (!globalForDb.cliqoPool) {
    globalForDb.cliqoPool = new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return globalForDb.cliqoPool;
}
