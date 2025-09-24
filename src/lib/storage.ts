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
  ENDPOINT: "regcheck.endpoint",
  SCENARIOS: "regcheck.scenarios",
  DEBUG_MODE: "regcheck.debugMode",
  INGREDIENT_HISTORY: "regcheck.validationHistory",
  RECIPE_HISTORY: "regcheck.recipeHistory",
} as const;

export const DEFAULT_INGREDIENT_ENDPOINT = `${API_BASE_URL}/v5/ingredient-analysis/transaction?report=tabular`;
export const DEFAULT_RECIPE_ENDPOINT = `${API_BASE_URL}/v5/recipe-analysis/transaction?report=tabular`;
export const DEFAULT_ENDPOINT = DEFAULT_INGREDIENT_ENDPOINT;

export const deriveRecipeEndpoint = (ingredientEndpoint?: string): string => {
  if (!ingredientEndpoint) return DEFAULT_RECIPE_ENDPOINT;
  try {
    const url = new URL(ingredientEndpoint);
    url.pathname = url.pathname.replace("ingredient-analysis", "recipe-analysis");
    return `${url.origin}${url.pathname}${url.search || ""}`;
  } catch {
    return ingredientEndpoint.replace("ingredient-analysis", "recipe-analysis");
  }
};

// Settings management
export const getSettings = (): Partial<AppSettings> => {
  return {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || "",
    endpoint: localStorage.getItem(STORAGE_KEYS.ENDPOINT) || DEFAULT_INGREDIENT_ENDPOINT,
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
  
  if (settings.endpoint !== undefined) {
    localStorage.setItem(STORAGE_KEYS.ENDPOINT, settings.endpoint);
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
export const getIngredientValidationHistory = (): ValidationResultRecord[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.INGREDIENT_HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveIngredientValidationResult = (record: ValidationResultRecord): void => {
  const history = getIngredientValidationHistory();
  history.unshift(record);
  localStorage.setItem(STORAGE_KEYS.INGREDIENT_HISTORY, JSON.stringify(history));
};

export const deleteIngredientValidationResult = (id: string): void => {
  const updated = getIngredientValidationHistory().filter(record => record.id !== id);
  localStorage.setItem(STORAGE_KEYS.INGREDIENT_HISTORY, JSON.stringify(updated));
};

export const getRecipeValidationHistory = (): ValidationResultRecord[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RECIPE_HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveRecipeValidationResult = (record: ValidationResultRecord): void => {
  const history = getRecipeValidationHistory();
  history.unshift(record);
  localStorage.setItem(STORAGE_KEYS.RECIPE_HISTORY, JSON.stringify(history));
};

export const deleteRecipeValidationResult = (id: string): void => {
  const updated = getRecipeValidationHistory().filter(record => record.id !== id);
  localStorage.setItem(STORAGE_KEYS.RECIPE_HISTORY, JSON.stringify(updated));
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
