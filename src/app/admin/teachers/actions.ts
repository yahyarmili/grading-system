"use server";

import { refresh } from "next/cache";
import {
  cancelInvitation,
  inviteTeacher,
  reissueInvitation,
  type InvitationActionResult,
  type InviteState,
} from "@/server/auth/invitations";
import { getActor } from "@/server/auth/session";

// Each action reads the actor itself: the data layer refuses anyone but the
// administrator, whatever the screen shows (AUTH-03 CA2).

export async function inviteTeacherAction(_previous: InviteState, form: FormData): Promise<InviteState> {
  const state = await inviteTeacher(await getActor(), {
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
  });
  if (state.status === "done") refresh();
  return state;
}

export async function reissueInvitationAction(invitationId: string): Promise<InvitationActionResult> {
  const result = await reissueInvitation(await getActor(), invitationId);
  refresh();
  return result;
}

export async function cancelInvitationAction(invitationId: string): Promise<InvitationActionResult> {
  const result = await cancelInvitation(await getActor(), invitationId);
  refresh();
  return result;
}
