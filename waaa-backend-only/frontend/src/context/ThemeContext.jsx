import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("waaa:theme") || "dark");
  const [density, setDensity] = useState(() => localStorage.getItem("waaa:density") || "comfortable");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
    localStorage.setItem("waaa:theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("waaa:density", density);
  }, [density]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, density, setDensity }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
