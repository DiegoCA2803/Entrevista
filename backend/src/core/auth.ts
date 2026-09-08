import { randomUUID, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import type { AppRepositories } from '../repositories/db.js';
import { asyncHandler } from './middleware/error.middleware.js';

const scrypt = promisify(scryptCallback);
const cookieName = 'minefleet_session';
export type User = { id: string; email: string; name: string; role: 'SUPERVISOR' | 'CONSULTA' };
type StoredUser = User & { password_hash: string };
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString('hex')}`;
}
async function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(':');
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createAuth(repos: AppRepositories) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres aleatorios.');
  const pool = repos.getPool?.();
  const memoryUsers = new Map<string, StoredUser>();
  const sessions = new Map<string, { userId: string; expires: number }>();
  const attempts = new Map<string, { count: number; expires: number }>();
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
    path: '/'
  };
  const publicUser = ({ id, email, name, role }: StoredUser): User => ({ id, email, name, role });
  const findUser = async (email: string): Promise<StoredUser | undefined> =>
    pool
      ? (await pool.query('SELECT * FROM app_users WHERE email=$1 AND active=TRUE', [email])).rows[0]
      : memoryUsers.get(email);

  for (const [prefix, role, defaultName] of [
    ['ADMIN', 'SUPERVISOR', 'Supervisor de operaciones'],
    ['VIEWER', 'CONSULTA', 'Consulta de operaciones']
  ] as const) {
    const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`${prefix}_PASSWORD`];
    if (!email || !password) continue;
    if (password.length < 12) throw new Error(`${prefix}_PASSWORD debe tener al menos 12 caracteres.`);
    if (await findUser(email)) continue;
    const user: StoredUser = {
      id: randomUUID(),
      email,
      name: process.env[`${prefix}_NAME`] || defaultName,
      role,
      password_hash: await hashPassword(password)
    };
    if (pool)
      await pool.query(
        'INSERT INTO app_users(id,email,name,password_hash,role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',
        [user.id, email, user.name, user.password_hash, role]
      );
    else memoryUsers.set(email, user);
  }

  const login = asyncHandler(async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || password.length > 256 || !password)
      return res.status(400).json({ error: 'Indica tu correo y contraseña.' });
    // Count by IP and account independently; both survive instance changes in PostgreSQL.
    for (const value of [`ip:${req.ip}`, `email:${email}`]) {
      const key = createHash('sha256').update(value).digest('hex');
      let count: number;
      if (pool) {
        const result = await pool.query(
          `INSERT INTO login_attempts(key,count,expires_at) VALUES ($1,1,now()+interval '15 minutes')
          ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.expires_at < now() THEN 1 ELSE login_attempts.count+1 END,
          expires_at=CASE WHEN login_attempts.expires_at < now() THEN now()+interval '15 minutes' ELSE login_attempts.expires_at END RETURNING count`,
          [key]
        );
        count = result.rows[0].count;
      } else {
        const old = attempts.get(key);
        const entry = old && old.expires > Date.now() ? old : { count: 0, expires: Date.now() + 900000 };
        count = ++entry.count;
        attempts.set(key, entry);
      }
      if (count > (value.startsWith('ip:') ? 60 : 10))
        return res.status(429).json({ error: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' });
    }
    const user = await findUser(email);
    const valid = await verifyPassword(password, user?.password_hash || dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    const sessionId = randomUUID();
    const expires = Date.now() + 8 * 3600000;
    if (pool)
      await pool.query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,$3)', [
        sessionId,
        user.id,
        new Date(expires)
      ]);
    else sessions.set(sessionId, { userId: user.id, expires });
    const token = jwt.sign({ email: user.email }, secret, {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: sessionId,
      expiresIn: '8h',
      issuer: 'minefleet',
      audience: 'minefleet-web'
    });
    res.cookie(cookieName, token, { ...options, maxAge: 8 * 3600000 }).json({ data: publicUser(user) });
  });

  const requireUser: RequestHandler = asyncHandler(async (req, res, next) => {
    const token = req.cookies?.[cookieName] || req.headers.authorization?.replace(/^Bearer /, '');
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'minefleet',
        audience: 'minefleet-web'
      }) as jwt.JwtPayload;
    } catch {
      return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    }
    let user: StoredUser | undefined;
    if (pool)
      user = (
        await pool.query(
          `SELECT u.* FROM auth_sessions s JOIN app_users u ON u.id=s.user_id
      WHERE s.id=$1 AND u.id=$2 AND u.active=TRUE AND s.revoked=FALSE AND s.expires_at > now()`,
          [claims.jti, claims.sub]
        )
      ).rows[0];
    else if (sessions.get(claims.jti!)?.expires! > Date.now())
      user = [...memoryUsers.values()].find((u) => u.id === claims.sub);
    if (!user) return res.status(401).json({ error: 'La sesión venció o fue revocada.' });
    res.locals.user = publicUser(user);
    res.locals.sessionId = claims.jti;
    next();
  });
  const requireSupervisor: RequestHandler = (_req, res, next) => {
    if (res.locals.user?.role !== 'SUPERVISOR') {
      res.status(403).json({ error: 'Esta operación requiere el rol Supervisor.' });
      return;
    }
    next();
  };
  const logout = asyncHandler(async (_req, res) => {
    if (pool) await pool.query('UPDATE auth_sessions SET revoked=TRUE WHERE id=$1', [res.locals.sessionId]);
    else sessions.delete(res.locals.sessionId);
    res.clearCookie(cookieName, options).json({ success: true });
  });
  return { login, requireUser, requireSupervisor, logout };
}
