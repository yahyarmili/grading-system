"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { roleHome } from "@/lib/roles";
import { acceptInvitation, type AcceptInvitationState } from "@/server/auth/invitations";
import {
  requestConfirmationLink,
  requestPasswordResetLink,
  resetPasswordWithToken,
  type LinkRequestState,
  type ResetPasswordState,
} from "@/server/auth/recovery";
import { getActor, getClientIp } from "@/server/auth/session";
import { forgetInvite, rememberedInvite, rememberInvite } from "@/server/classes/invite-cookie";
import { joinWithLink } from "@/server/classes/join";
import { AccessDeniedError } from "@/server/access/errors";
import { signInUser, signOutUser, type SignInState } from "@/server/auth/sign-in";
import {
  confirmEmailWithToken,
  signUpStudent,
  type ConfirmEmailState,
  type SignUpState,
} from "@/server/auth/sign-up";

export async function signUpAction(_previous: SignUpState, form: FormData): Promise<SignUpState> {
  const state = await signUpStudent(
    {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      password: form.get("password"),
    },
    {
      actor: await getActor(),
      ip: await getClientIp(),
      schedule: after,
      // A class link opened before signing up: joined once the email is confirmed (CLS-03 R3).
      inviteToken: await rememberedInvite(),
    },
  );
  // No email in the URL: the next screen does not say which address was used.
  if (state.status === "done") redirect("/check-email");
  return state;
}

export async function confirmEmailAction(
  _previous: ConfirmEmailState,
  form: FormData,
): Promise<ConfirmEmailState> {
  const state = await confirmEmailWithToken(form.get("token"));
  if (state.status === "done") redirect("/email-confirmed");
  return state;
}

export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const state = await signInUser(
    { email: form.get("email"), password: form.get("password") },
    { headers: await headers() },
  );
  if (state.status !== "done") return state;

  // A class link opened before signing in (CLS-03 R3): a student joins now.
  const invite = await rememberedInvite();
  if (invite) {
    await forgetInvite();
    if (state.role === "student") {
      const notice = await joinWithLink({ kind: "user", userId: state.userId, role: "student" }, invite);
      redirect(`/student/classes?join=${notice}`);
    }
  }
  // AUTH-02 CA1: straight to the space of the account's role.
  redirect(roleHome[state.role]);
}

/** The caller then loads /sign-in in full (SignOutButton): no page of the session stays in memory. */
export async function signOutAction(): Promise<void> {
  const actor = await getActor();
  await signOutUser({
    headers: await headers(),
    userId: actor.kind === "user" ? actor.userId : null,
  });
}

export async function forgotPasswordAction(
  _previous: LinkRequestState,
  form: FormData,
): Promise<LinkRequestState> {
  return requestPasswordResetLink({ email: form.get("email") }, { schedule: after });
}

export async function resendConfirmationAction(
  _previous: LinkRequestState,
  form: FormData,
): Promise<LinkRequestState> {
  return requestConfirmationLink({ email: form.get("email") }, { schedule: after });
}

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const state = await resetPasswordWithToken({ token: form.get("token"), password: form.get("password") });
  // Every session was closed: the user signs in again with the new password.
  if (state.status === "done") redirect("/sign-in?reset=done");
  return state;
}

export async function acceptInvitationAction(
  _previous: AcceptInvitationState,
  form: FormData,
): Promise<AcceptInvitationState> {
  const state = await acceptInvitation(
    { token: form.get("token"), password: form.get("password") },
    { headers: await headers() },
  );
  // AUTH-03 CA1: the new teacher is signed in and lands in the teacher space.
  if (state.status === "done") redirect(roleHome.teacher);
  return state;
}

/**
 * A visitor opened a class link (/join): the link is remembered, then the
 * visitor signs in or signs up (CLS-03 R3). Nothing is joined yet.
 */
export async function rememberInviteAction(form: FormData): Promise<void> {
  const token = form.get("token");
  if (typeof token === "string") await rememberInvite(token);
  redirect(form.get("next") === "sign-up" ? "/sign-up" : "/sign-in");
}

/** A signed-in student joins the class of a link (CLS-03 CA1), by a POST: opening the link joins nothing. */
export async function joinByLinkAction(form: FormData): Promise<void> {
  const actor = await getActor();
  await forgetInvite();
  let notice;
  try {
    notice = await joinWithLink(actor, form.get("token"));
  } catch (error) {
    if (!(error instanceof AccessDeniedError)) throw error;
    // Only students join; the page says so to anyone else.
    redirect(actor.kind === "user" ? roleHome[actor.role] : "/sign-in");
  }
  redirect(`/student/classes?join=${notice}`);
}
