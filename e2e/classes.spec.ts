import { expect, test, type Page } from "@playwright/test";
import { createTeacher, signIn } from "./support/helpers";

// CLS-01: a teacher creates and lists their classes (CA1 to CA3).

async function createClass(page: Page, name: string) {
  await page.getByRole("button", { name: "New class" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New class" });
  await dialog.getByLabel(/^Class name/).fill(name);
  await dialog.getByRole("button", { name: "Create class" }).click();
  return dialog;
}

const classCard = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });

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
