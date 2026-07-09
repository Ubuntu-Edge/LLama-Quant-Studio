import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { stat } from '@tauri-apps/plugin-fs';

export type DroppedItemKind = 'gguf' | 'directory' | 'unknown';

export interface DroppedItem {
    /** Absolute path of the dropped file or directory. */
    path: string;
    /** Last path component (file name or folder name). */
    name: string;
    /** Semantic kind — 'gguf' for model files, 'directory' for HF repos, 'unknown' otherwise. */
    kind: DroppedItemKind;
}

export interface UseFileDropResult {
    /** All items from the most recent drop. Empty until the first drop. */
    droppedItems: DroppedItem[];
    /** True while the user is dragging over the window. */
    isHovering: boolean;
    /** Clear the current drop result. */
    clear: () => void;
}

async function resolveKind(absolutePath: string): Promise<DroppedItemKind> {
    try {
        const info = await stat(absolutePath);
        if (info.isDirectory) return 'directory';
        if (absolutePath.toLowerCase().endsWith('.gguf')) return 'gguf';
        return 'unknown';
    } catch {
        // Fallback to extension check if stat is unavailable (e.g. sandboxed path)
        if (absolutePath.toLowerCase().endsWith('.gguf')) return 'gguf';
        return 'unknown';
    }
}

export function useFileDrop(): UseFileDropResult {
    const [droppedItems, setDroppedItems] = useState<DroppedItem[]>([]);
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        const appWindow = getCurrentWebviewWindow();

        const unlistenPromise = appWindow.onDragDropEvent(async (event) => {
            const { type } = event.payload;

            if (type === 'hover') {
                setIsHovering(true);
                return;
            }

            if (type === 'cancelled') {
                setIsHovering(false);
                return;
            }

            if (type === 'drop') {
                setIsHovering(false);
                const paths: string[] = event.payload.paths ?? [];
                if (paths.length === 0) return;

                const resolved = await Promise.all(
                    paths.map(async (absolutePath): Promise<DroppedItem> => {
                        const name = absolutePath.replace(/\\/g, '/').split('/').pop() ?? absolutePath;
                        const kind = await resolveKind(absolutePath);
                        return { path: absolutePath, name, kind };
                    })
                );

                setDroppedItems(resolved);
            }
        });

        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    }, []);

    const clear = () => setDroppedItems([]);

    return { droppedItems, isHovering, clear };
}

