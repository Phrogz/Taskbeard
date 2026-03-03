import { expect, test, type Page, type Route } from "@playwright/test";

async function setupPlannerRoutes(page: Page) {
  const planner = {
    season: { start_date: "2026-03-01", end_date: "2026-03-03", timezone: "America/Los_Angeles" },
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
        start_date: "2026-03-01",
        end_date: "2026-03-02",
        est_hours: 6,
        depends_on: [],
        assigned_to: [],
        completed: false,
        priority: "want",
      },
    ],
    dates: [
      { date: "2026-03-01", past: false, is_today: false, weekday: "Sun" },
      { date: "2026-03-02", past: false, is_today: false, weekday: "Mon" },
      { date: "2026-03-03", past: false, is_today: false, weekday: "Tue" },
    ],
    dependency_warnings: [],
    student_task_map: {},
  };

  let lastTasksPut: Array<{ id: string; start_date: string; end_date: string }> | null = null;

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

    if (url.includes("/api/tasks") && method === "PUT") {
      const payload = request.postDataJSON() as { tasks: typeof planner.tasks };
      planner.tasks = payload.tasks;
      lastTasksPut = payload.tasks.map((item) => ({
        id: item.id,
        start_date: item.start_date,
        end_date: item.end_date,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tasks: payload.tasks }),
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

  return {
    getLastTasksPut: () => lastTasksPut,
  };
}

test("left mousedown alone does not open the context menu", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const box = await taskCard.boundingBox();
  if (!box) throw new Error("Expected task card bounding box");

  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await expect(page.getByText("Complete")).toHaveCount(0);
  await page.mouse.up();
});

test("drag event path writes moved task and does not open context menu", async ({ page }) => {
  const routes = await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const targetDay = page.locator(".lane-row").first().locator(".lane-day").nth(2);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await taskCard.dispatchEvent("dragstart", { dataTransfer });
  await targetDay.dispatchEvent("dragover", { dataTransfer });
  await targetDay.dispatchEvent("drop", { dataTransfer });

  await expect.poll(() => routes.getLastTasksPut() !== null).toBeTruthy();

  const moved = routes.getLastTasksPut()?.find((item) => item.id === "task-1");
  expect(moved?.start_date).toBe("2026-03-03");
  await expect(page.getByText("Complete")).toHaveCount(0);
});
