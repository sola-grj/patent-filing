"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  colorThemeStorageKey,
  defaultColorTheme,
  isColorTheme,
  type ColorTheme,
} from "@/lib/color-theme";

type ColorThemeContextValue = {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
};

const ColorThemeContext = createContext<ColorThemeContextValue | null>(null);

export function ColorThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [colorTheme, setColorThemeState] =
    useState<ColorTheme>(defaultColorTheme);

  useEffect(() => {
    const currentTheme = document.documentElement.dataset.colorTheme ?? null;
    if (isColorTheme(currentTheme)) {
      setColorThemeState(currentTheme);
    }
  }, []);

  const setColorTheme = useCallback((theme: ColorTheme) => {
    document.documentElement.dataset.colorTheme = theme;
    try {
      window.localStorage.setItem(colorThemeStorageKey, theme);
    } catch {
      // Keep the in-memory theme active when browser storage is unavailable.
    }
    setColorThemeState(theme);
  }, []);

  const value = useMemo(
    () => ({ colorTheme, setColorTheme }),
    [colorTheme, setColorTheme],
  );

  return (
    <ColorThemeContext.Provider value={value}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const value = useContext(ColorThemeContext);
  if (!value) {
    throw new Error("useColorTheme must be used within ColorThemeProvider");
  }
  return value;
}
