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
        priority: "need",
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

test("tabs and zoom controls share the same horizontal row", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const tabButton = page.locator(".tabs button").first();
  const zoomButton = page.locator(".zoom-btn").first();

  await expect(tabButton).toBeVisible();
  await expect(zoomButton).toBeVisible();

  const tabBox = await tabButton.boundingBox();
  const zoomBox = await zoomButton.boundingBox();

  expect(tabBox).not.toBeNull();
  expect(zoomBox).not.toBeNull();

  const tabMidY = (tabBox!.y + tabBox!.height / 2);
  const zoomMidY = (zoomBox!.y + zoomBox!.height / 2);
  const yDelta = Math.abs(tabMidY - zoomMidY);

  expect(yDelta).toBeLessThanOrEqual(10);
});
