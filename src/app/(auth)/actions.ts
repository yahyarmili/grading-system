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
    { actor: await getActor(), ip: await getClientIp(), schedule: after },
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
  // AUTH-02 CA1: straight to the space of the account's role.
  if (state.status === "done") redirect(roleHome[state.role]);
  return state;
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
