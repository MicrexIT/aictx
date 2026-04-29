import { mount } from "svelte";

import App from "./App.svelte";

const target = document.getElementById("app");

if (!(target instanceof HTMLElement)) {
  throw new Error("Viewer mount element was not found.");
}

const app = mount(App, {
  target
});

export default app;
