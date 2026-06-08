"use client";

import {
  DualProgressBar,
  TicketSegmentFill,
  stripedGradient,
} from "@/components/dual-progress-bar";
import { SprintSummaryCard } from "@/components/sprint-summary-card";
import type {
  CheckoutProjections,
  ProjectionUnit,
  ProjectProjection,
  SprintProjection,
} from "@/lib/jira/projection-types";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const startMs = dateToMs(projection.timeline.projectStartDate);
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
  const [projections, setProjections] = useState<CheckoutProjections | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const metricsColumnRef = useRef<HTMLDivElement>(null);
  const [summaryPanelHeight, setSummaryPanelHeight] = useState<number | null>(null);

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
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-200" />
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
              <h1 className="mt-1 text-3xl font-black text-zinc-900">{projectName}</h1>
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
                Por tickets: {formatDateLong(altProjection.projection.estimatedDate)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>Progresso geral do projeto</span>
              <span className="text-blue-700">
                {projection.overall.donePoints}/{projection.overall.totalPoints} pts (
                {formatPct(projection.overall.completionPctPoints)})
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
              value={`${projection.velocity.throughputPerDay} pts/dia`}
              detail={`${altProjection.velocity.throughputPerDay} tk/dia · mediana ${projection.velocity.medianCycleDays}d (cycle time)`}
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
              detail={`${projection.velocity.pointsDelivered ?? 0} pts entregues em ${projection.velocity.windowDays} dia(s)`}
              borderColor="#0891b2"
              bgColor="#ecfeff"
            />
          </div>

          <section className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">Faixa de previsão</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Cenários em story points com velocidade ±25% em relação à média atual
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
                sub={`${projection.projection.remainingDays} dias restantes`}
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
            <h2 className="shrink-0 text-base font-bold text-zinc-900">Resumo das sprints</h2>
            <p className="mb-1 shrink-0 text-sm text-zinc-600">
              Situação atual de cada sprint pelo campo{" "}
              <code className="text-xs">_sprint</code>.
            </p>
            <p className="mb-4 shrink-0 text-xs text-zinc-500">
              Clique na sprint para ver os tickets. Barra sólida = concluído · listras =
              em andamento.
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

      {/* Cronograma — largura total */}
      <section className="w-full rounded-2xl border-2 border-violet-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900">
          Cronograma por sprint — velocidade em story points
        </h2>
        <p className="mb-1 text-sm text-zinc-600">
          Gantt sequencial: início em{" "}
          <strong className="font-semibold">
            {formatDateShort(projection.timeline.projectStartDate)}
          </strong>
          , velocidade de {projection.velocity.throughputPerDay} pts/dia (
          {projection.velocity.pointsDelivered ?? 0} pts já entregues). Cada sprint só começa quando
          a anterior termina.
        </p>
        <p className="mb-4 text-xs text-zinc-500">
          Barra segmentada por ticket (progresso real) · linha vermelha = hoje
        </p>

        <SprintGanttChart
          sprints={projection.sprints}
          unit="storyPoints"
          velocityPerDay={projection.velocity.throughputPerDay}
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
            Cenário alternativo ({altProjection.velocity.throughputPerDay} tickets/dia) ·
            término {formatDateShort(altProjection.projection.estimatedDate)}
          </span>
        </summary>
        <div className="border-t border-zinc-200 px-5 pb-5 pt-4">
          <p className="mb-4 text-xs text-zinc-500">
            Barra sólida = concluído · listras = em andamento · linha vermelha = hoje
          </p>

          <SprintGanttChart
            sprints={altProjection.sprints}
            unit="tickets"
            velocityPerDay={altProjection.velocity.throughputPerDay}
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
            <h3 className="mb-2 font-bold text-zinc-900">Cenário por story points (padrão)</h3>
            <ul className="space-y-2">
              {projection.assumptions.map((item) => (
                <li key={`sp-${item}`}>• {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-bold text-zinc-900">Cenário por tickets</h3>
            <ul className="space-y-2">
              {altProjection.assumptions.map((item) => (
                <li key={`tk-${item}`}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden border-r border-zinc-300/70" aria-hidden>
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
  projectStartDate,
  estimatedEndDate,
  startMs,
  endMs,
}: {
  sprints: SprintProjection[];
  unit: ProjectionUnit;
  velocityPerDay: number;
  projectStartDate: string;
  estimatedEndDate: string;
  startMs: number;
  endMs: number;
}) {
  const workloadLabel = unit === "storyPoints" ? "pts" : "tk";
  const velocityLabel =
    unit === "storyPoints" ? `${velocityPerDay} pts/dia` : `${velocityPerDay} tickets/dia`;
  const todayPct = positionOnTimeline(new Date().toISOString(), startMs, endMs);
  const monthTicks = useMemo(
    () => buildMonthTicks(startMs, endMs),
    [startMs, endMs],
  );
  const dayGrid = useMemo(() => buildDayGrid(startMs, endMs), [startMs, endMs]);
  const timelineRowSpan = sprints.length + 1;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="grid gap-x-2 gap-y-1 text-xs font-semibold text-zinc-500"
          style={{
            gridTemplateColumns: "88px 1fr",
            gridTemplateRows: `2.5rem repeat(${sprints.length}, 2.5rem)`,
          }}
        >
          <span className="flex items-center" style={{ gridColumn: 1, gridRow: 1 }}>
            Sprint
          </span>

          <div
            className="relative"
            style={{
              gridColumn: 2,
              gridRow: `1 / ${timelineRowSpan}`,
            }}
          >
            <DayGridBackground days={dayGrid} />

            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-1/2 bg-red-500"
              style={{ left: `${todayPct}%` }}
              title="Hoje"
            />
            <span
              className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ left: `${todayPct}%` }}
            >
              Hoje
            </span>

            <div className="relative z-10 flex h-full flex-col gap-1">
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

                return (
                  <div
                    key={sprint.sprint}
                    className="relative h-10 rounded-md border border-zinc-200/90 bg-white/50"
                  >
                    <div
                      className="absolute inset-y-1 z-10 flex overflow-hidden rounded shadow-sm"
                      style={{
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
                  </div>
                );
              })}
            </div>
          </div>

          {sprints.map((sprint, index) => (
            <div
              key={`label-${sprint.sprint}`}
              className="flex h-10 flex-col justify-center pr-1"
              style={{ gridColumn: 1, gridRow: index + 2 }}
            >
              <p className="text-sm font-black text-zinc-900">S{sprint.sprint}</p>
              <p className="text-[10px] font-medium text-zinc-500">
                {unit === "storyPoints" ? sprint.totalPoints : sprint.total}{" "}
                {workloadLabel} · {sprint.projectedDurationDays}d
              </p>
            </div>
          ))}
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
            <strong className="text-zinc-800">Velocidade:</strong> {velocityLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
