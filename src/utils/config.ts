import { open } from '@tauri-apps/plugin-dialog';
import { LazyStore } from '@tauri-apps/plugin-store';

// Initializes local state storage file safely inside the OS app data directory
const store = new LazyStore('settings.bin');

export async function selectLlamaPath(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select your llama.cpp installation directory'
  });

  if (selected && typeof selected === 'string') {
    await store.set('llama_path', selected);
    await store.save(); // Sync configurations safely to disk
    return selected;
  }
  return null;
}

export async function getSavedLlamaPath(): Promise<string | null> {
  const path = await store.get<{ value: string }>('llama_path');
  return path ? path.value : null;
}
