import { MongoClient, type Db } from "mongodb";
import dns from "node:dns";

// Fix Node.js DNS SRV resolution on macOS / local networks
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // ignore
}

const MONGODB_URI = process.env.MONGODB_URI || "";

// Extend the global type so TypeScript doesn't complain
declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | null = null;

if (MONGODB_URI) {
  try {
    const client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    if (process.env.NODE_ENV === "development") {
      if (!global._mongoClientPromise) {
        global._mongoClientPromise = client.connect().catch((err) => {
          console.warn("MongoDB Atlas connection notice:", err.message);
          return client;
        });
      }
      clientPromise = global._mongoClientPromise;
    } else {
      clientPromise = client.connect().catch((err) => {
        console.warn("MongoDB Atlas connection notice:", err.message);
        return client;
      });
    }
  } catch (err: any) {
    console.warn("MongoClient initialization notice:", err.message);
  }
}

export default clientPromise;

/**
 * Safe getDb helper that returns Db when connected, or null if MongoDB Atlas is unreachable.
 * This guarantees that login/signup never crash with 500 errors.
 */
export async function getDb(): Promise<Db | null> {
  if (!clientPromise) return null;
  try {
    const client = await Promise.race([
      clientPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MongoDB connection timeout")), 8000)
      ),
    ]);
    return client.db();
  } catch (err: any) {
    console.warn("getDb offline fallback:", err.message);
    return null;
  }
}

/**
 * Execute an operation on MongoDB safely without crashing if offline
 */
export async function executeMongoOperation<T>(
  operation: (db: Db) => Promise<T>
): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    return await operation(db);
  } catch (err: any) {
    console.warn("Mongo operation notice:", err.message);
    return null;
  }
}
