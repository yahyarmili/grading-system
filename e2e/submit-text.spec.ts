import { expect, test, type Page } from "@playwright/test";
import { phone, teacherWithClass } from "./support/classes";
import { createStudent, signIn, sql } from "./support/helpers";

// SUB-02 on a phone: the "no name" instruction before sending, a text box
// without autocorrect, the limit announced, a dated confirmation, one
// submission for a double click. The integration tests cover the rules.

const TEXT = "i has went to the beach , it were grate !!\nL’été dernier — café.\n\nmy freind is cool";

test("a student submits a pasted text once, kept as written, then sees it being marked", async ({ browser }) => {
  const teacher = await teacherWithClass(browser, "Grade 10");
  const student = await (await browser.newContext(phone)).newPage();
  const email = await createStudent("Lina", "Amrani");
  await signIn(student, email);
  await expect(student).toHaveURL(/\/student\//);
  await student.goto("/student/classes");
  await student.getByLabel("Class code").fill(teacher.code);
  await student.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("You joined the class")).toBeVisible();
  await createAssignment(teacher.page, "My town");

  // From My assignments to the submission screen.
  await student.goto("/student/assignments");
  await student.getByRole("link", { name: "Write my text" }).click();
  await expect(student.getByRole("heading", { name: "My town", level: 1 })).toBeVisible();

  // NFR-DON-04: the notice first, read once; the text box comes after.
  await expect(student.getByRole("heading", { name: "Before your first submission: your data" })).toBeVisible();
  await expect(student.getByText(/demonstration with fictitious data/)).toBeVisible();
  await expect(student.getByText(/if you write your name in it, your name is sent too/)).toBeVisible();
  await expect(student.getByRole("textbox", { name: /^Your text/ })).toHaveCount(0);
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/e43-1-notice-phone.png", fullPage: true });
  await student.setViewportSize({ width: 1280, height: 800 });
  await student.screenshot({ path: "test-results/e43-2-notice-desktop.png", fullPage: true });
  await student.setViewportSize(phone.viewport);
  await student.getByRole("button", { name: "I have read this notice" }).click();
  await expect(student.getByRole("heading", { name: "Before your first submission: your data" })).toHaveCount(0);
  const recorded = await sql<{ version: number }>(
    `SELECT n.version FROM notice_acknowledgements n JOIN users u ON u.id = n.user_id WHERE u.email = $1`,
    [email],
  );
  expect(recorded).toEqual([{ version: 1 }]);

  await expect(student.getByText("Do not write your name in your text.")).toBeVisible();
  await expect(student.getByText("At most 4,000 characters. A longer text is refused, never cut.")).toBeVisible();

  const box = student.getByRole("textbox", { name: /^Your text/ });
  for (const [name, value] of [["autocorrect", "off"], ["autocapitalize", "off"], ["spellcheck", "false"]]) {
    await expect(box).toHaveAttribute(name, value);
  }
  await expect(box).not.toHaveAttribute("maxlength");
  await student.waitForLoadState("networkidle");
  await student.screenshot({ path: "test-results/sub02-1-form-phone.png", fullPage: true });
  await student.setViewportSize({ width: 1280, height: 800 });
  await student.screenshot({ path: "test-results/sub02-1b-form-desktop.png", fullPage: true });
  await student.setViewportSize(phone.viewport);

  // Over the limit: nothing cut, the counter says by how much; the server refuses.
  await box.fill("a".repeat(4003));
  await expect(student.getByText("3 characters too many")).toBeVisible();
  await expect(box).toHaveValue("a".repeat(4003));
  await student.getByRole("button", { name: "Submit my text" }).click();
  await expect(student.getByText(/longer than 4,000 characters/).first()).toBeVisible();
  await expect(box).toHaveValue("a".repeat(4003));
  await student.screenshot({ path: "test-results/sub02-2-too-long-phone.png", fullPage: true });

  // A double click submits once.
  await box.fill(TEXT);
  await expect(student.getByText(`${[...new Intl.Segmenter().segment(TEXT)].length} / 4,000 characters`)).toBeVisible();
  await student.getByRole("button", { name: "Submit my text" }).dblclick();
  await expect(student.getByRole("heading", { name: "Text submitted" })).toBeVisible();
  await expect(student.getByText(/Submitted on .+ \(Casablanca time, GMT\+\d\)\./)).toBeVisible();
  await expect(student.getByText("Submitted, being marked")).toBeVisible();
  await expect(student.getByText(TEXT)).toHaveCount(0);
  await student.screenshot({ path: "test-results/sub02-3-submitted-phone.png", fullPage: true });

  const rows = await sql<{ text: string }>(
    `SELECT v.text FROM submission_versions v JOIN submissions s ON s.id = v.submission_id
     JOIN users u ON u.id = s.student_id WHERE u.email = $1`,
    [email],
  );
  expect(rows).toEqual([{ text: TEXT }]);

  // Reloaded, the page shows the confirmation, never the text (A3); the list says it too.
  await student.reload();
  await expect(student.getByRole("heading", { name: "Text submitted" })).toBeVisible();
  expect(await student.content()).not.toContain("my freind is cool");
  await student.goto("/student/assignments");
  await expect(student.getByRole("heading", { name: /Submitted, being marked \(1\)/ })).toBeVisible();
  await student.setViewportSize({ width: 1280, height: 800 });
  await student.screenshot({ path: "test-results/sub02-4-list-desktop.png", fullPage: true });

  // The teacher's assignment is now locked.
  await teacher.page.reload();
  await expect(teacher.page.getByText("Locked by submissions")).toBeVisible();
});

test("SUB-04 CA1: a text submitted after the deadline is marked Late, beside its state", async ({ browser }) => {
  const teacher = await teacherWithClass(browser, "Grade 11", ["Omar", "Idrissi"]);
  const student = await (await browser.newContext(phone)).newPage();
  await signIn(student, await createStudent("Yassine", "Alaoui"));
  await expect(student).toHaveURL(/\/student\//);
  await student.goto("/student/classes");
  await student.getByLabel("Class code").fill(teacher.code);
  await student.getByRole("button", { name: "Join the class" }).click();
  await expect(student.getByText("You joined the class")).toBeVisible();
  await createAssignment(teacher.page, "Late essay", "Grade 11");
  // A deadline already passed, as time will make it.
  await sql("UPDATE assignments SET deadline = now() - interval '1 minute' WHERE title = 'Late essay'");

  await student.goto("/student/assignments");
  await expect(student.getByText("Deadline passed")).toBeVisible();
  await student.getByRole("link", { name: "Write my text" }).click();
  await student.getByRole("button", { name: "I have read this notice" }).click();
  await student.getByRole("textbox", { name: /^Your text/ }).fill("My essay, a little late.");
  await student.getByRole("button", { name: "Submit my text" }).click();
  const submitted = student.locator("section").filter({ has: student.getByRole("heading", { name: "Text submitted" }) });
  await expect(submitted.getByText("Submitted, being marked")).toBeVisible();
  await expect(submitted.getByText("Late", { exact: true })).toBeVisible();
  await student.screenshot({ path: "test-results/sub04-1-late-phone.png", fullPage: true });

  await student.goto("/student/assignments");
  const card = student.getByRole("listitem").filter({ hasText: "Late essay" });
  await expect(card.getByText("Late", { exact: true })).toBeVisible();
  await expect(card.getByText("Deadline passed")).toHaveCount(0);
  await student.screenshot({ path: "test-results/sub04-2-late-list-phone.png", fullPage: true });
});

async function createAssignment(page: Page, title: string, className = "Grade 10") {
  await page.goto("/teacher/assignments/new");
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^Subject/).fill("Describe your town in about 150 words.");
  await page.getByLabel(/^Level/).selectOption("B1");
  await page.getByRole("radio", { name: "English" }).check();
  await page.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
  await page.getByRole("checkbox", { name: className }).check();
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Assignment “${title}” created` })).toBeVisible();
  await page.getByRole("link", { name: "Open the assignment" }).click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}
