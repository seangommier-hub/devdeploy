import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Rejects any request not carrying the exact shared API key issued during pairing.
 * This is the only authentication the agent has — it accepts predefined, structured
 * job requests only, never arbitrary shell commands, per the "no unauthenticated
 * remote build daemon" requirement.
 */
export function apiKeyAuth(expectedKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("Authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token || !safeEqual(token, expectedKey)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
