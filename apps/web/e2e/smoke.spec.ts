import { expect, test } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Kelola Aset Teknologi dengan Percaya Diri" })).toBeVisible();
  await expect(page.getByText("Masuk ke portal Viriya untuk akses workspace Anda")).toBeVisible();
  await expect(page.getByLabel("Tenant Code")).toBeVisible();
  await expect(page.getByLabel("Email Address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
