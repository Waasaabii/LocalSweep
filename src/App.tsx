import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownToLine,
  Bot,
  BrainCircuit,
  CheckCircle2,
  DatabaseZap,
  HardDriveDownload,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import "./App.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProcessAvatar } from "@/components/process-avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeCandidates,
  cleanCaches,
  killSelected,
  loadSettings,
  saveSettings,
  scanCaches,
  scanCandidates,
} from "@/lib/tauri-client";
import type { AppSettings, Candidate, PageKey, WorkspaceView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/lib/ui-store";

const pages: Array<{ key: PageKey; label: string; icon: typeof BrainCircuit; hint: string }> = [
  {
    key: "workspace",
    label: "端口 / 进程",
    icon: BrainCircuit,
    hint: "扫描、分析并勾选要处理的候选项",
  },
  {
    key: "cache",
    label: "缓存清理",
    icon: HardDriveDownload,
    hint: "扫描缓存目录并执行清理",
  },
  {
    key: "settings",
    label: "设置",
    icon: Settings2,
    hint: "配置 AI endpoint、模型和超时",
  },
];

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPorts(candidate: Candidate): string {
  if (candidate.ports.length === 0) {
    return "无监听端口";
  }
  return candidate.ports
    .map((port) => `${port.port}/${port.protocol}`)
    .join(" · ");
}

function sortCandidates(candidates: Candidate[], workspaceView: WorkspaceView): Candidate[] {
  if (workspaceView === "ports") {
    return [...candidates].sort((left, right) => {
      const leftPort = left.ports[0]?.port ?? Number.MAX_SAFE_INTEGER;
      const rightPort = right.ports[0]?.port ?? Number.MAX_SAFE_INTEGER;
      return leftPort - rightPort || right.cpuPercent - left.cpuPercent;
    });
  }

  return [...candidates].sort((left, right) => {
    if (left.cpuPercent === right.cpuPercent) {
      return right.memoryMb - left.memoryMb;
    }
    return right.cpuPercent - left.cpuPercent;
  });
}

function App() {
  const queryClient = useQueryClient();
  const page = useUiStore((state) => state.page);
  const workspaceView = useUiStore((state) => state.workspaceView);
  const search = useUiStore((state) => state.search);
  const selectedCandidateId = useUiStore((state) => state.selectedCandidateId);
  const selectedCandidateIds = useUiStore((state) => state.selectedCandidateIds);
  const selectedCacheCategories = useUiStore((state) => state.selectedCacheCategories);
  const analysis = useUiStore((state) => state.analysis);
  const killResponse = useUiStore((state) => state.killResponse);
  const cleanResponse = useUiStore((state) => state.cleanResponse);
  const setPage = useUiStore((state) => state.setPage);
  const setWorkspaceView = useUiStore((state) => state.setWorkspaceView);
  const setSearch = useUiStore((state) => state.setSearch);
  const setSelectedCandidateId = useUiStore((state) => state.setSelectedCandidateId);
  const toggleCandidate = useUiStore((state) => state.toggleCandidate);
  const clearSelectedCandidates = useUiStore((state) => state.clearSelectedCandidates);
  const toggleCacheCategory = useUiStore((state) => state.toggleCacheCategory);
  const replaceCacheCategories = useUiStore((state) => state.replaceCacheCategories);
  const setAnalysis = useUiStore((state) => state.setAnalysis);
  const setKillResponse = useUiStore((state) => state.setKillResponse);
  const setCleanResponse = useUiStore((state) => state.setCleanResponse);

  const candidatesQuery = useQuery({
    queryKey: ["candidates"],
    queryFn: scanCandidates,
    refetchInterval: 15000,
  });
  const cachesQuery = useQuery({
    queryKey: ["caches"],
    queryFn: scanCaches,
    enabled: page === "cache",
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: loadSettings,
  });

  const [settingsDraft, setSettingsDraft] = useState<AppSettings>({
    endpoint: "http://localhost:11434/v1",
    apiKey: "",
    model: "qwen2.5:14b",
    timeoutSeconds: 30,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettingsDraft(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const analyzeMutation = useMutation({
    mutationFn: analyzeCandidates,
    onSuccess: (response) => {
      setAnalysis(response);
      toast.success("AI 分析完成");
    },
    onError: (error) => toast.error(String(error)),
  });

  const killMutation = useMutation({
    mutationFn: killSelected,
    onSuccess: async (response) => {
      setKillResponse(response);
      toast.success("已执行结束进程命令");
      await queryClient.invalidateQueries({ queryKey: ["candidates"] });
      clearSelectedCandidates();
    },
    onError: (error) => toast.error(String(error)),
  });

  const cleanMutation = useMutation({
    mutationFn: cleanCaches,
    onSuccess: async (response) => {
      setCleanResponse(response);
      toast.success("缓存清理完成");
      await queryClient.invalidateQueries({ queryKey: ["caches"] });
      replaceCacheCategories([]);
    },
    onError: (error) => toast.error(String(error)),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: async () => {
      toast.success("设置已保存");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => toast.error(String(error)),
  });

  const allCandidates = candidatesQuery.data?.candidates ?? [];
  const candidates = sortCandidates(
    allCandidates.filter((candidate) => {
      if (workspaceView === "ports" && candidate.ports.length === 0) {
        return false;
      }

      if (!search.trim()) {
        return true;
      }

      const term = search.trim().toLowerCase();
      return [
        candidate.processName,
        candidate.commandSummary,
        candidate.executablePath,
        candidate.projectPath ?? "",
        formatPorts(candidate),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    }),
    workspaceView,
  );

  const selectedCandidates = candidates.filter((candidate) =>
    selectedCandidateIds.includes(candidate.id),
  );
  const activeCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    allCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    null;

  const suggestionMap = new Map(
    (analysis?.suggestions ?? []).map((suggestion) => [suggestion.candidateId, suggestion]),
  );

  const portsCount = allCandidates.reduce(
    (total, candidate) => total + candidate.ports.length,
    0,
  );
  const cacheBytes = (cachesQuery.data?.categories ?? []).reduce(
    (total, category) => total + category.totalBytes,
    0,
  );

  function submitAnalysis(scope: "all" | "filtered" | "selected") {
    const payload =
      scope === "selected"
        ? selectedCandidates
        : scope === "filtered"
          ? candidates
          : allCandidates;

    if (payload.length === 0) {
      toast.warning("当前没有可分析的候选项");
      return;
    }

    analyzeMutation.mutate({
      scope,
      candidates: payload,
    });
  }

  function submitKill(force: boolean) {
    if (selectedCandidateIds.length === 0) {
      toast.warning("请先勾选要结束的进程");
      return;
    }

    const confirmed = window.confirm(
      `${force ? "强制" : "温和"}结束 ${selectedCandidateIds.length} 个候选项？`,
    );
    if (!confirmed) {
      return;
    }

    killMutation.mutate({ candidateIds: selectedCandidateIds, force });
  }

  function submitDirectKill(candidateId: string, force: boolean) {
    const confirmed = window.confirm(
      `${force ? "强制" : "温和"}结束 ${candidateId}？`,
    );
    if (!confirmed) {
      return;
    }

    killMutation.mutate({ candidateIds: [candidateId], force });
  }

  function submitCacheClean() {
    if (selectedCacheCategories.length === 0) {
      toast.warning("请先勾选要清理的缓存类别");
      return;
    }

    const confirmed = window.confirm(
      `确认清理 ${selectedCacheCategories.length} 个缓存类别？`,
    );
    if (!confirmed) {
      return;
    }

    cleanMutation.mutate({ categories: selectedCacheCategories });
  }

  return (
    <div className="app-shell min-h-screen px-5 py-5 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1800px] grid-cols-[260px_minmax(0,1fr)] gap-4">
        <aside className="panel-surface subtle-grid flex flex-col gap-4 rounded-[28px] border border-white/50 bg-white/65 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/5">
          <div className="space-y-3">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
              LocalSweep
            </Badge>
            <div className="space-y-1">
              <h1 className="text-2xl font-medium tracking-tight">本地环境清理工作台</h1>
              <p className="text-sm text-muted-foreground">
                端口、进程、缓存和 AI 建议放在同一张操作台里。
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {pages.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
                    active
                      ? "border-foreground/15 bg-foreground text-background shadow-[0_16px_48px_rgba(15,23,42,0.24)]"
                      : "border-transparent bg-background/60 hover:border-border hover:bg-background",
                  )}
                  onClick={() => setPage(item.key)}
                >
                  <span
                    className={cn(
                      "rounded-xl p-2",
                      active ? "bg-white/12" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        active ? "text-white/70" : "text-muted-foreground",
                      )}
                    >
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <Card size="sm" className="mt-auto border border-white/40 bg-white/60 dark:border-white/10 dark:bg-white/6">
            <CardHeader>
              <CardTitle className="text-sm">运行态</CardTitle>
              <CardDescription>桌面端命令链路与 Web 预览共用同一界面。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>候选项</span>
                <span className="font-medium text-foreground">{allCandidates.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>监听端口</span>
                <span className="font-medium text-foreground">{portsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>缓存体积</span>
                <span className="font-medium text-foreground">{formatBytes(cacheBytes)}</span>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="panel-surface flex min-h-full flex-col gap-4 rounded-[28px] border border-white/50 bg-white/72 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border/70 bg-background/85 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                OpenAI-style console
              </p>
              <h2 className="text-xl font-medium">
                {page === "workspace"
                  ? "端口 / 进程"
                  : page === "cache"
                    ? "缓存清理"
                    : "设置"}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {candidatesQuery.isFetching ? "实时刷新中" : "准备就绪"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ["candidates"] });
                  void queryClient.invalidateQueries({ queryKey: ["caches"] });
                }}
              >
                <RefreshCw className="size-4" />
                刷新
              </Button>
            </div>
          </header>

          {page === "workspace" && (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_400px] gap-4">
              <section className="flex min-h-0 flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                    <CardHeader>
                      <CardDescription>当前候选项</CardDescription>
                      <CardTitle>{allCandidates.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      包含监听端口和高资源进程。
                    </CardContent>
                  </Card>
                  <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                    <CardHeader>
                      <CardDescription>已勾选</CardDescription>
                      <CardTitle>{selectedCandidateIds.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      支持批量结束，仍保留确认。
                    </CardContent>
                  </Card>
                  <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                    <CardHeader>
                      <CardDescription>AI 建议</CardDescription>
                      <CardTitle>{analysis?.suggestions.length ?? 0}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      推荐态会映射回当前列表。
                    </CardContent>
                  </Card>
                </div>

                <Card className="flex min-h-0 flex-1 flex-col border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle>候选工作区</CardTitle>
                        <CardDescription>
                          共用同一份 candidate store，在端口视图和进程视图之间切换。
                        </CardDescription>
                      </div>
                      <Tabs
                        value={workspaceView}
                        onValueChange={(value) => setWorkspaceView(value as WorkspaceView)}
                      >
                        <TabsList>
                          <TabsTrigger value="ports">端口视图</TabsTrigger>
                          <TabsTrigger value="processes">进程视图</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[260px] flex-1">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.currentTarget.value)}
                          className="pl-9"
                          placeholder="搜索端口、进程名、路径或项目目录…"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => submitAnalysis("filtered")}
                        disabled={analyzeMutation.isPending}
                      >
                        {analyzeMutation.isPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Bot className="size-4" />
                        )}
                        分析筛选结果
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => submitAnalysis("selected")}
                        disabled={analyzeMutation.isPending}
                      >
                        <Sparkles className="size-4" />
                        分析勾选项
                      </Button>
                      <Button size="sm" onClick={() => submitKill(false)} disabled={killMutation.isPending}>
                        <ArrowDownToLine className="size-4" />
                        结束所选
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_140px_120px_140px] gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span>选择</span>
                      <span>进程与来源</span>
                      <span>端口 / 风险</span>
                      <span>资源</span>
                      <span>动作</span>
                    </div>
                    <ScrollArea className="candidate-scroll min-h-0 flex-1 pr-3">
                      <div className="space-y-2">
                        {candidatesQuery.isLoading && (
                          <Card className="border border-dashed border-border/70 bg-transparent">
                            <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
                              <LoaderCircle className="size-4 animate-spin" />
                              正在扫描端口与进程…
                            </CardContent>
                          </Card>
                        )}

                        {!candidatesQuery.isLoading && candidates.length === 0 && (
                          <Card className="border border-dashed border-border/70 bg-transparent">
                            <CardContent className="py-8 text-sm text-muted-foreground">
                              当前筛选条件下没有候选项。
                            </CardContent>
                          </Card>
                        )}

                        {candidates.map((candidate) => {
                          const suggestion = suggestionMap.get(candidate.id);
                          const checked = selectedCandidateIds.includes(candidate.id);
                          return (
                            <Card
                              key={candidate.id}
                              className={cn(
                                "border bg-background/82 transition hover:border-foreground/15",
                                checked && "border-foreground/20 shadow-[0_16px_48px_rgba(15,23,42,0.12)]",
                                suggestion && "ring-1 ring-blue-500/20",
                              )}
                            >
                              <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_140px_120px_140px] items-start gap-3 py-4">
                                <div className="flex items-center gap-2 pt-0.5">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleCandidate(candidate.id)}
                                  />
                                  <button
                                    type="button"
                                    className="rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-medium"
                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                  >
                                    PID {candidate.pid}
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <ProcessAvatar candidate={candidate} />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium">
                                        {candidate.processName}
                                      </div>
                                      <div className="truncate text-xs text-muted-foreground">
                                        {candidate.commandSummary || candidate.executablePath}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {candidate.projectPath ?? candidate.executablePath}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="text-sm font-medium">{formatPorts(candidate)}</div>
                                  <div className="flex flex-wrap gap-1">
                                    {candidate.riskTags.slice(0, 3).map((tag) => (
                                      <Badge
                                        key={tag}
                                        variant="outline"
                                        className="rounded-full text-[11px]"
                                      >
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                  {suggestion && (
                                    <p className="text-xs text-blue-600 dark:text-blue-300">
                                      AI: {suggestion.reason}
                                    </p>
                                  )}
                                </div>

                                <div className="space-y-1 text-sm">
                                  <div className="font-medium">{candidate.cpuPercent.toFixed(1)}%</div>
                                  <div className="text-muted-foreground">
                                    {candidate.memoryMb.toFixed(1)} MB
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {candidate.status}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Button
                                    size="sm"
                                    className="w-full"
                                    onClick={() => submitDirectKill(candidate.id, false)}
                                  >
                                    结束
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                  >
                                    查看详情
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </section>

              <section className="flex min-h-0 flex-col gap-4">
                <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader>
                    <CardTitle>AI 建议面板</CardTitle>
                    <CardDescription>
                      分析当前候选项并回写推荐态，执行动作仍然保留本地确认。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2">
                      <Button
                        className="w-full justify-start"
                        onClick={() => submitAnalysis("all")}
                        disabled={analyzeMutation.isPending}
                      >
                        <Bot className="size-4" />
                        分析全部候选项
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => submitAnalysis("filtered")}
                        disabled={analyzeMutation.isPending}
                      >
                        <Sparkles className="size-4" />
                        分析当前筛选
                      </Button>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium">分析摘要</p>
                      <p className="text-sm text-muted-foreground">
                        {analysis?.summary ?? "还没有 AI 分析结果。"}
                      </p>
                    </div>
                    <ScrollArea className="candidate-scroll h-[220px] pr-3">
                      <div className="space-y-2">
                        {(analysis?.suggestions ?? []).map((suggestion) => (
                          <div
                            key={suggestion.candidateId}
                            className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{suggestion.candidateId}</p>
                              <Badge variant="outline">{suggestion.riskLevel}</Badge>
                            </div>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              {suggestion.recommendation}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{suggestion.reason}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader>
                    <CardTitle>执行结果</CardTitle>
                    <CardDescription>
                      保留逐项结果，避免只看到一个“成功/失败”提示。
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => submitKill(false)}
                      >
                        温和结束
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => submitKill(true)}
                      >
                        强制结束
                      </Button>
                    </div>
                    <ScrollArea className="candidate-scroll h-[220px] pr-3">
                      <div className="space-y-2">
                        {(killResponse?.results ?? []).map((result) => (
                          <div
                            key={result.candidateId}
                            className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{result.candidateId}</p>
                              {result.ok ? (
                                <CheckCircle2 className="size-4 text-emerald-500" />
                              ) : (
                                <AlertCircle className="size-4 text-amber-500" />
                              )}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </section>
            </div>
          )}

          {page === "cache" && (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4">
              <Card className="flex min-h-0 flex-col border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>缓存扫描</CardTitle>
                      <CardDescription>
                        V1 仅处理应用缓存、Xcode DerivedData 与 Cargo registry cache。
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void queryClient.invalidateQueries({ queryKey: ["caches"] })}
                    >
                      <RefreshCw className="size-4" />
                      重新扫描
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_160px_140px] gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span>选择</span>
                    <span>类别 / 路径</span>
                    <span>数量</span>
                    <span>体积</span>
                  </div>
                  <ScrollArea className="candidate-scroll min-h-0 flex-1 pr-3">
                    <div className="space-y-2">
                      {(cachesQuery.data?.categories ?? []).map((category) => (
                        <Card
                          key={category.category}
                          className="border border-border/70 bg-background/82"
                        >
                          <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_160px_140px] items-start gap-3 py-4">
                            <Checkbox
                              checked={selectedCacheCategories.includes(category.category)}
                              onCheckedChange={() => toggleCacheCategory(category.category)}
                            />
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{category.category}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {category.path}
                              </p>
                              {category.errors.length > 0 && (
                                <p className="text-xs text-amber-600 dark:text-amber-300">
                                  {category.errors[0]}
                                </p>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {category.fileCount.toLocaleString()} files
                            </div>
                            <div className="text-sm font-medium">
                              {formatBytes(category.totalBytes)}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <section className="flex flex-col gap-4">
                <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader>
                    <CardTitle>清理动作</CardTitle>
                    <CardDescription>仍然保留二次确认，不做无提示删除。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button className="w-full" onClick={submitCacheClean}>
                      <Trash2 className="size-4" />
                      清理所选缓存
                    </Button>
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-3 text-sm text-muted-foreground">
                      当前已勾选 {selectedCacheCategories.length} 个类别，预计释放{" "}
                      {formatBytes(
                        (cachesQuery.data?.categories ?? [])
                          .filter((category) =>
                            selectedCacheCategories.includes(category.category),
                          )
                          .reduce((total, category) => total + category.totalBytes, 0),
                      )}
                      。
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader>
                    <CardTitle>清理结果</CardTitle>
                    <CardDescription>逐项保留结果与失败信息。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="candidate-scroll h-[340px] pr-3">
                      <div className="space-y-2">
                        {(cleanResponse?.results ?? []).map((result) => (
                          <div
                            key={result.category}
                            className="rounded-2xl border border-border/70 bg-background/82 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{result.category}</p>
                              <Badge variant={result.ok ? "outline" : "secondary"}>
                                {result.ok ? "已完成" : "失败"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {result.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </section>
            </div>
          )}

          {page === "settings" && (
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-4">
              <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                <CardHeader>
                  <CardTitle>AI 配置</CardTitle>
                  <CardDescription>
                    配置 OpenAI-compatible `/v1/chat/completions` 接口，供桌面端与 CLI 共用。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="endpoint">API Endpoint</Label>
                    <Input
                      id="endpoint"
                      value={settingsDraft.endpoint}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          endpoint: event.currentTarget.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="model">模型名称</Label>
                    <Input
                      id="model"
                      value={settingsDraft.model}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          model: event.currentTarget.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Textarea
                      id="apiKey"
                      rows={4}
                      value={settingsDraft.apiKey}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          apiKey: event.currentTarget.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="timeout">超时（秒）</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={5}
                      max={120}
                      value={settingsDraft.timeoutSeconds}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          timeoutSeconds: Number(event.currentTarget.value || 30),
                        }))
                      }
                    />
                  </div>
                  <Button
                    onClick={() => saveSettingsMutation.mutate(settingsDraft)}
                    disabled={saveSettingsMutation.isPending}
                  >
                    <DatabaseZap className="size-4" />
                    保存设置
                  </Button>
                </CardContent>
              </Card>

              <section className="flex flex-col gap-4">
                <Card className="border border-white/40 bg-white/76 dark:border-white/10 dark:bg-white/6">
                  <CardHeader>
                    <CardTitle>当前行为</CardTitle>
                    <CardDescription>桌面端与 CLI 共用同一份本地设置。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-3">
                      `analyze` 命令会读取这里保存的 endpoint、model 和 timeout。
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/82 p-3">
                      当前 CLI 默认只读；kill 与 cache clean 先由桌面端承接。
                    </div>
                  </CardContent>
                </Card>
              </section>
            </div>
          )}
        </main>
      </div>

      <Sheet open={Boolean(activeCandidate)} onOpenChange={(open) => !open && setSelectedCandidateId(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>{activeCandidate?.processName ?? "候选详情"}</SheetTitle>
            <SheetDescription>查看完整路径、命令行、端口和 AI 建议。</SheetDescription>
          </SheetHeader>
          {activeCandidate && (
            <div className="space-y-4 px-4 pb-6 text-sm">
              <div className="rounded-2xl border border-border/70 bg-background/82 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ProcessAvatar candidate={activeCandidate} className="size-12 rounded-[18px]" />
                    <div>
                      <p className="text-base font-medium">{activeCandidate.processName}</p>
                      <p className="text-xs text-muted-foreground">
                        {activeCandidate.commandSummary || activeCandidate.executablePath}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      PID
                    </p>
                    <p className="text-lg font-medium">{activeCandidate.pid}</p>
                  </div>
                  <Badge variant="outline">{activeCandidate.status}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  端口
                </p>
                <p>{formatPorts(activeCandidate)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  可执行路径
                </p>
                <p className="break-all text-muted-foreground">{activeCandidate.executablePath}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  命令行摘要
                </p>
                <p className="break-all text-muted-foreground">{activeCandidate.commandSummary}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  项目目录
                </p>
                <p className="break-all text-muted-foreground">
                  {activeCandidate.projectPath ?? "未识别到项目目录"}
                </p>
              </div>

              <div className="flex flex-wrap gap-1">
                {activeCandidate.riskTags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default App;
