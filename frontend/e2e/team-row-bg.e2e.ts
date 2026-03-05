import { expect, test, type Page, type Route } from "@playwright/test";

async function setupPlannerRoutes(page: Page) {
  const planner = {
    season: { start_date: "2026-03-01", end_date: "2026-03-07", timezone: "America/Los_Angeles" },
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
        start_date: "2026-03-02",
        end_date: "2026-03-03",
        est_hours: 6,
        depends_on: [],
        assigned_to: [],
        completed: false,
        priority: "need",
      },
    ],
    dates: [
      { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
      { date: "2026-03-02", past: true, is_today: false, weekday: "Mon" },
      { date: "2026-03-03", past: false, is_today: true, weekday: "Tue" },
      { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
      { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
      { date: "2026-03-06", past: false, is_today: false, weekday: "Fri" },
      { date: "2026-03-07", past: false, is_today: false, weekday: "Sat" },
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

test("inactive lane-day cells keep no-practice background", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const inactiveLaneDay = page.locator(".lane-day.inactive").first();
  await expect(inactiveLaneDay).toBeVisible();

  const laneBg = await inactiveLaneDay.evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(laneBg).not.toBe("rgba(0, 0, 0, 0)");
});

test("today and past lane-day cells have no extra background", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const todayLaneDay = page.locator(".lane-day.today:not(.inactive):not(.break)").first();
  await expect(todayLaneDay).toBeVisible();

  const todayBg = await todayLaneDay.evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(todayBg).toBe("rgba(0, 0, 0, 0)");

  const pastLaneDay = page.locator(".lane-day.past:not(.inactive):not(.break)").first();
  await expect(pastLaneDay).toBeVisible();

  const pastBg = await pastLaneDay.evaluate(
    (el) => getComputedStyle(el).backgroundColor
  );
  expect(pastBg).toBe("rgba(0, 0, 0, 0)");
});
