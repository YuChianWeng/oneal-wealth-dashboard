import { expect, test } from "@playwright/test";

test("renders the dashboard root page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "總覽" })).toBeVisible();
  await expect(page.getByText("最後同步")).toBeVisible();
});
