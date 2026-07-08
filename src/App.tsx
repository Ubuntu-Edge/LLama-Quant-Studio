import { useLlamaCppPath } from "./hooks/useLlamaCppPath";
import logo from "./assets/logo.jpeg";
import "./App.css";

function App() {
  const { path, isLoading, error, selectDirectory, clearPath } = useLlamaCppPath();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="Ubuntu Edge AI" />
          <div className="sidebar-brand-text">
            <span className="name">Llama Quant Studio</span>
            <span className="tag">Edge AI Tooling</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a href="#" className="active">
            Setup
          </a>
          <a href="#">Models</a>
          <a href="#">Quantize</a>
          <a href="#">Logs</a>
        </nav>
      </aside>

      <main className="main">
        <div className="eyebrow">Step 1 · Environment</div>
        <h1>Point us to llama.cpp</h1>
        <p className="subtitle">
          Select the working directory where your local llama.cpp build lives.
          We'll remember it next time you open the app.
        </p>

        <div className="card">
          <h2>Working directory</h2>
          <p className="desc">
            This should be the root folder containing your compiled llama.cpp
            binaries.
          </p>

          {isLoading ? (
            <div className="empty-state">checking for a saved path...</div>
          ) : path ? (
            <div className="path-readout">
              <span className="label">$</span>
              {path}
            </div>
          ) : (
            <div className="empty-state">no directory selected yet</div>
          )}

          <div className="btn-row">
            {path ? (
              <>
                <button className="btn-secondary" onClick={selectDirectory}>
                  Change directory
                </button>
                <button className="btn-secondary" onClick={clearPath}>
                  Clear
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={selectDirectory}>
                Select directory
              </button>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}
        </div>
      </main>
    </div>
  );
}

export default App;