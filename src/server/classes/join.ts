import "server-only";
import type { Actor } from "@/server/access/actor";
import { AccessDeniedError } from "@/server/access/errors";
import { recordSecurityEvent } from "@/server/data/auth/security-events";
import { joinClass, type JoinResult } from "@/server/data/classes/memberships";
import { CLASS_MESSAGES } from "./classes";

// CLS-03, without Next request APIs so integration tests can call it.

export const JOIN_MESSAGES = {
  /** The same for an unknown, disabled or renewed code and for a removed student (R4, CA4). */
  refused: "This link or code doesn't work. Check it with your teacher.",
  locked: "Too many attempts. Wait a few minutes, then try again.",
  unconfirmed: "Confirm your email address first, then try again.",
  empty: "Enter the code your teacher gave you.",
} as const;

export type JoinState =
  | { status: "idle" }
  | { status: "invalid"; error: string; code: string }
  | { status: "joined" | "alreadyMember"; className: string }
  | { status: "error"; message: string };

/** Joins the class of a typed code. A refusal never says whether a class exists. */
export async function joinWithCode(actor: Actor, raw: { code: unknown }): Promise<JoinState> {
  const typed = typeof raw.code === "string" ? raw.code : "";
  if (!typed.trim()) return { status: "invalid", error: JOIN_MESSAGES.empty, code: typed };

  let result: JoinResult;
  try {
    result = await joinClass(actor, { code: typed });
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    await recordSecurityEvent("access_denied", { actorUserId: actor.kind === "user" ? actor.userId : null });
    return { status: "error", message: CLASS_MESSAGES.notAllowed };
  }
  switch (result.outcome) {
    case "joined":
    case "alreadyMember":
      return { status: result.outcome, className: result.className };
    case "refused":
      return { status: "invalid", error: JOIN_MESSAGES.refused, code: typed };
    case "locked":
      return { status: "error", message: JOIN_MESSAGES.locked };
    case "unconfirmed":
      return { status: "error", message: JOIN_MESSAGES.unconfirmed };
  }
}

/** What a link join tells "My classes" through the URL: no class name, no identifier. */
export type JoinNotice = "done" | "refused" | "locked" | "unconfirmed";

export async function joinWithLink(actor: Actor, linkToken: unknown): Promise<JoinNotice> {
  const result = await joinClass(actor, { linkToken });
  return result.outcome === "joined" || result.outcome === "alreadyMember" ? "done" : result.outcome;
}
