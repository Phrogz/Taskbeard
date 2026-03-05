import { expect, test } from "@playwright/test";

test("live planner: header day columns align with first lane columns", async ({ page }) => {
  await page.goto("/");

  const headerDays = page.locator(".timeline-header .day-cell");
  const laneDays = page.locator(".lane-row").first().locator(".lane-day");

  await expect(headerDays.first()).toBeVisible();
  await expect(laneDays.first()).toBeVisible();

  const headerCount = await headerDays.count();
  const laneCount = await laneDays.count();
  expect(headerCount).toBeGreaterThan(7);
  expect(laneCount).toBe(headerCount);

  const samples = [0, Math.floor(headerCount / 2), headerCount - 1];
  for (const index of samples) {
    const headerBox = await headerDays.nth(index).boundingBox();
    const laneBox = await laneDays.nth(index).boundingBox();

    expect(headerBox).not.toBeNull();
    expect(laneBox).not.toBeNull();

    const xDelta = Math.abs((headerBox?.x ?? 0) - (laneBox?.x ?? 0));
    const widthDelta = Math.abs((headerBox?.width ?? 0) - (laneBox?.width ?? 0));

    expect(xDelta).toBeLessThanOrEqual(0.75);
    expect(widthDelta).toBeLessThanOrEqual(0.75);
  }
});
