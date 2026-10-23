import { describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { AccessDeniedError } from "./errors";
import { authorize } from "./policy";

const student: Actor = { kind: "user", userId: "s1", role: "student" };
const teacher: Actor = { kind: "user", userId: "t1", role: "teacher" };
const admin: Actor = { kind: "user", userId: "a1", role: "admin" };

describe("authorize", () => {
  it("limits a student or a teacher to their own resources when only the owner has the right", () => {
    expect(authorize(student, "submission", "write")).toEqual({ scope: "own", userId: "s1", role: "student" });
    expect(authorize(teacher, "transcription", "read")).toEqual({ scope: "own", userId: "t1", role: "teacher" });
  });

  it("opens a resource without owner to every role that reads it", () => {
    expect(authorize(student, "rubric", "read").scope).toBe("any");
    expect(authorize(admin, "rubric", "read").scope).toBe("any");
  });

  it("gives the administrator the invitations, and nothing of classes or copies", () => {
    expect(authorize(admin, "teacherInvitation", "write")).toEqual({ scope: "any", userId: "a1", role: "admin" });
    expect(() => authorize(admin, "class", "read")).toThrow(AccessDeniedError);
    expect(() => authorize(admin, "submission", "read")).toThrow(AccessDeniedError);
  });

  it("refuses by default: missing action, other role, visitor", () => {
    expect(() => authorize(student, "unpublishedEvaluation", "read")).toThrow(AccessDeniedError);
    expect(() => authorize(student, "aiProposal", "read")).toThrow(AccessDeniedError);
    expect(() => authorize(teacher, "rubric", "write")).toThrow(AccessDeniedError);
    expect(() => authorize({ kind: "visitor" }, "rubric", "read")).toThrow(AccessDeniedError);
  });
});
