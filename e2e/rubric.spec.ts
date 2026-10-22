import { expect, test, type Page } from "@playwright/test";
import { phone } from "./support/classes";
import { createStudent, createTeacher, expectNotFound, signIn } from "./support/helpers";

// EVL-01: the rubric screen, read-only, for the teacher (desktop) and the
// student (phone). The unit tests freeze the text and the grade rule; this
// checks what the screen shows and that nothing on it, or sent to it, writes.

const CRITERIA = [
  "Task Achievement / Content",
  "Organization & Cohesion",
  "Vocabulary Range & Accuracy",
  "Grammatical Range & Accuracy",
  "Mechanics",
];

/** CA2 on screen: five criteria at 20%, levels 4 to 0, the grade rule, the French notice. */
async function expectRubric(page: Page) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Rubric", level: 1 })).toBeVisible();
  await expect(main.getByText("English · version en-1")).toBeVisible();
  // The French version is not published (Q6): no language tabs, the English rubric directly.
  await expect(main.getByRole("tablist")).toHaveCount(0);
  const criteria = main.getByRole("list", { name: "Criteria, English" }).getByRole("region");
  await expect(criteria).toHaveCount(5);
  for (const [i, name] of CRITERIA.entries()) {
    const criterion = criteria.nth(i);
    await expect(criterion.getByRole("heading", { name: `${i + 1}. ${name}` })).toBeVisible();
    await expect(criterion).toContainText("20% of the grade");
    await expect(criterion.getByRole("term")).toHaveText([
      /Level 4: Excellent\s*Full marks/,
      /Level 3: Good\s*High level/,
      /Level 2: Developing\s*Partial level/,
      /Level 1: Limited\s*Low level/,
      /Level 0: Inadequate\s*No evidence/,
    ]);
    await expect(criterion.getByRole("definition")).toHaveCount(5);
  }
  await expect(criteria.first().getByRole("definition").first()).toHaveText(
    "Fully addresses the task; ideas relevant and well developed.",
  );
  const rule = main.getByRole("region", { name: "Grade out of 20" });
  await expect(rule).toContainText("The grade is the sum of the five levels");
  await expect(rule).toContainText("3 + 2 + 4 + 3 + 2 give 14 / 20");
  await expect(main.getByText("French version not validated yet")).toBeVisible();
}

/** CA1 through the interface: nothing to fill in, nothing to press. */
async function expectNothingWrites(page: Page) {
  const main = page.getByRole("main");
  await expect(main.locator("form, input, textarea, select, [contenteditable]")).toHaveCount(0);
  await expect(main.getByRole("button")).toHaveCount(0);
}

test("CA2: the teacher reads the rubric from the menu, on a computer, and nothing on it writes (CA1)", async ({ page }) => {
  await signIn(page, await createTeacher("Sarah", "Bennett"));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rubric" }).click();
  await expect(page).toHaveURL(/\/teacher\/rubric$/);
  await expectRubric(page);
  await expectNothingWrites(page);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/evl01-1-teacher-desktop.png", fullPage: true });
  // Not the student's page.
  await expectNotFound(page, "/student/rubric");
});

test("CA2: the student reads the same rubric on a phone, and nothing on it writes (CA1)", async ({ browser }) => {
  const page = await (await browser.newContext(phone)).newPage();
  await signIn(page, await createStudent("Lina", "Amrani"));
  await expect(page).toHaveURL(/\/student\//);
  // Below lg, the menu is a drawer opened from the header, as for the teacher.
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Rubric" }).click();
  await expect(page).toHaveURL(/\/student\/rubric$/);
  await expectRubric(page);
  await expectNothingWrites(page);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/evl01-2-student-phone.png", fullPage: true });
  // What the phone shows at first.
  await page.screenshot({ path: "test-results/evl01-3-student-phone-top.png" });
  // On a tablet and a computer, the same layout as the teacher's: drawer, then sidebar.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: "test-results/evl01-4-student-tablet.png" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/evl01-5-student-desktop.png", fullPage: true });
  await expectNotFound(page, "/teacher/rubric");
});

test("CA1: requests sent straight to the rubric pages change nothing", async ({ browser }) => {
  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, await createTeacher("Omar", "Haddad"));
  await expect(teacher).toHaveURL(/\/teacher\//);
  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Adam", "Rami"));
  await expect(student).toHaveURL(/\/student\//);

  for (const [page, path] of [[teacher, "/teacher/rubric"], [student, "/student/rubric"]] as const) {
    await page.goto(path);
    await expectRubric(page);
    const before = await page.getByRole("main").innerText();

    const change = { criterion: "task", level: "4", descriptor: "Anything goes.", weight: "40" };
    const statuses: Record<string, number> = {};
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      statuses[method] = (await page.request.fetch(path, { method, form: change, maxRedirects: 0 })).status();
    }
    // A forged server action: the page declares none, so there is none to call.
    const forged = await page.request.post(path, {
      headers: { "Next-Action": "0".repeat(42), "Content-Type": "text/plain;charset=UTF-8" },
      data: JSON.stringify([change]),
      maxRedirects: 0,
    });
    statuses.action = forged.status();
    // No request is taken as a write (no redirect after an action), and none
    // breaks the server: the page is rendered again, or refused.
    for (const [method, status] of Object.entries(statuses)) {
      expect(status === 200 || (status >= 400 && status < 500), `${path} ${method}: ${status}`).toBe(true);
    }
    // Next 16 answers an unknown action 409 "Server Action unavailable" (400 when malformed).
    expect([400, 409], `${path}: forged action`).toContain(statuses.action);
    // The proof that no write exists anywhere (no action, route or data
    // function writes the rubric) is static: tests/access-inventory.test.ts.

    await page.reload();
    await expectRubric(page);
    expect(await page.getByRole("main").innerText()).toBe(before);
  }
});
