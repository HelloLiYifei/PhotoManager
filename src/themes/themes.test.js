import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_ID,
  THEMES,
  listThemes,
  normalizeThemePreference,
  resolveEffectiveTheme,
} from "./registry";
import { activateTheme, resetThemeRuntimeForTests } from "./runtime";

describe("theme registry", () => {
  it("discovers, orders, and localizes complete themes", () => {
    expect(THEMES).toEqual(["system", "dark", "light"]);
    expect(listThemes("zh-CN")).toEqual([
      { value: "dark", label: "深色", colorScheme: "dark" },
      { value: "light", label: "浅色", colorScheme: "light" },
    ]);
    expect(listThemes("unknown").map((theme) => theme.label)).toEqual(["Dark", "Light"]);
  });

  it("normalizes stored preferences and resolves the system default", () => {
    expect(normalizeThemePreference("missing")).toBe(DEFAULT_THEME_ID);
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
    expect(resolveEffectiveTheme("system", false)).toBe("light");
    expect(resolveEffectiveTheme("light", true)).toBe("light");
  });
});

describe("theme runtime", () => {
  beforeEach(() => {
    resetThemeRuntimeForTests();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.removeProperty("color-scheme");
  });

  afterEach(() => {
    resetThemeRuntimeForTests();
  });

  it("keeps only the active complete stylesheet", async () => {
    await activateTheme("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.querySelectorAll("style[data-app-theme]")).toHaveLength(1);

    await activateTheme("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.querySelectorAll("style[data-app-theme]")).toHaveLength(1);
    expect(document.querySelector("style[data-app-theme]")).toHaveAttribute("data-app-theme", "light");
  });

  it("lets the latest request win and rejects unknown themes", async () => {
    await Promise.all([activateTheme("dark"), activateTheme("light")]);
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    await expect(activateTheme("missing")).rejects.toThrow("Unknown theme");
  });
});
