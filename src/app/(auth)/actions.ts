"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getActor, getClientIp } from "@/server/auth/session";
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
