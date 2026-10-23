import "server-only";
import type { ResourcePage, ResourceRoute } from "@/lib/route-access";
import type { Actor } from "@/server/access/actor";
import { getStudentAssignment, getTeacherAssignment } from "@/server/data/assignments/assignments";
import { getClass } from "@/server/data/classes/classes";
import { getClassInvite } from "@/server/data/classes/invites";
import { getPublishedResult } from "@/server/data/results/student";
import { getCopy, getStudentIdentity } from "@/server/data/review/copy";

// E8.6: what src/proxy.ts asks before a resource page renders, so that an
// absent or another person's resource gets a real 404 in production (the
// page's own notFound() comes after the prerendered shell's 200). Each check
// calls the readers of its page, with the same condition (a falsy answer is
// not found): the proxy and the page cannot disagree, and the access matrix
// stays in the data layer.

type Check = (actor: Actor, params: Record<string, string>) => Promise<boolean>;

const CHECKS: Record<ResourcePage, Check> = {
  "/student/assignments/[assignmentId]": async (actor, { assignmentId }) => Boolean(await getStudentAssignment(actor, assignmentId)),
  "/student/assignments/[assignmentId]/result": async (actor, { assignmentId }) => Boolean(await getPublishedResult(actor, assignmentId)),
  "/teacher/assignments/[assignmentId]": async (actor, { assignmentId }) => Boolean(await getTeacherAssignment(actor, assignmentId)),
  "/teacher/assignments/[assignmentId]/edit": async (actor, { assignmentId }) => Boolean(await getTeacherAssignment(actor, assignmentId)),
  // Before the teacher notice is read, the page shows the notice: found.
  "/teacher/assignments/[assignmentId]/students/[studentId]": async (actor, { assignmentId, studentId }) => {
    const [copy, identity] = await Promise.all([getCopy(actor, assignmentId, studentId), getStudentIdentity(actor, studentId)]);
    return Boolean(copy && identity);
  },
  "/teacher/classes/[classId]": async (actor, { classId }) => {
    const [found, invite] = await Promise.all([getClass(actor, classId), getClassInvite(actor, classId)]);
    return Boolean(found && invite);
  },
};

/** Whether the page of this route would find its resource for this actor. */
export function resourceFound(actor: Actor, route: ResourceRoute): Promise<boolean> {
  return CHECKS[route.page](actor, route.params);
}
