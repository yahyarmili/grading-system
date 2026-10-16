import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RubricView } from "@/components/rubric-view";
import { RUBRIC_VERSIONS, type RubricVersion } from "@/lib/rubric";
import { FRENCH_RUBRIC_PENDING_NOTICE } from "@/lib/texts";

// EVL-01 R4: publishing the French version is the whole activation, with no
// change of the screen. A version written for this test stands for it; the
// screen with the real registry is checked by e2e/rubric.spec.ts.

const [en1] = RUBRIC_VERSIONS;
const frTest: RubricVersion = {
  ...en1,
  id: "fr-1",
  language: "fr",
  criteria: en1.criteria.map((c) => ({ ...c, name: `${c.name} (test only)` })),
};

const render = (fr: RubricVersion | null) => renderToStaticMarkup(createElement(RubricView, { rubrics: { en: en1, fr } }));

describe("the rubric screen", () => {
  it("shows the English rubric and says the French one is not validated, while it is not published", () => {
    const html = render(null);
    expect(html).toContain("English · version en-1");
    expect(html).toContain(FRENCH_RUBRIC_PENDING_NOTICE.title);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toMatch(/<(form|input|textarea|select|button)\b/);
  });

  it("offers each published language once the French version is published, without the notice", () => {
    const html = render(frTest);
    expect(html).not.toContain(FRENCH_RUBRIC_PENDING_NOTICE.title);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/role="tab"[^>]*>English</);
    expect(html).toMatch(/role="tab"[^>]*>French</);
    // The tabs switch the view; nothing else can be pressed or filled in.
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).not.toMatch(/<(form|input|textarea|select)\b/);
  });
});
