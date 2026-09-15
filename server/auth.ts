import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const SESSION_COOKIE = "silva_session";
const SESSION_MAX_AGE_S = 30 * 24 * 3600;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison that also hides the length of the secret. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** Derived from the password so that changing the password invalidates every session. */
export function cookieSecret(password: string): string {
  return sha256(`silvas-tab-session:${password}`).toString("hex");
}

export function openSession(reply: FastifyReply): void {
  reply.setCookie(SESSION_COOKIE, String(Date.now()), {
    signed: true,
    httpOnly: true,
    sameSite: "strict",
    secure: "auto",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export function closeSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function hasValidSession(req: FastifyRequest): boolean {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return false;
  const { valid, value } = req.unsignCookie(raw);
  return valid && Date.now() - Number(value) < SESSION_MAX_AGE_S * 1000;
}

/** Token from `Authorization: Bearer <token>`, or `?token=` for clients that cannot send headers. */
export function requestToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return (req.query as { token?: string } | undefined)?.token;
}
