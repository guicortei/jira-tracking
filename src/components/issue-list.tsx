"use client";

import { AssigneeBadge } from "@/components/assignee-badge";
import {
  StatusTimeline,
  getStatusSortValue,
} from "@/components/status-timeline";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useMemo, useState } from "react";

type IssueListProps = {
  project: JiraProject;
  issues: JiraIssue[];
  loading?: boolean;
  onBack: () => void;
  compactHeader?: boolean;
};

type SortKey =
  | "key"
  | "summary"
  | "status"
  | "issueType"
  | "assignee"
  | "sprint"
  | "workStartedAt"
  | "resolutionDate"
  | "daysCycleTime"
  | "daysToResolve"
  | "updated";

type SortDirection = "asc" | "desc";

const columns: { key: SortKey; label: string; className?: string }[] = [
  { key: "key", label: "Ticket" },
  { key: "summary", label: "Resumo" },
  { key: "status", label: "Andamento", className: "min-w-[240px]" },
  { key: "issueType", label: "Tipo" },
  { key: "assignee", label: "Responsável" },
  { key: "sprint", label: "_sprint" },
  { key: "workStartedAt", label: "Início trabalho" },
  { key: "resolutionDate", label: "Conclusão" },
  { key: "daysCycleTime", label: "Cycle time" },
  { key: "daysToResolve", label: "Lead time" },
  { key: "updated", label: "Atualizado" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  direction: SortDirection,
) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  let result = 0;

  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  }

  return direction === "asc" ? result : -result;
}

function getSortValue(issue: JiraIssue, key: SortKey) {
  switch (key) {
    case "key":
      return issue.key;
    case "summary":
      return issue.summary;
    case "status":
      return getStatusSortValue(issue.status);
    case "issueType":
      return issue.issueType;
    case "assignee":
      return issue.assignee;
    case "sprint":
      return issue.sprint;
    case "workStartedAt":
      return issue.workStartedAt
        ? new Date(issue.workStartedAt).getTime()
        : null;
    case "resolutionDate":
      return issue.resolutionDate
        ? new Date(issue.resolutionDate).getTime()
        : null;
    case "daysCycleTime":
      return issue.daysCycleTime ?? issue.daysInProgress;
    case "daysToResolve":
      return issue.daysToResolve;
    case "updated":
      return new Date(issue.updated).getTime();
  }
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = activeKey === sortKey;

  return (
    <th className={`px-3 py-2 text-xs font-medium ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-zinc-900"
      >
        {label}
        <span className="text-[10px] text-zinc-400">
          {isActive ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function IssueList({
  project,
  issues,
  loading = false,
  onBack,
  compactHeader = false,
}: IssueListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedIssues = useMemo(() => {
    return [...issues].sort((a, b) =>
      compareValues(
        getSortValue(a, sortKey),
        getSortValue(b, sortKey),
        sortDirection,
      ),
    );
  }, [issues, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "key" || key === "summary" ? "asc" : "desc");
  };

  return (
    <div className="space-y-4">
      {compactHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Detalhamento
            </p>
            <h2 className="text-xl font-semibold text-zinc-900">
              Todos os tickets
            </h2>
            <p className="text-sm text-zinc-500">
              {loading
                ? "Carregando..."
                : `${issues.length} ticket${issues.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Voltar aos projetos
            </button>
            <h2 className="text-xl font-semibold text-zinc-900">
              {project.name}
            </h2>
            <p className="text-sm text-zinc-500">
              {loading
                ? "Carregando tickets (inclui changelog)..."
                : `${issues.length} ticket${issues.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
            />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-zinc-500">
          Nenhum ticket encontrado neste projeto.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <tr>
                  {columns.map((column) => (
                    <SortableHeader
                      key={column.key}
                      label={column.label}
                      sortKey={column.key}
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                      className={column.className}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sortedIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-blue-600">
                      <a
                        href={`${project.siteUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {issue.key}
                      </a>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-zinc-900">
                      {issue.summary}
                    </td>
                    <td className="min-w-[240px] px-3 py-2 align-middle">
                      <StatusTimeline status={issue.status} inline />
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{issue.issueType}</td>
                    <td className="px-3 py-2">
                      {issue.assignee ? (
                        <AssigneeBadge
                          name={issue.assignee}
                          className="px-1 py-0.5 text-[9px]"
                        />
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {issue.sprint ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {issue.workStartedAt
                        ? formatDateOnly(issue.workStartedAt)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {issue.resolutionDate
                        ? formatDateOnly(issue.resolutionDate)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {issue.daysCycleTime !== null
                        ? `${issue.daysCycleTime} dia${issue.daysCycleTime === 1 ? "" : "s"}`
                        : issue.daysInProgress !== null
                          ? `${issue.daysInProgress} dia${issue.daysInProgress === 1 ? "" : "s"}*`
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {issue.daysToResolve !== null
                        ? `${issue.daysToResolve} dia${issue.daysToResolve === 1 ? "" : "s"}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {formatDate(issue.updated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            * Cycle time em andamento — dias desde a saída de &quot;A Fazer&quot;
            (via changelog). Lead time = criação até conclusão.
          </p>
        </div>
      )}
    </div>
  );
}
