import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import * as dotenv from "dotenv";

dotenv.config();

// Ensure fetchEndpoint directly targets the compute pooler host without bad subdomain transformation
neonConfig.fetchEndpoint = (host: string) => `https://${host}/sql`;

const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  console.warn("DATABASE_URL is not set in environment variables");
}

export const sqlClient = neon(connectionString || "");
export const db = drizzle(sqlClient, { schema });
