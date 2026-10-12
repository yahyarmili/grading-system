import { expect, test } from "@playwright/test";
import { expectNotFound, PASSWORD, signIn, signOut, uniqueEmail, waitForLink } from "./support/helpers";

// AUTH-01, AUTH-02, AUTH-04: a student signs up, confirms the email, signs in.

test("a student signs up, confirms the email and signs in to the student space", async ({ page }) => {
  const email = uniqueEmail("student");

  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("Sam");
  await page.getByLabel("Last name").fill("Lee");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // Not confirmed yet: no session, a new link is offered (AUTH-02 R3).
  await signIn(page, email);
  await expect(page.getByText("Confirm your email address first")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The link opens a page; only the button uses it (mail scanners open links).
  await page.goto(await waitForLink(email, "email_verification"));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();

  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\/assignments$/);
  await expect(page.getByRole("heading", { name: "My assignments" })).toBeVisible();

  // Other spaces answer like missing pages.
  await expectNotFound(page, "/teacher/classes");
  await expectNotFound(page, "/admin/teachers");

  // After sign-out, the back button shows nothing protected (AUTH-02 R4).
  await page.goto("/student/assignments");
  await signOut(page);
  // Not even hidden in the DOM (Next keeps previous pages hidden for back navigation).
  await expect(page.getByText("My assignments")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("My assignments")).toHaveCount(0);
});

test("a visitor is sent to sign in from every space (AUTH-04 CA1)", async ({ page }) => {
  for (const pathname of ["/student/assignments", "/teacher/classes", "/admin/teachers"]) {
    await page.goto(pathname);
    await expect(page, pathname).toHaveURL(/\/sign-in$/);
  }
});
