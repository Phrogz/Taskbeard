import { expect, test, type Page, type Route } from "@playwright/test";

async function setupPlannerRoutes(page: Page) {
  const planner = {
    season: { start_date: "2026-02-16", end_date: "2026-03-05", timezone: "America/Los_Angeles" },
    practices: {
      default_hours_per_day: { sun: 0, mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0 },
      overrides: [],
    },
    events: [],
    breaks: [],
    teams: [{ id: "team-a", name: "Build", colors: "blues" }],
    colors: { blues: ["#99ccff", "#7cb8ff", "#5a9eff"] },
    members: [],
    tasks: [
      {
        id: "task-1",
        title: "Build bot",
        teams: ["team-a"],
        start_date: "2026-02-20",
        end_date: "2026-02-24",
        est_hours: 6,
        depends_on: [],
        assigned_to: [],
        completed: false,
        priority: "want",
      },
    ],
    dates: [
      { date: "2026-02-16", past: false, is_today: false, weekday: "Mon" },
      { date: "2026-02-17", past: false, is_today: false, weekday: "Tue" },
      { date: "2026-02-18", past: false, is_today: false, weekday: "Wed" },
      { date: "2026-02-19", past: false, is_today: false, weekday: "Thu" },
      { date: "2026-02-20", past: false, is_today: false, weekday: "Fri" },
      { date: "2026-02-21", past: false, is_today: false, weekday: "Sat" },
      { date: "2026-02-22", past: false, is_today: false, weekday: "Sun" },
      { date: "2026-02-23", past: false, is_today: false, weekday: "Mon" },
      { date: "2026-02-24", past: false, is_today: false, weekday: "Tue" },
      { date: "2026-02-25", past: false, is_today: false, weekday: "Wed" },
      { date: "2026-02-26", past: false, is_today: false, weekday: "Thu" },
      { date: "2026-02-27", past: false, is_today: false, weekday: "Fri" },
      { date: "2026-02-28", past: false, is_today: false, weekday: "Sat" },
      { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
      { date: "2026-03-02", past: false, is_today: true, weekday: "Mon" },
      { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
      { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
      { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
    ],
    dependency_warnings: [],
    student_task_map: {},
  };

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url.includes("/api/planner") && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(planner),
      });
      return;
    }

    if (url.includes("/events")) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      });
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });
}

test("header day columns align with lane day columns", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const headerDays = page.locator(".timeline-header .day-cell");
  const laneDays = page.locator(".lane-row").first().locator(".lane-day");

  await expect(headerDays).toHaveCount(18);
  await expect(laneDays).toHaveCount(18);

  for (let index = 0; index < 18; index += 1) {
    const headerBox = await headerDays.nth(index).boundingBox();
    const laneBox = await laneDays.nth(index).boundingBox();

    expect(headerBox).not.toBeNull();
    expect(laneBox).not.toBeNull();

    const xDelta = Math.abs((headerBox?.x ?? 0) - (laneBox?.x ?? 0));
    const widthDelta = Math.abs((headerBox?.width ?? 0) - (laneBox?.width ?? 0));

    expect(xDelta).toBeLessThanOrEqual(0.5);
    expect(widthDelta).toBeLessThanOrEqual(0.5);
  }
});

test("month boundary aligns to first day of month column", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const marchLabel = page.locator(".timeline-months .month-cell", { hasText: "March" }).first();
  const marchFirstDay = page
    .locator(".timeline-header .day-cell")
    .filter({ has: page.locator(".day-num", { hasText: "01" }) })
    .first();

  await expect(marchLabel).toBeVisible();
  await expect(marchFirstDay).toBeVisible();

  const monthBox = await marchLabel.boundingBox();
  const dayBox = await marchFirstDay.boundingBox();

  expect(monthBox).not.toBeNull();
  expect(dayBox).not.toBeNull();

  const xDelta = Math.abs((monthBox?.x ?? 0) - (dayBox?.x ?? 0));
  expect(xDelta).toBeLessThanOrEqual(0.5);
});

test("first day starts at lane-grid edge", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await setupPlannerRoutes(page);
  await page.goto("/");

  const firstHeaderDay = page.locator(".timeline-header .day-cell").first();
  const firstLaneDay = page.locator(".lane-row").first().locator(".lane-day").first();

  await expect(firstHeaderDay).toBeVisible();
  await expect(firstLaneDay).toBeVisible();

  const headerBox = await firstHeaderDay.boundingBox();
  const laneBox = await firstLaneDay.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(laneBox).not.toBeNull();

  const xDelta = Math.abs((headerBox?.x ?? 0) - (laneBox?.x ?? 0));
  expect(xDelta).toBeLessThanOrEqual(0.5);
});
