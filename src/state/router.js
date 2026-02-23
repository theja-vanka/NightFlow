import { signal } from "@preact/signals";

export const currentPage = signal("dashboard");
export const routeParams = signal({});

export function navigate(page, params = {}) {
  currentPage.value = page;
  routeParams.value = params;
}
