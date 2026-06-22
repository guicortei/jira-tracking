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

function formatDateLong(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    new Date(value),
  );
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatRate(value: number) {
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
            project={project}
            showAssigneeInitials={showAssigneeInitials}
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
              project={project}
              showAssigneeInitials={showAssigneeInitials}
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

function startOfLocalDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function buildDayGrid(startMs: number, endMs: number): DayGridColumn[] {
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return [];

  const columns: DayGridColumn[] = [];
  let cursor = startOfLocalDay(startMs);
  const lastDay = startOfLocalDay(endMs);

  while (cursor <= lastDay) {
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
  const ticks: { label: string; pct: number }[] = [];
  const cursor = new Date(startMs);
  cursor.setDate(1);

  while (cursor.getTime() <= endMs) {
    ticks.push({
      label: new Intl.DateTimeFormat("pt-BR", {
        month: "short",
        year: "2-digit",
      }).format(cursor),
      pct: positionOnTimeline(cursor.toISOString(), startMs, endMs),
    });
    cursor.setMonth(cursor.getMonth() + 1);
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
  project,
  showAssigneeInitials = false,
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
  project: JiraProject;
  showAssigneeInitials?: boolean;
  viewMode?: "projection" | "flow";
  projectStartDate: string;
  estimatedEndDate: string;
  startMs: number;
  endMs: number;
}) {
  const workloadLabel = unit === "storyPoints" ? "pts" : "tk";
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
  const dayGrid = useMemo(() => buildDayGrid(startMs, endMs), [startMs, endMs]);
  const FLOW_BLOCK_HEIGHT = 12;
  const FLOW_BLOCK_GAP = 3;
  const FLOW_GROUP_GAP = 5;
  const FLOW_PADDING_Y = 6;
  const DEFAULT_ROW_HEIGHT = 40;
  const METRICS_HEADER_HEIGHT = 16;
  const METRICS_BAR_MAX_HEIGHT = 104;
  const METRICS_BAR_GAP = 4;
  const METRICS_VALUE_ROW_HEIGHT = 10;
  const METRICS_BOTTOM_PADDING = 4;
  const METRICS_ROW_HEIGHT =
    METRICS_HEADER_HEIGHT +
    METRICS_BAR_MAX_HEIGHT +
    METRICS_BAR_GAP +
    METRICS_VALUE_ROW_HEIGHT * 3 +
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

  const dailyTicketMetrics = useMemo(() => {
    if (dayGrid.length === 0) return [];
    const todayStartMs = startOfLocalDay(dateToMs(nowIso));

    const createdEntries = allSprintIssues
      .map((issue) => ({ issue, createdMs: dateToMs(issue.created) }))
      .filter((entry) => Number.isFinite(entry.createdMs))
      .sort((a, b) => a.createdMs - b.createdMs);
    const completedTimes = allSprintIssues
      .map((issue) => (issue.resolutionDate ? dateToMs(issue.resolutionDate) : null))
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((a, b) => a - b);

    let createdIndex = 0;
    let completedIndex = 0;
    let previousCreated = 0;

    return dayGrid.map((day) => {
      const dayEndMs = day.dayStartMs + 86400000 - 1;
      const newIssues: JiraIssue[] = [];
      while (
        createdIndex < createdEntries.length &&
        createdEntries[createdIndex]!.createdMs <= dayEndMs
      ) {
        newIssues.push(createdEntries[createdIndex]!.issue);
        createdIndex += 1;
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

      return {
        key: day.key,
        leftPct: day.leftPct,
        widthPct: day.widthPct,
        isFuture: day.dayStartMs > todayStartMs,
        createdCumulative,
        completedCumulative,
        newTickets,
        newIssues,
        completionPct:
          createdCumulative > 0 ? completedCumulative / createdCumulative : 0,
      };
    });
  }, [allSprintIssues, dayGrid, nowIso]);

  const maxCreatedCumulative = useMemo(
    () => Math.max(1, ...dailyTicketMetrics.map((item) => item.createdCumulative)),
    [dailyTicketMetrics],
  );

  const getSprintRowHeight = useCallback(
    (sprint: SprintProjection) => {
      if (viewMode !== "flow") return DEFAULT_ROW_HEIGHT;
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
            <span className="flex h-10 items-center">Sprint</span>

            {sprints.map((sprint) => (
              <div
                key={`label-${sprint.sprint}`}
                className="flex flex-col justify-center pr-1"
                style={{ height: `${getSprintRowHeight(sprint)}px` }}
              >
                <p className="text-sm font-black text-zinc-900">
                  S{sprint.sprint}
                </p>
                <p className="text-[10px] font-medium text-zinc-500">
                  {unit === "storyPoints" ? sprint.totalPoints : sprint.total}{" "}
                  {workloadLabel} · {formatDays(sprint.projectedDurationDays)}d
                </p>
              </div>
            ))}
            <div
              className="pr-1"
              style={{ height: `${METRICS_ROW_HEIGHT}px` }}
            >
              <div
                className="grid h-full text-right text-[8px] leading-tight text-zinc-500"
                style={{
                  gridTemplateRows: `${METRICS_HEADER_HEIGHT}px ${METRICS_BAR_MAX_HEIGHT}px ${METRICS_BAR_GAP}px repeat(3, ${METRICS_VALUE_ROW_HEIGHT}px) ${METRICS_BOTTOM_PADDING}px`,
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
              <div className="relative h-10 shrink-0 border-b border-zinc-300 bg-white/80 pb-1 backdrop-blur-[1px]">
                <span className="absolute bottom-0 left-0 whitespace-nowrap text-[10px] font-bold text-zinc-700">
                  {formatDateShort(projectStartDate)}
                </span>
                <span className="absolute bottom-0 right-0 whitespace-nowrap text-[10px] font-bold text-zinc-700">
                  {formatDateShort(estimatedEndDate)}
                </span>
                {monthTicks.map((tick) => (
                  <span
                    key={`${tick.label}-${tick.pct}`}
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-zinc-400"
                    style={{ left: `${tick.pct}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
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
                {dailyTicketMetrics.map((metric, metricIndex) => {
                  const createdHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        metric.createdCumulative > 0 ? 2 : 0,
                        (metric.createdCumulative / maxCreatedCumulative) *
                          METRICS_BAR_MAX_HEIGHT,
                      );
                  const doneHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        metric.completedCumulative > 0 ? 2 : 0,
                        (metric.completedCumulative / maxCreatedCumulative) *
                          METRICS_BAR_MAX_HEIGHT,
                      );
                  const newHeightPx = metric.isFuture
                    ? 0
                    : Math.max(
                        metric.newTickets > 0 ? 2 : 0,
                        (metric.newTickets / maxCreatedCumulative) *
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
                  const deltaClass = newLabel === "" ? "text-zinc-700" : "text-red-600";

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
                          gridTemplateRows: `${METRICS_HEADER_HEIGHT}px ${METRICS_BAR_MAX_HEIGHT}px ${METRICS_BAR_GAP}px repeat(3, ${METRICS_VALUE_ROW_HEIGHT}px) ${METRICS_BOTTOM_PADDING}px`,
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
                          {pctTrend === "up" && completionLabel !== "" ? (
                            <span
                              className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-[8px] font-bold leading-none text-emerald-600"
                              style={{
                                bottom: `${Math.min(
                                  METRICS_BAR_MAX_HEIGHT - 8,
                                  doneHeightPx + 2,
                                )}px`,
                              }}
                            >
                              {completionLabel}
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
                      </div>
                    </div>
                  );
                })}
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
