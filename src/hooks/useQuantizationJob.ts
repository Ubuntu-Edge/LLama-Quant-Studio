import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface QuantLogEntry {
    line: string;
    percentage: number;
}

interface JobDone {
    success: boolean;
    message: string;
    outputPath: string | null;
}

interface UseQuantizationJobResult {
    isRunning: boolean;
    logs: string[];
    progress: number;
    result: JobDone | null;
    error: string | null;
    start: (inputF16Path: string, modelName: string, quantType: string) => Promise<void>;
    clearLogs: () => void;
}

/**
 * Drives the GGUF Matrix Quantization job. Invokes the Rust command,
 * captures streaming log tokens to calculate loading metrics, and
 * updates real-time tracking variables.
 */
export function useQuantizationJob(): UseQuantizationJobResult {
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState<number>(0);
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
        setProgress(0);
        setResult(null);
        setError(null);
    }, []);

    const start = useCallback(async (inputF16Path: string, modelName: string, quantType: string) => {
        setError(null);
        setResult(null);
        setLogs([]);
        setProgress(0);
        setIsRunning(true);

        // Clear dangling pipeline listeners
        unlistenRefs.current.forEach((off) => off());
        unlistenRefs.current = [];

        // Listen for the rolling token calculations from llama-quantize
        const offLog = await listen<QuantLogEntry>("quantization://log", (event) => {
            setLogs((prev) => [...prev, event.payload.line]);
            if (event.payload.percentage > 0) {
                setProgress(Math.round(event.payload.percentage));
            }
        });

        // Listen for process execution termination status
        const offDone = await listen<JobDone>("quantization://done", (event) => {
            setResult(event.payload);
            setIsRunning(false);
            if (event.payload.success) {
                setProgress(100);
            }
        });

        unlistenRefs.current = [offLog, offDone];

        try {
            await invoke("quantize_matrix", {
                inputF16Path,
                modelName,
                quantType,
            });
        } catch (err) {
            setError(String(err));
            setIsRunning(false);
        }
    }, []);

    return { isRunning, logs, progress, result, error, start, clearLogs };
}