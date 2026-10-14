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
