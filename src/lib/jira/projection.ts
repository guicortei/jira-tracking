import type { JiraIssue } from "./types";
import type { ProjectProjection, SprintProjection } from "./projection-types";
import { normalizeStatus } from "@/components/status-timeline";

const CHECKOUT_PROJECT_KEY = "CT";
const OPTIMISTIC_FACTOR = 1.25;
const PESSIMISTIC_FACTOR = 0.75;

function isDone(status: string) {
  return normalizeStatus(status) === "FEITO";
}

function isNotStarted(status: string) {
  return normalizeStatus(status) === "A FAZER";
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.ceil(days));
  return result;
}

function toIsoDate(date: Date) {
  return date.toISOString();
}

function formatDatePt(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

function daysBetween(start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
}

function computeVelocity(issues: JiraIssue[]) {
  const completed = issues.filter(
    (issue) => isDone(issue.status) && issue.resolutionDate,
  );

  const cycleDays = completed
    .map((issue) => issue.daysCycleTime ?? issue.daysToResolve)
    .filter((value): value is number => value !== null);

  const medianCycleDays = median(cycleDays);

  if (completed.length === 0) {
    return {
      throughputPerDay: 1,
      medianDaysToResolve: medianCycleDays || 5,
      medianCycleDays: medianCycleDays || 5,
      sampleSize: 0,
      windowDays: 0,
    };
  }

  const resolutionDates = completed.map(
    (issue) => new Date(issue.resolutionDate!).getTime(),
  );
  const minDate = Math.min(...resolutionDates);
  const maxDate = Math.max(...resolutionDates);
  const windowDays = Math.max(
    1,
    Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)),
  );

  const throughputFromWindow = completed.length / windowDays;
  const throughputFromMedian =
    medianCycleDays > 0 ? 1 / medianCycleDays : 1;

  return {
    throughputPerDay: Math.max(throughputFromWindow, throughputFromMedian * 0.5),
    medianDaysToResolve: medianCycleDays || 5,
    medianCycleDays: medianCycleDays || 5,
    sampleSize: completed.length,
    windowDays,
  };
}

function getProjectWorkStartDate(issues: JiraIssue[], fallback: Date) {
  const workStarts = issues
    .map((issue) => {
      if (issue.workStartedAt) return new Date(issue.workStartedAt).getTime();
      if (!isNotStarted(issue.status)) return new Date(issue.created).getTime();
      return null;
    })
    .filter((value): value is number => value !== null);

  if (workStarts.length === 0) {
    const created = issues.map((issue) => new Date(issue.created).getTime());
    if (created.length === 0) return fallback;
    return new Date(Math.min(...created));
  }

  return new Date(Math.min(...workStarts));
}

function summarizeSprint(issues: JiraIssue[], sprint: number) {
  const sprintIssues = issues.filter((issue) => issue.sprint === sprint);
  const done = sprintIssues.filter((issue) => isDone(issue.status)).length;
  const notStarted = sprintIssues.filter((issue) =>
    isNotStarted(issue.status),
  ).length;
  const inProgress = sprintIssues.filter(
    (issue) => !isDone(issue.status) && !isNotStarted(issue.status),
  ).length;

  return {
    sprintIssues,
    total: sprintIssues.length,
    done,
    notStarted,
    inProgress,
  };
}

function scheduleSprintsSequentially(
  issues: JiraIssue[],
  throughputPerDay: number,
  projectStart: Date,
  now: Date,
) {
  const sprintNumbers = [
    ...new Set(
      issues
        .map((issue) => issue.sprint)
        .filter((value): value is number => value !== null),
    ),
  ].sort((a, b) => a - b);

  const rate = Math.max(throughputPerDay, 0.1);
  let cursor = new Date(projectStart);

  const sprints: SprintProjection[] = sprintNumbers.map((sprint) => {
    const { total, done, notStarted, inProgress } = summarizeSprint(
      issues,
      sprint,
    );

    const durationDays =
      total > 0 ? Math.max(1, Math.ceil(total / rate)) : 0;
    const start = new Date(cursor);
    const end = durationDays > 0 ? addDays(start, durationDays) : start;

    if (durationDays > 0) {
      cursor = end;
    }

    const startMs = start.getTime();
    const endMs = end.getTime();
    const nowMs = now.getTime();

    let unlocked = false;
    if (total > 0 && done < total) {
      if (nowMs >= startMs && nowMs < endMs) unlocked = true;
      if (inProgress > 0) unlocked = true;
    }

    return {
      sprint,
      total,
      done,
      open: total - done,
      inProgress,
      notStarted,
      completionPct: total > 0 ? done / total : 0,
      unlocked,
      projectedDurationDays: Math.ceil(durationDays),
      estimatedDaysRemaining: Math.max(0, Math.ceil(durationDays)),
      projectedStartDate: toIsoDate(start),
      projectedEndDate: toIsoDate(end),
    };
  });

  const projectEndDate = cursor;
  const remainingDays = daysBetween(now, projectEndDate);

  const activeSprints = sprints.filter(
    (sprint) => sprint.unlocked && sprint.done < sprint.total,
  ).length;

  return {
    sprints,
    projectEndDate,
    remainingDays,
    activeSprints,
  };
}

export function buildCheckoutProjection(
  issues: JiraIssue[],
  projectName = "Checkout TechTeam",
): ProjectProjection {
  const sprintIssues = issues.filter((issue) => issue.sprint !== null);
  const velocity = computeVelocity(sprintIssues);
  const now = new Date();
  const projectStart = getProjectWorkStartDate(sprintIssues, now);

  const optimistic = scheduleSprintsSequentially(
    sprintIssues,
    velocity.throughputPerDay * OPTIMISTIC_FACTOR,
    projectStart,
    now,
  );
  const estimated = scheduleSprintsSequentially(
    sprintIssues,
    velocity.throughputPerDay,
    projectStart,
    now,
  );
  const pessimistic = scheduleSprintsSequentially(
    sprintIssues,
    velocity.throughputPerDay * PESSIMISTIC_FACTOR,
    projectStart,
    now,
  );

  const done = sprintIssues.filter((issue) => isDone(issue.status)).length;
  const total = sprintIssues.length;

  return {
    projectKey: CHECKOUT_PROJECT_KEY,
    projectName,
    generatedAt: now.toISOString(),
    overall: {
      total,
      done,
      open: total - done,
      completionPct: total > 0 ? done / total : 0,
    },
    velocity: {
      ...velocity,
      throughputPerDay: Number(velocity.throughputPerDay.toFixed(2)),
    },
    timeline: {
      projectStartDate: toIsoDate(projectStart),
      estimatedEndDate: toIsoDate(estimated.projectEndDate),
      optimisticEndDate: toIsoDate(optimistic.projectEndDate),
      pessimisticEndDate: toIsoDate(pessimistic.projectEndDate),
    },
    projection: {
      optimisticDate: toIsoDate(optimistic.projectEndDate),
      estimatedDate: toIsoDate(estimated.projectEndDate),
      pessimisticDate: toIsoDate(pessimistic.projectEndDate),
      remainingDays: estimated.remainingDays,
      activeSprints: estimated.activeSprints,
    },
    sprints: estimated.sprints,
    assumptions: [
      "Projeção read-only com base nos tickets atuais do Checkout TechTeam.",
      `Início do projeto: ${formatDatePt(projectStart)} (menor data de início de trabalho via changelog).`,
      `Velocidade estimada: ${velocity.throughputPerDay.toFixed(2)} tickets/dia (${velocity.sampleSize} conclusões nos últimos ${velocity.windowDays} dia(s)).`,
      "Cada sprint é um bloco sequencial: duração = tickets da sprint ÷ velocidade; a próxima sprint começa quando a anterior termina.",
      `Mediana de cycle time: ${velocity.medianCycleDays.toFixed(1)} dias (saída de "A Fazer" até conclusão).`,
      `Faixa de término: otimista ${formatDatePt(optimistic.projectEndDate)}, pessimista ${formatDatePt(pessimistic.projectEndDate)}.`,
    ],
  };
}

export function isCheckoutProject(projectKey: string) {
  return projectKey.toUpperCase() === CHECKOUT_PROJECT_KEY;
}
