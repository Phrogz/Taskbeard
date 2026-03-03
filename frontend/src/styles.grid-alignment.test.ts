import { readFileSync } from "fs";
import { resolve } from "path";

describe("grid alignment contract", () => {
  it("uses one shared day-width token for header and lane columns", () => {
    const cssPath = resolve(process.cwd(), "src/styles.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toMatch(/--day-width:\s*\d+px\s*;/);

    const headerMatch = css.match(/\.timeline-header\s*\{[\s\S]*?grid-auto-columns:\s*var\(--day-width\);[\s\S]*?\}/m);
    const laneMatch = css.match(/\.lane-grid\s*\{[\s\S]*?grid-auto-columns:\s*var\(--day-width\);[\s\S]*?\}/m);

    expect(headerMatch).toBeTruthy();
    expect(laneMatch).toBeTruthy();
  });
});
