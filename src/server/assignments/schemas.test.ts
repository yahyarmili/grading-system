import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DEADLINE_TIME_ZONE } from "@/config/decisions";
import { ASSIGNMENT_TITLE_MAX_LENGTH } from "@/config/provisional";
import { instantToWallTime } from "@/lib/time-zone";
import { ASSIGNMENT_ERRORS, createAssignmentSchema } from "./schemas";

// ASG-01 R1 to R3, CA2: one message per field.

const inAWeek = instantToWallTime(new Date(Date.now() + 7 * 24 * 3600 * 1000), DEADLINE_TIME_ZONE);
const classId = "0b6c1c4e-1f6a-4f7e-9a51-2a8f8f2f3c11";

const valid = {
  title: "My town",
  subject: "Describe your town.",
  level: "B1",
  language: "en",
  deadline: inAWeek,
  instructions: "",
  classIds: [classId],
};

const errorsOf = (input: unknown) => {
  const parsed = createAssignmentSchema.safeParse(input);
  return parsed.success ? {} : z.flattenError(parsed.error).fieldErrors;
};

describe("createAssignmentSchema", () => {
  it("accepts a complete assignment; empty instructions become null", () => {
    const parsed = createAssignmentSchema.parse(valid);
    expect(parsed.instructions).toBeNull();
    expect(parsed.deadline).toBeInstanceOf(Date);
  });

  it("normalises the title, keeps the subject's line breaks", () => {
    const parsed = createAssignmentSchema.parse({ ...valid, title: "  My   town ", subject: " Line 1\nLine 2 " });
    expect(parsed.title).toBe("My town");
    expect(parsed.subject).toBe("Line 1\nLine 2");
  });

  it("gives one message per missing field", () => {
    expect(errorsOf({})).toEqual({
      title: [ASSIGNMENT_ERRORS.title],
      subject: [ASSIGNMENT_ERRORS.subject],
      level: [ASSIGNMENT_ERRORS.level],
      language: [ASSIGNMENT_ERRORS.language],
      deadline: [ASSIGNMENT_ERRORS.deadline],
      classIds: [ASSIGNMENT_ERRORS.classes],
    });
  });

  it.each([
    ["level", "B3", ASSIGNMENT_ERRORS.level],
    ["level", "b1", ASSIGNMENT_ERRORS.level],
    ["language", "de", ASSIGNMENT_ERRORS.language],
    ["title", "   ", ASSIGNMENT_ERRORS.title],
    ["title", "x".repeat(ASSIGNMENT_TITLE_MAX_LENGTH + 1), `Use at most ${ASSIGNMENT_TITLE_MAX_LENGTH} characters.`],
    ["deadline", "2020-01-01T10:00", ASSIGNMENT_ERRORS.deadlinePast],
    ["deadline", "2030-02-30T10:00", ASSIGNMENT_ERRORS.deadline],
    ["deadline", "tomorrow", ASSIGNMENT_ERRORS.deadline],
    ["classIds", [], ASSIGNMENT_ERRORS.classes],
    ["classIds", ["not-an-id"], ASSIGNMENT_ERRORS.classNotFound],
  ])("refuses %s = %j", (field, value, message) => {
    expect(errorsOf({ ...valid, [field]: value })).toEqual({ [field]: [message] });
  });

  it("counts the same class once", () => {
    expect(createAssignmentSchema.parse({ ...valid, classIds: [classId, classId] }).classIds).toEqual([classId]);
  });
});
