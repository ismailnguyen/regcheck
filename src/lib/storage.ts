import type { AppSettings, ScenarioInput } from "@/types";

// Local Storage keys
const STORAGE_KEYS = {
  API_KEY: "regcheck.apiKey",
  ENDPOINT: "regcheck.endpoint",
  ORG_NAME: "regcheck.orgName",
  SCENARIOS: "regcheck.scenarios",
} as const;

export const DEFAULT_ENDPOINT = "https://api.decernis.com/v5/ingredient-analysis/transaction?report=tabular";

// Settings management
export const getSettings = (): Partial<AppSettings> => {
  return {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || "",
    endpoint: localStorage.getItem(STORAGE_KEYS.ENDPOINT) || DEFAULT_ENDPOINT,
    orgName: localStorage.getItem(STORAGE_KEYS.ORG_NAME) || "",
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
  
  if (settings.orgName !== undefined) {
    if (settings.orgName) {
      localStorage.setItem(STORAGE_KEYS.ORG_NAME, settings.orgName);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ORG_NAME);
    }
  }
};

export const clearSensitiveData = (): void => {
  localStorage.removeItem(STORAGE_KEYS.API_KEY);
  localStorage.removeItem(STORAGE_KEYS.ORG_NAME);
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