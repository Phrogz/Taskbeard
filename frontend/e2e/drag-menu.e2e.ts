import { expect, test, type Page, type Route } from "@playwright/test";

type TaskSnapshot = { id: string; start_date: string; end_date: string; teams: string[] };

async function setupPlannerRoutes(
  page: Page,
  overrides: {
    teams?: Array<{ id: string; name: string; colors: string }>;
    tasks?: Array<Record<string, unknown>>;
  } = {}
) {
  const planner = {
    season: { start_date: "2026-03-01", end_date: "2026-03-03", timezone: "America/Los_Angeles" },
    practices: {
      default_hours_per_day: { sun: 0, mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 0 },
      overrides: [],
    },
    events: [],
    breaks: [],
    teams: overrides.teams ?? [{ id: "team-a", name: "Build", colors: "blues" }],
    colors: { blues: ["#99ccff", "#7cb8ff", "#5a9eff"], reds: ["#ff9999", "#ff7777", "#ff5555"] },
    members: [],
    tasks: overrides.tasks ?? [
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

  let lastTasksPut: TaskSnapshot[] | null = null;

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
      const payload = request.postDataJSON() as { tasks: Array<Record<string, unknown>> };
      planner.tasks = payload.tasks;
      lastTasksPut = payload.tasks.map((item) => ({
        id: item.id as string,
        start_date: item.start_date as string,
        end_date: item.end_date as string,
        teams: item.teams as string[],
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

test("pointerdown on task card is not prevented by Radix Trigger", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const prevented = await taskCard.evaluate((el) => {
    return new Promise<boolean>((resolve) => {
      el.addEventListener(
        "pointerdown",
        (ev) => resolve(ev.defaultPrevented),
        { once: true, capture: false }
      );
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    });
  });

  expect(prevented).toBe(false);
});

test("drag moves task to a different day", async ({ page }) => {
  const routes = await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const targetDay = page.locator(".lane-row").first().locator(".lane-day").nth(2);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await taskCard.dispatchEvent("dragstart", { dataTransfer });
  await targetDay.dispatchEvent("dragover", { dataTransfer });
  await targetDay.dispatchEvent("drop", { dataTransfer });

  await expect.poll(() => routes.getLastTasksPut() !== null, { timeout: 5000 }).toBeTruthy();

  const moved = routes.getLastTasksPut()?.find((item) => item.id === "task-1");
  expect(moved?.start_date).toBe("2026-03-03");
  await expect(page.getByText("Complete")).toHaveCount(0);
});

test("drag moves task to a different team", async ({ page }) => {
  const routes = await setupPlannerRoutes(page, {
    teams: [
      { id: "team-a", name: "Build", colors: "blues" },
      { id: "team-b", name: "Design", colors: "reds" },
    ],
  });
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const teamBLane = page.locator(".lane-row").nth(1);
  const targetDay = teamBLane.locator(".lane-day").nth(0);
  await expect(targetDay).toBeVisible();

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await taskCard.dispatchEvent("dragstart", { dataTransfer });
  await targetDay.dispatchEvent("dragover", { dataTransfer });
  await targetDay.dispatchEvent("drop", { dataTransfer });

  await expect.poll(() => routes.getLastTasksPut() !== null, { timeout: 5000 }).toBeTruthy();

  const moved = routes.getLastTasksPut()?.find((item) => item.id === "task-1");
  expect(moved?.teams).toEqual(["team-b"]);
  expect(moved?.start_date).toBe("2026-03-01");
});
