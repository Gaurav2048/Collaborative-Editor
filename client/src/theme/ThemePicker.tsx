import { useEffect, useState } from "react";
export type ThemePreference = "system" | "light" | "dark";
const key = "folio-theme";
function inheritedDark() {
  const root = document.documentElement;
  if (root.classList.contains("dark") || root.dataset.theme === "dark")
    return true;
  if (root.classList.contains("light") || root.dataset.theme === "light")
    return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
/** Standalone preference; never mutates the host application's theme or storage. */
export function useEditorTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
      return "system";
    }
  });
  const [dark, setDark] = useState(inheritedDark);
  useEffect(() => {
    const update = () => setDark(inheritedDark());
    const media = matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  const change = (value: ThemePreference) => {
    setPreference(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Storage may be disabled. */
    }
  };
  return {
    preference,
    change,
    resolved: preference === "system" ? (dark ? "dark" : "light") : preference,
  };
}
export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  return (
    <select
      className="theme-picker"
      aria-label="Editor theme"
      title="Editor appearance"
      value={value}
      onChange={(e) => onChange(e.target.value as ThemePreference)}
    >
      <option value="system">Theme: Auto</option>
      <option value="light">Theme: Light</option>
      <option value="dark">Theme: Dark</option>
    </select>
  );
}
