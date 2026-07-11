import { test, expect } from "@playwright/test";

const PAGES = [
  { label: "首頁總覽", url: "/" },
  { label: "收支分析", url: "/finance" },
  { label: "帳戶與負債", url: "/finance/accounts" },
  { label: "月度回顧", url: "/finance/reviews" },
  { label: "持倉總覽", url: "/portfolio" },
  { label: "交易紀錄", url: "/portfolio/transactions" },
  { label: "績效比較", url: "/portfolio/performance" },
  { label: "淨資產成長", url: "/growth" },
  { label: "Insights", url: "/insights" },
];

test.describe("desktop sidebar navigation", () => {
  test("sidebar links navigate to correct pages", async ({ page }) => {
    // Start from home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify sidebar is visible (desktop)
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Click each nav link and verify URL
    for (const nav of PAGES.slice(1)) {
      // Use the link inside the sidebar
      const link = sidebar.getByRole("link", { name: nav.label, exact: true });
      await link.click();
      await page.waitForURL(nav.url);
      await expect(page).toHaveURL(nav.url);
    }
  });

  test("active sidebar link has accent indicator", async ({ page }) => {
    await page.goto("/finance");
    await page.waitForLoadState("networkidle");

    // The active link should have the accent bar (a child span created by the sidebar)
    const activeLink = page.locator("aside a.bg-dashboard-chip");
    await expect(activeLink).toBeVisible();

    // Verify the accent bar exists within the active link
    const accentBar = activeLink.locator("span.bg-dashboard-accent");
    await expect(accentBar).toBeVisible();
  });

  test("sidebar data-status card is visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const statusCard = page.locator("aside").locator("text=資料狀態");
    await expect(statusCard).toBeVisible();
  });
});

test.describe("mobile bottom nav", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("mobile nav is visible on small screens", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const mobileNav = page.locator('nav[aria-label="行動版導航"]');
    await expect(mobileNav).toBeVisible();
  });

  test("mobile sidebar is hidden on small screens", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sidebar = page.locator("aside");
    await expect(sidebar).not.toBeVisible();
  });

  test("mobile nav links navigate correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const mobileNav = page.locator('nav[aria-label="行動版導航"]');

    // Click 財務 (finance link)
    const financeLink = mobileNav.getByRole("link", { name: "財務" });
    await financeLink.click();
    await page.waitForURL("/finance");
    await expect(page).toHaveURL("/finance");

    // Click 投資 (portfolio link)
    const portfolioLink = mobileNav.getByRole("link", { name: "投資" });
    await portfolioLink.click();
    await page.waitForURL("/portfolio");
    await expect(page).toHaveURL("/portfolio");
  });
});

test.describe("theme toggle", () => {
  test("toggles between dark and light theme", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Get initial theme
    const html = page.locator("html");
    const initialTheme = await html.getAttribute("data-theme");
    expect(["dark", "light"]).toContain(initialTheme);

    // Click theme toggle button
    const toggleBtn = page.getByRole("button", { name: /切換/ });
    await toggleBtn.click();

    // Wait briefly for the DOM update
    await page.waitForTimeout(300);

    const newTheme = await html.getAttribute("data-theme");
    expect(newTheme).not.toBe(initialTheme);
    expect(["dark", "light"]).toContain(newTheme);
  });

  test("theme persists across page navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Set to light
    const toggleBtn = page.getByRole("button", { name: /切換/ });
    await toggleBtn.click();
    await page.waitForTimeout(300);
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");

    // Navigate to another page
    await page.goto("/finance");
    await page.waitForLoadState("networkidle");

    // Theme should still be light
    expect(await page.locator("html").getAttribute("data-theme")).toBe("light");
  });
});

test.describe("range selector", () => {
  test("range pills toggle active state", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const rangeGroup = page.getByRole("radiogroup", { name: "時間範圍" });
    await expect(rangeGroup).toBeVisible();

    // All 5 pills present
    for (const label of ["1M", "3M", "YTD", "1Y", "All"]) {
      await expect(
        rangeGroup.getByRole("radio", { name: label }),
      ).toBeVisible();
    }

    // Click 1M — it should become active (aria-checked=true)
    const oneMonth = rangeGroup.getByRole("radio", { name: "1M" });
    await oneMonth.click();
    await expect(oneMonth).toHaveAttribute("aria-checked", "true");

    // The previously active 3M should no longer be checked
    const threeMonth = rangeGroup.getByRole("radio", { name: "3M" });
    await expect(threeMonth).toHaveAttribute("aria-checked", "false");
  });
});

test.describe("404 page", () => {
  test("shows custom 404 for unknown routes", async ({ page }) => {
    await page.goto("/nonexistent-route-xyz");
    await page.waitForLoadState("networkidle");

    // Should show 404 content
    await expect(page.locator("text=404")).toBeVisible();
    await expect(page.locator("text=找不到此頁面")).toBeVisible();

    // Should have "回到首頁" link
    const homeLink = page.getByRole("link", { name: "回到首頁" });
    await expect(homeLink).toBeVisible();

    // Click and navigate home
    await homeLink.click();
    await page.waitForURL("/");
    await expect(page).toHaveURL("/");
  });
});

test.describe("Obsidian link placeholder", () => {
  test("Obsidian button is disabled", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const obsidianBtn = page.getByRole("button", { name: "前往 Obsidian" });
    await expect(obsidianBtn).toBeVisible();
    await expect(obsidianBtn).toBeDisabled();
  });
});
