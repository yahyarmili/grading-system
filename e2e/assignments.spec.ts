import { expect, test } from "@playwright/test";
import { createClass, phone } from "./support/classes";
import { createTeacher, signIn } from "./support/helpers";

// ASG-01: the "New assignment" form, in a real browser. The integration tests
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
  await page.getByRole("link", { name: "New assignment" }).click();
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
