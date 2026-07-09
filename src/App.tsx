import { useState, useRef, useEffect } from "react";
import { useLlamaCppPath } from "./hooks/useLlamaCppPath";
import { useConversionJob } from "./hooks/useConversionJob";
import { useQuantizationJob } from "./hooks/useQuantizationJob";
import logo from "./assets/logo.jpeg";
import "./App.css";

type Tab = "setup" | "convert" | "quantize";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("setup");
  const { path: llamaPath, isLoading: isPathLoading, error: pathError, selectDirectory, clearPath } = useLlamaCppPath();

  // Pipeline state hooks loaded cleanly
  const conversion = useConversionJob();
  const quantization = useQuantizationJob();

  // Explicit parameters for pipeline inputs
  const [hfPath, setHfPath] = useState("");
  const [modelName, setModelName] = useState("llama-model");
  const [inputF16Path, setInputF16Path] = useState("");
  const [quantType, setQuantType] = useState("Q4_K_M");

  const convertConsoleRef = useRef<HTMLDivElement>(null);
  const quantConsoleRef = useRef<HTMLDivElement>(null);

  // Keep logs pinned to bottom during stream loops
  useEffect(() => {
    convertConsoleRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversion.logs]);

  useEffect(() => {
    quantConsoleRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [quantization.logs]);

  return (
    <div className="app-shell">
      {/* Shared Native Sidebar Layout */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={logo} alt="Ubuntu Edge AI" />
          <div className="sidebar-brand-text">
            <span className="name">Llama Quant Studio</span>
            <span className="tag">Edge AI Tooling</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={activeTab === "setup" ? "active" : ""}
            onClick={() => setActiveTab("setup")}
          >
            Setup
          </button>
          <button
            className={activeTab === "convert" ? "active" : ""}
            onClick={() => setActiveTab("convert")}
          >
            HF Conversion
          </button>
          <button
            className={activeTab === "quantize" ? "active" : ""}
            onClick={() => setActiveTab("quantize")}
          >
            Quantize Matrix
          </button>
        </nav>
      </aside>

      {/* Dynamic Viewport Window Panel */}
      <main className="main">

        {/* VIEW 1: SETUP WORKSPACE */}
        {activeTab === "setup" && (
          <>
            <div className="eyebrow">Step 1 · Environment</div>
            <h1>Point us to llama.cpp</h1>
            <p className="subtitle">
              Select the working directory where your local llama.cpp build lives. We'll remember it next time you open the app.
            </p>

            <div className="card">
              <h2>Working directory</h2>
              <p className="desc">This should be the root folder containing your compiled llama.cpp binaries.</p>

              {isPathLoading ? (
                <div className="empty-state">checking for a saved path...</div>
              ) : llamaPath ? (
                <div className="path-readout">
                  <span className="label">$</span>
                  {llamaPath}
                </div>
              ) : (
                <div className="empty-state">no directory selected yet</div>
              )}

              <div className="btn-row">
                {llamaPath ? (
                  <>
                    <button className="btn-secondary" onClick={selectDirectory}>Change directory</button>
                    <button className="btn-secondary" onClick={clearPath}>Clear</button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={selectDirectory}>Select directory</button>
                )}
              </div>
              {pathError && <p className="error-text">{pathError}</p>}
            </div>
          </>
        )}

        {/* VIEW 2: HUGGING FACE STAGE 1 CONVERSION */}
        {activeTab === "convert" && (
          <>
            <div className="eyebrow">Phase 2 · Pipeline Stage 1</div>
            <h1>Convert HF Repository to GGUF</h1>
            <p className="subtitle">Run convert_hf_to_gguf.py to generate an unquantized F16 base file matrix.</p>

            <div className="card">
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", uppercase: true, color: "#94a3b8", marginBottom: "4px" }}>Hugging Face Folder Path</label>
                  <input
                    type="text"
                    value={hfPath}
                    onChange={(e) => setHfPath(e.target.value)}
                    placeholder="C:/Paths/To/Your/HuggingFace-Model"
                    disabled={conversion.isRunning}
                    style={{ width: "100%", padding: "10px", background: "#020617", border: "1px solid #1e293b", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", uppercase: true, color: "#94a3b8", marginBottom: "4px" }}>Model Output Name</label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., llama-7b"
                    disabled={conversion.isRunning}
                    style={{ width: "100%", padding: "10px", background: "#020617", border: "1px solid #1e293b", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
              </div>

              <div className="btn-row">
                <button
                  className="btn-primary"
                  disabled={conversion.isRunning || !hfPath}
                  onClick={() => conversion.start(hfPath, modelName)}
                >
                  {conversion.isRunning ? "Converting Matrix..." : "Start Conversion Pass"}
                </button>
              </div>

              {conversion.error && <p className="error-text" style={{ marginTop: "1rem" }}>{conversion.error}</p>}
              {conversion.result && (
                <p style={{ marginTop: "1rem", fontSize: "13px", color: conversion.result.success ? "#34d399" : "#f87171" }}>
                  {conversion.result.message} {conversion.result.outputPath && `-> ${conversion.result.outputPath}`}
                </p>
              )}

              {/* Streaming Output Window */}
              <div style={{ marginTop: "1.5rem", background: "#020617", borderRadius: "8px", border: "1px solid #0f172a", padding: "12px", fontFamily: "monospace", fontSize: "12px" }}>
                <div style={{ paddingBottom: "6px", borderBottom: "1px solid #1e293b", color: "#64748b", marginBottom: "8px", fontSize: "10px" }}>CONVERSION FEED (STDOUT/STDERR)</div>
                <div style={{ height: "200px", overflowY: "auto", color: "#cbd5e1" }}>
                  {conversion.logs.length === 0 && <span style={{ color: "#475569", italic: true }}>Feed idle. Initiate conversion pass to view live tracking outputs...</span>}
                  {conversion.logs.map((log, idx) => (
                    <div key={idx} style={{ color: log.stream === "stderr" ? "#fbbf24" : "#cbd5e1" }}>{log.line}</div>
                  ))}
                  <div ref={convertConsoleRef} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* VIEW 3: CORE MATRIX QUANTIZATION STAGE 2 */}
        {activeTab === "quantize" && (
          <>
            <div className="eyebrow">Phase 2 · Pipeline Stage 2</div>
            <h1>Quantize Matrix Core</h1>
            <p className="subtitle">Execute llama-quantize to apply token-based structural compression weights.</p>

            <div className="card">
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", uppercase: true, color: "#94a3b8", marginBottom: "4px" }}>Source F16 GGUF Path</label>
                  <input
                    type="text"
                    value={inputF16Path}
                    onChange={(e) => setInputF16Path(e.target.value)}
                    placeholder="C:/Paths/To/outputs/your-model-f16.gguf"
                    disabled={quantization.isRunning}
                    style={{ width: "100%", padding: "10px", background: "#020617", border: "1px solid #1e293b", borderRadius: "6px", color: "#f8fafc" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", uppercase: true, color: "#94a3b8", marginBottom: "4px" }}>Compression Type</label>
                  <select
                    value={quantType}
                    onChange={(e) => setQuantType(e.target.value)}
                    disabled={quantization.isRunning}
                    style={{ width: "100%", padding: "10px", background: "#020617", border: "1px solid #1e293b", borderRadius: "6px", color: "#818cf8", fontFamily: "monospace" }}
                  >
                    <option value="Q4_K_M">Q4_K_M (Recommended Balanced)</option>
                    <option value="Q5_K_M">Q5_K_M (High Fidelity)</option>
                    <option value="Q8_0">Q8_0 (Near Lossless)</option>
                    <option value="IQ4_NL">IQ4_NL (High Compression)</option>
                  </select>
                </div>
              </div>

              {/* Token Metric Loading Visual */}
              {quantization.isRunning && (
                <div style={{ marginBottom: "1.5rem", background: "#020617", padding: "12px", border: "1px solid #0f172a", borderRadius: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "between", fontSize: "11px", fontFamily: "monospace", color: "#94a3b8", marginBottom: "6px" }}>
                    <span>Token Parsing Layer Computation Progress</span>
                    <span style={{ color: "#6366f1", fontWeight: "bold" }}>{quantization.progress}%</span>
                  </div>
                  <div style={{ width: "100%", background: "#0f172a", height: "6px", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ width: `${quantization.progress}%`, background: "#6366f1", height: "100%", transition: "width 0.3s ease" }}></div>
                  </div>
                </div>
              )}

              <div className="btn-row">
                <button
                  className="btn-primary"
                  disabled={quantization.isRunning || !inputF16Path}
                  onClick={() => quantization.start(inputF16Path, modelName, quantType)}
                >
                  {quantization.isRunning ? "Quantizing..." : "Ignite Quantization Engine"}
                </button>
              </div>

              {quantization.error && <p className="error-text" style={{ marginTop: "1rem" }}>{quantization.error}</p>}
              {quantization.result && (
                <p style={{ marginTop: "1rem", fontSize: "13px", color: quantization.result.success ? "#34d399" : "#f87171" }}>
                  {quantization.result.message} {quantization.result.outputPath && `-> ${quantization.result.outputPath}`}
                </p>
              )}

              {/* Developer Stream Output Console */}
              <div style={{ marginTop: "1.5rem", background: "#020617", borderRadius: "8px", border: "1px solid #0f172a", padding: "12px", fontFamily: "monospace", fontSize: "12px" }}>
                <div style={{ paddingBottom: "6px", borderBottom: "1px solid #1e293b", color: "#64748b", marginBottom: "8px", fontSize: "10px" }}>QUANTIZER FEED (STDERR STREAM)</div>
                <div style={{ height: "200px", overflowY: "auto", color: "#cbd5e1" }}>
                  {quantization.logs.length === 0 && <span style={{ color: "#475569", italic: true }}>Console empty. Run optimization process to isolate parsing matrix data...</span>}
                  {quantization.logs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                  <div ref={quantConsoleRef} />
                </div>
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  );
}

export default App;