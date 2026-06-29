"use client";

import { AssigneeBadge } from "@/components/assignee-badge";
import {
  DualProgressBar,
  TicketSegmentFill,
  stripedGradient,
} from "@/components/dual-progress-bar";
import { SprintSummaryCard } from "@/components/sprint-summary-card";
import { StatusTimeline, normalizeStatus } from "@/components/status-timeline";
import { getAssigneeBadgeColors } from "@/lib/string-color";
import type {
  CheckoutProjections,
  ProjectionUnit,
  ProjectProjection,
  SprintProjection,
} from "@/lib/jira/projection-types";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ProjectProjectionPanelProps = {
  projectKey: string;
  projectName: string;
  project: JiraProject;
  issues: JiraIssue[];
  issuesLoading?: boolean;
  onBack: () => void;
};

const SPRINT_COLORS = [
  "#64748b",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#c026d3",
  "#db2777",
  "#e11d48",
  "#ea580c",
  "#d97706",
  "#059669",
];

function formatDateShort(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateShortFromMs(value: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function formatDateLong(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    new Date(value),
  );
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatRate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

function formatDays(value: number) {
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
}

function dateToMs(value: string) {
  return new Date(value).getTime();
}

function buildSprintCategoryLabel(issues: JiraIssue[]) {
  const uniqueCategories = new Set<string>();
  for (const issue of issues) {
    for (const category of issue.categories) {
      const trimmed = category.trim();
      if (!trimmed) continue;
      uniqueCategories.add(trimmed);
    }
  }
  return [...uniqueCategories]
    .sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
    )
    .join(" / ");
}

function positionOnTimeline(date: string, startMs: number, endMs: number) {
  if (endMs <= startMs) return 0;
  return Math.min(
    100,
    Math.max(0, ((dateToMs(date) - startMs) / (endMs - startMs)) * 100),
  );
}

function buildTimelineRange(projection: ProjectProjection) {
  const startMs = startOfLocalDay(dateToMs(projection.timeline.projectStartDate));
  let endMs = dateToMs(projection.timeline.estimatedEndDate);
  const endDate = new Date(endMs);
  const endsAtDayStart =
    endDate.getHours() === 0 &&
    endDate.getMinutes() === 0 &&
    endDate.getSeconds() === 0 &&
    endDate.getMilliseconds() === 0;
  if (!endsAtDayStart) {
    endMs = startOfLocalDay(endMs) + 86400000;
  }
  if (endMs <= startMs) {
    endMs = startMs + 86400000;
  }
  return { startMs, endMs };
}

export function ProjectProjectionPanel({
  projectKey,
  projectName,
  project,
  issues,
  issuesLoading = false,
  onBack,
}: ProjectProjectionPanelProps) {
  const [storyChartMode, setStoryChartMode] = useState<"projection" | "flow">(
    "projection",
  );
  const [metricsBarBase, setMetricsBarBase] = useState<"tickets" | "storyPoints">(
    "tickets",
  );
  const [showAssigneeInitials, setShowAssigneeInitials] = useState(false);
  const [projections, setProjections] = useState<CheckoutProjections | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const metricsColumnRef = useRef<HTMLDivElement>(null);
  const [summaryPanelHeight, setSummaryPanelHeight] = useState<number | null>(
    null,
  );

  useEffect(() => {
    async function loadProjection() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects/${projectKey}/projection`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Falha ao carregar projeção.");
        }
        setProjections(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar projeção.",
        );
      } finally {
        setLoading(false);
      }
    }
    loadProjection();
  }, [projectKey]);

  const ticketProjection = projections?.tickets ?? null;
  const storyPointsProjection = projections?.storyPoints ?? null;

  const ticketTimelineRange = useMemo(
    () => (ticketProjection ? buildTimelineRange(ticketProjection) : null),
    [ticketProjection],
  );

  const storyPointsTimelineRange = useMemo(
    () =>
      storyPointsProjection ? buildTimelineRange(storyPointsProjection) : null,
    [storyPointsProjection],
  );

  const activeSprints = useMemo(() => {
    if (!storyPointsProjection) return 0;
    return storyPointsProjection.sprints.filter(
      (s) => s.unlocked && s.done < s.total,
    ).length;
  }, [storyPointsProjection]);

  const issuesBySprint = useMemo(() => {
    const map = new Map<number, JiraIssue[]>();
    for (const issue of issues) {
      if (issue.sprint === null) continue;
      const list = map.get(issue.sprint) ?? [];
      list.push(issue);
      map.set(issue.sprint, list);
    }
    return map;
  }, [issues]);

  const sprintLabelByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const [sprint, sprintIssues] of issuesBySprint.entries()) {
      const label = buildSprintCategoryLabel(sprintIssues);
      if (!label) continue;
      map.set(sprint, label);
    }
    return map;
  }, [issuesBySprint]);

  useEffect(() => {
    const column = metricsColumnRef.current;
    if (!column) return;

    const syncHeight = () => {
      const isWide = window.matchMedia("(min-width: 1024px)").matches;
      if (!isWide) {
        setSummaryPanelHeight(null);
        return;
      }
      setSummaryPanelHeight(column.getBoundingClientRect().height);
    };

    const runSync = () => {
      requestAnimationFrame(() => {
        syncHeight();
        requestAnimationFrame(syncHeight);
      });
    };

    runSync();

    const observer = new ResizeObserver(runSync);
    observer.observe(column);
    window.addEventListener("resize", runSync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", runSync);
    };
  }, [storyPointsProjection, loading]);

  if (loading) {
    return (
      <div className="mb-8 space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-200" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-zinc-200"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
        {error}
      </div>
    );
  }

  if (
    !ticketProjection ||
    !storyPointsProjection ||
    !ticketTimelineRange ||
    !storyPointsTimelineRange
  ) {
    return null;
  }

  const projection = storyPointsProjection;
  const altProjection = ticketProjection;
  const { startMs, endMs } = storyPointsTimelineRange;
  const altTimelineRange = ticketTimelineRange;
  const overallInProgress = projection.sprints.reduce(
    (acc, sprint) => acc + sprint.inProgress,
    0,
  );

  return (
    <div className="mb-10 space-y-6 text-zinc-900">
      {/* KPIs + resumo: flex evita que o resumo estique a linha */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div ref={metricsColumnRef} className="min-w-0 flex-1 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="mb-3 text-sm font-semibold text-blue-700 hover:underline"
              >
                ← Voltar aos projetos
              </button>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
                Dashboard
              </p>
              <h1 className="mt-1 text-3xl font-black text-zinc-900">
                {projectName}
              </h1>
            </div>

            <div className="min-w-[240px] rounded-2xl border-2 border-emerald-600 bg-emerald-600 px-6 py-4 text-white shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">
                Entrega estimada (story points)
              </p>
              <p className="mt-1 text-2xl font-black leading-tight">
                {formatDateLong(projection.projection.estimatedDate)}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-100">
                Faltam {projection.projection.remainingDays} dias
              </p>
              <p className="mt-3 border-t border-emerald-500/50 pt-3 text-xs font-semibold text-emerald-100">
                Por tickets:{" "}
                {formatDateLong(altProjection.projection.estimatedDate)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>Progresso geral do projeto</span>
              <span className="text-blue-700">
                {projection.overall.donePoints}/{projection.overall.totalPoints}{" "}
                pts ({formatPct(projection.overall.completionPctPoints)})
              </span>
            </div>
            <DualProgressBar
              total={projection.overall.total}
              done={projection.overall.done}
              inProgress={overallInProgress}
              doneColor="#2563eb"
              inProgressColor="#60a5fa"
              className="h-4"
            />
            <p className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm bg-blue-600" />
                Concluído
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-4 rounded-sm"
                  style={{
                    backgroundColor: "#60a5fa",
                    backgroundImage: stripedGradient("#60a5fa"),
                  }}
                />
                Em andamento
              </span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <KpiCard
              label="Progresso"
              value={formatPct(projection.overall.completionPctPoints)}
              detail={`${projection.overall.donePoints}/${projection.overall.totalPoints} pts · ${projection.overall.done} tickets concluídos`}
              borderColor="#2563eb"
              bgColor="#eff6ff"
            />
            <KpiCard
              label="Velocidade"
              value={`${formatRate(projection.velocity.throughputPerDay)} pts/dia`}
              detail={`${formatRate(altProjection.velocity.throughputPerDay)} tk/dia · mediana ${formatDays(projection.velocity.medianCycleDays)}d (cycle time)`}
              borderColor="#7c3aed"
              bgColor="#f5f3ff"
            />
            <KpiCard
              label="Sprints ativas"
              value={String(activeSprints)}
              detail={`de ${projection.sprints.length} sprints no total`}
              borderColor="#d97706"
              bgColor="#fffbeb"
            />
            <KpiCard
              label="Base da estimativa"
              value={String(projection.velocity.sampleSize)}
              detail={`${projection.velocity.pointsDelivered ?? 0} pts entregues em ${formatDays(projection.velocity.windowDays)} dia(s)`}
              borderColor="#0891b2"
              bgColor="#ecfeff"
            />
          </div>

          <section className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">
              Faixa de previsão
            </h2>
            <p className="mb-4 text-sm text-zinc-600">
              Cenários em story points com velocidade ±25% em relação à média
              atual
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ForecastCard
                label="Otimista"
                date={formatDateLong(projection.projection.optimisticDate)}
                sub={formatDateShort(projection.projection.optimisticDate)}
                color="#059669"
                bg="#ecfdf5"
              />
              <ForecastCard
                label="Estimado"
                date={formatDateLong(projection.projection.estimatedDate)}
                sub={`${formatDays(projection.projection.remainingDays)} dias restantes`}
                color="#1d4ed8"
                bg="#dbeafe"
                highlight
              />
              <ForecastCard
                label="Pessimista"
                date={formatDateLong(projection.projection.pessimisticDate)}
                sub={formatDateShort(projection.projection.pessimisticDate)}
                color="#b45309"
                bg="#fef3c7"
              />
            </div>
          </section>
        </div>

        <div
          className="w-full shrink-0 overflow-hidden lg:w-[38%]"
          style={
            summaryPanelHeight !== null
              ? {
                  height: summaryPanelHeight,
                  maxHeight: summaryPanelHeight,
                }
              : undefined
          }
        >
          <section
            className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm max-lg:max-h-[70vh] ${
              summaryPanelHeight === null ? "lg:max-h-[70vh]" : ""
            }`}
          >
            <h2 className="shrink-0 text-base font-bold text-zinc-900">
              Resumo das sprints
            </h2>
            <p className="mb-1 shrink-0 text-sm text-zinc-600">
              Situação atual de cada sprint pelo campo{" "}
              <code className="text-xs">_sprint</code>.
            </p>
            <p className="mb-4 shrink-0 text-xs text-zinc-500">
              Clique na sprint para ver os tickets. Barra sólida = concluído ·
              listras = em andamento.
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {projection.sprints.map((sprint, index) => (
                <SprintSummaryCard
                  key={sprint.sprint}
                  sprint={sprint}
                  color={SPRINT_COLORS[index % SPRINT_COLORS.length]}
                  sprintLabel={sprintLabelByNumber.get(sprint.sprint)}
                  issues={issuesBySprint.get(sprint.sprint) ?? []}
                  project={project}
                  issuesLoading={issuesLoading}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="relative left-1/2 w-screen -translate-x-1/2 space-y-6 px-3 sm:px-5 lg:px-8">
        {/* Cronograma — largura total */}
        <section className="w-full rounded-2xl border-2 border-violet-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-zinc-900">
              Cronograma por sprint — velocidade em story points
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setStoryChartMode((current) =>
                    current === "projection" ? "flow" : "projection",
                  )
                }
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                {storyChartMode === "projection"
                  ? "Ver fluxo real por ticket"
                  : "Ver modo projeção"}
              </button>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={showAssigneeInitials}
                  onChange={(event) =>
                    setShowAssigneeInitials(event.target.checked)
                  }
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                Mostrar iniciais
              </label>
            </div>
          </div>
          <p className="mb-1 text-sm text-zinc-600">
            Gantt sequencial: início em{" "}
            <strong className="font-semibold">
              {formatDateShort(projection.timeline.projectStartDate)}
            </strong>
            , velocidade de {formatRate(projection.velocity.throughputPerDay)}{" "}
            pts/dia ({projection.velocity.pointsDelivered ?? 0} pts já
            entregues). Cada sprint só começa quando a anterior termina.
          </p>
          <p className="mb-4 text-xs text-zinc-500">
            {storyChartMode === "projection"
              ? "Barra segmentada por ticket (progresso real) · linha vermelha = hoje"
              : "Modo fluxo real: cada bloco de ticket vai de Fazendo até Feito (ou Hoje se ainda não concluído) · linha vermelha = hoje"}
          </p>

          <SprintGanttChart
            sprints={projection.sprints}
            unit="storyPoints"
            velocityPerDay={projection.velocity.throughputPerDay}
            averageCycleDays={projection.velocity.medianCycleDays}
            averageCycleDaysPerPoint={projection.velocity.cycleDaysPerPoint}
            issuesBySprint={issuesBySprint}
            sprintLabelByNumber={sprintLabelByNumber}
            project={project}
            showAssigneeInitials={showAssigneeInitials}
            metricsBarBase={metricsBarBase}
            onMetricsBarBaseChange={setMetricsBarBase}
            viewMode={storyChartMode}
            projectStartDate={projection.timeline.projectStartDate}
            estimatedEndDate={projection.timeline.estimatedEndDate}
            startMs={startMs}
            endMs={endMs}
          />
        </section>

        <details className="w-full rounded-2xl border-2 border-zinc-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span className="text-base font-bold text-zinc-900">
              Cronograma por sprint — velocidade em tickets ▸
            </span>
            <span className="mt-1 block text-sm font-normal text-zinc-600">
              Cenário alternativo (
              {formatRate(altProjection.velocity.throughputPerDay)} tickets/dia)
              · término{" "}
              {formatDateShort(altProjection.projection.estimatedDate)}
            </span>
          </summary>
          <div className="border-t border-zinc-200 px-5 pb-5 pt-4">
            <p className="mb-4 text-xs text-zinc-500">
              Barra sólida = concluído · listras = em andamento · linha vermelha
              = hoje
            </p>

            <SprintGanttChart
              sprints={altProjection.sprints}
              unit="tickets"
              velocityPerDay={altProjection.velocity.throughputPerDay}
              averageCycleDays={altProjection.velocity.medianCycleDays}
              averageCycleDaysPerPoint={
                altProjection.velocity.cycleDaysPerPoint
              }
              issuesBySprint={issuesBySprint}
              sprintLabelByNumber={sprintLabelByNumber}
              project={project}
              showAssigneeInitials={showAssigneeInitials}
              metricsBarBase={metricsBarBase}
              onMetricsBarBaseChange={setMetricsBarBase}
              viewMode="projection"
              projectStartDate={altProjection.timeline.projectStartDate}
              estimatedEndDate={altProjection.timeline.estimatedEndDate}
              startMs={altTimelineRange.startMs}
              endMs={altTimelineRange.endMs}
            />
          </div>
        </details>

        <details className="rounded-2xl border-2 border-zinc-200 bg-zinc-50">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-zinc-800">
            Como a projeção é calculada ▾
          </summary>
          <div className="space-y-4 border-t-2 border-zinc-200 px-5 py-4 text-sm text-zinc-700">
            <div>
              <h3 className="mb-2 font-bold text-zinc-900">
                Cenário por story points (padrão)
              </h3>
              <ul className="space-y-2">
                {projection.assumptions.map((item) => (
                  <li key={`sp-${item}`}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-bold text-zinc-900">
                Cenário por tickets
              </h3>
              <ul className="space-y-2">
                {altProjection.assumptions.map((item) => (
                  <li key={`tk-${item}`}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  borderColor,
  bgColor,
}: {
  label: string;
  value: string;
  detail: string;
  borderColor: string;
  bgColor: string;
}) {
  return (
    <div
      className="rounded-2xl border-2 p-4 shadow-sm"
      style={{ borderColor, backgroundColor: bgColor }}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-700">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-zinc-900">{value}</p>
      <p className="mt-2 text-sm font-medium text-zinc-700">{detail}</p>
    </div>
  );
}

function ForecastCard({
  label,
  date,
  sub,
  color,
  bg,
  highlight,
}: {
  label: string;
  date: string;
  sub: string;
  color: string;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl border-2 p-4"
      style={{
        borderColor: color,
        backgroundColor: bg,
        boxShadow: highlight ? `0 0 0 3px ${color}33` : undefined,
      }}
    >
      <p
        className="text-xs font-bold uppercase tracking-wide"
        style={{ color }}
      >
        {label}
      </p>
      <p className="mt-2 text-lg font-black leading-snug text-zinc-900">
        {date}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-700">{sub}</p>
    </div>
  );
}

type DayGridColumn = {
  key: string;
  dayStartMs: number;
  leftPct: number;
  widthPct: number;
  isWeekend: boolean;
};

type ProjectionHistoryPoint = {
  issueKey: string;
  eventDate: string;
  deliveredPoints: number;
  remainingPoints: number;
  velocityPointsPerDay: number;
  estimatedEndDate: string;
};

type RollingProjectionHistoryPoint = {
  issueKey: string;
  eventDate: string;
  deliveredPoints: number;
  remainingPoints: number;
  windowPoints: number;
  windowDays: number;
  velocityPointsPerDay: number;
  estimatedEndDate: string | null;
};

function startOfLocalDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfLocalDay(ms: number) {
  return startOfLocalDay(ms) + 86400000 - 1;
}

function buildDayGrid(startMs: number, endMs: number): DayGridColumn[] {
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return [];

  const columns: DayGridColumn[] = [];
  let cursor = startOfLocalDay(startMs);
  const endExclusiveDayStart = startOfLocalDay(endMs);

  while (cursor < endExclusiveDayStart) {
    const date = new Date(cursor);
    const dayOfWeek = date.getDay();
    columns.push({
      key: date.toISOString().slice(0, 10),
      dayStartMs: cursor,
      leftPct: ((cursor - startMs) / spanMs) * 100,
      widthPct: (86400000 / spanMs) * 100,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
    cursor += 86400000;
  }

  return columns;
}

function DayGridBackground({ days }: { days: DayGridColumn[] }) {
  if (days.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden border-r border-zinc-300/70"
      aria-hidden
    >
      {days.map((day) => (
        <div
          key={day.key}
          className={`absolute top-0 bottom-0 border-l border-zinc-300/70 ${
            day.isWeekend ? "bg-zinc-200/55" : ""
          }`}
          style={{
            left: `${day.leftPct}%`,
            width: `${day.widthPct}%`,
          }}
        />
      ))}
    </div>
  );
}

function buildMonthTicks(startMs: number, endMs: number) {
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return [];
  const ticks: { key: string; label: string; leftPct: number; widthPct: number }[] = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const monthStartMs = Math.max(cursor.getTime(), startMs);
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    const monthEndMs = Math.min(next.getTime(), endMs);
    ticks.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(cursor),
      leftPct: ((monthStartMs - startMs) / spanMs) * 100,
      widthPct: Math.max(0, ((monthEndMs - monthStartMs) / spanMs) * 100),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return ticks;
}

function buildYearTicks(startMs: number, endMs: number) {
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return [];
  const ticks: { key: string; label: string; leftPct: number; widthPct: number }[] = [];
  const cursor = new Date(startMs);
  cursor.setMonth(0, 1);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const yearStartMs = Math.max(cursor.getTime(), startMs);
    const next = new Date(cursor);
    next.setFullYear(next.getFullYear() + 1);
    const yearEndMs = Math.min(next.getTime(), endMs);
    ticks.push({
      key: String(cursor.getFullYear()),
      label: String(cursor.getFullYear()),
      leftPct: ((yearStartMs - startMs) / spanMs) * 100,
      widthPct: Math.max(0, ((yearEndMs - yearStartMs) / spanMs) * 100),
    });
    cursor.setFullYear(cursor.getFullYear() + 1);
  }

  return ticks;
}

function SprintGanttChart({
  sprints,
  unit,
  velocityPerDay,
  averageCycleDays,
  averageCycleDaysPerPoint,
  issuesBySprint,
  sprintLabelByNumber,
  project,
  showAssigneeInitials = false,
  metricsBarBase = "tickets",
  onMetricsBarBaseChange,
  viewMode = "projection",
  projectStartDate,
  estimatedEndDate,
  startMs,
  endMs,
}: {
  sprints: SprintProjection[];
  unit: ProjectionUnit;
  velocityPerDay: number;
  averageCycleDays: number;
  averageCycleDaysPerPoint?: number;
  issuesBySprint?: Map<number, JiraIssue[]>;
  sprintLabelByNumber?: Map<number, string>;
  project: JiraProject;
  showAssigneeInitials?: boolean;
  metricsBarBase?: "tickets" | "storyPoints";
  onMetricsBarBaseChange?: (value: "tickets" | "storyPoints") => void;
  viewMode?: "projection" | "flow";
  projectStartDate: string;
  estimatedEndDate: string;
  startMs: number;
  endMs: number;
}) {
  const workloadLabel = unit === "storyPoints" ? "pts" : "tk";
  const [projectionChartMode, setProjectionChartMode] = useState<"normal" | "inverted">(
    "normal",
  );
  const [rollingWindowDays, setRollingWindowDays] = useState(14);
  const [yAxisWindowDays, setYAxisWindowDays] = useState(20);
  const velocityLabel =
    unit === "storyPoints"
      ? `${formatRate(velocityPerDay)} pts/dia`
      : `${formatRate(velocityPerDay)} tickets/dia`;
  const todayPct = positionOnTimeline(new Date().toISOString(), startMs, endMs);
  const nowIso = new Date().toISOString();
  const monthTicks = useMemo(
    () => buildMonthTicks(startMs, endMs),
    [startMs, endMs],
  );
  const yearTicks = useMemo(() => buildYearTicks(startMs, endMs), [startMs, endMs]);
  const dayGrid = useMemo(() => buildDayGrid(startMs, endMs), [startMs, endMs]);
  const FLOW_BLOCK_HEIGHT = 12;
  const FLOW_BLOCK_GAP = 3;
  const FLOW_GROUP_GAP = 5;
  const FLOW_PADDING_Y = 6;
  const DEFAULT_ROW_HEIGHT = 40;
  const PROJECTION_ROW_HEIGHT = 58;
  const TIMELINE_HEADER_HEIGHT = 40;
  const PROJECTION_HISTORY_ROW_HEIGHT = 240;
  const HISTORY_CHART_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
  const METRICS_HEADER_HEIGHT = 16;
  const METRICS_BAR_MAX_HEIGHT = 104;
  const METRICS_BAR_GAP = 4;
  const METRICS_VALUE_ROW_HEIGHT = 10;
  const METRICS_BOTTOM_PADDING = 4;
  const METRICS_ROW_HEIGHT =
    METRICS_HEADER_HEIGHT +
    METRICS_BAR_MAX_HEIGHT +
    METRICS_BAR_GAP +
    METRICS_VALUE_ROW_HEIGHT * 6 +
    METRICS_BOTTOM_PADDING;
  const firstIncompleteSprintIndex = useMemo(
    () => sprints.findIndex((sprint) => sprint.done < sprint.total),
    [sprints],
  );
  const plannedCascadeBySprint = useMemo(() => {
    const cascade = new Map<
      number,
      Array<{
        key: string;
        label: string;
        left: number;
        width: number;
        points: number;
        statusLabel: string;
        isInProgress: boolean;
        issue: JiraIssue;
      }>
    >();

    if (viewMode !== "flow" || unit !== "storyPoints") return cascade;
    if (firstIncompleteSprintIndex < 0 || velocityPerDay <= 0) return cascade;

    const nowMs = dateToMs(nowIso);
    let cursorMs = Math.max(nowMs, startMs);
    const cycleDays = Math.max(0.5, averageCycleDays || 1);
    const cycleDaysPerPoint = Math.max(0.25, averageCycleDaysPerPoint ?? 1);

    for (
      let index = firstIncompleteSprintIndex;
      index < sprints.length;
      index += 1
    ) {
      const sprint = sprints[index];
      const issues = issuesBySprint?.get(sprint.sprint) ?? [];
      const inProgressIssues = issues
        .filter((issue) => {
          const status = normalizeStatus(issue.status);
          return (
            Boolean(issue.workStartedAt) &&
            status !== "FEITO" &&
            status !== "A FAZER"
          );
        })
        .sort((a, b) => a.key.localeCompare(b.key));
      const todoIssues = issues
        .filter((issue) => normalizeStatus(issue.status) === "A FAZER")
        .sort((a, b) => a.key.localeCompare(b.key));
      const pendingIssues = [
        ...new Map(
          [...inProgressIssues, ...todoIssues].map((issue) => [
            issue.id,
            issue,
          ]),
        ).values(),
      ];

      const blocks = pendingIssues.map((issue) => {
        const statusNormalized = normalizeStatus(issue.status);
        const isInProgress = statusNormalized !== "A FAZER";
        const points = Math.max(issue.storyPoints ?? 1, 0);
        const rate = Math.max(velocityPerDay, 0.1);
        const estimatedDays = points / rate;
        const projectedEndMs = cursorMs + estimatedDays * 86400000;
        const blockEndMs = projectedEndMs;
        const projectedCycleDaysByPoints =
          points > 0 ? points * cycleDaysPerPoint : cycleDays;
        const projectedCycleDays = Math.max(0.25, projectedCycleDaysByPoints);
        const blockStartMs =
          isInProgress && issue.workStartedAt
            ? dateToMs(issue.workStartedAt)
            : blockEndMs - projectedCycleDays * 86400000;
        cursorMs = blockEndMs;

        const left = positionOnTimeline(
          new Date(blockStartMs).toISOString(),
          startMs,
          endMs,
        );
        const end = positionOnTimeline(
          new Date(blockEndMs).toISOString(),
          startMs,
          endMs,
        );
        const width = Math.max(0, end - left);

        return {
          key: issue.id,
          label: issue.key,
          left,
          width,
          points,
          statusLabel:
            statusNormalized === "A FAZER"
              ? "A fazer"
              : "Em andamento (projetado)",
          isInProgress,
          issue,
        };
      });

      cascade.set(sprint.sprint, blocks);
    }

    return cascade;
  }, [
    averageCycleDays,
    averageCycleDaysPerPoint,
    endMs,
    firstIncompleteSprintIndex,
    issuesBySprint,
    nowIso,
    sprints,
    startMs,
    unit,
    velocityPerDay,
    viewMode,
  ]);

  const buildFlowBlocks = useCallback(
    (sprint: SprintProjection) => {
      if (viewMode !== "flow") return [];
      const flowIssues = issuesBySprint?.get(sprint.sprint) ?? [];
      return flowIssues
        .filter((issue) => {
          if (!issue.workStartedAt) return false;
          const statusNormalized = normalizeStatus(issue.status);
          return Boolean(issue.resolutionDate) || statusNormalized === "FEITO";
        })
        .map((issue) => {
          const flowStart = issue.workStartedAt as string;
          const statusNormalized = normalizeStatus(issue.status);
          const flowEnd =
            issue.resolutionDate || statusNormalized === "FEITO"
              ? (issue.resolutionDate ?? nowIso)
              : nowIso;
          const startPct = positionOnTimeline(flowStart, startMs, endMs);
          const endPct = positionOnTimeline(flowEnd, startMs, endMs);
          const flowWidth = Math.max(0.6, endPct - startPct);
          const isDone =
            Boolean(issue.resolutionDate) || statusNormalized === "FEITO";

          return {
            key: issue.id,
            label: issue.key,
            left: startPct,
            width: flowWidth,
            isDone,
            statusLabel: isDone ? "Feito" : "Em andamento",
            issue,
          };
        })
        .sort((a, b) => {
          if (a.isDone !== b.isDone) {
            return a.isDone ? -1 : 1;
          }
          return a.left - b.left;
        });
    },
    [endMs, issuesBySprint, nowIso, startMs, viewMode],
  );

  const focusIssueInTicketList = useCallback((issueKey: string) => {
    const row = document.querySelector<HTMLElement>(
      `[data-issue-key="${issueKey}"]`,
    );
    if (!row) return;
    row.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    const previousOutline = row.style.outline;
    const previousOutlineOffset = row.style.outlineOffset;
    const previousBackgroundColor = row.style.backgroundColor;
    row.style.outline = "2px solid #60a5fa";
    row.style.outlineOffset = "-2px";
    row.style.backgroundColor = "#eff6ff";
    window.setTimeout(() => {
      row.style.outline = previousOutline;
      row.style.outlineOffset = previousOutlineOffset;
      row.style.backgroundColor = previousBackgroundColor;
    }, 1600);
  }, []);

  const allSprintIssues = useMemo(() => {
    const unique = new Map<string, JiraIssue>();
    for (const sprint of sprints) {
      const issues = issuesBySprint?.get(sprint.sprint) ?? [];
      for (const issue of issues) {
        unique.set(issue.id, issue);
      }
    }
    return [...unique.values()];
  }, [issuesBySprint, sprints]);

  const projectionHistory = useMemo<ProjectionHistoryPoint[]>(() => {
    const totalPoints = allSprintIssues.reduce(
      (sum, issue) => sum + Math.max(issue.storyPoints ?? 0, 0),
      0,
    );
    const completed = allSprintIssues
      .filter((issue) => issue.resolutionDate)
      .map((issue) => ({
        issue,
        resolutionDate: issue.resolutionDate as string,
        resolutionMs: dateToMs(issue.resolutionDate as string),
        points: Math.max(issue.storyPoints ?? 0, 0),
      }))
      .sort((a, b) => a.resolutionMs - b.resolutionMs);

    const projectStartMs = startOfLocalDay(dateToMs(projectStartDate));
    let deliveredPoints = 0;
    const points: ProjectionHistoryPoint[] = [];

    for (const completedEvent of completed) {
      deliveredPoints += completedEvent.points;

      const eventMs = completedEvent.resolutionMs;
      const elapsedDays = Math.max(
        1,
        (eventMs - projectStartMs) / (1000 * 60 * 60 * 24),
      );
      const velocity = deliveredPoints / elapsedDays;
      if (!Number.isFinite(velocity) || velocity <= 0) continue;

      const remainingPoints = Math.max(0, totalPoints - deliveredPoints);
      const remainingDays = remainingPoints / velocity;
      const estimatedEndDate = new Date(
        eventMs + remainingDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      points.push({
        issueKey: completedEvent.issue.key,
        eventDate: completedEvent.resolutionDate,
        deliveredPoints,
        remainingPoints,
        velocityPointsPerDay: velocity,
        estimatedEndDate,
      });
    }

    return points;
  }, [allSprintIssues, projectStartDate]);

  const rollingProjectionHistory = useMemo<RollingProjectionHistoryPoint[]>(() => {
    if (projectionHistory.length === 0) return [];
    const windowDays = Math.max(1, Math.min(180, Math.round(rollingWindowDays)));
    const dayMs = 24 * 60 * 60 * 1000;
    const projectStartMs = startOfLocalDay(dateToMs(projectStartDate));
    const minRollingEventMs = projectStartMs + windowDays * dayMs;
    const events = projectionHistory.map((point, index) => {
      const previous = projectionHistory[index - 1];
      return {
        issueKey: point.issueKey,
        eventDate: point.eventDate,
        eventMs: dateToMs(point.eventDate),
        deliveredPoints: point.deliveredPoints,
        remainingPoints: point.remainingPoints,
        pointsDelta: previous
          ? Math.max(0, point.deliveredPoints - previous.deliveredPoints)
          : Math.max(0, point.deliveredPoints),
      };
    });

    return events.map((event) => {
      const windowStartMs = event.eventMs - windowDays * dayMs;
      const windowPoints = events
        .filter(
          (candidate) =>
            candidate.eventMs > windowStartMs && candidate.eventMs <= event.eventMs,
        )
        .reduce((sum, candidate) => sum + candidate.pointsDelta, 0);
      const velocity = windowPoints / windowDays;
      const hasCompleteWindow = event.eventMs >= minRollingEventMs;
      const remainingDays =
        hasCompleteWindow && velocity > 0
          ? event.remainingPoints / velocity
          : Infinity;
      const estimatedEndDate =
        hasCompleteWindow && velocity > 0
          ? new Date(event.eventMs + remainingDays * dayMs).toISOString()
          : null;

      return {
        issueKey: event.issueKey,
        eventDate: event.eventDate,
        deliveredPoints: event.deliveredPoints,
        remainingPoints: event.remainingPoints,
        windowPoints,
        windowDays,
        velocityPointsPerDay: velocity,
        estimatedEndDate,
      };
    });
  }, [projectionHistory, rollingWindowDays, projectStartDate]);

  const projectionHistoryRange = useMemo(() => {
    if (projectionHistory.length === 0 && rollingProjectionHistory.length === 0) {
      return null;
    }
    const start = startOfLocalDay(dateToMs(projectStartDate));
    const rollingEstimatedMs = rollingProjectionHistory
      .map((point) =>
        point.estimatedEndDate ? dateToMs(point.estimatedEndDate) : null,
      )
      .filter((value): value is number => value !== null);
    const maxEstimatedEndMs = Math.max(
      ...projectionHistory.map((point) => dateToMs(point.estimatedEndDate)),
      ...(rollingEstimatedMs.length > 0 ? rollingEstimatedMs : [endMs]),
      endMs,
    );
    const end = endOfLocalDay(maxEstimatedEndMs);
    if (end <= start) return null;
    return { startMs: start, endMs: end };
  }, [endMs, projectStartDate, projectionHistory, rollingProjectionHistory]);

  const projectionHistoryChartData = useMemo(
    () =>
      projectionHistory.map((point, index) => ({
        ...point,
        eventMs: dateToMs(point.eventDate),
        cumulativeEstimatedEndMs: dateToMs(point.estimatedEndDate),
        rollingEstimatedEndMs: rollingProjectionHistory[index]?.estimatedEndDate
          ? dateToMs(rollingProjectionHistory[index]!.estimatedEndDate as string)
          : null,
        rollingVelocityPointsPerDay:
          rollingProjectionHistory[index]?.velocityPointsPerDay ?? null,
        rollingWindowPoints: rollingProjectionHistory[index]?.windowPoints ?? null,
      })),
    [projectionHistory, rollingProjectionHistory],
  );

  const inverseRollingScatterData = useMemo(
    () =>
      projectionHistoryChartData
        .filter((point) => point.rollingEstimatedEndMs !== null)
        .map((point) => ({
          x: point.rollingEstimatedEndMs as number,
          y: point.eventMs,
          issueKey: point.issueKey,
          eventDate: point.eventDate,
          rollingEstimatedEndMs: point.rollingEstimatedEndMs,
          rollingVelocityPointsPerDay: point.rollingVelocityPointsPerDay,
          rollingWindowPoints: point.rollingWindowPoints,
        })),
    [projectionHistoryChartData],
  );

  const inverseCumulativeScatterData = useMemo(
    () =>
      projectionHistoryChartData.map((point) => ({
        x: point.cumulativeEstimatedEndMs,
        y: point.eventMs,
        issueKey: point.issueKey,
        eventDate: point.eventDate,
        cumulativeEstimatedEndMs: point.cumulativeEstimatedEndMs,
        velocityPointsPerDay: point.velocityPointsPerDay,
      })),
    [projectionHistoryChartData],
  );

  const inverseYAxisDomain = useMemo<[number, number]>(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const windowDays = Math.max(1, Math.min(180, Math.round(yAxisWindowDays)));
    const upperBound = startOfLocalDay(dateToMs(nowIso));
    const lowerBound = upperBound - Math.max(0, windowDays - 1) * dayMs;
    return [lowerBound, upperBound];
  }, [nowIso, yAxisWindowDays]);

  const inverseYAxisTicks = useMemo(() => {
    const [lowerBound, upperBound] = inverseYAxisDomain;
    const ticks: number[] = [];
    let cursor = startOfLocalDay(lowerBound);
    const lastDay = startOfLocalDay(upperBound);
    while (cursor <= lastDay) {
      ticks.push(cursor);
      cursor += 86400000;
    }
    return ticks;
  }, [inverseYAxisDomain]);

  const latestCumulativePoint = useMemo(() => {
    if (projectionHistoryChartData.length === 0) return null;
    return projectionHistoryChartData[projectionHistoryChartData.length - 1] ?? null;
  }, [projectionHistoryChartData]);

  const latestRollingPoint = useMemo(() => {
    for (let index = projectionHistoryChartData.length - 1; index >= 0; index -= 1) {
      const point = projectionHistoryChartData[index];
      if (point?.rollingEstimatedEndMs !== null) {
        return point;
      }
    }
    return null;
  }, [projectionHistoryChartData]);

  const yAxisDomain = useMemo<[number, number] | null>(() => {
    if (projectionHistoryChartData.length === 0) return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const windowDays = Math.max(1, Math.min(180, Math.round(yAxisWindowDays)));
    const values = projectionHistoryChartData.flatMap((point) => [
      point.cumulativeEstimatedEndMs,
      ...(point.rollingEstimatedEndMs !== null ? [point.rollingEstimatedEndMs] : []),
    ]);

    if (values.length === 0) return null;
    const minMs = Math.min(...values);
    const lowerBound = startOfLocalDay(minMs);
    const upperBound = endOfLocalDay(
      lowerBound + Math.max(0, windowDays - 1) * dayMs,
    );
    if (upperBound <= lowerBound) return [lowerBound, lowerBound + dayMs];
    return [lowerBound, upperBound];
  }, [projectionHistoryChartData, yAxisWindowDays]);

  const yAxisTicks = useMemo(() => {
    if (!yAxisDomain) return [] as number[];
    const [minMs, maxMs] = yAxisDomain;
    const ticks: number[] = [];
    let cursor = startOfLocalDay(minMs);
    const lastDay = startOfLocalDay(maxMs);
    while (cursor <= lastDay) {
      ticks.push(cursor);
      cursor += 86400000;
    }
    return ticks;
  }, [yAxisDomain]);

  const latestSeriesBadges = useMemo(() => {
    if (!yAxisDomain) {
      return [] as Array<{
        key: string;
        label: string;
        yValue: number;
      }>;
    }
    const badges: Array<{
      key: string;
      label: string;
      yValue: number;
    }> = [];

    if (latestCumulativePoint) {
      badges.push({
        key: "latest-cumulative",
        label: `${formatDateShortFromMs(latestCumulativePoint.cumulativeEstimatedEndMs)} Acum`,
        yValue: latestCumulativePoint.cumulativeEstimatedEndMs,
      });
    }

    if (latestRollingPoint && latestRollingPoint.rollingEstimatedEndMs !== null) {
      badges.push({
        key: "latest-rolling",
        label: `${formatDateShortFromMs(latestRollingPoint.rollingEstimatedEndMs)} Janela`,
        yValue: latestRollingPoint.rollingEstimatedEndMs,
      });
    }

    return badges;
  }, [latestCumulativePoint, latestRollingPoint, yAxisDomain]);

  const yAxisGuideItems = useMemo(() => {
    if (!yAxisDomain || yAxisTicks.length === 0) {
      return [] as Array<{ value: number; topPx: number }>;
    }
    const [minMs, maxMs] = yAxisDomain;
    const spanMs = Math.max(1, maxMs - minMs);
    const plotHeight = PROJECTION_HISTORY_ROW_HEIGHT;
    return yAxisTicks.map((value) => ({
      value,
      topPx: Math.max(
        2,
        Math.min(
          PROJECTION_HISTORY_ROW_HEIGHT - 2,
          (1 - (value - minMs) / spanMs) * Math.max(1, plotHeight),
        ),
      ),
    }));
  }, [
    yAxisDomain,
    yAxisTicks,
    PROJECTION_HISTORY_ROW_HEIGHT,
  ]);

  const latestSeriesBadgeItems = useMemo(() => {
    if (!yAxisDomain || latestSeriesBadges.length === 0) {
      return [] as Array<{ key: string; label: string; topPx: number }>;
    }
    const [minMs, maxMs] = yAxisDomain;
    const spanMs = Math.max(1, maxMs - minMs);
    const plotHeight = PROJECTION_HISTORY_ROW_HEIGHT;
    const mapped = latestSeriesBadges.map((badge) => ({
      key: badge.key,
      label: badge.label,
      topPx: Math.max(
        6,
        Math.min(
          PROJECTION_HISTORY_ROW_HEIGHT - 6,
          (1 - (badge.yValue - minMs) / spanMs) * Math.max(1, plotHeight),
        ),
      ),
    }));

    if (mapped.length === 2) {
      const sorted = [...mapped].sort((a, b) => a.topPx - b.topPx);
      if (Math.abs(sorted[1]!.topPx - sorted[0]!.topPx) < 14) {
        sorted[1]!.topPx = Math.min(
          PROJECTION_HISTORY_ROW_HEIGHT - 6,
          sorted[1]!.topPx + 14,
        );
      }
      return mapped.map((item) => sorted.find((s) => s.key === item.key) ?? item);
    }

    return mapped;
  }, [
    yAxisDomain,
    latestSeriesBadges,
    PROJECTION_HISTORY_ROW_HEIGHT,
  ]);

  const dailyTicketMetrics = useMemo(() => {
    if (dayGrid.length === 0) return [];
    const todayStartMs = startOfLocalDay(dateToMs(nowIso));

    const createdEntries = allSprintIssues
      .map((issue) => ({
        issue,
        createdMs: dateToMs(issue.created),
        storyPoints: Math.max(issue.storyPoints ?? 0, 0),
      }))
      .filter((entry) => Number.isFinite(entry.createdMs))
      .sort((a, b) => a.createdMs - b.createdMs);
    const completedTimes = allSprintIssues
      .map((issue) => (issue.resolutionDate ? dateToMs(issue.resolutionDate) : null))
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((a, b) => a - b);
    const completedPointEntries = allSprintIssues
      .map((issue) =>
        issue.resolutionDate
          ? {
              completedMs: dateToMs(issue.resolutionDate),
              storyPoints: Math.max(issue.storyPoints ?? 0, 0),
            }
          : null,
      )
      .filter(
        (entry): entry is { completedMs: number; storyPoints: number } =>
          entry !== null && Number.isFinite(entry.completedMs),
      )
      .sort((a, b) => a.completedMs - b.completedMs);

    let createdIndex = 0;
    let completedIndex = 0;
    let completedPointsIndex = 0;
    let previousCreated = 0;
    let previousCreatedStoryPoints = 0;
    let createdStoryPointsCumulative = 0;
    let completedStoryPointsCumulative = 0;

    return dayGrid.map((day) => {
      const dayEndMs = day.dayStartMs + 86400000 - 1;
      const newIssues: JiraIssue[] = [];
      while (
        createdIndex < createdEntries.length &&
        createdEntries[createdIndex]!.createdMs <= dayEndMs
      ) {
        createdStoryPointsCumulative += createdEntries[createdIndex]!.storyPoints;
        newIssues.push(createdEntries[createdIndex]!.issue);
        createdIndex += 1;
      }
      while (
        completedPointsIndex < completedPointEntries.length &&
        completedPointEntries[completedPointsIndex]!.completedMs <= dayEndMs
      ) {
        completedStoryPointsCumulative +=
          completedPointEntries[completedPointsIndex]!.storyPoints;
        completedPointsIndex += 1;
      }
      while (
        completedIndex < completedTimes.length &&
        completedTimes[completedIndex]! <= dayEndMs
      ) {
        completedIndex += 1;
      }

      const createdCumulative = createdIndex;
      const completedCumulative = completedIndex;
      const newTickets = createdCumulative - previousCreated;
      previousCreated = createdCumulative;
      const newStoryPoints =
        createdStoryPointsCumulative - previousCreatedStoryPoints;
      previousCreatedStoryPoints = createdStoryPointsCumulative;

      return {
        key: day.key,
        leftPct: day.leftPct,
        widthPct: day.widthPct,
        isFuture: day.dayStartMs > todayStartMs,
        createdCumulative,
        completedCumulative,
        newTickets,
        createdStoryPointsCumulative,
        completedStoryPointsCumulative,
        newStoryPoints,
        newIssues,
        completionPct:
          createdCumulative > 0 ? completedCumulative / createdCumulative : 0,
        completionPctStoryPoints:
          createdStoryPointsCumulative > 0
            ? completedStoryPointsCumulative / createdStoryPointsCumulative
            : 0,
      };
    });
  }, [allSprintIssues, dayGrid, nowIso]);

  const maxBarBaseCumulative = useMemo(
    () =>
      Math.max(
        1,
        ...dailyTicketMetrics.map((item) =>
          metricsBarBase === "tickets"
            ? item.createdCumulative
            : item.createdStoryPointsCumulative,
        ),
      ),
    [dailyTicketMetrics, metricsBarBase],
  );

  const getSprintRowHeight = useCallback(
    (sprint: SprintProjection) => {
      if (viewMode !== "flow") {
        return PROJECTION_ROW_HEIGHT;
      }
      const flowCount = buildFlowBlocks(sprint).length;
      const plannedCount = (plannedCascadeBySprint.get(sprint.sprint) ?? [])
        .length;
      const blockCount = flowCount + plannedCount;
      if (blockCount === 0) return DEFAULT_ROW_HEIGHT;
      const stackHeight =
        blockCount * FLOW_BLOCK_HEIGHT +
        (blockCount - 1) * FLOW_BLOCK_GAP +
        (flowCount > 0 && plannedCount > 0 ? FLOW_GROUP_GAP : 0);
      return Math.max(DEFAULT_ROW_HEIGHT, stackHeight + FLOW_PADDING_Y * 2);
    },
    [buildFlowBlocks, plannedCascadeBySprint, viewMode],
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="grid gap-x-2 text-xs font-semibold text-zinc-500"
          style={{
            gridTemplateColumns: "88px 1fr",
          }}
        >
          <div className="relative z-10 flex h-full flex-col">
            <span
              className="flex items-center border-b border-zinc-300 text-[11px] font-bold text-zinc-600"
              style={{ height: `${TIMELINE_HEADER_HEIGHT}px` }}
            >
              Sprint
            </span>

            {sprints.map((sprint, index) => (
              <div
                key={`label-${sprint.sprint}`}
                className={`flex h-full flex-col justify-center gap-1 pr-1 ${
                  index < sprints.length - 1 ? "border-b border-zinc-200/80" : ""
                }`}
                style={{ height: `${getSprintRowHeight(sprint)}px` }}
              >
                <p className="truncate text-[11px] font-black leading-tight text-zinc-900">
                  S{sprint.sprint}{" "}
                  <span className="text-[9px] font-medium text-zinc-500">
                    {unit === "storyPoints" ? sprint.totalPoints : sprint.total}{" "}
                    {workloadLabel} / {formatDays(sprint.projectedDurationDays)}d
                  </span>
                </p>
                {sprintLabelByNumber?.get(sprint.sprint) ? (
                  <p
                    className="truncate rounded-md border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 text-[8px] font-semibold leading-tight text-zinc-700"
                    title={sprintLabelByNumber.get(sprint.sprint)}
                  >
                    {sprintLabelByNumber.get(sprint.sprint)}
                  </p>
                ) : null}
              </div>
            ))}
            <div
              className="pr-1"
              style={{ height: `${METRICS_ROW_HEIGHT}px` }}
            >
              <div
                className="grid h-full text-right text-[8px] leading-tight text-zinc-500"
                style={{
                  gridTemplateRows: `${METRICS_HEADER_HEIGHT}px ${METRICS_BAR_MAX_HEIGHT}px ${METRICS_BAR_GAP}px repeat(6, ${METRICS_VALUE_ROW_HEIGHT}px) ${METRICS_BOTTOM_PADDING}px`,
                }}
              >
                <p
                  className="text-[10px] font-black uppercase tracking-wide text-zinc-700"
                  style={{ gridRow: "1" }}
                >
                  Tickets
                </p>
                <p style={{ gridRow: "4", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  Criados
                </p>
                <p style={{ gridRow: "5", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  Feitos
                </p>
                <p style={{ gridRow: "6", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  %
                </p>
                <p style={{ gridRow: "7", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  SP total
                </p>
                <p style={{ gridRow: "8", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  SP feito
                </p>
                <p style={{ gridRow: "9", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}>
                  SP %
                </p>
              </div>
            </div>
            <div
              className="border-t border-zinc-200/80 pr-1"
              style={{ height: `${PROJECTION_HISTORY_ROW_HEIGHT}px` }}
            >
              <div className="flex h-full flex-col justify-center text-right text-[8px] leading-tight text-zinc-500">
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-700">
                  Proj. fim
                </p>
                <p className="mt-1">Acumulada + janela móvel</p>
                <p>por ticket concluído</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <DayGridBackground days={dayGrid} />

            <div
              className="pointer-events-none absolute bottom-0 top-0 z-[1] w-0.5 -translate-x-1/2 bg-red-500"
              style={{ left: `${todayPct}%` }}
              title="Hoje"
            />
            <span
              className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ left: `${todayPct}%` }}
            >
              Hoje
            </span>
            <div className="relative flex h-full flex-col">
              <div
                className="relative shrink-0 overflow-hidden rounded-md border border-zinc-200/90 bg-white/50"
                style={{ height: `${TIMELINE_HEADER_HEIGHT}px` }}
              >
                <DayGridBackground days={dayGrid} />
                <div className="absolute inset-x-0 top-0 h-3 overflow-hidden bg-white/35">
                  {yearTicks.map((tick) => (
                    <div
                      key={`year-${tick.key}`}
                      className="absolute bottom-0 top-0 border-l border-zinc-300/60 px-1 text-[9px] font-bold leading-3 text-zinc-700"
                      style={{ left: `${tick.leftPct}%`, width: `${tick.widthPct}%` }}
                    >
                      {tick.label}
                    </div>
                  ))}
                </div>
                <div className="absolute inset-x-0 top-3 h-3 overflow-hidden bg-white/30">
                  {monthTicks.map((tick) => (
                    <div
                      key={`month-${tick.key}`}
                      className="absolute bottom-0 top-0 border-l border-zinc-300/50 px-1 text-[9px] font-semibold leading-3 text-zinc-600"
                      style={{ left: `${tick.leftPct}%`, width: `${tick.widthPct}%` }}
                    >
                      {tick.label}
                    </div>
                  ))}
                </div>
                <div className="absolute inset-x-0 top-6 h-3 overflow-hidden bg-white/25">
                  {dayGrid.map((day) => {
                    return (
                      <span
                        key={`day-label-${day.key}`}
                        className="absolute -translate-x-1/2 whitespace-nowrap text-[8px] font-medium text-zinc-500"
                        style={{
                          left: `${day.leftPct + day.widthPct / 2}%`,
                          top: "0px",
                        }}
                      >
                        {new Date(day.dayStartMs).getDate()}
                      </span>
                    );
                  })}
                </div>
              </div>

              {sprints.map((sprint, index) => {
                const color = SPRINT_COLORS[index % SPRINT_COLORS.length];
                const left = positionOnTimeline(
                  sprint.projectedStartDate,
                  startMs,
                  endMs,
                );
                const endPos = positionOnTimeline(
                  sprint.projectedEndDate,
                  startMs,
                  endMs,
                );
                const width = Math.max(0.8, endPos - left);
                const isComplete = sprint.done === sprint.total;
                const flowBlocks = buildFlowBlocks(sprint);
                const plannedBlocks =
                  plannedCascadeBySprint.get(sprint.sprint) ?? [];
                const rowHeight = getSprintRowHeight(sprint);
                const plannedOffset =
                  flowBlocks.length > 0
                    ? flowBlocks.length * (FLOW_BLOCK_HEIGHT + FLOW_BLOCK_GAP) +
                      FLOW_GROUP_GAP
                    : 0;

                return (
                  <div
                    key={sprint.sprint}
                    className="relative rounded-md border border-zinc-200/90 bg-white/50"
                    style={{ height: `${rowHeight}px` }}
                  >
                    {viewMode === "flow" ? (
                      <>
                        {flowBlocks.map((block, blockIndex) => (
                          <div
                            key={block.key}
                            className="group absolute z-10 flex cursor-pointer rounded shadow-sm hover:z-50"
                            onClick={() =>
                              focusIssueInTicketList(block.issue.key)
                            }
                            style={{
                              top: `${FLOW_PADDING_Y + blockIndex * (FLOW_BLOCK_HEIGHT + FLOW_BLOCK_GAP)}px`,
                              left: `${block.left}%`,
                              width: `${block.width}%`,
                              height: `${FLOW_BLOCK_HEIGHT}px`,
                              backgroundColor: color,
                              backgroundImage: block.isDone
                                ? undefined
                                : stripedGradient(color),
                              minWidth: "10px",
                              opacity: block.isDone ? 1 : 0.92,
                            }}
                          >
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-1">
                              <span className="truncate text-[10px] font-bold text-white drop-shadow">
                                {compactTicketLabel(block.label)}
                              </span>
                            </div>
                            {showAssigneeInitials ? (
                              <AssigneeInitialBadge
                                assignee={block.issue.assignee}
                                faded={false}
                              />
                            ) : null}
                            <ProjectedTicketTooltip
                              issue={block.issue}
                              project={project}
                              statusLabel={block.statusLabel}
                            />
                          </div>
                        ))}
                        {plannedBlocks.map((block, blockIndex) => (
                          <div
                            key={`pending-${block.key}-${blockIndex}`}
                            className="group absolute z-10 flex cursor-pointer rounded border border-dashed border-white/80 shadow-sm hover:z-50"
                            onClick={() =>
                              focusIssueInTicketList(block.issue.key)
                            }
                            style={{
                              top: `${FLOW_PADDING_Y + plannedOffset + blockIndex * (FLOW_BLOCK_HEIGHT + FLOW_BLOCK_GAP)}px`,
                              left: `${block.left}%`,
                              width: `${block.width}%`,
                              height: `${FLOW_BLOCK_HEIGHT}px`,
                              borderColor: block.isInProgress
                                ? (() => {
                                    if (!block.issue.assignee)
                                      return "rgba(255,255,255,0.8)";
                                    return getAssigneeBadgeColors(
                                      block.issue.assignee,
                                    ).borderColor;
                                  })()
                                : undefined,
                              boxShadow: block.isInProgress
                                ? "0 0 0 1px rgba(0,0,0,0.95), 0 0 12px 4px rgba(0,0,0,0.55), 0 0 20px 6px rgba(0,0,0,0.3)"
                                : undefined,
                            }}
                          >
                            <div
                              className="absolute inset-0 rounded"
                              style={{
                                backgroundColor: color,
                                backgroundImage: stripedGradient(color),
                                opacity: block.isInProgress ? 0.92 : 0.55,
                              }}
                              aria-hidden
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded px-1">
                              <span className="truncate text-[10px] font-bold text-white drop-shadow">
                                {compactTicketLabel(block.label)}
                              </span>
                            </div>
                            {showAssigneeInitials ? (
                              <AssigneeInitialBadge
                                assignee={block.issue.assignee}
                                faded={!block.isInProgress}
                                ticketTitle={block.issue.summary}
                              />
                            ) : null}
                            <ProjectedTicketTooltip
                              issue={block.issue}
                              project={project}
                              statusLabel={block.statusLabel}
                            />
                          </div>
                        ))}
                        {flowBlocks.length === 0 &&
                        plannedBlocks.length === 0 ? (
                          <div className="absolute inset-0 z-10 flex items-center rounded border border-dashed border-zinc-300 px-2">
                            <span className="truncate text-[10px] font-semibold text-zinc-500">
                              Sem tickets em fluxo
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div
                        className="absolute z-10 flex overflow-hidden rounded shadow-sm"
                        style={{
                          top: "4px",
                          bottom: "4px",
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: color,
                          minWidth: sprint.total > 0 ? "12px" : "6px",
                        }}
                        title={`${formatDateShort(sprint.projectedStartDate)} → ${formatDateShort(sprint.projectedEndDate)} · ${
                          unit === "storyPoints"
                            ? `${sprint.totalPoints} pts`
                            : `${sprint.total} tickets`
                        }`}
                      >
                        {sprint.total > 0 ? (
                          <>
                            <TicketSegmentFill
                              total={sprint.total}
                              done={sprint.done}
                              inProgress={sprint.inProgress}
                              doneColor="rgba(0,0,0,0.35)"
                              inProgressColor="rgba(255,255,255,0.45)"
                              dividerClassName="border-white/35"
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-1">
                              <span className="truncate text-[10px] font-bold text-white drop-shadow">
                                {isComplete
                                  ? "Concluída"
                                  : `${formatDateShort(sprint.projectedStartDate)} – ${formatDateShort(sprint.projectedEndDate)}`}
                              </span>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              <div
                className="relative z-10 rounded-md border border-zinc-200/80 bg-white/20"
                style={{ height: `${METRICS_ROW_HEIGHT}px` }}
              >
                {onMetricsBarBaseChange ? (
                  <div className="absolute right-2 top-1 z-20 inline-flex items-center overflow-hidden rounded-md border border-zinc-300 bg-white text-[10px] font-semibold text-zinc-700 shadow-sm">
                    <span className="border-r border-zinc-300 px-2 py-1 text-zinc-500">
                      Barras
                    </span>
                    <button
                      type="button"
                      onClick={() => onMetricsBarBaseChange("tickets")}
                      className={`px-2 py-1 ${
                        metricsBarBase === "tickets"
                          ? "bg-zinc-900 text-white"
                          : "hover:bg-zinc-100"
                      }`}
                    >
                      Tickets
                    </button>
                    <button
                      type="button"
                      onClick={() => onMetricsBarBaseChange("storyPoints")}
                      className={`border-l border-zinc-300 px-2 py-1 ${
                        metricsBarBase === "storyPoints"
                          ? "bg-zinc-900 text-white"
                          : "hover:bg-zinc-100"
                      }`}
                    >
                      Story points
                    </button>
                  </div>
                ) : null}
                {dailyTicketMetrics.map((metric, metricIndex) => {
                  const barCreatedBase =
                    metricsBarBase === "tickets"
                      ? metric.createdCumulative
                      : metric.createdStoryPointsCumulative;
                  const barDoneBase =
                    metricsBarBase === "tickets"
                      ? metric.completedCumulative
                      : metric.completedStoryPointsCumulative;
                  const barNewBase =
                    metricsBarBase === "tickets"
                      ? metric.newTickets
                      : metric.newStoryPoints;
                  const createdHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        barCreatedBase > 0 ? 2 : 0,
                        (barCreatedBase / maxBarBaseCumulative) *
                          METRICS_BAR_MAX_HEIGHT,
                      );
                  const doneHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        barDoneBase > 0 ? 2 : 0,
                        (barDoneBase / maxBarBaseCumulative) *
                          METRICS_BAR_MAX_HEIGHT,
                      );
                  const newHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        barNewBase > 0 ? 2 : 0,
                        (barNewBase / maxBarBaseCumulative) *
                          METRICS_BAR_MAX_HEIGHT,
                      );
                  const createdLabel =
                    metric.isFuture || metric.createdCumulative === 0
                      ? ""
                      : String(metric.createdCumulative);
                  const completedLabel =
                    metric.isFuture || metric.completedCumulative === 0
                      ? ""
                      : String(metric.completedCumulative);
                  const newLabel =
                    metric.isFuture || metric.newTickets === 0
                      ? ""
                      : `+${metric.newTickets}`;
                  const pctRounded = Math.round(metric.completionPct * 100);
                  const completionLabel =
                    metric.isFuture || pctRounded === 0 ? "" : `${pctRounded}%`;
                  const createdStoryPointsLabel =
                    metric.isFuture || metric.createdStoryPointsCumulative === 0
                      ? ""
                      : formatRate(metric.createdStoryPointsCumulative);
                  const completedStoryPointsLabel =
                    metric.isFuture || metric.completedStoryPointsCumulative === 0
                      ? ""
                      : formatRate(metric.completedStoryPointsCumulative);
                  const pctStoryPointsRounded = Math.round(
                    metric.completionPctStoryPoints * 100,
                  );
                  const completionStoryPointsLabel =
                    metric.isFuture || pctStoryPointsRounded === 0
                      ? ""
                      : `${pctStoryPointsRounded}%`;
                  const previousMetric =
                    metricIndex > 0 ? dailyTicketMetrics[metricIndex - 1] : null;
                  const pctTrend: "up" | "down" | "flat" = (() => {
                    if (!previousMetric || metric.isFuture || previousMetric.isFuture) {
                      return "flat";
                    }
                    if (metric.completionPct > previousMetric.completionPct) {
                      return "up";
                    }
                    if (metric.completionPct < previousMetric.completionPct) {
                      return "down";
                    }
                    return "flat";
                  })();
                  const pctTrendClass =
                    pctTrend === "up"
                      ? "text-emerald-600"
                      : pctTrend === "down"
                        ? "text-red-600"
                        : "text-zinc-700";
                  const pctStoryPointsTrend: "up" | "down" | "flat" = (() => {
                    if (!previousMetric || metric.isFuture || previousMetric.isFuture) {
                      return "flat";
                    }
                    if (
                      metric.completionPctStoryPoints >
                      previousMetric.completionPctStoryPoints
                    ) {
                      return "up";
                    }
                    if (
                      metric.completionPctStoryPoints <
                      previousMetric.completionPctStoryPoints
                    ) {
                      return "down";
                    }
                    return "flat";
                  })();
                  const pctStoryPointsTrendClass =
                    pctStoryPointsTrend === "up"
                      ? "text-emerald-600"
                      : pctStoryPointsTrend === "down"
                        ? "text-red-600"
                        : "text-zinc-700";
                  const deltaClass = newLabel === "" ? "text-zinc-700" : "text-red-600";
                  const activePctTrend =
                    metricsBarBase === "tickets" ? pctTrend : pctStoryPointsTrend;
                  const activePctLabel =
                    metricsBarBase === "tickets"
                      ? completionLabel
                      : completionStoryPointsLabel;

                  return (
                    <div
                      key={`metric-${metric.key}`}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${metric.leftPct}%`,
                        width: `${metric.widthPct}%`,
                      }}
                    >
                      <div
                        className="grid h-full"
                        style={{
                          gridTemplateRows: `${METRICS_HEADER_HEIGHT}px ${METRICS_BAR_MAX_HEIGHT}px ${METRICS_BAR_GAP}px repeat(6, ${METRICS_VALUE_ROW_HEIGHT}px) ${METRICS_BOTTOM_PADDING}px`,
                        }}
                      >
                        <div className="relative w-full" style={{ gridRow: "2" }}>
                          <div className="group/novos absolute -top-3 left-1/2 z-20 -translate-x-1/2">
                            <p className={`text-[8px] leading-none ${deltaClass}`}>{newLabel}</p>
                            {!metric.isFuture && metric.newIssues.length > 0 ? (
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 w-52 -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-1.5 text-left text-[9px] font-medium text-zinc-700 opacity-0 shadow-lg ring-1 ring-black/5 transition-opacity group-hover/novos:opacity-100">
                                <p className="mb-1 text-[8px] font-bold uppercase tracking-wide text-zinc-500">
                                  Novos tickets do dia
                                </p>
                                <ul className="max-h-28 space-y-0.5 overflow-y-auto pr-0.5">
                                  {metric.newIssues.map((issue) => (
                                    <li key={`new-${metric.key}-${issue.id}`} className="truncate">
                                      <span className="font-bold text-blue-700">{issue.key}</span>{" "}
                                      <span className="text-zinc-600">— {issue.summary}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                          <div className="absolute inset-0 overflow-hidden bg-zinc-200/25">
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-zinc-500/35"
                              style={{ height: `${createdHeightPx}px` }}
                            />
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-emerald-500/50"
                              style={{ height: `${doneHeightPx}px` }}
                            />
                          {activePctTrend === "up" && activePctLabel !== "" ? (
                            <span
                              className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-[8px] font-bold leading-none text-emerald-600"
                              style={{
                                bottom: `${Math.min(
                                  METRICS_BAR_MAX_HEIGHT - 8,
                                  doneHeightPx + 2,
                                )}px`,
                              }}
                            >
                              {activePctLabel}
                            </span>
                          ) : null}
                            {!metric.isFuture && metric.newTickets > 0 ? (
                              <div
                                className="absolute left-0 right-0 bg-red-500/55"
                                style={{
                                  bottom: `${Math.max(0, createdHeightPx - newHeightPx)}px`,
                                  height: `${newHeightPx}px`,
                                }}
                              />
                            ) : null}
                          </div>
                        </div>
                        <p
                          className="text-center text-[8px] leading-tight text-zinc-700"
                          style={{ gridRow: "4", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {createdLabel}
                        </p>
                        <p
                          className="text-center text-[8px] leading-tight text-zinc-700"
                          style={{ gridRow: "5", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {completedLabel}
                        </p>
                        <p
                          className={`text-center text-[8px] leading-tight ${pctTrendClass}`}
                          style={{ gridRow: "6", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {completionLabel}
                        </p>
                        <p
                          className="text-center text-[8px] leading-tight text-zinc-700"
                          style={{ gridRow: "7", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {createdStoryPointsLabel}
                        </p>
                        <p
                          className="text-center text-[8px] leading-tight text-zinc-700"
                          style={{ gridRow: "8", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {completedStoryPointsLabel}
                        </p>
                        <p
                          className={`text-center text-[8px] leading-tight ${pctStoryPointsTrendClass}`}
                          style={{ gridRow: "9", lineHeight: `${METRICS_VALUE_ROW_HEIGHT}px` }}
                        >
                          {completionStoryPointsLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className="relative z-10 mt-1 overflow-visible rounded-md border border-zinc-200/80 bg-white/25"
                style={{ height: `${PROJECTION_HISTORY_ROW_HEIGHT}px` }}
              >
                <div className="absolute right-1 top-1 z-20 flex items-center gap-1 rounded border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[8px] text-zinc-600 shadow-sm">
                  <span className="font-semibold text-zinc-700">Janela</span>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={rollingWindowDays}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) return;
                      setRollingWindowDays(Math.max(1, Math.min(180, Math.round(parsed))));
                    }}
                    className="w-9 rounded border border-zinc-300 px-1 py-0 text-right text-[8px] text-zinc-700 outline-none focus:border-blue-400"
                  />
                  <span>d</span>
                </div>
                <div className="absolute right-1 top-6 z-20 flex items-center gap-1 rounded border border-zinc-200 bg-white/90 px-1.5 py-0.5 text-[8px] text-zinc-600 shadow-sm">
                  <span className="font-semibold text-zinc-700">Eixo Y</span>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={yAxisWindowDays}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (!Number.isFinite(parsed)) return;
                      setYAxisWindowDays(Math.max(1, Math.min(180, Math.round(parsed))));
                    }}
                    className="w-9 rounded border border-zinc-300 px-1 py-0 text-right text-[8px] text-zinc-700 outline-none focus:border-blue-400"
                  />
                  <span>d</span>
                </div>
                <div className="absolute right-1 top-11 z-20 inline-flex items-center overflow-hidden rounded border border-zinc-200 bg-white/90 text-[8px] font-semibold text-zinc-700 shadow-sm">
                  <span className="border-r border-zinc-200 px-1.5 py-0.5 text-zinc-500">
                    Visão
                  </span>
                  <button
                    type="button"
                    onClick={() => setProjectionChartMode("normal")}
                    className={`px-1.5 py-0.5 ${
                      projectionChartMode === "normal"
                        ? "bg-zinc-900 text-white"
                        : "hover:bg-zinc-100"
                    }`}
                  >
                    Padrão
                  </button>
                  <button
                    type="button"
                    onClick={() => setProjectionChartMode("inverted")}
                    className={`border-l border-zinc-200 px-1.5 py-0.5 ${
                      projectionChartMode === "inverted"
                        ? "bg-zinc-900 text-white"
                        : "hover:bg-zinc-100"
                    }`}
                  >
                    Invertida
                  </button>
                </div>
                <div className="pointer-events-none absolute left-1 top-1 z-20 flex items-center gap-2 text-[8px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                    <span className="h-1 w-2 rounded-sm bg-violet-600" />
                    Acumulada
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                    <span className="h-1 w-2 rounded-sm bg-sky-600" />
                    Janela móvel
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-zinc-500">
                    <span className="h-1 w-2 rounded-sm border border-zinc-400" />
                    {projectionChartMode === "inverted"
                      ? "Y: Hoje -> Hoje-Y"
                      : "Série padrão"}
                  </span>
                </div>
                {projectionHistoryRange && projectionHistoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={
                        projectionChartMode === "normal"
                          ? projectionHistoryChartData
                          : inverseCumulativeScatterData
                      }
                      margin={HISTORY_CHART_MARGIN}
                    >
                      <CartesianGrid
                        stroke="#d4d4d8"
                        strokeDasharray="3 3"
                        vertical={false}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        dataKey={projectionChartMode === "normal" ? "eventMs" : "x"}
                        domain={[startMs, endMs]}
                        padding={{ left: 0, right: 0 }}
                        allowDataOverflow
                        hide
                      />
                      <YAxis
                        yAxisId="main"
                        type="number"
                        dataKey={
                          projectionChartMode === "normal"
                            ? "cumulativeEstimatedEndMs"
                            : "y"
                        }
                        domain={
                          projectionChartMode === "normal"
                            ? yAxisDomain ?? [
                                projectionHistoryRange.startMs,
                                projectionHistoryRange.endMs,
                              ]
                            : inverseYAxisDomain
                        }
                        allowDataOverflow
                        ticks={
                          projectionChartMode === "normal"
                            ? yAxisTicks
                            : inverseYAxisTicks
                        }
                        interval={0}
                        hide
                        axisLine={false}
                        tickLine={false}
                        orientation="right"
                        mirror
                        tickMargin={0}
                        width={1}
                      />
                      <Tooltip
                        cursor={{ stroke: "#a1a1aa", strokeDasharray: "4 4" }}
                        wrapperStyle={{ zIndex: 80, pointerEvents: "none" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) {
                            return null;
                          }
                          const item = payload[0]?.payload as
                            | (ProjectionHistoryPoint & {
                                eventMs: number;
                                cumulativeEstimatedEndMs: number;
                                rollingEstimatedEndMs: number | null;
                                rollingVelocityPointsPerDay: number | null;
                                rollingWindowPoints: number | null;
                                x?: number;
                                y?: number;
                                estimatedEndDate?: string;
                                eventDate?: string;
                              })
                            | undefined;
                          if (!item) return null;

                          const safeDateFromString = (value?: string) => {
                            if (!value) return null;
                            const time = new Date(value).getTime();
                            if (!Number.isFinite(time)) return null;
                            return formatDateShort(value);
                          };
                          const safeDateFromMs = (value?: number | null) => {
                            if (value === null || value === undefined) return null;
                            if (!Number.isFinite(value)) return null;
                            return formatDateShortFromMs(value);
                          };

                          const cumulativeEntry = payload.find(
                            (entry) => entry.dataKey === "cumulativeEstimatedEndMs",
                          );
                          const rollingEntry = payload.find(
                            (entry) => entry.dataKey === "rollingEstimatedEndMs",
                          );
                          const cumulativeColor =
                            typeof cumulativeEntry?.color === "string"
                              ? cumulativeEntry.color
                              : "#7c3aed";
                          const rollingColor =
                            typeof rollingEntry?.color === "string"
                              ? rollingEntry.color
                              : "#0284c7";

                          const conclusionLabel =
                            safeDateFromString(item.eventDate) ??
                            safeDateFromMs(
                              typeof item.eventMs === "number"
                                ? item.eventMs
                                : typeof item.y === "number"
                                  ? item.y
                                  : null,
                            ) ??
                            "—";
                          const cumulativeEndLabel =
                            safeDateFromMs(
                              typeof item.cumulativeEstimatedEndMs === "number"
                                ? item.cumulativeEstimatedEndMs
                                : typeof item.x === "number"
                                  ? item.x
                                  : null,
                            ) ??
                            safeDateFromString(item.estimatedEndDate) ??
                            "—";
                          const rollingEndLabel =
                            safeDateFromMs(item.rollingEstimatedEndMs) ??
                            `aguarde ${rollingWindowDays}d`;
                          const cumulativeVelocityLabel =
                            typeof item.velocityPointsPerDay === "number" &&
                            Number.isFinite(item.velocityPointsPerDay)
                              ? `${formatRate(item.velocityPointsPerDay)} pts/dia`
                              : "—";
                          const rollingVelocityLabel =
                            typeof item.rollingVelocityPointsPerDay === "number" &&
                            Number.isFinite(item.rollingVelocityPointsPerDay)
                              ? `${formatRate(item.rollingVelocityPointsPerDay)} pts/dia`
                              : "indeterminado";
                          const rollingWindowPointsLabel =
                            typeof item.rollingWindowPoints === "number" &&
                            Number.isFinite(item.rollingWindowPoints)
                              ? formatRate(item.rollingWindowPoints)
                              : "—";

                          return (
                            <div className="min-w-[250px] rounded-lg border border-zinc-200 bg-white p-2 text-[10px] shadow-lg ring-1 ring-black/5">
                              <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-zinc-100 pb-1">
                                <p className="font-bold text-zinc-800">{item.issueKey}</p>
                                <p className="font-medium text-zinc-500">
                                  {conclusionLabel}
                                </p>
                              </div>

                              <div className="space-y-1.5">
                                <div className="rounded border border-violet-100 bg-violet-50/60 px-1.5 py-1">
                                  <p
                                    className="mb-0.5 flex items-center gap-1 font-semibold"
                                    style={{ color: cumulativeColor }}
                                  >
                                    <span
                                      className="inline-block h-1.5 w-2 rounded-sm"
                                      style={{ backgroundColor: cumulativeColor }}
                                    />
                                    Série acumulada
                                  </p>
                                  <p className="text-zinc-600">
                                    Velocidade:{" "}
                                    <span className="font-semibold text-zinc-700">
                                      {cumulativeVelocityLabel}
                                    </span>
                                  </p>
                                  <p className="text-zinc-600">
                                    Fim estimado:{" "}
                                    <span className="font-semibold text-zinc-700">
                                      {cumulativeEndLabel}
                                    </span>
                                  </p>
                                </div>

                                <div className="rounded border border-sky-100 bg-sky-50/60 px-1.5 py-1">
                                  <p
                                    className="mb-0.5 flex items-center gap-1 font-semibold"
                                    style={{ color: rollingColor }}
                                  >
                                    <span
                                      className="inline-block h-1.5 w-2 rounded-sm"
                                      style={{ backgroundColor: rollingColor }}
                                    />
                                    Série janela móvel ({rollingWindowDays}d)
                                  </p>
                                  <p className="text-zinc-600">
                                    Velocidade:{" "}
                                    <span className="font-semibold text-zinc-700">
                                      {rollingVelocityLabel}
                                    </span>
                                  </p>
                                  <p className="text-zinc-600">
                                    SP na janela:{" "}
                                    <span className="font-semibold text-zinc-700">
                                      {rollingWindowPointsLabel}
                                    </span>
                                  </p>
                                  <p className="text-zinc-600">
                                    Fim estimado:{" "}
                                    <span className="font-semibold text-zinc-700">
                                      {rollingEndLabel}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      {projectionChartMode === "normal" ? (
                        <>
                          <Line
                            yAxisId="main"
                            type="monotone"
                            dataKey="cumulativeEstimatedEndMs"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: "#7c3aed", stroke: "#ffffff", strokeWidth: 1 }}
                            activeDot={{ r: 4 }}
                            isAnimationActive={false}
                          />
                          <Line
                            yAxisId="main"
                            type="monotone"
                            dataKey="rollingEstimatedEndMs"
                            stroke="#0284c7"
                            strokeWidth={2}
                            dot={{ r: 2.2, fill: "#0284c7", stroke: "#ffffff", strokeWidth: 1 }}
                            activeDot={{ r: 4 }}
                            connectNulls={false}
                            isAnimationActive={false}
                          />
                        </>
                      ) : (
                        <>
                          <Scatter
                            yAxisId="main"
                            data={inverseCumulativeScatterData}
                            line={{ stroke: "#7c3aed", strokeWidth: 2, opacity: 0.8 }}
                            shape={() => null}
                            fill="transparent"
                            legendType="none"
                            isAnimationActive={false}
                          />
                          <Scatter
                            yAxisId="main"
                            data={inverseRollingScatterData}
                            line={{ stroke: "#0284c7", strokeWidth: 2, opacity: 0.8 }}
                            shape={() => null}
                            fill="transparent"
                            legendType="none"
                            isAnimationActive={false}
                          />
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center px-2">
                    <span className="text-[10px] font-medium text-zinc-500">
                      Sem histórico suficiente de tickets concluídos.
                    </span>
                  </div>
                )}
                {projectionChartMode === "normal" && yAxisGuideItems.length > 0 ? (
                  <div className="pointer-events-none absolute inset-0 z-10">
                    {yAxisGuideItems.map((item) => (
                      <div
                        key={`y-guide-line-${item.value}`}
                        className="absolute left-0 right-0 border-t border-zinc-300/45"
                        style={{ top: `${item.topPx}px` }}
                      />
                    ))}
                  </div>
                ) : null}
                {projectionChartMode === "normal" && yAxisGuideItems.length > 0 ? (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-30"
                    style={{ left: `${todayPct}%`, width: 0 }}
                  >
                    {yAxisGuideItems.map((item) => (
                      <span
                        key={`y-guide-${item.value}`}
                        className="absolute left-1 -translate-y-1/2 whitespace-nowrap text-left text-[8px] font-medium text-zinc-600"
                        style={{ top: `${item.topPx}px` }}
                      >
                        {formatDateShortFromMs(item.value)}
                      </span>
                    ))}
                    {latestSeriesBadgeItems.map((badge) => (
                      <span
                        key={badge.key}
                        className={`absolute left-1 -translate-y-1/2 whitespace-nowrap rounded border px-1 py-0.5 text-left text-[8px] font-bold ${
                          badge.key === "latest-cumulative"
                            ? "border-violet-300 bg-violet-100 text-violet-800"
                            : "border-sky-300 bg-sky-100 text-sky-800"
                        }`}
                        style={{ top: `${badge.topPx}px` }}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
          <span>
            <strong className="text-zinc-800">Início:</strong>{" "}
            {formatDateShort(projectStartDate)}
          </span>
          <span>
            <strong className="text-zinc-800">Término estimado:</strong>{" "}
            {formatDateShort(estimatedEndDate)}
          </span>
          <span>
            <strong className="text-zinc-800">Velocidade:</strong>{" "}
            {velocityLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function compactTicketLabel(ticketKey: string) {
  const parts = ticketKey.split("-");
  const suffix = parts[parts.length - 1];
  return suffix ?? ticketKey;
}

function assigneeInitials(name: string) {
  const words = name.match(/\p{L}+/gu) ?? [];
  if (words.length === 0) return "";
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  const first = words[0]![0] ?? "";
  const last = words[words.length - 1]![0] ?? "";
  return `${first}${last}`.toUpperCase();
}

function AssigneeInitialBadge({
  assignee,
  faded = false,
  ticketTitle,
}: {
  assignee: string | null;
  faded?: boolean;
  ticketTitle?: string;
}) {
  if (!assignee) return null;
  const initials = assigneeInitials(assignee);
  if (!initials) return null;
  const colors = getAssigneeBadgeColors(assignee);

  return (
    <div
      className="pointer-events-none absolute right-[-155px] top-1/2 z-20 inline-flex w-[150px] -translate-y-1/2 items-center gap-1"
      style={{ opacity: faded ? 0.55 : 1 }}
      aria-hidden
    >
      <span
        className="inline-flex h-3 min-w-3 items-center justify-center rounded border px-0.5 text-[8px] font-bold leading-none"
        style={{
          backgroundColor: colors.backgroundColor,
          color: colors.color,
          borderColor: colors.borderColor,
        }}
        title={assignee}
      >
        {initials}
      </span>
      {ticketTitle ? (
        <span className="truncate text-[9px] font-semibold text-zinc-700">
          {ticketTitle}
        </span>
      ) : null}
    </div>
  );
}

function ProjectedTicketTooltip({
  issue,
  project,
  statusLabel,
}: {
  issue: JiraIssue;
  project: JiraProject;
  statusLabel: string;
}) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2.5 text-left opacity-0 shadow-xl ring-1 ring-black/5 transition-opacity duration-150 group-hover:opacity-100">
      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" />

      <div className="mb-1.5 flex items-start gap-1.5">
        <a
          href={`${project.siteUrl}/browse/${issue.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto shrink-0 pt-px text-[10px] font-bold leading-snug text-blue-600 hover:underline"
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

      <div className="mb-1.5">
        <StatusTimeline status={issue.status} inline />
      </div>

      <p className="text-[9px] font-semibold text-zinc-500">{statusLabel}</p>
    </div>
  );
}
