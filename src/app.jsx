import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";

const name = signal("");
const greeting = signal("");

async function handleGreet() {
  greeting.value = await invoke("greet", { name: name.value });
}

export function App() {
  useEffect(() => {
    const timer = setTimeout(() => {
      invoke("close_splash");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main>
      <img src="/assets/image.png" alt="NightForge Logo" class="logo" />
      <h1>NightForge</h1>
      <p>A Tauri + Preact App</p>
      <div class="input-row">
        <input
          type="text"
          placeholder="Enter your name..."
          value={name}
          onInput={(e) => (name.value = e.currentTarget.value)}
        />
        <button onClick={handleGreet}>Greet</button>
      </div>
      {greeting.value && <p class="greeting">{greeting}</p>}
    </main>
  );
}
