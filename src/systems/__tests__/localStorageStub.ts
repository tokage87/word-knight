// Minimal in-memory localStorage stand-in for node-environment tests.
// MetaStore.ts reads localStorage at module scope (the `metaStore`
// singleton is constructed on import), so tests stub this global via
// vi.stubGlobal BEFORE dynamically importing the module.

export interface LocalStorageStub {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export function createLocalStorageStub(): LocalStorageStub {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}
