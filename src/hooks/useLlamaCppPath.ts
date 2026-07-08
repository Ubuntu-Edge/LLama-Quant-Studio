import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface UseLlamaCppPathResult {
  path: string | null;
  isLoading: boolean;
  error: string | null;
  selectDirectory: () => Promise<void>;
  clearPath: () => Promise<void>;
}

/**
 * Manages the persisted llama.cpp working directory path.
 * - Loads the saved path on mount.
 * - Exposes selectDirectory() to open a native folder picker and persist the result.
 * - Exposes clearPath() to remove the saved path.
 */
export function useLlamaCppPath(): UseLlamaCppPathResult {
  const [path, setPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load persisted path on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const saved = await invoke<string | null>("load_llama_cpp_path");
        if (!cancelled) setPath(saved);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectDirectory = useCallback(async () => {
    setError(null);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your llama.cpp directory",
      });

      // User cancelled the dialog
      if (!selected || Array.isArray(selected)) return;

      await invoke("save_llama_cpp_path", { path: selected });
      setPath(selected);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const clearPath = useCallback(async () => {
    setError(null);
    try {
      await invoke("clear_llama_cpp_path");
      setPath(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  return { path, isLoading, error, selectDirectory, clearPath };
}
