import { expect, test, type Page } from "@playwright/test";
import { classCard, createClass, inviteCard, phone, teacherWithClass } from "./support/classes";
import { createStudent, signIn, sql } from "./support/helpers";

// SUB-01: My assignments, on a phone first. The integration tests cover the
// rules (closed list of fields, derivation, refusals); this checks the screen.

test("CA3: a student without a class gets an explicit empty state leading to Join a class", async ({ browser }) => {
  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Lina", "Amrani"));
  await expect(student).toHaveURL(/\/student\//);
  await student.goto("/student/assignments");
  await expect(student.getByText("You are not in a class yet")).toBeVisible();
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/sub01-1-empty-phone.png", fullPage: true });
  await student.getByRole("link", { name: "Join a class" }).click();
  await expect(student).toHaveURL(/\/student\/classes$/);
  await expect(student.getByRole("heading", { name: "Join a class" })).toBeVisible();
});

test("CA1: the student of C1 and C3 sees each assignment once, with its fields and the time zone", async ({ browser }) => {
  const teacher = await teacherWithClass(browser, "C1");
  const page = teacher.page;
  // A second class, C3, and its code.
  await page.goto("/teacher/classes");
  await expect(await createClass(page, "C3")).toBeHidden();
  await classCard(page, "C3").getByRole("link", { name: "C3" }).click();
  await expect(page.getByRole("heading", { name: "C3", level: 1 })).toBeVisible();
  const c3Code = (await inviteCard(page).getByLabel("Code").textContent())!;

  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Adam", "Rami"));
  await expect(student).toHaveURL(/\/student\//);
  for (const code of [teacher.code, c3Code]) {
    await student.goto("/student/classes");
    const form = student.locator("form").filter({ has: student.getByLabel("Class code") });
    await form.getByLabel("Class code").fill(code);
    await form.getByRole("button", { name: "Join the class" }).click();
    await expect(student.getByText("You joined the class")).toBeVisible();
  }

  // The student is in a class, nothing was sent yet.
  await student.goto("/student/assignments");
  await expect(student.getByText("No assignments yet")).toBeVisible();

  await createAssignment(page, { title: "Both classes", classes: ["C1", "C3"], deadline: "2030-06-14T18:00" });
  await createAssignment(page, {
    title: "Already due", classes: ["C1"], deadline: "2030-01-10T09:00", instructions: "Use the past simple.",
  });
  // A deadline already passed, as time will make it.
  await sql("UPDATE assignments SET deadline = now() - interval '1 day' WHERE title = 'Already due'");

  await student.goto("/student/assignments");
  const group = student.getByRole("region", { name: /To submit/ });
  await expect(group.getByRole("heading", { name: /To submit \(2\)/ })).toBeVisible();
  // One card per assignment: the list items with a title (the meta lines are lists too).
  const cards = group.getByRole("listitem").filter({ has: student.getByRole("heading", { level: 3 }) });
  await expect(cards).toHaveCount(2);
  // Nearest deadline first; the passed one says so in words.
  await expect(cards.nth(0)).toContainText("Already due");
  await expect(cards.nth(0)).toContainText("Deadline passed");
  await expect(cards.nth(0)).toContainText("Use the past simple.");
  const both = cards.nth(1);
  await expect(both).toContainText("Both classes");
  await expect(both).toContainText(/Due Jun 14, 2030, 18:00 \(Casablanca time, GMT\+\d\)/);
  await expect(both).toContainText("English");
  await expect(both).toContainText("Describe your town.");
  // No instructions: no empty block. Neither the level nor a class name.
  await expect(both.getByRole("heading", { name: "Instructions" })).toHaveCount(0);
  await expect(both).not.toContainText("B1");
  await expect(both).not.toContainText("C1");
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/sub01-2-list-phone.png", fullPage: true });

  await student.setViewportSize({ width: 1280, height: 800 });
  await student.screenshot({ path: "test-results/sub01-3-list-desktop.png", fullPage: true });
});

async function createAssignment(
  page: Page,
  { title, classes, deadline, instructions }: { title: string; classes: string[]; deadline: string; instructions?: string },
) {
  await page.goto("/teacher/assignments/new");
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Subject/).fill("Describe your town.");
  if (instructions) await page.getByLabel(/^Instructions/).fill(instructions);
  await page.getByLabel(/^Level/).selectOption("B1");
  await page.getByRole("radio", { name: "English" }).check();
  await page.getByLabel(/^Deadline/).fill(deadline);
  for (const name of classes) await page.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Assignment “${title}” created` })).toBeVisible();
}
