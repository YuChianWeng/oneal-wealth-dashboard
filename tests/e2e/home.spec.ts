import { expect, test } from "@playwright/test";

test("renders the dashboard root page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Oneal Wealth Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByText("Read-only v1 · no financial records are changed."),
  ).toBeVisible();
});
