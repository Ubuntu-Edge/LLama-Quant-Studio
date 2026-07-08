import { useEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

interface DroppedFile {
  path: string;
  name: string;
  isGguf: boolean;
}

export function useFileDrop() {
  const [droppedFile, setDroppedFile] = useState<DroppedFile | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    
    const unlistenHover = appWindow.onDragDropEvent((event) => {
      if (event.payload.type === 'hover') {
        setIsHovering(true);
      } else if (event.payload.type === 'drop') {
        setIsHovering(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const absolutePath = paths[0];
          const fileName = absolutePath.split(/[/\\]/).pop() || '';
          
          setDroppedFile({
            path: absolutePath,
            name: fileName,
            isGguf: fileName.endsWith('.gguf')
          });
        }
      } else if (event.payload.type === 'cancelled') {
        setIsHovering(false);
      }
    });

    return () => {
      unlistenHover.then((f) => f());
    };
  }, []);

  return { droppedFile, isHovering };
}
