import { readFileSync } from "fs";
import { resolve } from "path";

describe("override day highlight style", () => {
  it("uses a top-right triangle on day headers and no lane-column top border", () => {
    const cssPath = resolve(process.cwd(), "src/styles.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toMatch(/\.day-cell\.override\s*\{[\s\S]*position:\s*relative;[\s\S]*\}/m);
    expect(css).toMatch(/\.day-cell\.override::after\s*\{[\s\S]*border-left:\s*\d+px\s+solid\s+transparent;[\s\S]*border-top:\s*\d+px\s+solid\s+rgba\(251,\s*191,\s*36,[\s\d.]+\);[\s\S]*\}/m);

    expect(css).not.toMatch(/\.lane-day\.override\s*\{[\s\S]*box-shadow:/m);
    expect(css).not.toMatch(/\.day-cell\.override,\s*\n\.lane-day\.override\s*\{[\s\S]*box-shadow:/m);
  });
});
