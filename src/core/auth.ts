import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import type { Pool } from "pg";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE_NAME = "session";
export const SESSION_COOKIE_MAX_AGE_MS = SESSION_COOKIE_MAX_AGE_SECONDS * 1000;

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not set.");
  }
  googleClient ??= new OAuth2Client(GOOGLE_CLIENT_ID);
  return googleClient;
}

function getJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set.");
  }
  return JWT_SECRET;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Verifies a Google ID token (from Google Identity Services on the client) and extracts the profile. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await getGoogleClient().verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google ID token is missing required claims.");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

export interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Creates the user on first sign-in, or updates their profile/login time on return visits.
 * Conflicts on `email` rather than `google_sub`: seeded rows (see `src/core/owner.ts`'s
 * migration data) can carry a placeholder google_sub before anyone has actually signed in,
 * so email is the identifier that reliably links a real Google login to that pre-existing row.
 */
export async function upsertGoogleUser(pool: Pool, profile: GoogleProfile): Promise<AppUser> {
  const result = await pool.query<{ id: string; email: string; display_name: string | null; avatar_url: string | null }>(
    `insert into users (google_sub, email, display_name, avatar_url)
     values ($1, $2, $3, $4)
     on conflict (email) do update
       set google_sub = excluded.google_sub,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           last_login_at = now()
     returning id, email, display_name, avatar_url`,
    [profile.sub, profile.email, profile.name, profile.picture]
  );
  const row = result.rows[0];
  return { id: row.id, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url };
}

/** Looks up a user by id, for populating GET /auth/me from the session cookie's userId. */
export async function getUserById(pool: Pool, userId: string): Promise<AppUser | null> {
  const result = await pool.query<{ id: string; email: string; display_name: string | null; avatar_url: string | null }>(
    "select id, email, display_name, avatar_url from users where id = $1",
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, avatarUrl: row.avatar_url };
}

interface SessionTokenPayload {
  userId: string;
}

/** Signs a stateless session token for the given user, to be stored in an httpOnly cookie. */
export function signSessionToken(userId: string): string {
  return jwt.sign({ userId } satisfies SessionTokenPayload, getJwtSecret(), {
    expiresIn: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Verifies a session token, returning the userId it was issued for, or null if invalid/expired. */
export function verifySessionToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as SessionTokenPayload;
    return payload.userId;
  } catch {
    return null;
  }
}
