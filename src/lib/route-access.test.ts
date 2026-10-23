import { describe, expect, it } from "vitest";
import { decideRoute, FIXED_SPACE_PAGES, resourceRoute, spaceRole } from "./route-access";

describe("spaceRole", () => {
  it("maps each space prefix to its role, and nothing else", () => {
    expect(spaceRole("/student/assignments")).toBe("student");
    expect(spaceRole("/teacher")).toBe("teacher");
    expect(spaceRole("/admin/teachers")).toBe("admin");
    expect(spaceRole("/teachers")).toBeNull();
    expect(spaceRole("/sign-in")).toBeNull();
    expect(spaceRole("/")).toBeNull();
  });
});

describe("decideRoute", () => {
  const spaces = { student: "/student/assignments", teacher: "/teacher/classes", admin: "/admin/teachers" } as const;
  const roles = ["student", "teacher", "admin"] as const;

  it("sends a visitor to sign-in from every space", () => {
    for (const path of Object.values(spaces)) expect(decideRoute(path, null)).toBe("sign-in");
  });

  it("allows each role in its own space only, and answers not found elsewhere", () => {
    for (const role of roles) {
      for (const [space, path] of Object.entries(spaces)) {
        expect(decideRoute(path, role)).toBe(space === role ? "allow" : "not-found");
      }
    }
  });

  it("leaves public pages alone", () => {
    expect(decideRoute("/sign-in", null)).toBe("public");
    expect(decideRoute("/sign-up", "student")).toBe("public");
  });
});

describe("resourceRoute (E8.6)", () => {
  const a = "0b5c9a3e-2f4d-4c1b-9e8a-7d6f5e4c3b2a";
  const b = "6f1e2d3c-4b5a-4968-8776-655443322110";

  it("reads each resource page and its ids", () => {
    expect(resourceRoute(`/student/assignments/${a}`)).toEqual({ page: "/student/assignments/[assignmentId]", params: { assignmentId: a } });
    expect(resourceRoute(`/student/assignments/${a}/result`)).toEqual({ page: "/student/assignments/[assignmentId]/result", params: { assignmentId: a } });
    expect(resourceRoute(`/teacher/assignments/${a}`)).toEqual({ page: "/teacher/assignments/[assignmentId]", params: { assignmentId: a } });
    expect(resourceRoute(`/teacher/assignments/${a}/edit`)).toEqual({ page: "/teacher/assignments/[assignmentId]/edit", params: { assignmentId: a } });
    expect(resourceRoute(`/teacher/assignments/${a}/students/${b}`)).toEqual({
      page: "/teacher/assignments/[assignmentId]/students/[studentId]", params: { assignmentId: a, studentId: b },
    });
    expect(resourceRoute(`/teacher/classes/${b}`)).toEqual({ page: "/teacher/classes/[classId]", params: { classId: b } });
  });

  it("an id that is not one is malformed, whichever of the ids", () => {
    expect(resourceRoute("/student/assignments/42")).toBe("malformed");
    expect(resourceRoute("/student/assignments/not-an-id/result")).toBe("malformed");
    expect(resourceRoute(`/teacher/assignments/${a}/students/nobody`)).toBe("malformed");
    expect(resourceRoute(`/teacher/classes/${a.toUpperCase()}x`)).toBe("malformed");
  });

  it("a fixed page wins over an id, as in Next.js; any other path is no resource page", () => {
    for (const page of FIXED_SPACE_PAGES) expect(resourceRoute(page), page).toBeNull();
    expect(resourceRoute("/teacher/assignments/new")).toBeNull();
    expect(resourceRoute(`/student/assignments/${a}/result/extra`)).toBeNull();
    expect(resourceRoute(`/teacher/assignments/${a}/students`)).toBeNull();
    expect(resourceRoute(`/sign-in`)).toBeNull();
    expect(resourceRoute("/")).toBeNull();
  });
});
