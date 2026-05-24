import type { AppState } from '../types';

const IDB_DB = 'digimon_survive_db';
const IDB_VERSION = 2;
const IDB_STORE = 'state';
const IDB_IMG_STORE = 'images';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_IMG_STORE)) db.createObjectStore(IDB_IMG_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveImage(key: string, dataUrl: string): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_IMG_STORE, 'readwrite');
      const req = tx.objectStore(IDB_IMG_STORE).put(dataUrl, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silencioso
  }
}

export async function idbLoadImage(key: string): Promise<string | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_IMG_STORE, 'readonly').objectStore(IDB_IMG_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbListImageKeys(): Promise<string[]> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_IMG_STORE, 'readonly').objectStore(IDB_IMG_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function idbSave(state: AppState): Promise<void> {
  try {
    const db = await idbOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(JSON.stringify(state), 'appstate');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silencioso
  }
}

export async function idbLoad(): Promise<AppState | null> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get('appstate');
      req.onsuccess = () => resolve(req.result ? JSON.parse(req.result) as AppState : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
