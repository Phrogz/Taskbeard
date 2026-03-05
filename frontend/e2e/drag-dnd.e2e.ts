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
    season: { start_date: "2026-03-01", end_date: "2026-03-07", timezone: "America/Los_Angeles" },
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
      { date: "2026-03-04", past: false, is_today: false, weekday: "Wed" },
      { date: "2026-03-05", past: false, is_today: false, weekday: "Thu" },
      { date: "2026-03-06", past: false, is_today: false, weekday: "Fri" },
      { date: "2026-03-07", past: false, is_today: false, weekday: "Sat" },
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

async function installDragListeners(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    (window as unknown as Record<string, string[]>).__dragLog = [];
    for (const evt of ["dragstart", "drag", "dragover", "drop", "dragend"]) {
      document.addEventListener(evt, () => {
        (window as unknown as Record<string, string[]>).__dragLog.push(evt);
      }, true);
    }
  });
  return () => page.evaluate(() => (window as unknown as Record<string, string[]>).__dragLog);
}

test("task card has correct draggable attributes and no event prevention", async ({ page }) => {
  await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const result = await taskCard.evaluate((el) => {
    const log: string[] = [];

    document.addEventListener("pointerdown", (e) => {
      log.push(`doc-pointerdown prevented=${e.defaultPrevented}`);
    }, true);
    document.addEventListener("mousedown", (e) => {
      log.push(`doc-mousedown prevented=${e.defaultPrevented}`);
    }, true);

    el.addEventListener("pointerdown", (e) => {
      log.push(`card-pointerdown prevented=${e.defaultPrevented}`);
    });
    el.addEventListener("mousedown", (e) => {
      log.push(`card-mousedown prevented=${e.defaultPrevented}`);
    });

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    el.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, pointerId: 1,
    }));
    el.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0,
    }));

    const styles = getComputedStyle(el);
    const parentStyles = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const gpStyles = el.parentElement?.parentElement
      ? getComputedStyle(el.parentElement.parentElement) : null;

    return {
      log,
      draggable: el.draggable,
      draggableAttr: el.getAttribute("draggable"),
      pointerEvents: styles.pointerEvents,
      userSelect: styles.userSelect,
      webkitUserDrag: styles.getPropertyValue("-webkit-user-drag"),
      parentPointerEvents: parentStyles?.pointerEvents,
      parentOverflow: parentStyles?.overflow,
      gpOverflow: gpStyles?.overflow,
      prevSiblingTag: el.previousElementSibling?.tagName,
      prevSiblingClass: el.previousElementSibling?.className?.toString(),
      prevSiblingPointerEvents: el.previousElementSibling
        ? getComputedStyle(el.previousElementSibling).pointerEvents : null,
    };
  });

  console.log("=== CARD DRAG ATTRIBUTES ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("=== END ===");

  expect(result.draggable).toBe(true);
  expect(result.pointerEvents).not.toBe("none");
  expect(result.log.every((e) => !e.includes("prevented=true"))).toBe(true);
});

test("synthetic drag-drop moves task to new day", async ({ page }) => {
  const routes = await setupPlannerRoutes(page);
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const getDragLog = await installDragListeners(page);

  await page.screenshot({ path: "e2e/screenshots/drag-day-before.png" });

  const targetDay = page.locator(".lane-row").first().locator(".lane-day").nth(4);
  await expect(targetDay).toBeVisible();

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  await taskCard.dispatchEvent("dragstart", { dataTransfer });
  await targetDay.dispatchEvent("dragover", { dataTransfer });
  await targetDay.dispatchEvent("drop", { dataTransfer });
  await taskCard.dispatchEvent("dragend", { dataTransfer });

  await page.screenshot({ path: "e2e/screenshots/drag-day-after.png" });

  const log = await getDragLog();
  console.log("Drag events:", log);

  await expect.poll(() => routes.getLastTasksPut() !== null, { timeout: 5000 }).toBeTruthy();

  const moved = routes.getLastTasksPut()?.find((item) => item.id === "task-1");
  expect(moved?.start_date).toBe("2026-03-05");
});

test.skip("placeholder: real drag moves task to a different team", async ({ page }) => {
  const routes = await setupPlannerRoutes(page, {
    teams: [
      { id: "team-a", name: "Build", colors: "blues" },
      { id: "team-b", name: "Design", colors: "reds" },
    ],
  });
  await page.goto("/");

  const taskCard = page.locator(".task-card", { hasText: "Build bot" });
  await expect(taskCard).toBeVisible();

  const getDragLog = await installDragListeners(page);

  await page.screenshot({ path: "e2e/screenshots/drag-team-before.png" });

  const teamBLane = page.locator(".lane-row").nth(1);
  const targetDay = teamBLane.locator(".lane-day").nth(0);
  await expect(targetDay).toBeVisible();

  await taskCard.dragTo(targetDay, { sourcePosition: { x: 10, y: 10 } });

  await page.screenshot({ path: "e2e/screenshots/drag-team-after.png" });

  const log = await getDragLog();
  console.log("Drag events fired:", log);

  expect(log).toContain("dragstart");
  expect(log).toContain("drop");

  await expect.poll(() => routes.getLastTasksPut() !== null, { timeout: 5000 }).toBeTruthy();

  const moved = routes.getLastTasksPut()?.find((item) => item.id === "task-1");
  expect(moved?.teams).toEqual(["team-b"]);
  expect(moved?.start_date).toBe("2026-03-01");
});
