import { expect, test } from "@playwright/test";
import { classCard, createClass, phone, teacherWithClass } from "./support/classes";
import { createStudent, createTeacher, expectNotFound, PASSWORD, signIn, uniqueEmail, waitForLink } from "./support/helpers";

// CLS-01: a teacher creates and lists their classes (CA1 to CA3).

test("a teacher creates two classes; a second teacher sees only their own", async ({ page, browser }) => {
  const sarah = await createTeacher("Sarah", "Bennett");
  await signIn(page, sarah);
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");

  // Empty state, with its own way to create a class.
  await expect(page.getByText("No classes yet")).toBeVisible();
  await page.screenshot({ path: "test-results/classes-empty-desktop.png", fullPage: true });

  // CA1: two classes, listed and empty.
  await expect(await createClass(page, "Grade 10 — A")).toBeHidden();
  await expect(classCard(page, "Grade 10 — A")).toBeVisible();
  await expect(await createClass(page, "Grade 11 — Literature")).toBeHidden();
  await expect(classCard(page, "Grade 11 — Literature").getByText("0 students")).toBeVisible();
  await expect(page.getByText("2 classes")).toBeVisible();

  // CA2: the same name, whatever the case, is refused; the dialog stays open with the typed name.
  const dialog = await createClass(page, "  grade 10 — a ");
  await expect(dialog.getByText("You already have a class with this name.")).toBeVisible();
  await expect(dialog.getByLabel(/^Class name/)).toHaveValue("  grade 10 — a ");
  await expect(dialog.getByLabel(/^Class name/)).toBeFocused();
  await page.screenshot({ path: "test-results/classes-duplicate-desktop.png" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading") })).toHaveCount(2);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/classes-list-phone.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/classes-list-desktop.png", fullPage: true });

  // CA3: a second teacher with a class of the same name sees only theirs.
  const karim = await createTeacher("Karim", "Alaoui");
  const other = await (await browser.newContext()).newPage();
  await signIn(other, karim);
  await expect(other).toHaveURL(/\/teacher\//);
  await other.goto("/teacher/classes");
  await expect(other.getByText("No classes yet")).toBeVisible();
  await expect(await createClass(other, "Grade 10 — A")).toBeHidden();
  await expect(classCard(other, "Grade 10 — A")).toBeVisible();
  await expect(other.getByText("Grade 11 — Literature")).toHaveCount(0);
  await expect(other.getByText("1 class", { exact: true })).toBeVisible();
});

// CLS-02: link and code of a class, copied in one click, renewed, disabled (CA1 to CA3).
test("a teacher shares, renews and disables the class link and code", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  await signIn(page, await createTeacher("Sarah", "Bennett"));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  await expect(await createClass(page, "Grade 10 — A")).toBeHidden();

  // The card opens the class page.
  await classCard(page, "Grade 10 — A").getByRole("link", { name: "Grade 10 — A" }).click();
  await expect(page.getByRole("heading", { name: "Grade 10 — A", level: 1 })).toBeVisible();
  const invite = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite students" }) });
  await expect(invite.getByText("Link and code: Active")).toBeVisible();

  // CA1: link and code shown, copied in one click.
  const link = await invite.getByLabel("Link").inputValue();
  expect(new URL(link).pathname).toBe("/join");
  const code = (await invite.getByLabel("Code").textContent())!;
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await invite.getByRole("button", { name: "Copy code" }).click();
  await expect(invite.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await invite.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.screenshot({ path: "test-results/class-invite-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/class-invite-phone.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  // CA2: renewal gives a new link and code.
  await invite.getByRole("button", { name: "Generate new link and code" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await expect(invite.getByText("New link and code created.")).toBeVisible();
  await expect(invite.getByLabel("Code")).not.toHaveText(code);
  expect(await invite.getByLabel("Link").inputValue()).not.toBe(link);

  // CA3: disabled, nothing to share any more; renewing brings them back.
  await invite.getByRole("button", { name: "Disable" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
  await expect(invite.getByText("Link and code: Disabled")).toBeVisible();
  await expect(invite.getByText("nobody can join with them")).toBeVisible();
  await expect(invite.getByLabel("Code")).toHaveCount(0);
  await page.screenshot({ path: "test-results/class-invite-disabled-desktop.png", fullPage: true });
  await invite.getByRole("button", { name: "Generate new link and code" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await expect(invite.getByText("Link and code: Active")).toBeVisible();

  // Another teacher: the class page answers "not found".
  const other = await (await browser.newContext()).newPage();
  await signIn(other, await createTeacher("Karim", "Alaoui"));
  await expect(other).toHaveURL(/\/teacher\//);
  const response = await other.goto(page.url());
  expect(response?.status()).toBe(404);
});


// CLS-03 R3, CA1: a new student opens the link without a session, signs up,
// confirms in another browser (a phone's mail app), signs in: in the class.
test("a new student joins through the link: sign up, confirm elsewhere, sign in", async ({ browser }) => {
  const teacher = await teacherWithClass(browser, "Grade 10 — A");
  const student = await (await browser.newContext(phone)).newPage();
  const email = uniqueEmail("student");

  // Opening the link joins nothing and shows no class data.
  await student.goto(teacher.link);
  await expect(student.getByRole("heading", { name: "Join a class" })).toBeVisible();
  await expect(student.getByText("Grade 10 — A")).toHaveCount(0);
  await student.screenshot({ path: "test-results/join-link-visitor-phone.png", fullPage: true });
  await student.getByRole("button", { name: "Create a student account" }).click();

  await expect(student).toHaveURL(/\/sign-up$/);
  await expect(student.getByText("Create your account and confirm your email: you join the class then.")).toBeVisible();
  await student.getByLabel("First name").fill("Sam");
  await student.getByLabel("Last name").fill("Lee");
  await student.getByLabel("Email").fill(email);
  await student.getByLabel(/^Password/).fill(PASSWORD);
  await student.getByRole("button", { name: "Create account" }).click();
  await expect(student.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Unconfirmed: no session, so no class (CLS-03 R3).
  await signIn(student, email);
  await expect(student.getByText("Confirm your email address first")).toBeVisible();

  // Confirmed in another browser, where the link was never opened.
  const mailApp = await (await browser.newContext(phone)).newPage();
  await mailApp.goto(await waitForLink(email, "email_verification"));
  await mailApp.getByRole("button", { name: "Confirm my email" }).click();
  await expect(mailApp.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await signIn(mailApp, email);
  await expect(mailApp).toHaveURL(/\/student\//);
  await mailApp.goto("/student/classes");
  await expect(mailApp.getByRole("heading", { name: "Grade 10 — A" })).toBeVisible();
  await expect(mailApp.getByText("Sarah Bennett")).toBeVisible();
  await mailApp.screenshot({ path: "test-results/my-classes-phone.png", fullPage: true });

  // Back in the first browser: signing in joins again, without a duplicate.
  await signIn(student, email);
  await expect(student).toHaveURL(/\/student\/classes\?join=done$/);
  await expect(student.getByText("You are in the class")).toBeVisible();
  await expect(student.getByRole("heading", { name: "Grade 10 — A" })).toHaveCount(1);
});

// CLS-03 CA1 to CA4, CLS-04 CA1 and CA4: an existing student joins by link (sign-in first), then by code;
// removed by the teacher, the same code gets the neutral refusal; readmitted, the class is back.
test("an existing student joins by link and by code; removed, the code is refused", async ({ browser }) => {
  const first = await teacherWithClass(browser, "Grade 10 — A");
  const second = await teacherWithClass(browser, "French — Group 2");
  const email = await createStudent("Adam", "Rami");
  const student = await (await browser.newContext(phone)).newPage();

  // Link without a session: sign in, then joined at once.
  await student.goto(first.link);
  await student.getByRole("button", { name: "Sign in to join" }).click();
  await expect(student.getByText("Sign in with your student account: you join the class right after.")).toBeVisible();
  await student.getByLabel("Email").fill(email);
  await student.getByLabel(/^Password/).fill(PASSWORD);
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(student).toHaveURL(/\/student\/classes\?join=done$/);

  // CA3: a second class, by code typed loosely.
  const form = student.locator("form").filter({ has: student.getByLabel("Class code") });
  await form.getByLabel("Class code").fill(second.code.toLowerCase().replace("-", " "));
  await form.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("You joined the class")).toBeVisible();
  await expect(student.getByRole("heading", { name: "Grade 10 — A" })).toBeVisible();
  await expect(student.getByRole("heading", { name: "French — Group 2" })).toBeVisible();

  // CA2: the same code again, no duplicate.
  await form.getByLabel("Class code").fill(second.code);
  await form.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("You are already in this class")).toBeVisible();
  await expect(student.getByRole("heading", { name: "French — Group 2" })).toHaveCount(1);

  // CA4: removed by the teacher (CLS-04), the active code is refused like an unknown one.
  const teacher = second.page;
  const roster = teacher.locator("section").filter({ has: teacher.getByRole("heading", { name: "Students", exact: true }) });
  await teacher.reload();
  const row = () => roster.getByRole("row").filter({ hasText: email });
  await expect(row()).toContainText("Adam");
  await expect(row()).toContainText("Rami");
  await teacher.screenshot({ path: "test-results/class-roster-desktop.png", fullPage: true });
  await row().getByRole("button", { name: "Remove Adam Rami" }).click();
  const confirmRemove = teacher.getByRole("dialog", { name: "Remove Adam Rami from the class?" });
  await confirmRemove.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirmRemove).toBeHidden();
  await expect(roster.getByText(/Student removed/)).toBeVisible();
  await expect(roster.getByRole("tab", { name: "Active (0)" })).toBeVisible();
  await expect(roster.getByText("No students yet")).toBeVisible();
  await roster.getByRole("tab", { name: "Removed (1)" }).click();
  await expect(row()).toBeVisible();
  await teacher.screenshot({ path: "test-results/class-roster-removed-desktop.png", fullPage: true });
  await teacher.setViewportSize({ width: 375, height: 812 });
  await teacher.screenshot({ path: "test-results/class-roster-removed-phone.png", fullPage: true });
  // The table scrolls inside its frame, never the page.
  expect(await teacher.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await teacher.setViewportSize({ width: 1280, height: 800 });

  await student.reload();
  await expect(student.getByRole("heading", { name: "French — Group 2" })).toHaveCount(0);
  await form.getByLabel("Class code").fill(second.code);
  await form.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("This link or code doesn't work. Check it with your teacher.")).toBeVisible();
  await student.screenshot({ path: "test-results/join-refused-phone.png", fullPage: true });
  await form.getByLabel("Class code").fill("ZZZZ-9999");
  await form.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("This link or code doesn't work. Check it with your teacher.")).toBeVisible();
  await expect(student.getByRole("heading", { name: "French — Group 2" })).toHaveCount(0);

  // CLS-04 R2, CA4: readmitted by the teacher, no code needed: the class is back.
  await row().getByRole("button", { name: "Readmit Adam Rami" }).click();
  await teacher.getByRole("dialog", { name: "Readmit Adam Rami?" }).getByRole("button", { name: "Readmit" }).click();
  await expect(roster.getByText(/Student readmitted/)).toBeVisible();
  await expect(roster.getByRole("tab", { name: "Removed (0)" })).toBeVisible();
  await roster.getByRole("tab", { name: "Active (1)" }).click();
  await expect(row()).toBeVisible();
  await student.reload();
  await expect(student.getByRole("heading", { name: "French — Group 2" })).toHaveCount(1);

  // CA4: another teacher reaches neither the class nor its students.
  await expectNotFound(first.page, new URL(teacher.url()).pathname);
  await expect(first.page.getByText(email)).toHaveCount(0);

  // A teacher opening a class link cannot join.
  await first.page.goto(second.link);
  await expect(first.page.getByText("Only student accounts can join a class.")).toBeVisible();
});
