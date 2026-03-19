import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyzeCandidatesRequest,
  AnalyzeCandidatesResponse,
  AppSettings,
  Candidate,
  CacheCategoryResult,
  CleanCachesRequest,
  CleanCachesResponse,
  KillRequest,
  KillResponse,
  SaveSettingsResponse,
  ScanCachesResponse,
  ScanCandidatesResponse,
} from "@/lib/types";

const DEFAULT_SETTINGS: AppSettings = {
  endpoint: "http://localhost:11434/v1",
  apiKey: "",
  model: "qwen2.5:14b",
  timeoutSeconds: 30,
};

const MOCK_CANDIDATES: Candidate[] = [
  {
    id: "proc_1337",
    processName: "ollama",
    pid: 1337,
    icon: null,
    ports: [{ port: 11434, protocol: "tcp" }],
    executablePath: "/usr/local/bin/ollama",
    commandSummary: "ollama serve",
    projectPath: null,
    cpuPercent: 32.4,
    memoryMb: 1432,
    startedAt: "2026-03-19T13:20:00+08:00",
    status: "running",
    riskTags: ["model-service", "high-memory"],
  },
  {
    id: "proc_2024",
    processName: "node",
    pid: 2024,
    icon: null,
    ports: [
      { port: 3000, protocol: "tcp" },
      { port: 5173, protocol: "tcp" },
    ],
    executablePath: "/opt/homebrew/bin/node",
    commandSummary: "pnpm dev",
    projectPath: "/Users/wangshangbin/My/LocalSweep",
    cpuPercent: 18.7,
    memoryMb: 652,
    startedAt: "2026-03-19T13:05:00+08:00",
    status: "running",
    riskTags: ["dev-service", "multi-port"],
  },
  {
    id: "proc_7788",
    processName: "python",
    pid: 7788,
    icon: null,
    ports: [{ port: 8000, protocol: "tcp" }],
    executablePath: "/usr/bin/python3",
    commandSummary: "uv run api.py",
    projectPath: "/Users/wangshangbin/workbench/api-server",
    cpuPercent: 4.3,
    memoryMb: 221,
    startedAt: "2026-03-19T12:40:00+08:00",
    status: "running",
    riskTags: ["dev-service"],
  },
];

const MOCK_CACHE_SCAN: CacheCategoryResult[] = [
  {
    category: "appCaches",
    path: "~/Library/Caches/",
    fileCount: 2814,
    totalBytes: 3_481_321_155,
    errors: [],
  },
  {
    category: "xcodeDerivedData",
    path: "~/Library/Developer/Xcode/DerivedData/",
    fileCount: 915,
    totalBytes: 7_248_987_211,
    errors: [],
  },
  {
    category: "cargoRegistryCache",
    path: "~/.cargo/registry/cache/",
    fileCount: 742,
    totalBytes: 1_939_321_122,
    errors: [],
  },
];

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function safeInvoke<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  if (!hasTauriRuntime()) {
    return fallback;
  }

  return invoke<T>(command, args);
}

export async function scanCandidates(): Promise<ScanCandidatesResponse> {
  const fallback: ScanCandidatesResponse = {
    candidates: MOCK_CANDIDATES,
    scannedAt: new Date().toISOString(),
  };
  return safeInvoke("scan_ports_and_processes", {}, fallback);
}

export async function analyzeCandidates(
  request: AnalyzeCandidatesRequest,
): Promise<AnalyzeCandidatesResponse> {
  const fallback: AnalyzeCandidatesResponse = {
    summary:
      "当前候选项中有 2 个建议优先处理，主要风险来自多端口开发服务和高内存模型服务。",
    suggestions: request.candidates.slice(0, 2).map((candidate, index) => ({
      candidateId: candidate.id,
      recommendation: "kill",
      reason:
        index === 0
          ? "该进程占用多个开发端口，且资源长期占用。"
          : "该进程内存占用较高，建议在不需要时结束。",
      riskLevel: index === 0 ? "medium" : "low",
    })),
    analyzedAt: new Date().toISOString(),
  };
  return safeInvoke("analyze_candidates", { request }, fallback);
}

export async function killSelected(
  request: KillRequest,
): Promise<KillResponse> {
  const fallback: KillResponse = {
    results: request.candidateIds.map((id) => ({
      candidateId: id,
      ok: false,
      message: "当前为浏览器预览模式，不执行真实进程结束。",
    })),
    executedAt: new Date().toISOString(),
  };
  return safeInvoke("kill_processes", { request }, fallback);
}

export async function scanCaches(): Promise<ScanCachesResponse> {
  const fallback: ScanCachesResponse = {
    categories: MOCK_CACHE_SCAN,
    scannedAt: new Date().toISOString(),
  };
  return safeInvoke("scan_caches", {}, fallback);
}

export async function cleanCaches(
  request: CleanCachesRequest,
): Promise<CleanCachesResponse> {
  const fallback: CleanCachesResponse = {
    results: request.categories.map((category) => ({
      category,
      ok: false,
      removedBytes: 0,
      message: "当前为浏览器预览模式，不执行真实缓存清理。",
    })),
    cleanedAt: new Date().toISOString(),
  };
  return safeInvoke("clean_caches", { request }, fallback);
}

export async function loadSettings(): Promise<AppSettings> {
  return safeInvoke("load_settings", {}, DEFAULT_SETTINGS);
}

export async function saveSettings(
  settings: AppSettings,
): Promise<SaveSettingsResponse> {
  const fallback: SaveSettingsResponse = { savedAt: new Date().toISOString() };
  return safeInvoke("save_settings", { settings }, fallback);
}
