import { expect, test } from "@playwright/test";
import {
  createAdminWithScript,
  expectNotFound,
  PASSWORD,
  signIn,
  signOut,
  uniqueEmail,
  waitForLink,
} from "./support/helpers";

// AUTH-03: the administrator (created by the local script) invites a teacher,
// who chooses a password and signs in to the teacher space.

test("an invited teacher sets a password and signs in to the teacher space", async ({ page, browser }) => {
  const adminEmail = uniqueEmail("admin");
  const teacherEmail = uniqueEmail("teacher");

  // The administrator chooses a password through the link given by the script.
  await page.goto(await createAdminWithScript(adminEmail));
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByRole("button", { name: "Save the new password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await signIn(page, adminEmail);
  await expect(page).toHaveURL(/\/admin\/teachers$/);

  // Next keeps the previous page (sign-in) hidden in the DOM: work inside the invitation form.
  const invite = page.locator("form").filter({ has: page.getByRole("button", { name: "Send the invitation" }) });
  await invite.getByLabel("First name").fill("Tara");
  await invite.getByLabel("Last name").fill("Quinn");
  await invite.getByLabel("Email").fill(teacherEmail);
  await invite.getByRole("button", { name: "Send the invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: teacherEmail });
  await expect(row.getByText("Waiting for the teacher")).toBeVisible();

  // The teacher, in another browser session, follows the link.
  const teacher = await (await browser.newContext()).newPage();
  await teacher.goto(await waitForLink(teacherEmail, "teacher_invitation"));
  await expect(teacher.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await teacher.getByLabel(/^Password/).fill(PASSWORD);
  await teacher.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(teacher).toHaveURL(/\/teacher\/classes$/);
  await expect(teacher.getByRole("heading", { name: "Classes" })).toBeVisible();

  // The account is a teacher account, and nothing else.
  await expectNotFound(teacher, "/student/assignments");
  await expectNotFound(teacher, "/admin/teachers");

  // Signs out, then back in with the chosen password.
  await teacher.goto("/teacher/classes");
  await signOut(teacher);
  await signIn(teacher, teacherEmail);
  await expect(teacher).toHaveURL(/\/teacher\/classes$/);

  // The administrator sees the invitation accepted, and no class space.
  await page.reload();
  await expect(row.getByText("Account active")).toBeVisible();
  await expectNotFound(page, "/teacher/classes");

  // The link worked once.
  await teacher.goto(await waitForLink(teacherEmail, "teacher_invitation"));
  await expect(teacher.getByRole("heading", { name: "This invitation does not work" })).toBeVisible();
});
