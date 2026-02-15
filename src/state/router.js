import { signal } from "@preact/signals";

export const currentPage = signal("dashboard");

export function navigate(page) {
  currentPage.value = page;
}
