export type ProjectionUnit = "tickets" | "storyPoints";

export type SprintProjection = {
  sprint: number;
  total: number;
  done: number;
  totalPoints: number;
  donePoints: number;
  inProgressPoints: number;
  notStartedPoints: number;
  /** Pendentes na simulação (não concluídos, inclui backlog) */
  open: number;
  /** Tickets que saíram de "A Fazer" e ainda não estão "Feito" */
  inProgress: number;
  /** Tickets ainda em "A Fazer" */
  notStarted: number;
  /** Progresso real: feitos / total */
  completionPct: number;
  unlocked: boolean;
  /** Duração projetada do bloco (tickets ÷ velocidade) */
  projectedDurationDays: number;
  estimatedDaysRemaining: number;
  projectedStartDate: string;
  projectedEndDate: string;
};

export type ProjectionTimeline = {
  projectStartDate: string;
  estimatedEndDate: string;
  optimisticEndDate: string;
  pessimisticEndDate: string;
};

export type ProjectProjection = {
  projectKey: string;
  projectName: string;
  generatedAt: string;
  unit: ProjectionUnit;
  overall: {
    total: number;
    done: number;
    open: number;
    completionPct: number;
    totalPoints: number;
    donePoints: number;
    openPoints: number;
    completionPctPoints: number;
  };
  velocity: {
    throughputPerDay: number;
    unit: ProjectionUnit;
    medianDaysToResolve: number;
    medianCycleDays: number;
    sampleSize: number;
    windowDays: number;
    /** Story points entregues na janela (apenas modo storyPoints) */
    pointsDelivered?: number;
  };
  timeline: ProjectionTimeline;
  projection: {
    optimisticDate: string;
    estimatedDate: string;
    pessimisticDate: string;
    remainingDays: number;
    activeSprints: number;
  };
  sprints: SprintProjection[];
  assumptions: string[];
};

export type CheckoutProjections = {
  tickets: ProjectProjection;
  storyPoints: ProjectProjection;
};
