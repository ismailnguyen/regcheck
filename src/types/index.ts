// Core data types for RegCheck application

export type Country = string;
export type Usage = string;
export type IdType = "CAS" | "INCI name" | "Decernis ID" | "FEMA No." | "E No." | "INS No.";

export interface IngredientInput {
  id: string;
  name: string;
  idType: IdType;
  idValue: string;
}

export interface ScenarioInput {
  id: string;
  name: string;
  countries: Country[];
  usages: Usage[];
  ingredients: IngredientInput[];
  createdAt: string;
  updatedAt: string;
  status?: "Draft" | "Passed" | "Failed" | "Blocked";
  lastRunAt?: string;
  lastSummary?: ResultSummary;
}

export interface ResultComments {
  nameOnList?: string | null;
  functionOnList?: string | null;
  usageOnList?: string | null;
  comments?: string | null;
}

export interface ReportRow {
  customerId: string;
  customerName: string;
  idType: IdType | string;
  idValue: string;
  decernisId?: number | null;
  decernisName?: string | null;
  country: string;
  usage: string;
  function?: string | null;
  resultIndicator: string;
  threshold?: string | null;
  citation?: string | null;
  color?: string | null;
  comments?: ResultComments | null;
  hyperlink?: string | null;
  percentage?: string | number | null;
  spec?: string | null;
  regulation?: string | null;
  otherIdentifiers?: Record<string, string> | null;
}

export interface IngredientAnalysisReport {
  reportId: string;
  reportDateTime: string;
  ["ingredient-list-name"]: string;
  tabularReport: ReportRow[];
}

export interface ApiResponse {
  ingredientAnalysisReport: IngredientAnalysisReport;
}

export interface ResultSummary {
  countsByIndicator: Record<string, number>;
  total: number;
}

export interface AppSettings {
  apiKey: string;
  debugMode?: boolean;
}

export type ValidationScenarioIngredient = IngredientInput & {
  percentage?: number;
  function?: string;
  spec?: string;
};

export interface ValidationScenarioSnapshot {
  name?: string;
  countries: Country[];
  usages: Usage[];
  ingredients: ValidationScenarioIngredient[];
  spec?: string;
}

export interface ValidationRunMetrics {
  durationMs: number;
  status: number;
  statusText?: string;
  weightBytes?: number;
}

export interface ValidationResultRecord {
  id: string;
  name: string;
  createdAt: string;
  summary: ResultSummary;
  results: ReportRow[];
  scenario: ValidationScenarioSnapshot;
  metrics?: ValidationRunMetrics;
}

export interface DebugRequestInfo {
  method: string;
  url: string;
  payload: unknown;
}

export interface DebugResponseInfo {
  durationMs: number;
  status: number;
  weightBytes?: number;
  body: unknown;
  statusText?: string;
}

export interface DebugInfo {
  request: DebugRequestInfo;
  response: DebugResponseInfo;
  errorMessage?: string;
  jobId?: string;
}

export interface RecipeIngredientInput extends IngredientInput {
  percentage: number;
  function?: string;
  spec?: string;
}

// Built-in data constants
export const COUNTRIES: Country[] = [
  "United States", "Japan", "United Kingdom", "Northern Ireland", "Portugal", 
  "India", "Spain", "Canada", "Latvia", "Sweden", "Netherlands", "Belgium", 
  "China", "Poland", "Italy", "France", "Australia", "Lithuania", "Germany", "Estonia"
];

export const USAGES: Usage[] = [
  "Baby Cream", "Eye Concealer", "Antidandruff", "Artificial Nail", "Baby Oil", 
  "Eyeliner", "Eye Cream", "Eye Mask", "Face Scrub", "Face Serum", "Rouges", 
  "Hair Bleaching", "Hair Conditioner", "Lip balm", "Lip Gloss", "Lip Pencil", 
  "Lipstick", "Nail Polish", "Toothpaste", "Body Lotion"
];

export const ID_TYPES: IdType[] = [
  "Decernis ID", "CAS", "INCI name", "FEMA No.", "E No.", "INS No."
];
