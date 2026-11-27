import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hmac, sign, verify } from '@/lib/crypto';
import { env } from '@/lib/env';

/*
 * Studio sign-in. Google (OAuth client + ADMIN_EMAILS) and a password
 * (ADMIN_PASSWORD) can each be turned on, and both show on the sign-in page
 * when both are set. In local development with neither, a one-click dev
 * sign-in is offered.
 */

const COOKIE = 'mg_admin';
const TTL = 14 * 24 * 3600 * 1000;

export type AuthMethod = 'google' | 'password' | 'dev';

export function authMethods() {
  const google = Boolean(env.googleClientId && env.googleClientSecret);
  const password = env.adminPassword.length > 0;
  return { google, password, dev: !google && !password && !env.isProd };
}

/** Changes whenever ADMIN_PASSWORD changes, so old password sessions end. */
const passwordTag = () => hmac('admin-password', env.adminPassword).slice(0, 16);

export async function setAdmin(email: string, m: AuthMethod) {
  const payload = { email, m, exp: Date.now() + TTL, ...(m === 'password' ? { pt: passwordTag() } : {}) };
  (await cookies()).set(COOKIE, sign('admin', payload), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL / 1000,
  });
}

export async function clearAdmin() {
  (await cookies()).delete(COOKIE);
}

export async function getAdmin(): Promise<{ email: string } | null> {
  const p = verify<{ email: string; m?: AuthMethod; pt?: string; exp: number }>('admin', (await cookies()).get(COOKIE)?.value);
  if (!p) return null;
  // A session only lasts while the method that created it is still switched on
  const on = authMethods();
  if (p.m === 'google' && !(on.google && env.adminEmails.includes(p.email.toLowerCase()))) return null;
  if (p.m === 'password' && !(on.password && p.pt === passwordTag())) return null;
  if (p.m === 'dev' && !on.dev) return null;
  if (!p.m) return null;
  return { email: p.email };
}

/** For Studio pages: send strangers to the sign-in page. */
export async function requireAdminPage() {
  const a = await getAdmin();
  if (!a) redirect('/studio/login');
  return a;
}

/** For server actions and API routes. */
export async function requireAdmin() {
  const a = await getAdmin();
  if (!a) throw new Error('Not signed in');
  return a;
}

export function passwordMatches(input: string) {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(env.adminPassword).digest();
  return env.adminPassword.length > 0 && crypto.timingSafeEqual(a, b);
}
