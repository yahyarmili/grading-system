import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXED_SPACE_PAGES, RESOURCE_PAGES } from "@/lib/route-access";

// E8.6: every page of the role spaces is either fixed or a resource page that
// src/proxy.ts checks (src/lib/route-access.ts). A new page with an id in its
// path, left out, would answer a missing resource with the prerendered
// shell's 200 in production: this test fails first.

/** The routes of the page.tsx files below this directory of src/app. */
function pages(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...pages(full));
    else if (name === "page.tsx") found.push(`/${path.relative("src/app", dir).split(path.sep).join("/")}`);
  }
  return found;
}

describe("the role spaces' pages and the proxy's resource check", () => {
  it("every page of /student, /teacher and /admin is listed, fixed or resource, and nothing else", () => {
    const onDisk = ["student", "teacher", "admin"].flatMap((space) => pages(path.join("src/app", space))).sort();
    expect([...FIXED_SPACE_PAGES, ...RESOURCE_PAGES].sort()).toEqual(onDisk);
  });

  it("a resource page has an id in its path; a fixed one has none", () => {
    for (const page of RESOURCE_PAGES) expect(page).toMatch(/\[\w+\]/);
    for (const page of FIXED_SPACE_PAGES) expect(page).not.toMatch(/\[/);
  });
});
