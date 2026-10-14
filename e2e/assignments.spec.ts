import { expect, test } from "@playwright/test";
import { createClass, phone } from "./support/classes";
import { createTeacher, expectNotFound, signIn, sql } from "./support/helpers";

// ASG-01 to ASG-03: the assignment screens, in a real browser. The integration tests
// cover the rules; this checks the screen: messages per field, the deadline
// read back in the single time zone, and the summary after creation.

test("a teacher without a class is sent to Classes first", async ({ page }) => {
  await signIn(page, await createTeacher("Nora", "Diaz"));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/assignments/new");
  await expect(page.getByText("Create a class first")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Classes" })).toHaveAttribute("href", "/teacher/classes");
});

test("ASG-01: create an assignment for C1 and C3", async ({ page, browser }) => {
  await signIn(page, await createTeacher("Sarah", "Bennett"));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  for (const name of ["C1", "C2", "C3"]) await expect(await createClass(page, name)).toBeHidden();

  await page.goto("/teacher/assignments");
  await page.getByRole("link", { name: "New assignment" }).first().click();
  await expect(page.getByRole("heading", { name: "New assignment", level: 1 })).toBeVisible();
  await expect(page.getByText("Do not write a student's name, the level or the class")).toBeVisible();

  // Nothing filled: one message per field, focus on the first one.
  await page.getByRole("button", { name: "Create assignment" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "Fix the following fields" });
  await expect(summary).toBeVisible();
  for (const message of ["Enter a title.", "Enter the subject of the task.", "Choose a level from A1 to C1.", "Choose English or French.", "Choose the date and time of the deadline.", "Choose at least one of your classes."]) {
    await expect(summary).toContainText(message);
  }
  await expect(page.getByLabel(/^Title/)).toBeFocused();
  await page.screenshot({ path: "test-results/asg01-1-errors-desktop.png", fullPage: true });

  await page.getByLabel(/^Title/).fill("My town");
  await page.getByLabel(/^Subject/).fill("Describe your town in about 150 words.");
  await page.getByLabel(/^Level/).selectOption("B1");
  await page.getByRole("radio", { name: "English" }).check();
  await page.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
  // Read back in the single zone, with its name, before sending.
  await expect(page.getByText(/Due Jun 14, 2030, 18:00 \(Casablanca time, GMT\+\d\)/)).toBeVisible();
  await page.getByRole("checkbox", { name: "C1" }).check();
  await page.getByRole("checkbox", { name: "C3" }).check();
  await page.screenshot({ path: "test-results/asg01-2-filled-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Create assignment" }).click();

  const done = page.getByRole("status").filter({ hasText: "Assignment “My town” created" });
  await expect(done).toBeVisible();
  await expect(page.getByText("Sent to C1, C3")).toBeVisible();
  await expect(page.getByText(/Due Jun 14, 2030, 18:00 \(Casablanca time, GMT\+\d\)/)).toBeVisible();
  await page.screenshot({ path: "test-results/asg01-3-created-desktop.png", fullPage: true });

  // A narrow window keeps the form usable.
  const narrow = await (await browser.newContext({ ...phone, storageState: await page.context().storageState() })).newPage();
  await narrow.goto("/teacher/assignments/new");
  await expect(narrow.getByRole("button", { name: "Create assignment" })).toBeVisible();
  // The capture waits for hydration: taken earlier, it touches the server HTML.
  await narrow.waitForLoadState("networkidle");
  await narrow.screenshot({ path: "test-results/asg01-4-form-phone.png", fullPage: true });
});

test("ASG-02: the list and the page of an assignment; another teacher gets 404", async ({ page, browser }) => {
  await signIn(page, await createTeacher("Sarah", "Bennett"));
  await expect(page).toHaveURL(/\/teacher\//);

  // No assignment yet: the empty state leads to the form.
  await page.goto("/teacher/assignments");
  await expect(page.getByText("No assignments yet")).toBeVisible();

  await page.goto("/teacher/classes");
  for (const name of ["C1", "C2"]) await expect(await createClass(page, name)).toBeHidden();
  for (const [title, deadline, classes] of [["Soon", "2030-01-10T09:00", ["C1"]], ["Later", "2030-06-14T18:00", ["C1", "C2"]]] as const) {
    await page.goto("/teacher/assignments/new");
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Subject/).fill("Describe your town.");
    await page.getByLabel(/^Level/).selectOption("B1");
    await page.getByRole("radio", { name: "French" }).check();
    await page.getByLabel(/^Deadline/).fill(deadline);
    for (const name of classes) await page.getByRole("checkbox", { name }).check();
    await page.getByRole("button", { name: "Create assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Assignment “${title}” created` })).toBeVisible();
  }

  // Latest deadline first, with its fields.
  await page.getByRole("link", { name: "Back to assignments" }).click();
  const table = page.getByRole("table", { name: "Assignments" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("Later");
  await expect(table.getByRole("row").nth(1)).toContainText("C1, C2");
  await expect(table.getByRole("row").nth(1)).toContainText("Jun 14, 2030, 18:00");
  await expect(table.getByRole("row").nth(2)).toContainText("Soon");
  await expect(table.getByRole("columnheader", { name: /Deadline \(Casablanca time\)/ })).toBeVisible();
  await page.screenshot({ path: "test-results/asg02-1-list-desktop.png", fullPage: true });

  // Opening it shows the real details.
  await table.getByRole("link", { name: "Later" }).click();
  await expect(page.getByRole("heading", { name: "Later", level: 1 })).toBeVisible();
  await expect(page.getByText(/Due Jun 14, 2030, 18:00 \(Casablanca time, GMT\+\d\)/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Describe your town.").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("No submissions yet").filter({ visible: true })).toBeVisible();
  await page.screenshot({ path: "test-results/asg02-2-assignment-desktop.png", fullPage: true });
  const url = new URL(page.url()).pathname;

  // Another teacher, or an assignment that does not exist: a real 404.
  const karim = await (await browser.newContext()).newPage();
  await signIn(karim, await createTeacher("Karim", "Haddad"));
  await expect(karim).toHaveURL(/\/teacher\//);
  await expectNotFound(karim, url);
  await expectNotFound(karim, `/teacher/assignments/${crypto.randomUUID()}`);
  await expectNotFound(karim, "/teacher/assignments/not-an-id");
  await karim.goto("/teacher/assignments");
  await expect(karim.getByText("No assignments yet")).toBeVisible();
});

test("mockups 1.4 and 1.5 stay under /dev/mockups, out of the teacher space", async ({ page }) => {
  await page.goto("/dev/mockups");
  await page.getByRole("link").filter({ hasText: /./ }).first().click();
  await expect(page).toHaveURL(/\/dev\/mockups\/assignments\//);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/asg02-3-mockup-1-4.png", fullPage: true });
});

test("ASG-03: edit, then delete with confirmation; once locked, only the title and level", async ({ page }) => {
  await signIn(page, await createTeacher("Sarah", "Bennett"));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  await expect(await createClass(page, "C1")).toBeHidden();

  async function create(title: string) {
    await page.goto("/teacher/assignments/new");
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Subject/).fill("Describe your town.");
    await page.getByLabel(/^Level/).selectOption("B1");
    await page.getByRole("radio", { name: "English" }).check();
    await page.getByLabel(/^Deadline/).fill("2030-06-14T18:00");
    await page.getByRole("checkbox", { name: "C1" }).check();
    await page.getByRole("button", { name: "Create assignment" }).click();
    await page.getByRole("link", { name: "Open the assignment" }).click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    return new URL(page.url()).pathname;
  }

  // CA1: the edit form, prefilled; the new subject shows on the page.
  const url = await create("My town");
  await page.getByRole("link", { name: "Edit" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Edit assignment", level: 1 })).toBeVisible();
  await expect(page.getByLabel(/^Deadline/)).toHaveValue("2030-06-14T18:00");
  await expect(page.getByText("The classes are chosen when the assignment is created")).toBeVisible();
  await page.getByLabel(/^Subject/).fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the subject of the task." })).toBeVisible();
  await expect(page.getByLabel(/^Subject/)).toBeFocused();
  await page.getByLabel(/^Subject/).fill("Describe your village.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/asg03-1-saved-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Open the assignment" }).click();
  await expect(page.getByText("Describe your village.").filter({ visible: true })).toBeVisible();

  // R2: locked as the first submission will lock it (E4): the task is read only, no Delete.
  await sql("UPDATE assignments SET locked_at = now() WHERE id = $1", [url.split("/").pop()]);
  await page.reload();
  await expect(page.getByText("Locked by submissions").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/asg03-2-locked-page-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Edit" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Edit assignment", level: 1 })).toBeVisible();
  await expect(page.getByText("Locked", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByLabel(/^Subject/)).toHaveCount(0);
  await expect(page.getByLabel(/^Deadline/)).toHaveCount(0);
  await page.getByLabel(/^Title/).fill("My village");
  await page.getByLabel(/^Level/).selectOption("B2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/asg03-3-locked-edit-desktop.png", fullPage: true });

  // CA1: deleted after confirmation, gone from the list.
  await create("To delete");
  await page.getByRole("button", { name: "Delete" }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete “To delete”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.screenshot({ path: "test-results/asg03-4-delete-dialog-desktop.png" });
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/teacher\/assignments$/);
  const table = page.getByRole("table", { name: "Assignments" });
  await expect(table.getByRole("link", { name: "My village" })).toBeVisible();
  await expect(table.getByRole("link", { name: "To delete" })).toHaveCount(0);
});
