import { signal, effect } from "@preact/signals";

const storedTheme = localStorage.getItem("theme") || "dark";
export const theme = signal(storedTheme);
document.documentElement.setAttribute("data-theme", storedTheme);

effect(() => {
  document.documentElement.setAttribute("data-theme", theme.value);
  localStorage.setItem("theme", theme.value);
});

export function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}
