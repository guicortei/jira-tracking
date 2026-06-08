"use client";

import { AssigneeBadge } from "@/components/assignee-badge";
import { DualProgressBar } from "@/components/dual-progress-bar";
import {
  StatusTimeline,
  normalizeStatus,
} from "@/components/status-timeline";
import type { SprintProjection } from "@/lib/jira/projection-types";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useMemo, useState, type CSSProperties } from "react";

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function issueLeftBarStyle(
  status: string,
  sprintColor: string,
): CSSProperties | null {
  const normalized = normalizeStatus(status);

  if (normalized === "FEITO") {
    return { backgroundColor: sprintColor };
  }

  if (normalized !== "A FAZER") {
    return {
      backgroundColor: sprintColor,
      backgroundImage: `repeating-linear-gradient(
          -45deg,
          rgba(255,255,255,0.4) 0,
          rgba(255,255,255,0.4) 4px,
          transparent 4px,
          transparent 8px
        )`,
    };
  }

  return null;
}

function sprintStatusLabel(sprint: SprintProjection) {
  const now = Date.now();
  const start = new Date(sprint.projectedStartDate).getTime();
  const end = new Date(sprint.projectedEndDate).getTime();

  if (sprint.done === sprint.total) return "Concluída";
  if (now < start) return "Prevista";
  if (now >= end && sprint.done < sprint.total) return "Atrasada";
  if (now >= start) return "Em execução";
  return "Prevista";
}

type SprintSummaryCardProps = {
  sprint: SprintProjection;
  color: string;
  issues: JiraIssue[];
  project: JiraProject;
  issuesLoading?: boolean;
};

export function SprintSummaryCard({
  sprint,
  color,
  issues,
  project,
  issuesLoading = false,
}: SprintSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = sprint.done === sprint.total;

  const sprintIssues = useMemo(
    () =>
      [...issues].sort((a, b) =>
        a.key.localeCompare(b.key, "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [issues],
  );

  const statusColor =
    isComplete ? "#2563eb" : sprint.unlocked ? "#059669" : "#71717a";

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full px-2.5 py-2 text-left transition hover:bg-zinc-100"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white"
            style={{ backgroundColor: color }}
          >
            S{sprint.sprint}
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-xs font-bold text-zinc-900">
                Sprint {sprint.sprint} · {formatPct(sprint.completionPct)}
              </p>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                style={{ backgroundColor: statusColor }}
              >
                {sprintStatusLabel(sprint)}
              </span>
            </div>

            <DualProgressBar
              total={sprint.total}
              done={sprint.done}
              inProgress={sprint.inProgress}
              doneColor={color}
              inProgressColor={color}
              className="h-1.5"
            />

            <p className="text-[10px] font-medium text-zinc-500">
              {sprint.done} feitos · {sprint.inProgress} and. · {sprint.notStarted}{" "}
              a fazer
            </p>
          </div>

          <span
            className="shrink-0 pt-0.5 text-sm font-bold text-zinc-400"
            aria-hidden
          >
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 bg-white px-2.5 py-2">
          <p className="mb-2 text-[10px] font-medium text-zinc-500">
            {formatDateShort(sprint.projectedStartDate)} →{" "}
            {formatDateShort(sprint.projectedEndDate)} · {sprint.projectedDurationDays}d
          </p>

          {issuesLoading ? (
            <p className="py-2 text-xs text-zinc-500">Carregando tickets...</p>
          ) : sprintIssues.length === 0 ? (
            <p className="py-2 text-xs text-zinc-500">Nenhum ticket nesta sprint.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
              {sprintIssues.map((issue) => {
                const leftBarStyle = issueLeftBarStyle(issue.status, color);

                return (
                <li
                  key={issue.id}
                  className="flex overflow-hidden rounded border border-zinc-100 bg-zinc-50"
                >
                  {leftBarStyle ? (
                    <div
                      className="w-1 shrink-0 self-stretch"
                      style={leftBarStyle}
                      aria-hidden
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 px-2 py-1.5">
                  <div className="mb-1 flex items-start gap-1.5">
                    <a
                      href={`${project.siteUrl}/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 pt-px text-[10px] font-bold leading-snug text-blue-600 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {issue.key}
                    </a>
                    {issue.storyPoints !== null ? (
                      <span
                        className="shrink-0 rounded border border-zinc-200 bg-white px-1 py-px text-[9px] font-black leading-none tabular-nums text-zinc-700"
                        title="Story points"
                      >
                        {issue.storyPoints}
                      </span>
                    ) : null}
                    <p className="min-w-0 flex-1 break-words text-[10px] leading-snug text-zinc-700">
                      {issue.summary}
                    </p>
                    {issue.assignee ? (
                      <AssigneeBadge name={issue.assignee} className="pt-px" />
                    ) : null}
                  </div>
                  <StatusTimeline status={issue.status} inline />
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
