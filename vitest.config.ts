import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Vitest options live here rather than inside vite.config.ts because `vitest`
// resolves its own nested copy of `vite`, so `defineConfig` from `vitest/config`
// will not accept the plugin objects that the top-level `vite` config declares.
// Merging keeps the dev/build config authoritative for plugins and aliases.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Several design-system tests import stylesheets with Vite's `?raw` suffix
      // to assert on real CSS text. Vitest disables CSS processing by default and
      // stubs every CSS module with an empty export, which silently turns those
      // assertions into `expected '' to contain ...`. Processing must stay on so
      // `?raw` yields the file's actual source.
      css: true,
    },
  }),
);
