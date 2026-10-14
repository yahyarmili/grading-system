import { expect, test } from "@playwright/test";
import { classCard, inviteCard, phone, rosterSection, teacherWithClass } from "./support/classes";
import { createStudent, expectNotFound, PASSWORD, signIn, uniqueEmail, waitForLink } from "./support/helpers";

// E2 (fonctionnalites.md §8.2): the journey of the step, then the scenario of
// its exit criteria. CLS-01 to CLS-04 have their detailed tests in classes.spec.ts.

const REFUSED = "This link or code doesn't work. Check it with your teacher.";

// The teacher shares the code, the student signs up through the link,
// confirms, appears in the list, is removed, then refused.
test("E2 journey: share, sign up through the link, confirm, listed, removed, refused", async ({ browser }) => {
  const sarah = await teacherWithClass(browser, "Grade 10 — A");
  const roster = rosterSection(sarah.page);
  await expect(roster.getByText("No students yet")).toBeVisible();

  // The teacher shares the link and the code (copied in one click).
  await sarah.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const invite = inviteCard(sarah.page);
  await invite.getByRole("button", { name: "Copy code" }).click();
  expect(await sarah.page.evaluate(() => navigator.clipboard.readText())).toBe(sarah.code);
  await sarah.page.screenshot({ path: "test-results/e2-1-teacher-shares-desktop.png", fullPage: true });

  // The student opens the link without an account and signs up from it.
  const student = await (await browser.newContext(phone)).newPage();
  const email = uniqueEmail("student");
  await student.goto(sarah.link);
  await student.getByRole("button", { name: "Create a student account" }).click();
  await student.getByLabel("First name").fill("Sam");
  await student.getByLabel("Last name").fill("Lee");
  await student.getByLabel("Email").fill(email);
  await student.getByLabel(/^Password/).fill(PASSWORD);
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Not confirmed yet: not in the class.
  await sarah.page.reload();
  await expect(roster.getByText("No students yet")).toBeVisible();

  // Confirms the address: the class comes with it.
  await student.goto(await waitForLink(email, "email_verification"));
  await student.getByRole("button", { name: "Confirm my email" }).click();
  await expect(student.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await signIn(student, email);
  await expect(student).toHaveURL(/\/student\//);
  await student.goto("/student/classes");
  await expect(student.getByRole("heading", { name: "Grade 10 — A" })).toBeVisible();
  await student.screenshot({ path: "test-results/e2-2-student-joined-phone.png", fullPage: true });

  // Listed with first name, last name and email.
  await sarah.page.reload();
  const row = roster.getByRole("row").filter({ hasText: email });
  await expect(row).toContainText("Sam");
  await expect(row).toContainText("Lee");
  await expect(roster.getByRole("tab", { name: "Active (1)" })).toBeVisible();
  await sarah.page.screenshot({ path: "test-results/e2-3-student-listed-desktop.png", fullPage: true });

  // Removed by the teacher.
  await row.getByRole("button", { name: "Remove Sam Lee" }).click();
  await sarah.page.getByRole("dialog", { name: "Remove Sam Lee from the class?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(roster.getByRole("tab", { name: "Removed (1)" })).toBeVisible();

  // The class leaves the student's space; the shared code and the link are refused.
  await student.reload();
  await expect(student.getByRole("heading", { name: "Grade 10 — A" })).toHaveCount(0);
  await student.getByLabel("Class code").fill(sarah.code);
  await student.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText(REFUSED)).toBeVisible();
  await student.screenshot({ path: "test-results/e2-4-code-refused-phone.png", fullPage: true });
  await student.goto(sarah.link);
  await student.getByRole("button", { name: "Join the class" }).click();
  await expect(student).toHaveURL(/\/student\/classes\?join=refused$/);
  await expect(student.getByText(REFUSED)).toBeVisible();
  await expect(student.getByRole("heading", { name: "Grade 10 — A" })).toHaveCount(0);

  // Still removed on the teacher's side: nothing joined behind their back.
  await sarah.page.reload();
  await expect(roster.getByRole("tab", { name: "Active (0)" })).toBeVisible();
  await roster.getByRole("tab", { name: "Removed (1)" }).click();
  await expect(roster.getByRole("row").filter({ hasText: email })).toBeVisible();
});

// Exit criteria: two teachers, one student in both classes; each teacher sees only their class.
test("E2 exit scenario: two teachers, one student in both classes, each sees only their own", async ({ browser }) => {
  const sarah = await teacherWithClass(browser, "Grade 10 — A", ["Sarah", "Bennett"]);
  const karim = await teacherWithClass(browser, "Grade 11 — B", ["Karim", "Alaoui"]);
  const linaEmail = await createStudent("Lina", "Haddad");
  const lina = await (await browser.newContext(phone)).newPage();
  await signIn(lina, linaEmail);
  await expect(lina).toHaveURL(/\/student\//);

  // Joins Sarah's class by link and Karim's by code.
  await lina.goto(sarah.link);
  await lina.getByRole("button", { name: "Join the class" }).click();
  await expect(lina).toHaveURL(/\/student\/classes\?join=done$/);
  await lina.getByLabel("Class code").fill(karim.code);
  await lina.getByRole("button", { name: "Join the class" }).click();
  await expect(lina.getByText("You joined the class")).toBeVisible();

  // The student sees both classes, each with its teacher.
  await lina.reload();
  const card = (name: string) => lina.getByRole("listitem").filter({ has: lina.getByRole("heading", { name }) });
  await expect(card("Grade 10 — A")).toContainText("Sarah Bennett");
  await expect(card("Grade 11 — B")).toContainText("Karim Alaoui");
  await lina.screenshot({ path: "test-results/e2-exit-student-phone.png", fullPage: true });

  // Each teacher: their class only, with the student in it.
  for (const [teacher, own, other, shot] of [
    [sarah, "Grade 10 — A", "Grade 11 — B", "sarah"],
    [karim, "Grade 11 — B", "Grade 10 — A", "karim"],
  ] as const) {
    await teacher.page.goto("/teacher/classes");
    await expect(classCard(teacher.page, own)).toContainText("1 student");
    await expect(teacher.page.getByText("1 class", { exact: true })).toBeVisible();
    await expect(teacher.page.getByText(other)).toHaveCount(0);
    await teacher.page.screenshot({ path: `test-results/e2-exit-${shot}-classes-desktop.png`, fullPage: true });

    await teacher.page.goto(teacher.url);
    const roster = rosterSection(teacher.page);
    await expect(roster.getByRole("row").filter({ hasText: linaEmail })).toContainText("Haddad");
    await expect(roster.getByRole("tab", { name: "Active (1)" })).toBeVisible();
  }

  // Neither reaches the other's class page, nor its list of students (404, like a missing page).
  await expectNotFound(sarah.page, karim.url);
  await expectNotFound(karim.page, sarah.url);

  // Removing her from one class leaves the other intact.
  const sarahRoster = rosterSection(sarah.page);
  await sarah.page.goto(sarah.url);
  await sarahRoster.getByRole("button", { name: "Remove Lina Haddad" }).click();
  await sarah.page.getByRole("dialog", { name: "Remove Lina Haddad from the class?" }).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(sarahRoster.getByRole("tab", { name: "Removed (1)" })).toBeVisible();
  await lina.reload();
  await expect(lina.getByRole("heading", { name: "Grade 10 — A" })).toHaveCount(0);
  await expect(card("Grade 11 — B")).toBeVisible();
  await karim.page.goto(karim.url);
  await expect(rosterSection(karim.page).getByRole("tab", { name: "Active (1)" })).toBeVisible();
});
