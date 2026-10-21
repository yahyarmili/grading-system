import { expect, type Browser, type Page } from "@playwright/test";
import { createStudent, createTeacher, signIn } from "./helpers";

// Class screens shared by the E2 journeys (CLS-01 to CLS-04).

/** A phone in portrait: the student screens target it. */
export const phone = { viewport: { width: 375, height: 812 } };

/** Opens "New class", types the name and submits; returns the dialog. */
export async function createClass(page: Page, name: string) {
  await page.getByRole("button", { name: "New class" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New class" });
  await dialog.getByLabel(/^Class name/).fill(name);
  await dialog.getByRole("button", { name: "Create class" }).click();
  return dialog;
}

/** A class card of the teacher's Classes screen. */
export const classCard = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });

/** The "Invite students" card of a class page. */
export const inviteCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite students" }) });

/** The "Students" section of a class page. */
export const rosterSection = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Students", exact: true }) });

/** A teacher with one class, in their own browser, on the class page; returns the class link and code. */
export async function teacherWithClass(browser: Browser, name: string, teacher: [string, string] = ["Sarah", "Bennett"]) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, await createTeacher(...teacher));
  await expect(page).toHaveURL(/\/teacher\//);
  await page.goto("/teacher/classes");
  await expect(await createClass(page, name)).toBeHidden();
  await classCard(page, name).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  const link = await inviteCard(page).getByLabel("Link").inputValue();
  const code = (await inviteCard(page).getByLabel("Code").textContent())!;
  return { page, link, code, url: new URL(page.url()).pathname };
}

/** A student on a phone, signed in, who joined the class with its code (E6, E7 journeys). */
export async function studentInClass(browser: Browser, code: string, student: [string, string] = ["Lina", "Amrani"]) {
  const page = await (await browser.newContext(phone)).newPage();
  const email = await createStudent(...student);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\//);
  await page.goto("/student/classes");
  await page.getByLabel("Class code").fill(code);
  await page.getByRole("button", { name: "Join the class" }).click();
  await expect(page.getByText("You joined the class")).toBeVisible();
  return { page, email };
}

/** The status the student sees once they submitted, whatever the state (SUB-01 CA2). */
export const beingMarked = (page: Page) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Text submitted" }) })
    .getByText("Submitted, being marked");
