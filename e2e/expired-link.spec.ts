import { expect, test } from "@playwright/test";
import { expireLinks, PASSWORD, signIn, uniqueEmail, waitForLink } from "./support/helpers";

// AUTH-01 CA4 and AUTH-05 CA3: an expired confirmation link is refused; a new
// link is requested, works, and the old one stays refused.

test("an expired confirmation link is refused, then a new link confirms the email", async ({ page }) => {
  const email = uniqueEmail("late");

  await page.goto("/sign-up");
  await page.getByLabel("First name").fill("Lou");
  await page.getByLabel("Last name").fill("Late");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const expired = await waitForLink(email, "email_verification");
  await expireLinks(email, "email_verification");
  await page.goto(expired);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();

  // From the refusal, the student asks for a new link.
  await page.getByRole("link", { name: "get a new confirmation link" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send a new link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const fresh = await waitForLink(email, "email_verification", expired);
  await page.goto(fresh);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();

  await signIn(page, email);
  await expect(page).toHaveURL(/\/student\/assignments$/);

  // The old link stays refused.
  await page.goto(expired);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("heading", { name: "This link does not work" })).toBeVisible();
});
