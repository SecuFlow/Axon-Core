const LEGACY_STORAGE_KEY = "axon_worker_offline_reports_v1";

const DB_NAME = "axon_worker_app";
const DB_VERSION = 2;
const STORE_REPORTS = "offline_reports";
const STORE_VOICE = "pending_voice";

export type OfflineWorkerReport = {
  id: string;
  createdAt: string;
  machineName: string;
  issueDescription: string;
  category?: "maschinenfehler" | "prozessoptimierung" | "sicherheitsrisiko" | null;
  /** data:image/...;base64,... */
  photoDataUrls: string[];
  analysisText?: string | null;
  priorityLevel?: string | null;
  warning?: string | null;
  httpError?: string | null;
};

export type PendingVoiceSync = {
  id: string;
  createdAt: string;
  field: "machine_name" | "issue_description";
  /** z. B. audio/webm */
  mimeType: string;
  audioBlob: Blob;
};

let dbPromise: Promise<IDBDatabase> | null = null;
let migrateLegacyPromise: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (ev.oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          db.createObjectStore(STORE_REPORTS, { keyPath: "id" });
        }
      }
      if (ev.oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_VOICE)) {
          db.createObjectStore(STORE_VOICE, { keyPath: "id" });
        }
      }
    };
  });
  return dbPromise;
}

async function migrateLegacyFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  if (migrateLegacyPromise) return migrateLegacyPromise;
  migrateLegacyPromise = (async () => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const db = await openDb();
      for (const row of parsed) {
        const r = row as OfflineWorkerReport;
        if (!r?.id) continue;
        await idbPut(db, STORE_REPORTS, r);
      }
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* Queue bleibt ggf. in Legacy, bis Platz da ist */
    }
  })();
  return migrateLegacyPromise;
}

function idbPut<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const st = tx.objectStore(store);
    const req = st.getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
    req.onerror = () => reject(req.error);
  });
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const st = tx.objectStore(store);
    const req = st.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  await migrateLegacyFromLocalStorage();
  const db = await openDb();
  return fn(db);
}

export async function queueOfflineReport(
  entry: Omit<OfflineWorkerReport, "id" | "createdAt">,
): Promise<void> {
  if (typeof window === "undefined") return;
  const row: OfflineWorkerReport = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
      .toString(16)
      .slice(2)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  await withDb(async (db) => {
    const existing = await idbGetAll<OfflineWorkerReport>(db, STORE_REPORTS);
    const next = [...existing, row].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const trimmed = next.slice(-25);
    await idbClear(db, STORE_REPORTS);
    for (const r of trimmed) {
      await idbPut(db, STORE_REPORTS, r);
    }
  });
}

export async function getOfflineReportCount(): Promise<number> {
  const q = await getOfflineReportsQueue();
  return q.length;
}

export async function clearOfflineReportsQueue(): Promise<void> {
  if (typeof window === "undefined") return;
  await withDb((db) => idbClear(db, STORE_REPORTS));
}

export async function getOfflineReportsQueue(): Promise<OfflineWorkerReport[]> {
  if (typeof window === "undefined") return [];
  return withDb(async (db) => {
    const rows = await idbGetAll<OfflineWorkerReport>(db, STORE_REPORTS);
    return rows.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  });
}

export async function removeOfflineReportById(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  await withDb((db) => idbDelete(db, STORE_REPORTS, id));
}

export async function peekLatestOfflineReport(): Promise<OfflineWorkerReport | null> {
  const q = await getOfflineReportsQueue();
  return q.length ? q[q.length - 1]! : null;
}

export async function enqueuePendingVoiceSync(
  field: PendingVoiceSync["field"],
  audioBlob: Blob,
): Promise<void> {
  if (typeof window === "undefined") return;
  const row: PendingVoiceSync = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    field,
    mimeType: audioBlob.type || "audio/webm",
    audioBlob,
  };
  await withDb((db) => idbPut(db, STORE_VOICE, row));
}

export async function getPendingVoiceQueue(): Promise<PendingVoiceSync[]> {
  if (typeof window === "undefined") return [];
  return withDb(async (db) => {
    const rows = await idbGetAll<PendingVoiceSync>(db, STORE_VOICE);
    return rows.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  });
}

export async function removePendingVoiceById(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  await withDb((db) => idbDelete(db, STORE_VOICE, id));
}

export async function filesToDataUrls(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files.slice(0, 5)) {
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = typeof r.result === "string" ? r.result : "";
          resolve(s);
        };
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(f);
      });
      if (b64.startsWith("data:")) out.push(b64);
    } catch {
      // einzelnes Bild überspringen
    }
  }
  return out;
}

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const raw = (dataUrl ?? "").trim();
  const match = /^data:([^;]+);base64,(.+)$/.exec(raw);
  if (!match) return null;
  try {
    const mime = match[1] || "application/octet-stream";
    const b64 = match[2] || "";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
