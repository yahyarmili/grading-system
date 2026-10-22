import { expect, test, type Page } from "@playwright/test";
import { classCard, createClass, inviteCard, phone, teacherWithClass } from "./support/classes";
import { createStudent, createTeacher, expectNotFound, signIn } from "./support/helpers";

// E3 (fonctionnalites.md §8.3): the journey of the step. ASG-01 to ASG-03 and
// SUB-01 have their detailed tests in assignments.spec.ts and student-assignments.spec.ts.

test("E3 journey: an assignment for C1 and C3, seen once by the student of both; edited, seen at once", async ({ browser }) => {
  const sarah = await teacherWithClass(browser, "C1");
  const teacher = sarah.page;
  const c3Code = await addClass(teacher, "C3");

  // The student joins C1 and C3 with their codes.
  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Adam", "Rami"));
  await expect(student).toHaveURL(/\/student\//);
  for (const code of [sarah.code, c3Code]) {
    await student.goto("/student/classes");
    const form = student.locator("form").filter({ has: student.getByLabel("Class code") });
    await form.getByLabel("Class code").fill(code);
    await form.getByRole("button", { name: "Join the class" }).click();
    await expect(student.getByText("You joined the class")).toBeVisible();
  }
  await student.goto("/student/assignments");
  await expect(student.getByText("No assignments yet")).toBeVisible();

  // The teacher creates one assignment for C1 and C3.
  await teacher.goto("/teacher/assignments/new");
  await teacher.getByLabel(/^Title/).fill("My town");
  await teacher.getByLabel(/^Subject/).fill("Describe your town.");
  await teacher.getByLabel(/^Level/).selectOption("B1");
  await teacher.getByRole("radio", { name: "English" }).check();
  await teacher.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
  await teacher.getByRole("checkbox", { name: "C1" }).check();
  await teacher.getByRole("checkbox", { name: "C3" }).check();
  await teacher.getByRole("button", { name: "Create assignment" }).click();
  await teacher.getByRole("link", { name: "Open the assignment" }).click();
  await expect(teacher.getByRole("heading", { name: "My town", level: 1 })).toBeVisible();
  const assignmentUrl = new URL(teacher.url()).pathname;
  await teacher.waitForLoadState("networkidle");
  await teacher.screenshot({ path: "test-results/e3-1-teacher-assignment-desktop.png", fullPage: true });

  // The student of both classes sees it once, with the time zone.
  await student.reload();
  const cards = assignmentCards(student);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("My town");
  await expect(cards.first()).toContainText(/Due Jun 14, 2030, 18:00 \(Casablanca time, GMT\+\d\)/);
  await expect(cards.first()).toContainText("Describe your town.");
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/e3-2-student-sees-once-phone.png", fullPage: true });

  // The teacher edits the subject; the student, who already visited the list,
  // comes back to it through the menu and reads the new subject.
  await student.goto("/student/classes");
  await teacher.getByRole("link", { name: "Edit" }).filter({ visible: true }).click();
  await teacher.getByLabel(/^Subject/).fill("Describe your village.");
  await teacher.getByRole("button", { name: "Save changes" }).click();
  await expect(teacher.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();
  await student.getByRole("button", { name: "Open menu" }).click();
  await student.getByRole("link", { name: "My assignments" }).filter({ visible: true }).click();
  await expect(assignmentCards(student).first()).toContainText("Describe your village.");
  await expect(student.getByText("Describe your town.")).toHaveCount(0);

  // A second teacher reaches neither the assignment nor its edit form (404), and lists nothing.
  const karim = await (await browser.newContext()).newPage();
  await signIn(karim, await createTeacher("Karim", "Alaoui"));
  await expect(karim).toHaveURL(/\/teacher\//);
  await expectNotFound(karim, assignmentUrl);
  await expectNotFound(karim, `${assignmentUrl}/edit`);
  await karim.goto("/teacher/assignments");
  await expect(karim.getByRole("heading", { name: "Assignments", level: 1 })).toBeVisible();
  await expect(karim.getByText("My town")).toHaveCount(0);
  // Without a class, the empty state leads to Classes.
  await expect(karim.getByText("No assignments yet")).toBeVisible();
  await karim.getByRole("link", { name: "Go to Classes" }).click();
  await expect(karim).toHaveURL(/\/teacher\/classes$/);
});

test("E3 journey: a student without a class sees the empty state, which leads to Join a class", async ({ browser }) => {
  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Lina", "Amrani"));
  await expect(student).toHaveURL(/\/student\//);
  await student.goto("/student/assignments");
  await expect(student.getByText("You are not in a class yet")).toBeVisible();
  await expect(assignmentCards(student)).toHaveCount(0);
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/e3-3-no-class-phone.png", fullPage: true });
  await student.getByRole("link", { name: "Join a class" }).click();
  await expect(student).toHaveURL(/\/student\/classes$/);
});

/** Creates a class from the Classes screen and returns its code. */
async function addClass(page: Page, name: string) {
  await page.goto("/teacher/classes");
  await expect(await createClass(page, name)).toBeHidden();
  await classCard(page, name).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return (await inviteCard(page).getByLabel("Code").textContent())!;
}

/** One card per assignment: the list items with a title (the meta lines are lists too). */
const assignmentCards = (page: Page) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
