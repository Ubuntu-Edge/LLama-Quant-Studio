import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface LogEntry {
    stream: "stdout" | "stderr";
    line: string;
}

interface JobDone {
    success: boolean;
    message: string;
    outputPath: string | null;
}

interface UseConversionJobResult {
    isRunning: boolean;
    logs: LogEntry[];
    result: JobDone | null;
    error: string | null;
    start: (hfRepoPath: string, modelName: string) => Promise<void>;
    clearLogs: () => void;
}

/**
 * Drives the HF -> GGUF conversion job. Starting a job invokes the Rust
 * command, which spawns python3 convert_hf_to_gguf.py and streams its
 * output back via Tauri events.
 */
export function useConversionJob(): UseConversionJobResult {
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [result, setResult] = useState<JobDone | null>(null);
    const [error, setError] = useState<string | null>(null);

    const unlistenRefs = useRef<UnlistenFn[]>([]);

    useEffect(() => {
        return () => {
            unlistenRefs.current.forEach((off) => off());
        };
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
        setResult(null);
        setError(null);
    }, []);

    const start = useCallback(async (hfRepoPath: string, modelName: string) => {
        setError(null);
        setResult(null);
        setLogs([]);
        setIsRunning(true);

        // Clean up any previous listeners before attaching new ones
        unlistenRefs.current.forEach((off) => off());
        unlistenRefs.current = [];

        const offLog = await listen<LogEntry>("conversion://log", (event) => {
            setLogs((prev) => [...prev, event.payload]);
        });

        const offDone = await listen<JobDone>("conversion://done", (event) => {
            setResult(event.payload);
            setIsRunning(false);
        });

        unlistenRefs.current = [offLog, offDone];

        try {
            await invoke("convert_hf_to_gguf", {
                hfRepoPath,
                modelName,
            });
        } catch (err) {
            setError(String(err));
            setIsRunning(false);
        }
    }, []);

    return { isRunning, logs, result, error, start, clearLogs };
}