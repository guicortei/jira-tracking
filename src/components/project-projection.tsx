"use client";

import type { ProjectProjection, SprintProjection } from "@/lib/jira/projection-types";
import { useEffect, useMemo, useRef, useState } from "react";

type ProjectProjectionPanelProps = {
  projectKey: string;
  projectName: string;
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

function stripedGradient(baseColor: string) {
  return `repeating-linear-gradient(
    -45deg,
    ${baseColor},
    ${baseColor} 6px,
    color-mix(in srgb, ${baseColor} 55%, white) 6px,
    color-mix(in srgb, ${baseColor} 55%, white) 12px
  )`;
}

function DualProgressBar({
  total,
  done,
  inProgress,
  doneColor,
  inProgressColor,
  className = "h-2.5",
}: {
  total: number;
  done: number;
  inProgress: number;
  doneColor: string;
  inProgressColor: string;
  className?: string;
}) {
  if (total <= 0) {
    return <div className={`rounded-full bg-zinc-300 ${className}`} />;
  }

  const donePct = (done / total) * 100;
  const inProgressPct = (inProgress / total) * 100;

  return (
    <div
      className={`flex overflow-hidden rounded-full bg-zinc-300 ${className}`}
      role="progressbar"
      aria-valuenow={done + inProgress}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      {donePct > 0 && (
        <div
          className="h-full shrink-0 transition-all"
          style={{ width: `${donePct}%`, backgroundColor: doneColor }}
          title={`${done} concluídos`}
        />
      )}
      {inProgressPct > 0 && (
        <div
          className="h-full shrink-0 transition-all"
          style={{
            width: `${inProgressPct}%`,
            backgroundColor: inProgressColor,
            backgroundImage: stripedGradient(inProgressColor),
          }}
          title={`${inProgress} em andamento`}
        />
      )}
    </div>
  );
}

function sprintStatusLabel(sprint: SprintProjection) {
  const now = Date.now();
  const start = dateToMs(sprint.projectedStartDate);
  const end = dateToMs(sprint.projectedEndDate);

  if (sprint.done === sprint.total) return "Concluída";
  if (now < start) return "Prevista";
  if (now >= end && sprint.done < sprint.total) return "Atrasada";
  if (now >= start) return "Em execução";
  return "Prevista";
}

function sprintBreakdown(sprint: SprintProjection) {
  return `${sprint.done} feitos · ${sprint.inProgress} em andamento · ${sprint.notStarted} a fazer`;
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

export function ProjectProjectionPanel({
  projectKey,
  projectName,
  onBack,
}: ProjectProjectionPanelProps) {
  const [projection, setProjection] = useState<ProjectProjection | null>(null);
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
        setProjection(data);
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

  const timelineRange = useMemo(() => {
    if (!projection) return null;
    const startMs = dateToMs(projection.timeline.projectStartDate);
    const endMs = Math.max(
      dateToMs(projection.timeline.pessimisticEndDate),
      dateToMs(projection.timeline.estimatedEndDate),
      Date.now(),
    );
    const padding = 86400000 * 7;
    return { startMs: startMs - padding, endMs: endMs + padding };
  }, [projection]);

  const activeSprints = useMemo(() => {
    if (!projection) return 0;
    return projection.sprints.filter(
      (s) => s.unlocked && s.done < s.total,
    ).length;
  }, [projection]);

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
  }, [projection, loading]);

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

  if (!projection || !timelineRange) return null;

  const { startMs, endMs } = timelineRange;
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
                Entrega estimada
              </p>
              <p className="mt-1 text-2xl font-black leading-tight">
                {formatDateLong(projection.projection.estimatedDate)}
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-100">
                Faltam {projection.projection.remainingDays} dias
              </p>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>Progresso geral do projeto</span>
              <span className="text-blue-700">
                {projection.overall.done}/{projection.overall.total} (
                {formatPct(projection.overall.completionPct)})
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
              value={formatPct(projection.overall.completionPct)}
              detail={`${projection.overall.done} concluídos · ${projection.overall.open} abertos`}
              borderColor="#2563eb"
              bgColor="#eff6ff"
            />
            <KpiCard
              label="Velocidade"
              value={`${projection.velocity.throughputPerDay}/dia`}
              detail={`Mediana de ${projection.velocity.medianCycleDays} dias (cycle time)`}
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
              detail={`tickets resolvidos em ${projection.velocity.windowDays} dia(s)`}
              borderColor="#0891b2"
              bgColor="#ecfeff"
            />
          </div>

          <section className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">Faixa de previsão</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Cenários com velocidade ±25% em relação à média atual
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
            Barra sólida = concluído · listras = em andamento (não inclui &quot;A Fazer&quot;).
            </p>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {projection.sprints.map((sprint, index) => (
                <SprintCard
                  key={sprint.sprint}
                  sprint={sprint}
                  color={SPRINT_COLORS[index % SPRINT_COLORS.length]}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Cronograma — largura total */}
      <section className="w-full rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-zinc-900">Cronograma por sprint</h2>
        <p className="mb-1 text-sm text-zinc-600">
          Gantt sequencial: início em{" "}
          <strong className="font-semibold">
            {formatDateShort(projection.timeline.projectStartDate)}
          </strong>
          , velocidade de {projection.velocity.throughputPerDay} tickets/dia. Cada sprint só começa
          quando a anterior termina.
        </p>
          <p className="mb-4 text-xs text-zinc-500">
            Barra sólida = concluído · listras = em andamento · linha vermelha = hoje
          </p>

        <SprintGanttChart
          sprints={projection.sprints}
          velocityPerDay={projection.velocity.throughputPerDay}
          projectStartDate={projection.timeline.projectStartDate}
          estimatedEndDate={projection.timeline.estimatedEndDate}
          startMs={startMs}
          endMs={endMs}
        />
      </section>

      <details className="rounded-2xl border-2 border-zinc-200 bg-zinc-50">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-zinc-800">
          Como a projeção é calculada ▾
        </summary>
        <ul className="space-y-2 border-t-2 border-zinc-200 px-5 py-4 text-sm text-zinc-700">
          {projection.assumptions.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
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
  velocityPerDay,
  projectStartDate,
  estimatedEndDate,
  startMs,
  endMs,
}: {
  sprints: SprintProjection[];
  velocityPerDay: number;
  projectStartDate: string;
  estimatedEndDate: string;
  startMs: number;
  endMs: number;
}) {
  const todayPct = positionOnTimeline(new Date().toISOString(), startMs, endMs);
  const monthTicks = useMemo(
    () => buildMonthTicks(startMs, endMs),
    [startMs, endMs],
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="mb-2 grid grid-cols-[88px_1fr] gap-2 text-xs font-semibold text-zinc-500">
          <span>Sprint</span>
          <div className="relative h-8 border-b border-zinc-300">
            {monthTicks.map((tick) => (
              <span
                key={`${tick.label}-${tick.pct}`}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${tick.pct}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[88px_1fr] gap-2">
          <div className="space-y-1">
            {sprints.map((sprint) => (
              <div key={sprint.sprint} className="flex h-10 flex-col justify-center pr-1">
                <p className="text-sm font-black text-zinc-900">S{sprint.sprint}</p>
                <p className="text-[10px] font-medium text-zinc-500">
                  {sprint.total} tk · {sprint.projectedDurationDays}d
                </p>
              </div>
            ))}
          </div>

          <div className="relative space-y-1">
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 -translate-x-1/2 bg-red-500"
              style={{ left: `${todayPct}%` }}
              title="Hoje"
            />
            <span
              className="pointer-events-none absolute -top-5 z-10 -translate-x-1/2 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ left: `${todayPct}%` }}
            >
              Hoje
            </span>

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
                  className="relative h-10 rounded-md border border-zinc-200 bg-zinc-50"
                >
                  <div
                    className="absolute inset-y-1 overflow-hidden rounded shadow-sm"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                      minWidth: "6px",
                    }}
                    title={`${formatDateShort(sprint.projectedStartDate)} → ${formatDateShort(sprint.projectedEndDate)}`}
                  >
                    <div className="absolute inset-0 flex overflow-hidden">
                      {sprint.total > 0 && sprint.done > 0 && (
                        <div
                          className="h-full bg-black/35"
                          style={{ width: `${(sprint.done / sprint.total) * 100}%` }}
                        />
                      )}
                      {sprint.total > 0 && sprint.inProgress > 0 && (
                        <div
                          className="h-full"
                          style={{
                            width: `${(sprint.inProgress / sprint.total) * 100}%`,
                            backgroundImage: `repeating-linear-gradient(
                              -45deg,
                              rgba(255,255,255,0.55) 0,
                              rgba(255,255,255,0.55) 5px,
                              rgba(255,255,255,0.2) 5px,
                              rgba(255,255,255,0.2) 10px
                            )`,
                          }}
                        />
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center px-1">
                      <span className="truncate text-[10px] font-bold text-white drop-shadow">
                        {isComplete
                          ? "Concluída"
                          : `${formatDateShort(sprint.projectedStartDate)} – ${formatDateShort(sprint.projectedEndDate)}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
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
            <strong className="text-zinc-800">Velocidade:</strong> {velocityPerDay}/dia
          </span>
        </div>
      </div>
    </div>
  );
}

function SprintCard({
  sprint,
  color,
}: {
  sprint: SprintProjection;
  color: string;
}) {
  const isComplete = sprint.done === sprint.total;

  return (
    <div className="rounded-xl border-2 border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-black text-white"
            style={{ backgroundColor: color }}
          >
            S{sprint.sprint}
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-900">Sprint {sprint.sprint}</p>
            <p className="text-xs font-medium text-zinc-600">
              {sprint.done} de {sprint.total} concluídos ({formatPct(sprint.completionPct)})
            </p>
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
          style={{
            backgroundColor: isComplete
              ? "#2563eb"
              : sprint.unlocked
                ? "#059669"
                : "#71717a",
          }}
        >
          {sprintStatusLabel(sprint)}
        </span>
      </div>

      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>Progresso real</span>
        <span>{sprint.done}/{sprint.total}</span>
      </div>
      <DualProgressBar
        total={sprint.total}
        done={sprint.done}
        inProgress={sprint.inProgress}
        doneColor={color}
        inProgressColor={color}
        className="mb-3 h-2.5"
      />

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Feitos" value={sprint.done} />
        <MiniStat label="Em andamento" value={sprint.inProgress} />
        <MiniStat label="A fazer" value={sprint.notStarted} />
      </div>

      <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700">
        {isComplete ? (
          <>
            Bloco projetado:{" "}
            <span className="font-bold text-zinc-900">
              {formatDateShort(sprint.projectedStartDate)} –{" "}
              {formatDateShort(sprint.projectedEndDate)}
            </span>
          </>
        ) : (
          <>
            Previsão:{" "}
            <span className="font-bold text-zinc-900">
              {formatDateShort(sprint.projectedStartDate)} →{" "}
              {formatDateShort(sprint.projectedEndDate)}
            </span>
            {" · "}
            {sprint.projectedDurationDays} dias ({sprint.total} tickets ÷ velocidade)
          </>
        )}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-1 py-1.5">
      <p className="text-base font-black text-zinc-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase text-zinc-500">{label}</p>
    </div>
  );
}
