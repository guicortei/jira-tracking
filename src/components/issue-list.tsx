"use client";

import { AssigneeBadge } from "@/components/assignee-badge";
import {
  WORKFLOW,
  normalizeStatus,
  StatusTimeline,
  getStatusSortValue,
} from "@/components/status-timeline";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IssueListProps = {
  project: JiraProject;
  issues: JiraIssue[];
  loading?: boolean;
  onBack: () => void;
  compactHeader?: boolean;
};

type SortKey =
  | "key"
  | "linked"
  | "summary"
  | "status"
  | "issueType"
  | "categories"
  | "assignee"
  | "sprint"
  | "storyPoints"
  | "workStartedAt"
  | "resolutionDate"
  | "daysCycleTime"
  | "daysToResolve"
  | "updated";

type SortDirection = "asc" | "desc";

const columns: { key: SortKey; label: string; className?: string }[] = [
  { key: "key", label: "Ticket", className: "min-w-[120px] whitespace-nowrap" },
  { key: "linked", label: "Vínculos", className: "min-w-[140px]" },
  { key: "summary", label: "Resumo" },
  { key: "status", label: "Andamento", className: "min-w-[240px]" },
  { key: "issueType", label: "Tipo" },
  { key: "categories", label: "Categorias", className: "min-w-[180px]" },
  { key: "assignee", label: "Responsável" },
  { key: "sprint", label: "_sprint" },
  { key: "storyPoints", label: "Points" },
  { key: "workStartedAt", label: "Início trabalho" },
  { key: "resolutionDate", label: "Conclusão" },
  { key: "daysCycleTime", label: "Cycle time" },
  { key: "daysToResolve", label: "Lead time" },
  { key: "updated", label: "Atualizado" },
];

function getIssueCellValue(issue: JiraIssue, key: SortKey) {
  switch (key) {
    case "key":
      return issue.key;
    case "linked":
      return issue.linkedIssues.length > 0 ? "Com vínculos" : "Sem vínculos";
    case "summary":
      return issue.summary;
    case "status":
      return issue.status;
    case "issueType":
      return issue.issueType;
    case "categories":
      return issue.categories.length > 0 ? issue.categories.join(", ") : "—";
    case "assignee":
      return issue.assignee ?? "—";
    case "sprint":
      return issue.sprint !== null ? String(issue.sprint) : "—";
    case "storyPoints":
      return issue.storyPoints !== null ? String(issue.storyPoints) : "—";
    case "workStartedAt":
      return issue.workStartedAt ? formatDateOnly(issue.workStartedAt) : "—";
    case "resolutionDate":
      return issue.resolutionDate ? formatDateOnly(issue.resolutionDate) : "—";
    case "daysCycleTime":
      return issue.daysCycleTime !== null
        ? `${issue.daysCycleTime} dia${issue.daysCycleTime === 1 ? "" : "s"}`
        : issue.daysInProgress !== null
          ? `${issue.daysInProgress} dia${issue.daysInProgress === 1 ? "" : "s"}*`
          : "—";
    case "daysToResolve":
      return issue.daysToResolve !== null
        ? `${issue.daysToResolve} dia${issue.daysToResolve === 1 ? "" : "s"}`
        : "—";
    case "updated":
      return formatDate(issue.updated);
  }
}

function getIssueFilterValues(issue: JiraIssue, key: SortKey) {
  if (key === "categories") {
    return issue.categories.length > 0 ? issue.categories : ["—"];
  }
  return [getIssueCellValue(issue, key)];
}

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

function getStatusAccent(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "BLOQUEADO") return "#ef4444";
  const step = WORKFLOW.find((item) => item.key === normalized);
  return step?.color ?? "#71717a";
}

function compactTicketKey(issueKey: string) {
  const parts = issueKey.split("-");
  return parts[parts.length - 1] ?? issueKey;
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
    case "linked":
      return issue.linkedIssues.length;
    case "summary":
      return issue.summary;
    case "status":
      return getStatusSortValue(issue.status);
    case "issueType":
      return issue.issueType;
    case "categories":
      return issue.categories.join(", ");
    case "assignee":
      return issue.assignee;
    case "sprint":
      return issue.sprint;
    case "storyPoints":
      return issue.storyPoints;
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
  filterOptions,
  selectedFilterValues,
  onFilterChange,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  filterOptions: string[];
  selectedFilterValues: string[];
  onFilterChange: (key: SortKey, values: string[]) => void;
}) {
  const isActive = activeKey === sortKey;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const hasActiveFilter = selectedFilterValues.length !== filterOptions.length;
  const selectedSet = useMemo(
    () => new Set(selectedFilterValues),
    [selectedFilterValues],
  );
  const visibleOptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return filterOptions;
    return filterOptions.filter((option) =>
      option.toLowerCase().includes(normalizedSearch),
    );
  }, [filterOptions, search]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  const toggleOption = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onFilterChange(sortKey, [...next]);
  };

  return (
    <th className={`relative px-3 py-2 text-xs font-medium ${className ?? ""}`}>
      <div className="inline-flex items-center gap-1.5">
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
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setIsOpen((current) => !current);
          }}
          className={`rounded border px-1.5 py-0.5 text-[10px] ${
            hasActiveFilter
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100"
          }`}
          title={`Filtrar ${label}`}
        >
          ⌕
        </button>
      </div>

      {isOpen ? (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-zinc-200 bg-white p-2 text-zinc-700 shadow-xl"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar valores..."
            className="mb-2 w-full rounded border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-blue-400"
          />
          <div className="mb-2 flex gap-1">
            <button
              type="button"
              onClick={() => onFilterChange(sortKey, [...filterOptions])}
              className="rounded border border-zinc-300 px-2 py-1 text-[10px] hover:bg-zinc-100"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => onFilterChange(sortKey, [])}
              className="rounded border border-zinc-300 px-2 py-1 text-[10px] hover:bg-zinc-100"
            >
              Deselect all
            </button>
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-zinc-200 p-1">
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option) => (
                <label
                  key={`${sortKey}-${option}`}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option)}
                    onChange={() => toggleOption(option)}
                  />
                  <span className="truncate">{option}</span>
                </label>
              ))
            ) : (
              <p className="px-1 py-2 text-[11px] text-zinc-500">Nenhum valor encontrado.</p>
            )}
          </div>
        </div>
      ) : null}
    </th>
  );
}

type VisibleIssueRow = {
  issue: JiraIssue;
  depth: number;
  isLinked: boolean;
  pathKey: string;
};

function LinkedIssuesDots({ issue }: { issue: JiraIssue }) {
  if (issue.linkedIssues.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {issue.linkedIssues.map((linked) => {
        const color = getStatusAccent(linked.status);

        return (
          <span
            key={`${issue.key}-${linked.id}`}
            className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white"
            style={{ backgroundColor: color }}
            title={`${linked.key} · ${linked.status} · ${linked.summary}`}
          >
            ({compactTicketKey(linked.key)})
          </span>
        );
      })}
    </div>
  );
}

function IssueRow({
  issue,
  project,
  depth,
  isLinked,
  expanded,
  loadingLinked,
  onToggleExpand,
}: {
  issue: JiraIssue;
  project: JiraProject;
  depth: number;
  isLinked: boolean;
  expanded: boolean;
  loadingLinked: boolean;
  onToggleExpand: (issue: JiraIssue) => void;
}) {
  const hasDependencies = issue.linkedIssues.length > 0;

  return (
    <tr className={isLinked ? "bg-zinc-100/80 hover:bg-zinc-100" : "hover:bg-zinc-50"}>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-blue-600">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
          {hasDependencies ? (
            <button
              type="button"
              onClick={() => onToggleExpand(issue)}
              className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-300 text-[10px] text-zinc-600 hover:bg-zinc-200"
              aria-label={expanded ? "Recolher vínculos" : "Expandir vínculos"}
              title={expanded ? "Recolher vínculos" : "Expandir vínculos"}
            >
              {loadingLinked ? "…" : expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-block h-5 w-5" aria-hidden />
          )}
          <a
            href={`${project.siteUrl}/browse/${issue.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap hover:underline"
          >
            {issue.key}
          </a>
        </div>
      </td>
      <td className="px-3 py-2">
        <LinkedIssuesDots issue={issue} />
      </td>
      <td className="max-w-xs truncate px-3 py-2 text-zinc-900">{issue.summary}</td>
      <td className="min-w-[240px] px-3 py-2 align-middle">
        <StatusTimeline status={issue.status} inline />
      </td>
      <td className="px-3 py-2 text-zinc-600">{issue.issueType}</td>
      <td className="px-3 py-2">
        {issue.categories.length > 0 ? (
          <div className="flex max-w-[240px] flex-wrap gap-1">
            {issue.categories.map((category) => (
              <span
                key={`${issue.key}-category-${category}`}
                className="inline-flex rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700"
                title={category}
              >
                {category}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {issue.assignee ? (
          <AssigneeBadge name={issue.assignee} className="px-1 py-0.5 text-[9px]" />
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-zinc-600">{issue.sprint ?? "—"}</td>
      <td className="px-3 py-2 font-semibold tabular-nums text-zinc-700">
        {issue.storyPoints ?? "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
        {issue.workStartedAt ? formatDateOnly(issue.workStartedAt) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
        {issue.resolutionDate ? formatDateOnly(issue.resolutionDate) : "—"}
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
      <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDate(issue.updated)}</td>
    </tr>
  );
}

export function IssueList({
  project,
  issues,
  loading = false,
  onBack,
  compactHeader = false,
}: IssueListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [loadingLinkedByKey, setLoadingLinkedByKey] = useState<Record<string, boolean>>({});
  const [linkedByParentKey, setLinkedByParentKey] = useState<Record<string, JiraIssue[]>>({});
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const [selectedFilterValuesByKey, setSelectedFilterValuesByKey] = useState<
    Partial<Record<SortKey, string[]>>
  >({});

  const allKnownIssues = useMemo(() => {
    const all = new Map<string, JiraIssue>();
    for (const issue of issues) {
      all.set(issue.key, issue);
    }
    for (const linkedIssues of Object.values(linkedByParentKey)) {
      for (const issue of linkedIssues) {
        all.set(issue.key, issue);
      }
    }
    return [...all.values()];
  }, [issues, linkedByParentKey]);

  const filterOptionsByKey = useMemo(() => {
    const map = {} as Record<SortKey, string[]>;
    for (const column of columns) {
      const values = new Set<string>();
      for (const issue of allKnownIssues) {
        for (const value of getIssueFilterValues(issue, column.key)) {
          values.add(value);
        }
      }
      map[column.key] = [...values].sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
      );
    }
    return map;
  }, [allKnownIssues]);

  const matchesSelectedFilters = useCallback(
    (issue: JiraIssue) => {
      for (const column of columns) {
        const key = column.key;
        const options = filterOptionsByKey[key] ?? [];
        const selected = selectedFilterValuesByKey[key] ?? options;
        if (selected.length === options.length) continue;
        const values = getIssueFilterValues(issue, key);
        if (!values.some((value) => selected.includes(value))) {
          return false;
        }
      }
      return true;
    },
    [filterOptionsByKey, selectedFilterValuesByKey],
  );

  const sortedIssues = useMemo(() => {
    return [...issues]
      .filter(matchesSelectedFilters)
      .sort((a, b) =>
      compareValues(
        getSortValue(a, sortKey),
        getSortValue(b, sortKey),
        sortDirection,
      ),
      );
  }, [issues, matchesSelectedFilters, sortKey, sortDirection]);

  const visibleRows = useMemo(() => {
    const rows: VisibleIssueRow[] = [];

    const appendChildren = (
      parentIssue: JiraIssue,
      depth: number,
      path: Set<string>,
      parentPathKey: string,
    ) => {
      const children = linkedByParentKey[parentIssue.key] ?? [];
      for (const child of children) {
        if (path.has(child.key)) continue;
        const pathKey = `${parentPathKey}>${child.key}`;
        if (matchesSelectedFilters(child)) {
          rows.push({ issue: child, depth, isLinked: true, pathKey });
        }
        if (expandedKeys[child.key]) {
          appendChildren(child, depth + 1, new Set([...path, child.key]), pathKey);
        }
      }
    };

    for (const issue of sortedIssues) {
      rows.push({ issue, depth: 0, isLinked: false, pathKey: issue.key });
      if (expandedKeys[issue.key]) {
        appendChildren(issue, 1, new Set([issue.key]), issue.key);
      }
    }

    return rows;
  }, [expandedKeys, linkedByParentKey, matchesSelectedFilters, sortedIssues]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(
      key === "key" || key === "summary" || key === "status" ? "asc" : "desc",
    );
  };

  const handleFilterChange = useCallback(
    (key: SortKey, nextValues: string[]) => {
      setSelectedFilterValuesByKey((current) => ({
        ...current,
        [key]: nextValues,
      }));
    },
    [],
  );

  const loadLinkedIssues = useCallback(async (issue: JiraIssue) => {
    setLinkedError(null);
    setLoadingLinkedByKey((current) => ({ ...current, [issue.key]: true }));
    try {
      const response = await fetch(`/api/issues/${encodeURIComponent(issue.key)}/linked`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao carregar tickets vinculados.");
      }

      setLinkedByParentKey((current) => ({
        ...current,
        [issue.key]: data.issues ?? [],
      }));
    } finally {
      setLoadingLinkedByKey((current) => ({ ...current, [issue.key]: false }));
    }
  }, []);

  const handleToggleExpand = useCallback(
    async (issue: JiraIssue) => {
      if (expandedKeys[issue.key]) {
        setExpandedKeys((current) => ({ ...current, [issue.key]: false }));
        return;
      }

      try {
        if (!linkedByParentKey[issue.key] && issue.linkedIssues.length > 0) {
          await loadLinkedIssues(issue);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Falha ao carregar tickets vinculados.";
        setLinkedError(message);
        return;
      }

      setExpandedKeys((current) => ({ ...current, [issue.key]: true }));
    },
    [expandedKeys, linkedByParentKey, loadLinkedIssues],
  );

  return (
    <div
      className={
        compactHeader
          ? "relative left-1/2 w-screen -translate-x-1/2 space-y-4 px-3 sm:px-5 lg:px-8"
          : "space-y-4"
      }
    >
      {compactHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Detalhamento
            </p>
            <h2 className="text-xl font-semibold text-zinc-900">Todos os tickets</h2>
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
            <h2 className="text-xl font-semibold text-zinc-900">{project.name}</h2>
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
          {linkedError ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {linkedError}
            </div>
          ) : null}
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
                      filterOptions={filterOptionsByKey[column.key] ?? []}
                      selectedFilterValues={
                        selectedFilterValuesByKey[column.key] ??
                        (filterOptionsByKey[column.key] ?? [])
                      }
                      onFilterChange={handleFilterChange}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleRows.map((row) => (
                  <IssueRow
                    key={row.pathKey}
                    issue={row.issue}
                    project={project}
                    depth={row.depth}
                    isLinked={row.isLinked}
                    expanded={Boolean(expandedKeys[row.issue.key])}
                    loadingLinked={Boolean(loadingLinkedByKey[row.issue.key])}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            * Cycle time em andamento — dias desde a saída de &quot;A Fazer&quot; (via changelog).
            Lead time = criação até conclusão.
          </p>
        </div>
      )}
    </div>
  );
}
