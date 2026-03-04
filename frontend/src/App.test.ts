import { hashFromView, viewFromHash } from "./App";

describe("hash round-trip for view state", () => {
  it("should preserve both-on state when Teams and People are both active", () => {
    const hash = hashFromView("tasks", true, true);
    const restored = viewFromHash(hash);

    expect(restored.tab).toBe("tasks");
    expect(restored.showTeams).toBe(true);
    expect(restored.showPeople).toBe(true);
  });
});
