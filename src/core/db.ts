import { Pool, type PoolConfig } from "pg";

/**
 * Parses a Npgsql-style connection string ("Host=...;Username=...;Password=...;...", as
 * Neon's .NET-flavored connection string) into pg's PoolConfig. Falls back to letting `pg`
 * parse it directly if it looks like a standard "postgres://" URL instead.
 */
function parseConnectionString(raw: string): PoolConfig {
  if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    return { connectionString: raw, ssl: { rejectUnauthorized: false } };
  }

  const fields = new Map<string, string>();
  for (const pair of raw.split(";")) {
    if (!pair.trim()) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim().toLowerCase();
    const value = pair.slice(eq + 1).trim();
    fields.set(key, value);
  }

  const sslMode = fields.get("ssl mode")?.toLowerCase() ?? fields.get("sslmode")?.toLowerCase();

  return {
    host: fields.get("host"),
    port: fields.get("port") ? Number(fields.get("port")) : undefined,
    database: fields.get("database"),
    user: fields.get("username") ?? fields.get("user"),
    password: fields.get("password"),
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
  };
}

function createPool(): Pool {
  const raw = process.env.DB_CONNECTION_STRING;
  if (!raw) {
    throw new Error("DB_CONNECTION_STRING is not set.");
  }
  return new Pool(parseConnectionString(raw));
}

let pool: Pool | null = null;

/** Lazily created, process-wide connection pool to the Neon database. */
export function getPool(): Pool {
  pool ??= createPool();
  return pool;
}
