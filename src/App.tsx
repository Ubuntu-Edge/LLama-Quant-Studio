import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { useLlamaCppPath } from "./hooks/useLlamaCppPath";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  const {
    path,
    isLoading,
    error,
    selectDirectory,
    clearPath,
  } = useLlamaCppPath();

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>

      <hr style={{ margin: "2rem 0" }} />

      <h2>llama.cpp Directory</h2>

      {isLoading ? (
        <p>Loading saved path...</p>
      ) : path ? (
        <div>
          <p>Current path: {path}</p>
          <button onClick={selectDirectory}>Change Directory</button>
          <button onClick={clearPath}>Clear</button>
        </div>
      ) : (
        <button onClick={selectDirectory}>Select llama.cpp Directory</button>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}

export default App;