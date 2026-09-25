import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * User auth (Supabase Auth: email + Google). Reads stay public so the live
 * dashboard remains gradable without an account; WRITES require a session.
 * When SUPABASE_URL/ANON_KEY are unset (local dev), writes stay open and
 * /health reports userAuth:false. Tests inject a stub verifier via AppDeps.
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthVerify = (token: string) => Promise<AuthUser | null>;

let client: ReturnType<typeof createClient> | null = null;

export function supabaseVerifier(): AuthVerify | null {
  if (env.supabaseUrl === '' || env.supabaseAnonKey === '') return null;
  if (client === null) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  const sb = client;
  return async (token: string) => {
    try {
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    } catch {
      return null;
    }
  };
}

export function bearerToken(req: Request): string {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

/**
 * Enforces auth on write routes. Returns the user, or responds 401/503 and
 * returns null. Open mode (no verifier): passes through with a synthetic
 * dev user so behavior stays identical apart from enforcement.
 */
export async function requireUser(
  req: Request,
  res: Response,
  verify: AuthVerify | null,
): Promise<AuthUser | null> {
  if (verify === null) return { id: 'dev-open-mode', email: null };
  const token = bearerToken(req);
  if (token === '') {
    res.status(401).json({ error: 'unauthorized', message: 'sign in required for this action' });
    return null;
  }
  const user = await verify(token);
  if (user === null) {
    res.status(401).json({ error: 'unauthorized', message: 'invalid or expired session' });
    return null;
  }
  return user;
}
