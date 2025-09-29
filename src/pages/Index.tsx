import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RegCheckHeader } from "@/components/RegCheckHeader";
import { Play } from "lucide-react";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { IngredientsBuilder } from "@/components/IngredientsBuilder";
import { RecipeBuilder } from "@/components/RecipeBuilder";
import { ResultsTable } from "@/components/ResultsTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { ValidationHistory } from "@/components/ValidationHistory";
import {
  getSettings,
  storeIngredient,
  getIngredientValidationHistory,
  saveIngredientValidationResult,
  getRecipeValidationHistory,
  saveRecipeValidationResult,
  deleteIngredientValidationResult,
  deleteRecipeValidationResult,
} from "@/lib/storage";
import {
  runValidationJob,
  DECERNIS_API_BASE_URL,
  INGREDIENT_ENDPOINT_PATH,
  RECIPE_ENDPOINT_PATH,
  type ValidationJobRecord,
} from "@/lib/regcheck-jobs";
import { toast } from "@/hooks/use-toast";
import type {
  Country,
  Usage,
  IngredientInput,
  RecipeIngredientInput,
  ReportRow,
  ResultSummary,
  ResultComments,
  DebugInfo,
  DebugRequestInfo,
  AppSettings,
  ApiResponse,
  ValidationResultRecord,
  ValidationRunMetrics,
  IdType,
} from "@/types";
import { ID_TYPES } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const TAB_BUILDER = "builder" as const;
const TAB_HISTORY = "history" as const;

type Mode = "ingredients" | "recipe";
type TabValue = typeof TAB_BUILDER | typeof TAB_HISTORY;

interface IngredientRequestPayload {
  transaction: {
    scope: {
      name: string;
      country: Country[];
      topic: Array<{
        name: string;
        scopeDetail: {
          usage: Usage[];
        };
      }>;
    };
    ingredientList: {
      name: string;
      list: Array<{
        customerId: string;
        customerName: string;
        idType: IdType;
        idValue: string;
      }>;
    };
  };
}

interface RecipeRequestPayload {
  transaction: {
    scope: {
      name: string;
      country: Country[];
      topic: Array<{
        name: string;
        scopeDetail: {
          usage: Usage[];
        };
      }>;
    };
    recipe: {
      name: string;
      spec: string;
      ingredients: Array<{
        idType: IdType;
        idValue: string;
        name: string;
        percentage: number;
        function?: string;
        spec?: string;
      }>;
    };
  };
}

const isValidIdValue = (idType: IdType, value: string): boolean => {
  if (!value.trim()) return false;
  if (idType === "INCI name") return value.trim().length > 0;
  return /^[0-9]+$/.test(value.trim());
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const formatJsonForEditor = (value: unknown): string => {
  if (value === undefined) {
    return "";
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const computeIngredientResults = (body: unknown): { results: ReportRow[]; summary: ResultSummary } => {
  if (!isRecord(body)) {
    throw new Error("Response body must be a JSON object");
  }

  const report = (body as ApiResponse).ingredientAnalysisReport;

  if (!report || !Array.isArray(report.tabularReport)) {
    throw new Error("API response missing tabular report data");
  }

  const results = report.tabularReport.map((row) => ({
    ...row,
    resultIndicator: row.resultIndicator || "UNKNOWN",
  }));

  const summary: ResultSummary = {
    countsByIndicator: {},
    total: results.length,
  };

  results.forEach(result => {
    const indicator = result.resultIndicator || "UNKNOWN";
    summary.countsByIndicator[indicator] =
      (summary.countsByIndicator[indicator] || 0) + 1;
  });

  return { results, summary };
};

interface MatrixContext {
  country?: string;
  usage?: string;
  resultIndicator?: string;
  spec?: string;
}

const extractNotListedMatrixRows = (
  source: unknown,
  existingKeys: Set<string>,
  context: MatrixContext = {},
): ReportRow[] => {
  const rows: ReportRow[] = [];

  const toStringValue = (entry: Record<string, unknown>, keys: string[], fallback?: string): string => {
    for (const key of keys) {
      const raw = entry[key];
      if (typeof raw === "string" && raw.trim()) {
        return raw.trim();
      }
      if (Array.isArray(raw)) {
        const flattened = raw
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .join(", ");
        if (flattened) {
          return flattened;
        }
      }
    }
    return fallback ?? "";
  };

  const toNumberValue = (entry: Record<string, unknown>, keys: string[], fallback?: number | null): number | null => {
    for (const key of keys) {
      const raw = entry[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      if (typeof raw === "string" && raw.trim()) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return fallback ?? null;
  };

  const toObjectMap = (entry: Record<string, unknown>, keys: string[]): Record<string, string> | null => {
    for (const key of keys) {
      const raw = entry[key];
      if (isRecord(raw)) {
        const normalized: Record<string, string> = {};
        Object.entries(raw).forEach(([mapKey, mapValue]) => {
          if (typeof mapValue === "string" && mapValue.trim()) {
            normalized[mapKey] = mapValue.trim();
          }
        });
        if (Object.keys(normalized).length > 0) {
          return normalized;
        }
      }
    }
    return null;
  };

  const visit = (value: unknown, ctx: MatrixContext) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, ctx));
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const nextContext: MatrixContext = { ...ctx };

    const countryCandidate = toStringValue(value, ["country", "countryName", "countries", "jurisdiction"], undefined);
    if (countryCandidate) {
      nextContext.country = countryCandidate;
    }

    const usageCandidate = toStringValue(value, ["usage", "usageName", "application", "applications", "category"], undefined);
    if (usageCandidate) {
      nextContext.usage = usageCandidate;
    }

    const specCandidate = toStringValue(value, ["spec", "specification", "ingredientSpec"], undefined);
    if (specCandidate) {
      nextContext.spec = specCandidate;
    }

    const indicatorRaw = value.resultIndicator ?? value.status ?? value.listingStatus ?? value.indicator ?? nextContext.resultIndicator;
    const normalizedIndicator = typeof indicatorRaw === "string"
      ? indicatorRaw.replace(/_/g, " ").trim().toUpperCase()
      : undefined;
    if (normalizedIndicator) {
      nextContext.resultIndicator = normalizedIndicator;
    }

    const hasIngredientDetails = Boolean(
      value.ingredientName || value.ingredient || value.name || value.customerName || value.customerId || value.idValue,
    );

    const shouldCollect = Boolean(
      normalizedIndicator &&
      normalizedIndicator.includes("NOT") &&
      normalizedIndicator.includes("LISTED") &&
      hasIngredientDetails,
    );

    if (shouldCollect) {
      const record = value as Record<string, unknown>;
      const name = toStringValue(record, [
        "ingredientName",
        "ingredient",
        "name",
        "customerName",
        "customerId",
        "description",
      ], "Unknown Ingredient");

      const idValue = toStringValue(record, ["idValue", "identifier", "ingredientId", "decernisId"], name);
      const idType = toStringValue(record, ["idType", "identifierType"], "Not Listed");
      const functionValue = toStringValue(record, ["function", "role", "functionality"], "");
      const decernisName = toStringValue(record, ["decernisName", "decernisIngredientName"], "");
      const threshold = toStringValue(record, ["threshold", "limit", "maximumLevel"], "");
      const citation = toStringValue(record, ["citation", "reference", "legalCitation"], "");
      const regulation = toStringValue(record, ["regulation", "regulationName", "regulationReference"], "");
      const hyperlink = toStringValue(record, ["hyperlink", "link", "url"], "");
      const percentage = toNumberValue(record, ["percentage", "concentration"], null);
      const otherIdentifiers = toObjectMap(record, ["otherIdentifiers", "identifiers"]);

      const normalizedRow: ReportRow = {
        customerId: name,
        customerName: name,
        idType: idType || "Not Listed",
        idValue: idValue || name,
        decernisName: decernisName || null,
        country: nextContext.country ?? "",
        usage: nextContext.usage ?? "",
        function: functionValue ? functionValue : null,
        resultIndicator: nextContext.resultIndicator ?? "NOT LISTED",
        threshold: threshold || null,
        citation: citation || null,
        color: null,
        comments: null,
        hyperlink: hyperlink || null,
        percentage: percentage ?? null,
        spec: nextContext.spec ?? null,
        regulation: regulation || null,
        otherIdentifiers,
      };

      const key = createRowCombinationKey(normalizedRow);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        rows.push(normalizedRow);
      }
    }

    Object.values(value).forEach((child) => {
      visit(child, nextContext);
    });
  };

  visit(source, context);

  return rows;
};

const computeRecipeResults = (body: unknown): { results: ReportRow[]; summary: ResultSummary } => {
  if (!isRecord(body)) {
    throw new Error("Response body must be a JSON object");
  }

  const apiResponse = body as ApiResponse & {
    recipeAnalaysisReport?: {
      recipeReport?: Array<{
        country?: string;
        resultIndicator?: string;
        tabularReport?: ReportRow[];
      }>;
      matrixReport?: unknown;
    };
  } & {
    recipeAnalysisReport?: {
      recipeReport?: Array<{
        country?: string;
        resultIndicator?: string;
        tabularReport?: ReportRow[];
      }>;
      matrixReport?: unknown;
    };
  };

  const recipeReportContainer = apiResponse.recipeAnalaysisReport || apiResponse.recipeAnalysisReport;
  let results: ReportRow[] = [];

  if (recipeReportContainer?.recipeReport && Array.isArray(recipeReportContainer.recipeReport)) {
    results = recipeReportContainer.recipeReport.flatMap((entry) => {
      const entryCountry = entry.country || "";
      const entryIndicator = entry.resultIndicator;
      const tabular = Array.isArray(entry.tabularReport) ? entry.tabularReport : [];
      return tabular.map((row) => ({
        ...row,
        country: row.country || entryCountry,
        resultIndicator: row.resultIndicator || entryIndicator || "UNKNOWN",
      }));
    });
  }

  if (results.length === 0 && apiResponse.ingredientAnalysisReport?.tabularReport) {
    results = apiResponse.ingredientAnalysisReport.tabularReport.map((row) => ({
      ...row,
      resultIndicator: row.resultIndicator || "UNKNOWN",
    }));
  }

  const existingKeys = new Set(results.map((row) => createRowCombinationKey(row)));

  const perEntryMatrixRows: ReportRow[] = [];
  if (recipeReportContainer?.recipeReport && Array.isArray(recipeReportContainer.recipeReport)) {
    recipeReportContainer.recipeReport.forEach((entry) => {
      if (!Array.isArray(entry.matrixReport) || entry.matrixReport.length === 0) {
        return;
      }

      const entryContext: MatrixContext = {
        country: typeof entry.country === "string" ? entry.country : undefined,
        resultIndicator: typeof entry.resultIndicator === "string"
          ? entry.resultIndicator.replace(/_/g, " ").trim().toUpperCase()
          : undefined,
      };

      perEntryMatrixRows.push(
        ...extractNotListedMatrixRows(entry.matrixReport, existingKeys, entryContext),
      );
    });
  }

  const matrixSource = recipeReportContainer?.matrixReport ?? (apiResponse as { recipeMatrixReport?: unknown }).recipeMatrixReport;
  const notListedRows = [
    ...perEntryMatrixRows,
    ...extractNotListedMatrixRows(matrixSource ?? apiResponse, existingKeys),
  ];
  if (notListedRows.length > 0) {
    results = [...results, ...notListedRows];
  }

  if (results.length === 0) {
    throw new Error("API response missing recipe report data");
  }

  const summary: ResultSummary = {
    countsByIndicator: {},
    total: results.length,
  };

  results.forEach(result => {
    const indicator = result.resultIndicator || "UNKNOWN";
    summary.countsByIndicator[indicator] =
      (summary.countsByIndicator[indicator] || 0) + 1;
  });

  return { results, summary };
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.some(item => hasMeaningfulValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(entry => hasMeaningfulValue(entry));
  }
  return true;
};

const normalizeKeyPart = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return "";
};

const createRowCombinationKey = (row: ReportRow): string => {
  return [
    normalizeKeyPart(row.idValue),
    normalizeKeyPart(row.customerName),
    normalizeKeyPart(row.customerId),
    normalizeKeyPart(row.decernisName),
    normalizeKeyPart(row.country),
    normalizeKeyPart(row.usage),
    normalizeKeyPart(row.regulation),
    normalizeKeyPart(row.threshold),
    normalizeKeyPart(row.resultIndicator),
  ].join("|");
};

const mergeReportRowDetails = (base: ReportRow, incoming: ReportRow): ReportRow => {
  const merged: ReportRow = { ...base };
  const mergeableFields: (keyof ReportRow)[] = [
    "customerId",
    "customerName",
    "idType",
    "idValue",
    "decernisId",
    "decernisName",
    "country",
    "usage",
    "function",
    "threshold",
    "citation",
    "color",
    "hyperlink",
    "spec",
    "regulation",
    "resultIndicator",
  ];

  const mergedRecord = merged as Record<string, unknown>;
  const incomingRecord = incoming as Record<string, unknown>;

  mergeableFields.forEach((field) => {
    const candidate = incomingRecord[field];
    if (!hasMeaningfulValue(candidate)) {
      return;
    }

    const current = mergedRecord[field];
    if (hasMeaningfulValue(current)) {
      return;
    }

    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        mergedRecord[field] = trimmed;
      }
      return;
    }

    if (typeof candidate === "number") {
      if (Number.isFinite(candidate)) {
        mergedRecord[field] = candidate;
      }
      return;
    }

    mergedRecord[field] = candidate;
  });

  if (incoming.comments) {
    const combinedComments: ResultComments = { ...(merged.comments ?? {}) };
    let updated = false;

    (Object.entries(incoming.comments) as [keyof ResultComments, unknown][]).forEach(([commentKey, commentValue]) => {
      if (typeof commentValue === "string") {
        const trimmed = commentValue.trim();
        if (trimmed) {
          combinedComments[commentKey] = trimmed;
          updated = true;
        }
        return;
      }

      if (commentValue !== null && commentValue !== undefined) {
        combinedComments[commentKey] = commentValue as ResultComments[keyof ResultComments];
        updated = true;
      }
    });

    if (updated) {
      merged.comments = combinedComments;
    }
  }

  if (incoming.otherIdentifiers) {
    merged.otherIdentifiers = {
      ...(merged.otherIdentifiers ?? {}),
      ...incoming.otherIdentifiers,
    };
  }

  if (!hasMeaningfulValue(merged.percentage) && hasMeaningfulValue(incoming.percentage)) {
    merged.percentage = typeof incoming.percentage === "string" ? incoming.percentage.trim() : incoming.percentage;
  }

  return merged;
};

const combineRecipeAndIngredientRows = (recipeRows: ReportRow[], ingredientRows: ReportRow[]): ReportRow[] => {
  if (ingredientRows.length === 0) {
    return recipeRows;
  }

  const map = new Map<string, ReportRow>();

  recipeRows.forEach((row) => {
    map.set(createRowCombinationKey(row), { ...row });
  });

  ingredientRows.forEach((row) => {
    const key = createRowCombinationKey(row);
    const existing = map.get(key);
    if (existing) {
      map.set(key, mergeReportRowDetails(existing, row));
    } else {
      map.set(key, { ...row });
    }
  });

  return Array.from(map.values());
};

const summarizeResults = (rows: ReportRow[]): ResultSummary => {
  const countsByIndicator: Record<string, number> = {};
  rows.forEach((row) => {
    const indicator = typeof row.resultIndicator === "string" && row.resultIndicator.trim()
      ? row.resultIndicator.trim().toUpperCase()
      : "UNKNOWN";
    countsByIndicator[indicator] = (countsByIndicator[indicator] || 0) + 1;
  });

  return {
    countsByIndicator,
    total: rows.length,
  };
};

const buildIngredientPayload = (
  scenarioName: string,
  countries: Country[],
  usages: Usage[],
  ingredients: IngredientInput[],
): IngredientRequestPayload => {
  const trimmedScenarioName = scenarioName.trim();
  const effectiveScenarioName = trimmedScenarioName || "Untitled Scenario";

  return {
    transaction: {
      scope: {
        name: effectiveScenarioName,
        country: [...countries],
        topic: [
          {
            name: "COS",
            scopeDetail: {
              usage: [...usages],
            },
          },
        ],
      },
      ingredientList: {
        name: trimmedScenarioName ? `${trimmedScenarioName} Ingredients` : "Submitted Ingredients",
        list: ingredients.map((ingredient) => ({
          customerId: ingredient.name,
          customerName: ingredient.name,
          idType: ingredient.idType,
          idValue: ingredient.idValue,
        })),
      },
    },
  };
};

const buildRecipePayload = (
  scenarioName: string,
  countries: Country[],
  usages: Usage[],
  spec: string,
  ingredients: RecipeIngredientInput[],
): RecipeRequestPayload => {
  const trimmedScenarioName = scenarioName.trim();
  const recipeName = trimmedScenarioName || "Untitled Recipe";
  const trimmedSpec = spec.trim();
  const recipeSpecValue = trimmedSpec || recipeName;

  return {
    transaction: {
      scope: {
        name: recipeName,
        country: [...countries],
        topic: [
          {
            name: "COS",
            scopeDetail: {
              usage: [...usages],
            },
          },
        ],
      },
      recipe: {
        name: recipeName,
        spec: recipeSpecValue,
        ingredients: ingredients.map((ingredient) => {
          const normalized: RecipeRequestPayload["transaction"]["recipe"]["ingredients"][number] = {
            idType: ingredient.idType,
            idValue: ingredient.idValue,
            name: ingredient.name,
            percentage: ingredient.percentage,
          };

          const trimmedFunction = ingredient.function?.trim();
          const trimmedIngredientSpec = ingredient.spec?.trim();

          if (trimmedFunction) {
            normalized.function = trimmedFunction;
          }
          if (trimmedIngredientSpec) {
            normalized.spec = trimmedIngredientSpec;
          }

          return normalized;
        }),
      },
    },
  };
};

const Index = () => {
  // Default active tab/pane
  const [activeMode, setActiveMode] = useState<Mode>("ingredients");

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ingredient builder state
  const [ingredientScenarioName, setIngredientScenarioName] = useState("");
  const [ingredientCountries, setIngredientCountries] = useState<Country[]>([]);
  const [ingredientUsages, setIngredientUsages] = useState<Usage[]>([]);
  const [ingredientItems, setIngredientItems] = useState<IngredientInput[]>([]);

  const [ingredientResults, setIngredientResults] = useState<ReportRow[]>([]);
  const [ingredientSummary, setIngredientSummary] = useState<ResultSummary>();
  const [ingredientIsRunning, setIngredientIsRunning] = useState(false);
  const [ingredientDebugInfo, setIngredientDebugInfo] = useState<DebugInfo | null>(null);
  const [ingredientHistory, setIngredientHistory] = useState<ValidationResultRecord[]>([]);
  const [selectedIngredientHistoryId, setSelectedIngredientHistoryId] = useState<string | null>(null);
  const [ingredientTab, setIngredientTab] = useState<TabValue>(TAB_BUILDER);

  // Recipe builder state
  const [recipeScenarioName, setRecipeScenarioName] = useState("");
  const [recipeCountries, setRecipeCountries] = useState<Country[]>([]);
  const [recipeUsages, setRecipeUsages] = useState<Usage[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientInput[]>([]);
  const [recipeSpec, setRecipeSpec] = useState("");
  const [recipeIncludeIngredientAnalysis, setRecipeIncludeIngredientAnalysis] = useState(false);

  const [recipeResults, setRecipeResults] = useState<ReportRow[]>([]);
  const [recipeSummary, setRecipeSummary] = useState<ResultSummary>();
  const [recipeIsRunning, setRecipeIsRunning] = useState(false);
  const [recipeDebugInfo, setRecipeDebugInfo] = useState<DebugInfo | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<ValidationResultRecord[]>([]);
  const [selectedRecipeHistoryId, setSelectedRecipeHistoryId] = useState<string | null>(null);
  const [recipeTab, setRecipeTab] = useState<TabValue>(TAB_BUILDER);

  const [debugModeEnabled, setDebugModeEnabled] = useState(() => Boolean(getSettings().debugMode));
  const [ingredientPayloadText, setIngredientPayloadText] = useState("");
  const [ingredientPayloadError, setIngredientPayloadError] = useState<string | null>(null);
  const [recipePayloadText, setRecipePayloadText] = useState("");
  const [recipePayloadError, setRecipePayloadError] = useState<string | null>(null);
  const ingredientPayloadApplyingRef = useRef(false);
  const recipePayloadApplyingRef = useRef(false);
  const [ingredientResponseText, setIngredientResponseText] = useState("");
  const [ingredientResponseError, setIngredientResponseError] = useState<string | null>(null);
  const [recipeResponseText, setRecipeResponseText] = useState("");
  const [recipeResponseError, setRecipeResponseError] = useState<string | null>(null);
  const ingredientResponseApplyingRef = useRef(false);
  const recipeResponseApplyingRef = useRef(false);

  useEffect(() => {
    const ingredientHistoryData = getIngredientValidationHistory();
    setIngredientHistory(ingredientHistoryData);
    if (ingredientHistoryData.length > 0) {
      setSelectedIngredientHistoryId(ingredientHistoryData[0].id);
    }

    const recipeHistoryData = getRecipeValidationHistory();
    setRecipeHistory(recipeHistoryData);
    if (recipeHistoryData.length > 0) {
      setSelectedRecipeHistoryId(recipeHistoryData[0].id);
    }
  }, []);

  const ingredientCanRun =
    ingredientCountries.length > 0 &&
    ingredientUsages.length > 0 &&
    ingredientItems.length > 0 &&
    ingredientItems.every((ing) => ing.name.trim() && ing.idValue.trim());

  const resetIngredientBuilder = () => {
    setIngredientScenarioName("");
    setIngredientCountries([]);
    setIngredientUsages([]);
    setIngredientItems([]);
    setIngredientResults([]);
    setIngredientSummary(undefined);
    setIngredientDebugInfo(null);
  };

  const recipeTotalPercentage = useMemo(
    () => recipeIngredients.reduce((total, ing) => total + (Number.isFinite(ing.percentage) ? ing.percentage : 0), 0),
    [recipeIngredients]
  );

  const recipeInputsValid = recipeIngredients.every((ing) =>
    ing.name.trim() &&
    ing.idValue.trim() &&
    isValidIdValue(ing.idType, ing.idValue) &&
    Number.isFinite(ing.percentage)
  );

  const recipeCanRun =
    recipeCountries.length > 0 &&
    recipeUsages.length > 0 &&
    recipeIngredients.length > 0 &&
    recipeInputsValid;

  const resetRecipeBuilder = () => {
    setRecipeScenarioName("");
    setRecipeCountries([]);
    setRecipeUsages([]);
    setRecipeIngredients([]);
    setRecipeSpec("");
    setRecipeResults([]);
    setRecipeSummary(undefined);
    setRecipeDebugInfo(null);
    setRecipeIncludeIngredientAnalysis(false);
  };

  const ingredientRequestPayload = useMemo<IngredientRequestPayload>(
    () => buildIngredientPayload(ingredientScenarioName, ingredientCountries, ingredientUsages, ingredientItems),
    [ingredientScenarioName, ingredientCountries, ingredientUsages, ingredientItems],
  );

  const recipeRequestPayload = useMemo<RecipeRequestPayload>(
    () => buildRecipePayload(recipeScenarioName, recipeCountries, recipeUsages, recipeSpec, recipeIngredients),
    [recipeScenarioName, recipeCountries, recipeUsages, recipeSpec, recipeIngredients],
  );

  useEffect(() => {
    if (!debugModeEnabled) {
      setIngredientDebugInfo(null);
      setRecipeDebugInfo(null);
      setIngredientPayloadError(null);
      setRecipePayloadError(null);
      setIngredientPayloadText("");
      setRecipePayloadText("");
      setIngredientResponseText("");
      setRecipeResponseText("");
      setIngredientResponseError(null);
      setRecipeResponseError(null);
      return;
    }
  }, [debugModeEnabled]);

  useEffect(() => {
    if (!debugModeEnabled) {
      return;
    }
    if (ingredientPayloadApplyingRef.current) {
      ingredientPayloadApplyingRef.current = false;
      return;
    }
    const payloadString = JSON.stringify(ingredientRequestPayload, null, 2);
    setIngredientPayloadText(payloadString);
    setIngredientPayloadError(null);
  }, [debugModeEnabled, ingredientRequestPayload]);

  useEffect(() => {
    if (!debugModeEnabled) {
      return;
    }
    if (recipePayloadApplyingRef.current) {
      recipePayloadApplyingRef.current = false;
      return;
    }
    const payloadString = JSON.stringify(recipeRequestPayload, null, 2);
    setRecipePayloadText(payloadString);
    setRecipePayloadError(null);
  }, [debugModeEnabled, recipeRequestPayload]);

  useEffect(() => {
    if (!debugModeEnabled) {
      return;
    }
    if (ingredientResponseApplyingRef.current) {
      ingredientResponseApplyingRef.current = false;
      return;
    }

    const body = ingredientDebugInfo?.response?.body;
    if (body === undefined) {
      setIngredientResponseText("");
      setIngredientResponseError(null);
      return;
    }

    setIngredientResponseText(formatJsonForEditor(body));
    setIngredientResponseError(null);
  }, [debugModeEnabled, ingredientDebugInfo]);

  useEffect(() => {
    if (!debugModeEnabled) {
      return;
    }
    if (recipeResponseApplyingRef.current) {
      recipeResponseApplyingRef.current = false;
      return;
    }

    const body = recipeDebugInfo?.response?.body;
    if (body === undefined) {
      setRecipeResponseText("");
      setRecipeResponseError(null);
      return;
    }

    setRecipeResponseText(formatJsonForEditor(body));
    setRecipeResponseError(null);
  }, [debugModeEnabled, recipeDebugInfo]);

  const handleIngredientPayloadTextChange = useCallback((value: string) => {
    setIngredientPayloadText(value);

    if (!debugModeEnabled) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      if (!isRecord(parsed) || !isRecord(parsed.transaction)) {
        throw new Error("Payload must include a transaction object");
      }

      const transaction = parsed.transaction as Record<string, unknown>;
      const scopeRaw = transaction.scope;
      if (!isRecord(scopeRaw)) {
        throw new Error("Payload transaction.scope must be an object");
      }

      const scopeNameRaw = scopeRaw["name"];
      const scopeName = typeof scopeNameRaw === "string" ? scopeNameRaw : "";

      const countriesRaw = scopeRaw["country"];
      if (!Array.isArray(countriesRaw) || countriesRaw.some((country) => typeof country !== "string")) {
        throw new Error("scope.country must be an array of strings");
      }
      const countries = countriesRaw.map((country) => country as string);

      const topicRaw = scopeRaw["topic"];
      if (!Array.isArray(topicRaw) || topicRaw.length === 0) {
        throw new Error("scope.topic must contain at least one entry");
      }

      const firstTopic = topicRaw[0];
      if (!isRecord(firstTopic)) {
        throw new Error("scope.topic[0] must be an object");
      }

      const scopeDetailRaw = firstTopic["scopeDetail"];
      if (!isRecord(scopeDetailRaw)) {
        throw new Error("scope.topic[0].scopeDetail must be an object");
      }

      const usageRaw = scopeDetailRaw["usage"];
      if (!Array.isArray(usageRaw) || usageRaw.some((usage) => typeof usage !== "string")) {
        throw new Error("scope.topic[0].scopeDetail.usage must be an array of strings");
      }
      const usages = usageRaw.map((usage) => usage as string);

      const ingredientListRaw = transaction.ingredientList;
      if (!isRecord(ingredientListRaw)) {
        throw new Error("transaction.ingredientList must be an object");
      }

      const listRaw = ingredientListRaw["list"];
      if (!Array.isArray(listRaw)) {
        throw new Error("transaction.ingredientList.list must be an array");
      }

      const normalizedIngredients: IngredientInput[] = listRaw.map((item, index) => {
        if (!isRecord(item)) {
          throw new Error(`Ingredient at index ${index} must be an object`);
        }

        const idTypeRaw = item["idType"];
        if (typeof idTypeRaw !== "string" || !ID_TYPES.includes(idTypeRaw as IdType)) {
          throw new Error(`Ingredient at index ${index} has an invalid idType`);
        }
        const idType = idTypeRaw as IdType;

        const idValueRaw = item["idValue"];
        if (typeof idValueRaw !== "string" || !idValueRaw.trim()) {
          throw new Error(`Ingredient at index ${index} must include an idValue string`);
        }

        const nameCandidate = item["customerName"] ?? item["customerId"] ?? item["name"];
        if (typeof nameCandidate !== "string" || !nameCandidate.trim()) {
          throw new Error(`Ingredient at index ${index} must include a name`);
        }

        const normalized: IngredientInput = {
          id: crypto.randomUUID(),
          name: nameCandidate,
          idType,
          idValue: idValueRaw,
        };

        return normalized;
      });

      const builderScenarioName = scopeName === "Untitled Scenario" ? "" : scopeName;

      ingredientPayloadApplyingRef.current = true;
      setIngredientScenarioName(builderScenarioName);
      setIngredientCountries(countries);
      setIngredientUsages(usages);
      setIngredientItems(normalizedIngredients);

      const canonicalPayload = buildIngredientPayload(builderScenarioName, countries, usages, normalizedIngredients);
      setIngredientPayloadText(JSON.stringify(canonicalPayload, null, 2));
      setIngredientPayloadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON payload";
      setIngredientPayloadError(message);
    }
  }, [debugModeEnabled]);

  const handleRecipePayloadTextChange = useCallback((value: string) => {
    setRecipePayloadText(value);

    if (!debugModeEnabled) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      if (!isRecord(parsed) || !isRecord(parsed.transaction)) {
        throw new Error("Payload must include a transaction object");
      }

      const transaction = parsed.transaction as Record<string, unknown>;
      const scopeRaw = transaction.scope;
      if (!isRecord(scopeRaw)) {
        throw new Error("Payload transaction.scope must be an object");
      }

      const scopeNameRaw = scopeRaw["name"];
      const scopeName = typeof scopeNameRaw === "string" ? scopeNameRaw : "";

      const countriesRaw = scopeRaw["country"];
      if (!Array.isArray(countriesRaw) || countriesRaw.some((country) => typeof country !== "string")) {
        throw new Error("scope.country must be an array of strings");
      }
      const countries = countriesRaw.map((country) => country as string);

      const topicRaw = scopeRaw["topic"];
      if (!Array.isArray(topicRaw) || topicRaw.length === 0) {
        throw new Error("scope.topic must contain at least one entry");
      }

      const firstTopic = topicRaw[0];
      if (!isRecord(firstTopic)) {
        throw new Error("scope.topic[0] must be an object");
      }

      const scopeDetailRaw = firstTopic["scopeDetail"];
      if (!isRecord(scopeDetailRaw)) {
        throw new Error("scope.topic[0].scopeDetail must be an object");
      }

      const usageRaw = scopeDetailRaw["usage"];
      if (!Array.isArray(usageRaw) || usageRaw.some((usage) => typeof usage !== "string")) {
        throw new Error("scope.topic[0].scopeDetail.usage must be an array of strings");
      }
      const usages = usageRaw.map((usage) => usage as string);

      const recipeRaw = transaction.recipe;
      if (!isRecord(recipeRaw)) {
        throw new Error("transaction.recipe must be an object");
      }

      const recipeNameRaw = recipeRaw["name"];
      const recipeName = typeof recipeNameRaw === "string" ? recipeNameRaw : scopeName || "Untitled Recipe";

      const specRaw = recipeRaw["spec"];
      const specValue = typeof specRaw === "string" ? specRaw : "";

      const ingredientsRaw = recipeRaw["ingredients"];
      if (!Array.isArray(ingredientsRaw)) {
        throw new Error("transaction.recipe.ingredients must be an array");
      }

      const normalizedIngredients: RecipeIngredientInput[] = ingredientsRaw.map((item, index) => {
        if (!isRecord(item)) {
          throw new Error(`Recipe ingredient at index ${index} must be an object`);
        }

        const idTypeRaw = item["idType"];
        if (typeof idTypeRaw !== "string" || !ID_TYPES.includes(idTypeRaw as IdType)) {
          throw new Error(`Recipe ingredient at index ${index} has an invalid idType`);
        }
        const idType = idTypeRaw as IdType;

        const idValueRaw = item["idValue"];
        if (typeof idValueRaw !== "string" || !idValueRaw.trim()) {
          throw new Error(`Recipe ingredient at index ${index} must include an idValue string`);
        }

        const nameRaw = item["name"] ?? item["customerName"] ?? item["customerId"];
        if (typeof nameRaw !== "string" || !nameRaw.trim()) {
          throw new Error(`Recipe ingredient at index ${index} must include a name`);
        }

        const percentageRaw = item["percentage"];
        const percentage = typeof percentageRaw === "number"
          ? percentageRaw
          : typeof percentageRaw === "string" && percentageRaw.trim()
            ? Number(percentageRaw)
            : NaN;

        if (!Number.isFinite(percentage)) {
          throw new Error(`Recipe ingredient at index ${index} must include a numeric percentage`);
        }

        const normalized: RecipeIngredientInput = {
          id: crypto.randomUUID(),
          name: nameRaw,
          idType,
          idValue: idValueRaw,
          percentage,
        };

        const functionRaw = item["function"];
        if (typeof functionRaw === "string" && functionRaw.trim()) {
          normalized.function = functionRaw.trim();
        }

        const ingredientSpecRaw = item["spec"];
        if (typeof ingredientSpecRaw === "string" && ingredientSpecRaw.trim()) {
          normalized.spec = ingredientSpecRaw.trim();
        }

        return normalized;
      });

      const builderScenarioName = recipeName === "Untitled Recipe" ? "" : recipeName;
      const builderSpec = specValue === recipeName ? "" : specValue;

      recipePayloadApplyingRef.current = true;
      setRecipeScenarioName(builderScenarioName);
      setRecipeCountries(countries);
      setRecipeUsages(usages);
      setRecipeIngredients(normalizedIngredients);
      setRecipeSpec(builderSpec);

      const canonicalPayload = buildRecipePayload(builderScenarioName, countries, usages, builderSpec, normalizedIngredients);
      setRecipePayloadText(JSON.stringify(canonicalPayload, null, 2));
      setRecipePayloadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON payload";
      setRecipePayloadError(message);
    }
  }, [debugModeEnabled]);

  const handleIngredientResponseTextChange = useCallback((value: string) => {
    setIngredientResponseText(value);

    if (!debugModeEnabled) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      const { results, summary } = computeIngredientResults(parsed);

      setIngredientResults(results);
      setIngredientSummary(summary);

      if (ingredientDebugInfo) {
        ingredientResponseApplyingRef.current = true;
      }
      setIngredientResponseText(JSON.stringify(parsed, null, 2));
      setIngredientResponseError(null);

      setIngredientDebugInfo(prev => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          response: {
            ...prev.response,
            body: parsed,
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON body";
      setIngredientResponseError(message);
    }
  }, [debugModeEnabled, ingredientDebugInfo]);

  const handleRecipeResponseTextChange = useCallback((value: string) => {
    setRecipeResponseText(value);

    if (!debugModeEnabled) {
      return;
    }

    try {
      const parsed = JSON.parse(value);
      const { results, summary } = computeRecipeResults(parsed);

      setRecipeResults(results);
      setRecipeSummary(summary);

      if (recipeDebugInfo) {
        recipeResponseApplyingRef.current = true;
      }
      setRecipeResponseText(JSON.stringify(parsed, null, 2));
      setRecipeResponseError(null);

      setRecipeDebugInfo(prev => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          response: {
            ...prev.response,
            body: parsed,
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON body";
      setRecipeResponseError(message);
    }
  }, [debugModeEnabled, recipeDebugInfo]);

  const runIngredientValidation = async () => {
    const settings = getSettings();
    if (!settings.apiKey) {
      toast({
        title: "API Key Required",
        description: "Please configure your API key in settings before running validation.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    const debugEnabled = Boolean(settings.debugMode);
    const requestPayload = ingredientRequestPayload;
    const upstreamUrl = `${DECERNIS_API_BASE_URL}${INGREDIENT_ENDPOINT_PATH}`;

    const requestInfo = {
      method: "POST",
      url: upstreamUrl,
      payload: requestPayload,
    };

    setIngredientIsRunning(true);
    setIngredientDebugInfo(null);

    let jobRecord: ValidationJobRecord | null = null;
    let responseBody: unknown = null;
    let responseStatus = 0;
    let responseStatusText = "";
    let responseWeightBytes: number | undefined;

    try {
      jobRecord = await runValidationJob({
        endpointPath: INGREDIENT_ENDPOINT_PATH,
        payload: requestPayload,
        apiKey: settings.apiKey,
        metadata: {
          scenarioName: ingredientScenarioName || undefined,
          type: "ingredient",
        },
      });

      responseStatus = jobRecord.result?.status ?? 0;
      responseStatusText = jobRecord.result?.statusText ?? "";
      responseWeightBytes = jobRecord.result?.weightBytes;

      if (jobRecord.status === "failed") {
        responseBody = jobRecord.error?.details ?? jobRecord.result?.body ?? null;
        throw new Error(jobRecord.error?.message || "Validation job failed");
      }

      const body = jobRecord.result?.body;
      responseBody = body ?? jobRecord.result?.rawBody ?? null;

      if (!body || typeof body !== "object") {
        throw new Error("Unexpected API response format");
      }

      const { results: normalizedResults, summary } = computeIngredientResults(body);

      ingredientItems.forEach(ingredient => {
        storeIngredient(ingredient);
      });

      setIngredientResults(normalizedResults);
      setIngredientSummary(summary);

      toast({
        title: "Validation Complete",
        description: summary.total > 0
          ? `Found ${summary.total} results across ${ingredientCountries.length} countries and ${ingredientUsages.length} usages.`
          : "The API call completed successfully but returned no results.",
      });

      const computedDuration = jobRecord.metrics?.durationMs ?? Math.max(
        0,
        new Date(jobRecord.updatedAt).getTime() - new Date(jobRecord.startedAt).getTime(),
      );

      const metrics: ValidationRunMetrics = {
        durationMs: computedDuration,
        status: responseStatus,
        statusText: responseStatusText || undefined,
        weightBytes: responseWeightBytes,
      };

      const recordName = ingredientScenarioName.trim() || `Scenario ${new Date().toLocaleString()}`;
      const record: ValidationResultRecord = {
        id: crypto.randomUUID(),
        name: recordName,
        createdAt: new Date().toISOString(),
        summary: {
          countsByIndicator: { ...summary.countsByIndicator },
          total: summary.total,
        },
        results: normalizedResults,
        scenario: {
          name: ingredientScenarioName.trim() || undefined,
          countries: [...ingredientCountries],
          usages: [...ingredientUsages],
          ingredients: ingredientItems.map((ingredient) => ({ ...ingredient })),
        },
        metrics,
      };

      saveIngredientValidationResult(record);
      setIngredientHistory(prev => [record, ...prev]);
      setSelectedIngredientHistoryId(record.id);

      if (debugEnabled) {
        setIngredientDebugInfo({
          request: requestInfo,
          response: {
            durationMs: metrics.durationMs,
            status: responseStatus,
            statusText: responseStatusText,
            weightBytes: responseWeightBytes,
            body: body,
          },
          jobId: jobRecord.jobId,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Validation Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (debugEnabled) {
        const durationMs = jobRecord?.metrics?.durationMs ?? (jobRecord
          ? Math.max(0, new Date(jobRecord.updatedAt).getTime() - new Date(jobRecord.startedAt).getTime())
          : 0);

        setIngredientDebugInfo({
          request: requestInfo,
          response: {
            durationMs,
            status: responseStatus || 0,
            statusText: responseStatusText || "Error",
            weightBytes: responseWeightBytes,
            body: responseBody ?? { message: errorMessage },
          },
          errorMessage,
          jobId: jobRecord?.jobId,
        });
      }
    } finally {
      setIngredientIsRunning(false);
    }
  };

  const runRecipeValidation = async () => {
    const settings = getSettings();
    if (!settings.apiKey) {
      toast({
        title: "API Key Required",
        description: "Please configure your API key in settings before running validation.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    const debugEnabled = Boolean(settings.debugMode);

    const recipeName = recipeScenarioName || "Untitled Recipe";
    const recipeSpecValue = recipeSpec.trim() || recipeName;

    const requestPayload = recipeRequestPayload;

    const requestInfo = {
      method: "POST",
      url: `${DECERNIS_API_BASE_URL}${RECIPE_ENDPOINT_PATH}`,
      payload: requestPayload,
    };

    const includeIngredientAnalysis = recipeIncludeIngredientAnalysis;
    const ingredientInputsFromRecipe: IngredientInput[] = includeIngredientAnalysis
      ? recipeIngredients.map(({ id, name, idType, idValue }) => ({
          id,
          name,
          idType,
          idValue,
        }))
      : [];
    const ingredientRequestPayloadForRecipe = includeIngredientAnalysis
      ? buildIngredientPayload(recipeScenarioName, recipeCountries, recipeUsages, ingredientInputsFromRecipe)
      : null;

    setRecipeIsRunning(true);
    setRecipeDebugInfo(null);
    let jobRecord: ValidationJobRecord | null = null;
    let responseBody: unknown = null;
    let responseStatus = 0;
    let responseStatusText = "";
    let responseWeightBytes: number | undefined;

    let ingredientResponseBody: unknown = null;
    let ingredientDurationMs = 0;
    let ingredientWeightBytes: number | undefined;
    let ingredientErrorMessage: string | null = null;

    try {
      jobRecord = await runValidationJob({
        endpointPath: RECIPE_ENDPOINT_PATH,
        payload: requestPayload,
        apiKey: settings.apiKey,
        metadata: {
          scenarioName: recipeScenarioName || undefined,
          type: "recipe",
        },
      });

      responseStatus = jobRecord.result?.status ?? 0;
      responseStatusText = jobRecord.result?.statusText ?? "";
      responseWeightBytes = jobRecord.result?.weightBytes;

      if (jobRecord.status === "failed") {
        responseBody = jobRecord.error?.details ?? jobRecord.result?.body ?? null;
        throw new Error(jobRecord.error?.message || "Recipe validation failed");
      }

      const body = jobRecord.result?.body;
      responseBody = body ?? jobRecord.result?.rawBody ?? null;

      if (!body || typeof body !== "object") {
        throw new Error("Unexpected API response format");
      }

      const { results: normalizedResults } = computeRecipeResults(body);

      recipeIngredients.forEach(({ percentage: _percentage, function: _function, spec: _spec, ...base }) => {
        storeIngredient(base);
      });

      let combinedResults = normalizedResults;

      if (includeIngredientAnalysis && ingredientRequestPayloadForRecipe) {
        try {
          const ingredientJobRecord = await runValidationJob({
            endpointPath: INGREDIENT_ENDPOINT_PATH,
            payload: ingredientRequestPayloadForRecipe,
            apiKey: settings.apiKey,
            metadata: {
              scenarioName: recipeScenarioName || undefined,
              type: "ingredient",
            },
          });

          if (ingredientJobRecord.status === "failed") {
            ingredientResponseBody = ingredientJobRecord.error?.details ?? ingredientJobRecord.result?.body ?? null;
            throw new Error(ingredientJobRecord.error?.message || "Ingredient analysis failed");
          }

          const ingredientBody = ingredientJobRecord.result?.body;
          ingredientResponseBody = ingredientBody ?? ingredientJobRecord.result?.rawBody ?? null;

          if (!ingredientBody || typeof ingredientBody !== "object") {
            throw new Error("Unexpected ingredient API response format");
          }

          const { results: ingredientResults } = computeIngredientResults(ingredientBody);
          combinedResults = combineRecipeAndIngredientRows(normalizedResults, ingredientResults);

          ingredientDurationMs = ingredientJobRecord.metrics?.durationMs ?? Math.max(
            0,
            new Date(ingredientJobRecord.updatedAt).getTime() - new Date(ingredientJobRecord.startedAt).getTime(),
          );

          const weight = ingredientJobRecord.result?.weightBytes;
          if (typeof weight === "number" && Number.isFinite(weight)) {
            ingredientWeightBytes = weight;
          }
        } catch (ingredientError) {
          ingredientErrorMessage = ingredientError instanceof Error
            ? ingredientError.message
            : "Ingredient analysis failed";
          toast({
            title: "Ingredient Analysis Failed",
            description: ingredientErrorMessage,
            variant: "destructive",
          });
        }
      }

      const combinedSummary = summarizeResults(combinedResults);

      setRecipeResults(combinedResults);
      setRecipeSummary(combinedSummary);

      toast({
        title: "Recipe Validation Complete",
        description: combinedSummary.total > 0
          ? `Found ${combinedSummary.total} results across ${recipeCountries.length} countries and ${recipeUsages.length} usages.`
          : "The API call completed successfully but returned no results.",
      });

      const recipeDuration = jobRecord.metrics?.durationMs ?? Math.max(
        0,
        new Date(jobRecord.updatedAt).getTime() - new Date(jobRecord.startedAt).getTime(),
      );
      const totalDuration = recipeDuration + ingredientDurationMs;

      const combinedWeightBytes = (() => {
        let total = 0;
        let hasValue = false;
        [responseWeightBytes, ingredientWeightBytes].forEach((weight) => {
          if (typeof weight === "number" && Number.isFinite(weight)) {
            total += weight;
            hasValue = true;
          }
        });
        return hasValue ? total : undefined;
      })();

      const metrics: ValidationRunMetrics = {
        durationMs: totalDuration,
        status: responseStatus,
        statusText: responseStatusText || undefined,
        weightBytes: combinedWeightBytes,
      };

      const recordName = recipeScenarioName.trim() || `Recipe ${new Date().toLocaleString()}`;
      const record: ValidationResultRecord = {
        id: crypto.randomUUID(),
        name: recordName,
        createdAt: new Date().toISOString(),
        summary: {
          countsByIndicator: { ...combinedSummary.countsByIndicator },
          total: combinedSummary.total,
        },
        results: combinedResults,
        scenario: {
          name: recipeScenarioName.trim() || undefined,
          countries: [...recipeCountries],
          usages: [...recipeUsages],
          ingredients: recipeIngredients.map((ingredient) => ({ ...ingredient })),
          spec: recipeSpecValue,
          includeIngredientAnalysis: includeIngredientAnalysis || undefined,
        },
        metrics,
      };

      saveRecipeValidationResult(record);
      setRecipeHistory(prev => [record, ...prev]);
      setSelectedRecipeHistoryId(record.id);

      if (debugEnabled) {
        const debugBody = includeIngredientAnalysis
          ? {
              recipe: body,
              ingredient: ingredientResponseBody,
            }
          : body;

        setRecipeDebugInfo({
          request: requestInfo,
          response: {
            durationMs: metrics.durationMs,
            status: responseStatus,
            statusText: responseStatusText,
            weightBytes: metrics.weightBytes,
            body: debugBody,
          },
          jobId: jobRecord.jobId,
          ...(ingredientErrorMessage ? { errorMessage: ingredientErrorMessage } : {}),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Recipe Validation Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (debugEnabled) {
        const durationMs = jobRecord?.metrics?.durationMs ?? (jobRecord
          ? Math.max(0, new Date(jobRecord.updatedAt).getTime() - new Date(jobRecord.startedAt).getTime())
          : 0);

        setRecipeDebugInfo({
          request: requestInfo,
          response: {
            durationMs,
            status: responseStatus || 0,
            statusText: responseStatusText || "Error",
            weightBytes: responseWeightBytes,
            body: responseBody ?? { message: errorMessage },
          },
          errorMessage,
          jobId: jobRecord?.jobId,
        });
      }
    } finally {
      setRecipeIsRunning(false);
    }
  };

  const currentIsRunning = activeMode === "ingredients" ? ingredientIsRunning : recipeIsRunning;
  const currentCanRun = activeMode === "ingredients" ? ingredientCanRun : recipeCanRun;
  const currentResults = activeMode === "ingredients" ? ingredientResults : recipeResults;
  const currentSummary = activeMode === "ingredients" ? ingredientSummary : recipeSummary;
  const currentDebugInfo = activeMode === "ingredients" ? ingredientDebugInfo : recipeDebugInfo;
  const currentHistory = activeMode === "ingredients" ? ingredientHistory : recipeHistory;
  const currentSelectedHistoryId = activeMode === "ingredients" ? selectedIngredientHistoryId : selectedRecipeHistoryId;
  const currentTab = activeMode === "ingredients" ? ingredientTab : recipeTab;
  const currentPayloadText = activeMode === "ingredients" ? ingredientPayloadText : recipePayloadText;
  const currentPayloadError = activeMode === "ingredients" ? ingredientPayloadError : recipePayloadError;
  const handlePayloadTextChange = activeMode === "ingredients"
    ? handleIngredientPayloadTextChange
    : handleRecipePayloadTextChange;
  const currentResponseText = activeMode === "ingredients" ? ingredientResponseText : recipeResponseText;
  const currentResponseError = activeMode === "ingredients" ? ingredientResponseError : recipeResponseError;
  const handleResponseTextChange = activeMode === "ingredients"
    ? handleIngredientResponseTextChange
    : handleRecipeResponseTextChange;
  const currentRequestPayload = activeMode === "ingredients" ? ingredientRequestPayload : recipeRequestPayload;
  const currentEndpoint = activeMode === "ingredients"
    ? `${DECERNIS_API_BASE_URL}${INGREDIENT_ENDPOINT_PATH}`
    : `${DECERNIS_API_BASE_URL}${RECIPE_ENDPOINT_PATH}`;
  const defaultRequestInfo: DebugRequestInfo = {
    method: "POST",
    url: currentEndpoint,
    payload: currentRequestPayload,
  };
  const displayedRequestInfo = currentDebugInfo?.request ?? defaultRequestInfo;

  const handleTabChange = (value: string) => {
    const val = value as TabValue;
    if (activeMode === "ingredients") {
      setIngredientTab(val);
    } else {
      setRecipeTab(val);
    }
  };

  const handleHistorySelect = (id: string) => {
    if (activeMode === "ingredients") {
      setSelectedIngredientHistoryId(id);
    } else {
      setSelectedRecipeHistoryId(id);
    }
  };

  const handleIngredientHistoryDelete = (id: string) => {
    deleteIngredientValidationResult(id);
    setIngredientHistory(prev => {
      const updated = prev.filter(record => record.id !== id);
      setSelectedIngredientHistoryId(current => (current === id ? updated[0]?.id ?? null : current));
      return updated;
    });
  };

  const handleRecipeHistoryDelete = (id: string) => {
    deleteRecipeValidationResult(id);
    setRecipeHistory(prev => {
      const updated = prev.filter(record => record.id !== id);
      setSelectedRecipeHistoryId(current => (current === id ? updated[0]?.id ?? null : current));
      return updated;
    });
  };

  const handleDeleteCurrentHistoryRecord = (id: string) => {
    if (activeMode === "ingredients") {
      handleIngredientHistoryDelete(id);
    } else {
      handleRecipeHistoryDelete(id);
    }
  };

  const handleSettingsSave = useCallback((updatedSettings: Partial<AppSettings>) => {
    if (typeof updatedSettings.debugMode === "boolean") {
      setDebugModeEnabled(updatedSettings.debugMode);
    } else {
      const latest = getSettings();
      setDebugModeEnabled(Boolean(latest.debugMode));
    }
  }, []);

  const historyTabLabel = activeMode === "ingredients"
    ? "Ingredients validation results"
    : "Recipe validation results";

  const historyTitle = activeMode === "ingredients"
    ? "Ingredients Validation Results"
    : "Recipe Validation Results";

  const currentResultsTitle = activeMode === "recipe"
    ? (recipeScenarioName.trim() || "Untitled Recipe")
    : (ingredientScenarioName.trim() || "Untitled Scenario");

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const runActiveValidation = () => {
    scrollToTop();

    if (activeMode === "ingredients") {
      void runIngredientValidation();
    } else {
      void runRecipeValidation();
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <RegCheckHeader
        onSettingsClick={() => setSettingsOpen(true)}
        mode={activeMode}
        onModeChange={setActiveMode}
      />
      
      <div className="container mx-auto px-2 py-6 2xl:max-w-none">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value={TAB_BUILDER}>Validation Builder</TabsTrigger>
            <TabsTrigger value={TAB_HISTORY}>{historyTabLabel}</TabsTrigger>
          </TabsList>

          <TabsContent value={TAB_BUILDER}>
            <div className="grid gap-6 grid-cols-3">
              {(currentResults.length > 0 || currentIsRunning) && (
                <div className="col-span-3">
                  <ResultsTable
                    data={currentResults}
                    summary={currentSummary}
                    isLoading={currentIsRunning}
                    title={currentResultsTitle}
                    showPercentage={activeMode === "recipe"}
                  />
                </div>
              )}
              {debugModeEnabled && (
                <div className="col-span-3">
                  <DebugPanel
                    request={displayedRequestInfo}
                    response={currentDebugInfo?.response}
                    errorMessage={currentDebugInfo?.errorMessage}
                    jobId={currentDebugInfo?.jobId}
                    payloadText={currentPayloadText}
                    onPayloadTextChange={handlePayloadTextChange}
                    payloadError={currentPayloadError}
                    responseBodyText={currentResponseText}
                    onResponseBodyTextChange={handleResponseTextChange}
                    responseBodyError={currentResponseError}
                  />
                </div>
              )}
              <div>
                <ScopeBuilder
                  scenarioName={activeMode === "ingredients" ? ingredientScenarioName : recipeScenarioName}
                  countries={activeMode === "ingredients" ? ingredientCountries : recipeCountries}
                  usages={activeMode === "ingredients" ? ingredientUsages : recipeUsages}
                  onScenarioNameChange={activeMode === "ingredients" ? setIngredientScenarioName : setRecipeScenarioName}
                  onCountriesChange={activeMode === "ingredients" ? setIngredientCountries : setRecipeCountries}
                  onUsagesChange={activeMode === "ingredients" ? setIngredientUsages : setRecipeUsages}
                />
              </div>
              
              <div className="col-span-2 space-y-4">
                {activeMode === "ingredients" ? (
                  <IngredientsBuilder
                    ingredients={ingredientItems}
                    onIngredientsChange={setIngredientItems}
                  />
                ) : (
                  <RecipeBuilder
                    ingredients={recipeIngredients}
                    recipeSpec={recipeSpec}
                    onRecipeSpecChange={setRecipeSpec}
                    onIngredientsChange={setRecipeIngredients}
                    includeIngredientAnalysis={recipeIncludeIngredientAnalysis}
                    onIncludeIngredientAnalysisChange={setRecipeIncludeIngredientAnalysis}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={activeMode === "ingredients" ? resetIngredientBuilder : resetRecipeBuilder}
                    disabled={currentIsRunning}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    onClick={runActiveValidation}
                    disabled={!currentCanRun || currentIsRunning}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {currentIsRunning ? "Analyzing..." : "Analyze compliance"}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value={TAB_HISTORY}>
            <ValidationHistory
              records={currentHistory}
              selectedRecordId={currentSelectedHistoryId}
              onSelectRecord={handleHistorySelect}
              title={historyTitle}
              onDeleteRecord={handleDeleteCurrentHistoryRecord}
            />
          </TabsContent>
        </Tabs>
      </div>
      
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSave={handleSettingsSave}
      />
    </div>
  );
};

export default Index;
