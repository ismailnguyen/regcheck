import type {
  AppSettings,
  ScenarioInput,
  IngredientInput,
  ValidationResultRecord,
} from "@/types";

const API_BASE_URL = import.meta.env.VITE_DECERNIS_API_BASE_URL
  || (import.meta.env.DEV ? "/decernis-api" : "https://api.decernis.com");

// Local Storage keys
const STORAGE_KEYS = {
  API_KEY: "regcheck.apiKey",
  SCENARIOS: "regcheck.scenarios",
  DEBUG_MODE: "regcheck.debugMode",
  INGREDIENT_HISTORY: "regcheck.validationHistory",
  RECIPE_HISTORY: "regcheck.recipeHistory",
  ACTIVE_MODE: "regcheck.activeMode",
} as const;

export const DEFAULT_INGREDIENT_ENDPOINT = `${API_BASE_URL}/v5/ingredient-analysis/transaction?report=tabular`;
export const DEFAULT_RECIPE_ENDPOINT = `${API_BASE_URL}/v5/recipe-analysis/transaction`;

const HISTORY_DB_NAME = "regcheck.history";
const HISTORY_DB_VERSION = 1;
const HISTORY_MIGRATION_FLAG = "regcheck.history.migrated";

type HistoryStoreKey =
  | typeof STORAGE_KEYS.INGREDIENT_HISTORY
  | typeof STORAGE_KEYS.RECIPE_HISTORY;

const HISTORY_STORE_NAMES: Record<HistoryStoreKey, string> = {
  [STORAGE_KEYS.INGREDIENT_HISTORY]: "ingredientHistory",
  [STORAGE_KEYS.RECIPE_HISTORY]: "recipeHistory",
};

const isBrowserEnvironment = typeof window !== "undefined";
const hasLocalStorage = isBrowserEnvironment && typeof localStorage !== "undefined";
const hasIndexedDB = isBrowserEnvironment && typeof indexedDB !== "undefined";

let historyDbPromise: Promise<IDBDatabase> | null = null;
let historyMigrationPerformed = false;

const isQuotaExceededError = (error: unknown): boolean => {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError"
      || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
      || error.code === 22
      || error.code === 1014
    );
  }
  return false;
};

const openHistoryDatabase = async (): Promise<IDBDatabase> => {
  if (!hasIndexedDB) {
    throw new Error("IndexedDB is not supported in this environment.");
  }

  if (!historyDbPromise) {
    historyDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.values(HISTORY_STORE_NAMES).forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        });
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          historyDbPromise = null;
          historyMigrationPerformed = false;
        };
        resolve(db);
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open history database"));
      };
    }).catch((error) => {
      historyDbPromise = null;
      throw error;
    });
  }

  const db = await historyDbPromise;

  if (!historyMigrationPerformed) {
    historyMigrationPerformed = true;
    try {
      await migrateLegacyHistoryToIndexedDB(db);
    } catch (error) {
      console.error("Failed to migrate legacy history data:", error);
    }
  }

  return db;
};

const migrateLegacyHistoryToIndexedDB = async (db: IDBDatabase): Promise<void> => {
  if (!hasLocalStorage) {
    return;
  }

  if (localStorage.getItem(HISTORY_MIGRATION_FLAG) === "true") {
    return;
  }

  const entries: Array<[HistoryStoreKey, ValidationResultRecord[]]> = [];

  (Object.keys(HISTORY_STORE_NAMES) as HistoryStoreKey[]).forEach((key) => {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as ValidationResultRecord[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        entries.push([key, parsed]);
      }
    } catch (error) {
      console.warn(`Skipping migration of ${key}:`, error);
    }
  });

  if (entries.length === 0) {
    localStorage.setItem(HISTORY_MIGRATION_FLAG, "true");
    return;
  }

  await Promise.all(entries.map(([key, records]) => {
    return new Promise<void>((resolve, reject) => {
      const storeName = HISTORY_STORE_NAMES[key];
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      records.forEach((record) => {
        store.put(record);
      });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error(`Migration aborted for ${storeName}`));
      transaction.onerror = () => reject(transaction.error ?? new Error(`Migration failed for ${storeName}`));
    });
  }));

  entries.forEach(([key]) => {
    localStorage.removeItem(key);
  });

  localStorage.setItem(HISTORY_MIGRATION_FLAG, "true");
};

const getHistoryRecords = async (key: HistoryStoreKey): Promise<ValidationResultRecord[]> => {
  if (hasIndexedDB) {
    const db = await openHistoryDatabase();
    return new Promise<ValidationResultRecord[]>((resolve, reject) => {
      const storeName = HISTORY_STORE_NAMES[key];
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      let results: ValidationResultRecord[] = [];

      const request = store.getAll();
      request.onsuccess = () => {
        results = Array.isArray(request.result) ? request.result : [];
      };

      transaction.oncomplete = () => {
        resolve([...results].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error(`Failed to read history for ${storeName}`));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error(`Failed to read history for ${storeName}`));
      };
    });
  }

  if (!hasLocalStorage) {
    return [];
  }

  const stored = localStorage.getItem(key);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored) as ValidationResultRecord[];
    return Array.isArray(parsed)
      ? [...parsed].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      : [];
  } catch {
    return [];
  }
};

const saveHistoryRecord = async (key: HistoryStoreKey, record: ValidationResultRecord): Promise<void> => {
  if (hasIndexedDB) {
    const db = await openHistoryDatabase();
    await new Promise<void>((resolve, reject) => {
      const storeName = HISTORY_STORE_NAMES[key];
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.put(record);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error(`Failed to save history for ${storeName}`));
      transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to save history for ${storeName}`));
    });
    return;
  }

  if (!hasLocalStorage) {
    throw new Error("Persistent storage is not available in this environment.");
  }

  const existing = await getHistoryRecords(key);
  existing.unshift(record);

  try {
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (error) {
    if (isQuotaExceededError(error)) {
      throw new Error("History storage quota reached. Please clear history or use a browser profile with more storage.");
    }
    throw error instanceof Error ? error : new Error("Failed to save validation history.");
  }
};

const deleteHistoryRecord = async (key: HistoryStoreKey, id: string): Promise<void> => {
  if (hasIndexedDB) {
    const db = await openHistoryDatabase();
    await new Promise<void>((resolve, reject) => {
      const storeName = HISTORY_STORE_NAMES[key];
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error(`Failed to delete history for ${storeName}`));
      transaction.onerror = () => reject(transaction.error ?? new Error(`Failed to delete history for ${storeName}`));
    });
    return;
  }

  if (!hasLocalStorage) {
    return;
  }

  const remaining = (await getHistoryRecords(key)).filter(record => record.id !== id);
  localStorage.setItem(key, JSON.stringify(remaining));
};
// Settings management
export const getSettings = (): Partial<AppSettings> => {
  return {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || "",
    debugMode: localStorage.getItem(STORAGE_KEYS.DEBUG_MODE) === "true",
  };
};

export const saveSettings = (settings: Partial<AppSettings>): void => {
  if (settings.apiKey !== undefined) {
    if (settings.apiKey) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, settings.apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  }

  if (settings.debugMode !== undefined) {
    localStorage.setItem(STORAGE_KEYS.DEBUG_MODE, settings.debugMode ? "true" : "false");
  }
};

export const clearSensitiveData = (): void => {
  localStorage.removeItem(STORAGE_KEYS.API_KEY);
  localStorage.removeItem("regcheck.orgName");
};

// Validation history management
export const getIngredientValidationHistory = async (): Promise<ValidationResultRecord[]> => {
  return getHistoryRecords(STORAGE_KEYS.INGREDIENT_HISTORY);
};

export const saveIngredientValidationResult = async (record: ValidationResultRecord): Promise<void> => {
  await saveHistoryRecord(STORAGE_KEYS.INGREDIENT_HISTORY, record);
};

export const deleteIngredientValidationResult = async (id: string): Promise<void> => {
  await deleteHistoryRecord(STORAGE_KEYS.INGREDIENT_HISTORY, id);
};

export const getRecipeValidationHistory = async (): Promise<ValidationResultRecord[]> => {
  return getHistoryRecords(STORAGE_KEYS.RECIPE_HISTORY);
};

export const saveRecipeValidationResult = async (record: ValidationResultRecord): Promise<void> => {
  await saveHistoryRecord(STORAGE_KEYS.RECIPE_HISTORY, record);
};

export const deleteRecipeValidationResult = async (id: string): Promise<void> => {
  await deleteHistoryRecord(STORAGE_KEYS.RECIPE_HISTORY, id);
};

// Scenarios management
export const getScenarios = (): ScenarioInput[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveScenario = (scenario: ScenarioInput): void => {
  const scenarios = getScenarios();
  const index = scenarios.findIndex(s => s.id === scenario.id);
  
  if (index >= 0) {
    scenarios[index] = scenario;
  } else {
    scenarios.push(scenario);
  }
  
  localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify(scenarios));
};

export const deleteScenario = (id: string): void => {
  const scenarios = getScenarios().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify(scenarios));
};

// Ingredients history management
export const getStoredIngredients = (): IngredientInput[] => {
  try {
    const stored = localStorage.getItem('regcheck.ingredients');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const storeIngredient = (ingredient: IngredientInput): void => {
  const stored = getStoredIngredients();
  const exists = stored.some(item => 
    item.name.toLowerCase() === ingredient.name.toLowerCase() && 
    item.idType === ingredient.idType && 
    item.idValue === ingredient.idValue
  );
  
  if (!exists) {
    stored.push(ingredient);
    localStorage.setItem('regcheck.ingredients', JSON.stringify(stored));
  }
};

// Active mode management
type BuilderMode = "ingredients" | "recipe";

export const getActiveMode = (): BuilderMode | null => {
  const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_MODE);
  if (stored === "ingredients" || stored === "recipe") {
    return stored;
  }
  return null;
};

export const setActiveMode = (mode: BuilderMode): void => {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, mode);
};
