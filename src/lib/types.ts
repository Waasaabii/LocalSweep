export type WorkspaceView = "ports" | "processes";

export type PageKey = "workspace" | "cache" | "settings";

export type RiskLevel = "low" | "medium" | "high";

export type Recommendation = "kill" | "keep" | "investigate";

export type CacheCategory =
  | "appCaches"
  | "xcodeDerivedData"
  | "cargoRegistryCache";

export interface PortBinding {
  port: number;
  protocol: "tcp" | "udp";
}

export interface Candidate {
  id: string;
  processName: string;
  pid: number;
  icon?: string | null;
  ports: PortBinding[];
  executablePath: string;
  commandSummary: string;
  projectPath?: string | null;
  cpuPercent: number;
  memoryMb: number;
  startedAt: string;
  status: "running" | "sleeping" | "stopped" | "unknown";
  riskTags: string[];
}

export interface ScanCandidatesResponse {
  candidates: Candidate[];
  scannedAt: string;
}

export interface AnalyzeCandidatesRequest {
  scope: "all" | "filtered" | "selected";
  candidates: Candidate[];
}

export interface AiSuggestion {
  candidateId: string;
  recommendation: Recommendation;
  reason: string;
  riskLevel: RiskLevel;
}

export interface AnalyzeCandidatesResponse {
  summary: string;
  suggestions: AiSuggestion[];
  analyzedAt: string;
}

export interface KillRequest {
  candidateIds: string[];
  force: boolean;
}

export interface KillResultItem {
  candidateId: string;
  ok: boolean;
  message: string;
}

export interface KillResponse {
  results: KillResultItem[];
  executedAt: string;
}

export interface CacheCategoryResult {
  category: CacheCategory;
  path: string;
  fileCount: number;
  totalBytes: number;
  errors: string[];
}

export interface ScanCachesResponse {
  categories: CacheCategoryResult[];
  scannedAt: string;
}

export interface CleanCachesRequest {
  categories: CacheCategory[];
}

export interface CleanCacheResultItem {
  category: CacheCategory;
  ok: boolean;
  removedBytes: number;
  message: string;
}

export interface CleanCachesResponse {
  results: CleanCacheResultItem[];
  cleanedAt: string;
}

export interface AppSettings {
  endpoint: string;
  apiKey: string;
  model: string;
  timeoutSeconds: number;
}

export interface SaveSettingsResponse {
  savedAt: string;
}

