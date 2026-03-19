import { useState } from "react";

import type { Candidate } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProcessAvatarProps {
  candidate: Candidate;
  className?: string;
}

interface AvatarPreset {
  label: string;
  className: string;
}

function deriveInitials(processName: string): string {
  const parts = processName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return processName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "??";
}

function inferPreset(candidate: Candidate): AvatarPreset {
  const haystack = [
    candidate.processName,
    candidate.commandSummary,
    candidate.executablePath,
    candidate.projectPath ?? "",
    candidate.riskTags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("wechat") || haystack.includes("wecom")) {
    return {
      label: "WX",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_45%),linear-gradient(135deg,#4ade80,#16a34a)] text-white",
    };
  }

  if (haystack.includes("qq")) {
    return {
      label: "QQ",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_45%),linear-gradient(135deg,#60a5fa,#1d4ed8)] text-white",
    };
  }

  if (haystack.includes("cursor")) {
    return {
      label: "CU",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_45%),linear-gradient(135deg,#111827,#020617)] text-white",
    };
  }

  if (
    haystack.includes("visual studio code") ||
    haystack.includes("/code") ||
    haystack.includes("vscode")
  ) {
    return {
      label: "<>",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.26),transparent_42%),linear-gradient(135deg,#38bdf8,#2563eb)] text-white",
    };
  }

  if (haystack.includes("claude")) {
    return {
      label: "Cl",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_45%),linear-gradient(135deg,#fb923c,#c2410c)] text-white",
    };
  }

  if (haystack.includes("chrome") || haystack.includes("arc") || haystack.includes("firefox") || haystack.includes("safari")) {
    return {
      label: "WB",
      className:
        "bg-[conic-gradient(from_220deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#ef4444)] text-white",
    };
  }

  if (haystack.includes("ollama") || haystack.includes("model-service")) {
    return {
      label: "AI",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(135deg,#334155,#0f172a)] text-white",
    };
  }

  if (haystack.includes("node") || haystack.includes("pnpm") || haystack.includes("npm")) {
    return {
      label: "JS",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.24),transparent_42%),linear-gradient(135deg,#4ade80,#15803d)] text-white",
    };
  }

  if (haystack.includes("python") || haystack.includes("uv ")) {
    return {
      label: "Py",
      className:
        "bg-[linear-gradient(135deg,#2563eb_0%,#2563eb_48%,#fbbf24_52%,#d97706_100%)] text-white",
    };
  }

  if (haystack.includes("docker") || haystack.includes("orbstack") || haystack.includes("colima")) {
    return {
      label: "DK",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.24),transparent_45%),linear-gradient(135deg,#38bdf8,#0284c7)] text-white",
    };
  }

  if (
    haystack.includes("postgres") ||
    haystack.includes("mysql") ||
    haystack.includes("mongo") ||
    haystack.includes("redis") ||
    haystack.includes("sqlite")
  ) {
    return {
      label: "DB",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.24),transparent_45%),linear-gradient(135deg,#a78bfa,#6d28d9)] text-white",
    };
  }

  if (
    haystack.includes("xcode") ||
    haystack.includes("goland") ||
    haystack.includes("pycharm") ||
    haystack.includes("webstorm") ||
    haystack.includes("intellij")
  ) {
    return {
      label: "IDE",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_45%),linear-gradient(135deg,#0f172a,#7c3aed)] text-white",
    };
  }

  if (
    haystack.includes("terminal") ||
    haystack.includes("iterm") ||
    haystack.includes("warp") ||
    haystack.includes("zsh") ||
    haystack.includes("bash")
  ) {
    return {
      label: "$_",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(135deg,#374151,#111827)] text-emerald-200",
    };
  }

  if (haystack.includes("cargo") || haystack.includes("rust") || haystack.includes("tauri")) {
    return {
      label: "Rs",
      className:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_42%),linear-gradient(135deg,#475569,#1e293b)] text-amber-200",
    };
  }

  return {
    label: deriveInitials(candidate.processName),
    className:
      "bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.28),transparent_42%),linear-gradient(135deg,#e2e8f0,#cbd5e1)] text-slate-700 dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.12),transparent_42%),linear-gradient(135deg,#334155,#0f172a)] dark:text-slate-100",
  };
}

export function ProcessAvatar({ candidate, className }: ProcessAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const preset = inferPreset(candidate);
  const hasImage = Boolean(candidate.icon) && !imageFailed;

  return (
    <div
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/80 shadow-sm",
        hasImage ? "bg-white dark:bg-slate-950" : preset.className,
        className,
      )}
    >
      {hasImage ? (
        <img
          src={candidate.icon ?? undefined}
          alt={candidate.processName}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <>
          <div className="absolute inset-0 rounded-2xl border border-white/15" />
          <span className="relative text-[11px] font-semibold tracking-[0.08em]">
            {preset.label}
          </span>
        </>
      )}
    </div>
  );
}
