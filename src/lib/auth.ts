import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { redirect } from 'next/navigation';

const cookieName = 'mini_ecom_admin';

// SESSION_SECRET is optional. Without it, the key is derived from the server-only
// DATABASE_URL so sessions stay signed with a value that is never exposed to clients.
function key() {
  const secret = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new Error('ต้องตั้ง SESSION_SECRET หรือ DATABASE_URL อย่างใดอย่างหนึ่ง');
  return createHash('sha256').update(`mini-ecom-session:${secret}`).digest();
}

export async function signIn(adminId: string) {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key());
  (await cookies()).set(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: 60 * 60 * 24 * 7,
  });
}

export async function adminId() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const result = await jwtVerify(token, key());
    return result.payload.role === 'admin' && result.payload.sub ? result.payload.sub : null;
  } catch { return null; }
}

export async function requireAdmin() {
  const id = await adminId();
  if (!id) redirect('/admin/login');
  return id;
}

export async function signOut() {
  (await cookies()).delete(cookieName);
}
