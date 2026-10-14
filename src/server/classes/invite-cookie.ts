import "server-only";
import { cookies } from "next/headers";
import { CLASS_INVITE_INTENT_TTL } from "@/config/provisional";
import { LINK_TOKEN_PATTERN } from "./invite-codes";

// CLS-03 R3: a class link opened without a session is kept in a cookie until
// sign-in or sign-up. Server only (httpOnly): no script on the page reads it.

const NAME = "class_invite";

export async function rememberInvite(token: string): Promise<void> {
  if (!LINK_TOKEN_PATTERN.test(token)) return;
  (await cookies()).set(NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLASS_INVITE_INTENT_TTL,
  });
}

/** The remembered link token, if any and well formed. */
export async function rememberedInvite(): Promise<string | undefined> {
  const token = (await cookies()).get(NAME)?.value;
  return token && LINK_TOKEN_PATTERN.test(token) ? token : undefined;
}

export async function forgetInvite(): Promise<void> {
  (await cookies()).delete(NAME);
}
