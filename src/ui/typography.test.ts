import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const UI_ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(UI_ROOT, "..");
const MIN_ESSENTIAL_REM = 0.75;

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (/\.(?:css|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

describe("Petra typography contract", () => {
  it("defines the shared caption floor at 12px-equivalent or larger", () => {
    const css = readFileSync(join(UI_ROOT, "typography.css"), "utf8");
    const token = css.match(/--petra-type-caption:\s*([0-9.]+)rem/);
    expect(token).not.toBeNull();
    expect(Number(token?.[1])).toBeGreaterThanOrEqual(MIN_ESSENTIAL_REM);
  });

  it("does not reintroduce raw sub-floor rem font sizes in shipped UI source", () => {
    const violations: string[] = [];

    for (const path of sourceFiles(SRC_ROOT)) {
      const source = readFileSync(path, "utf8");
      const patterns = [
        /font-size:\s*([0-9.]+)rem/g,
        /fontSize:\s*["']([0-9.]+)rem["']/g,
      ];

      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          if (Number(match[1]) < MIN_ESSENTIAL_REM) {
            violations.push(
              `${path.slice(SRC_ROOT.length + 1)}: ${match[0]}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
