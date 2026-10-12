import { describe, expect, it } from "vitest";
import { decideRoute, spaceRole } from "./route-access";

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
