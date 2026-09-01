export const colorThemes = [
  {
    value: "midnight",
    label: "Midnight Blue",
    swatch: "#192033",
  },
  {
    value: "forest",
    label: "Forest Green",
    swatch: "#022C22",
  },
] as const;

export type ColorTheme = (typeof colorThemes)[number]["value"];

export const defaultColorTheme: ColorTheme = "midnight";
export const colorThemeStorageKey = "pat-color-theme";

export function isColorTheme(value: string | null): value is ColorTheme {
  return colorThemes.some((theme) => theme.value === value);
}
