export const WORKFLOW = [
  { key: "A FAZER", label: "A fazer", color: "#a8a29e", light: "#f5f5f4" },
  { key: "FAZENDO", label: "Fazendo", color: "#3b82f6", light: "#eff6ff" },
  { key: "EM CODE REVIEW", label: "Code review", color: "#8b5cf6", light: "#f5f3ff" },
  { key: "EM ANALISE", label: "Análise", color: "#f59e0b", light: "#fffbeb" },
  { key: "EM TESTE", label: "Teste", color: "#06b6d4", light: "#ecfeff" },
  { key: "FEITO", label: "Feito", color: "#10b981", light: "#ecfdf5" },
] as const;

export function normalizeStatus(status: string) {
  return status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

export function getStatusSortValue(status: string) {
  const normalized = normalizeStatus(status);
  if (normalized === "BLOQUEADO") return WORKFLOW.length;
  const index = WORKFLOW.findIndex((step) => step.key === normalized);
  return index === -1 ? WORKFLOW.length + 1 : index;
}

type StatusTimelineProps = {
  status: string;
  compact?: boolean;
  /** Uma linha só: trilha + status, para listas densas */
  inline?: boolean;
};

function TimelineTrack({
  status,
  dotSize,
  lineHeight,
  blockedDotSize,
}: {
  status: string;
  dotSize: { current: number; other: number };
  lineHeight: number;
  blockedDotSize: number;
}) {
  const normalized = normalizeStatus(status);
  const isBlocked = normalized === "BLOQUEADO";
  const currentIndex = WORKFLOW.findIndex((step) => step.key === normalized);

  return (
    <div className="flex min-w-0 flex-1 items-center">
      {WORKFLOW.map((step, index) => {
        const isDone = !isBlocked && currentIndex > index;
        const isCurrent = !isBlocked && currentIndex === index;
        const isUpcoming = isBlocked || currentIndex < index;
        const lineDone = !isBlocked && currentIndex > index;
        const size = isCurrent ? dotSize.current : dotSize.other;

        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div
              title={step.label}
              className="relative z-10 shrink-0 rounded-full"
              style={{
                width: size,
                height: size,
                backgroundColor: isDone || isCurrent ? step.color : "#e4e4e7",
                boxShadow: isCurrent
                  ? `0 0 0 2px white, 0 0 0 3px ${step.color}55`
                  : undefined,
                opacity: isBlocked && isUpcoming ? 0.35 : 1,
              }}
            />
            {index < WORKFLOW.length - 1 && (
              <div
                className="mx-px min-w-[4px] flex-1 rounded-full"
                style={{
                  height: lineHeight,
                  backgroundColor: lineDone ? step.color : "#e4e4e7",
                  opacity: isBlocked ? 0.35 : 1,
                }}
              />
            )}
          </div>
        );
      })}
      {isBlocked && (
        <>
          <div
            className="mx-px h-[2px] w-2 shrink-0 rounded-full bg-red-300"
            aria-hidden
          />
          <div
            title="Bloqueado"
            className="shrink-0 rounded-full bg-red-500"
            style={{
              width: blockedDotSize,
              height: blockedDotSize,
              boxShadow: "0 0 0 2px white, 0 0 0 3px #ef444455",
            }}
          />
        </>
      )}
    </div>
  );
}

export function StatusTimeline({
  status,
  compact = false,
  inline = false,
}: StatusTimelineProps) {
  const normalized = normalizeStatus(status);
  const isBlocked = normalized === "BLOQUEADO";
  const currentIndex = WORKFLOW.findIndex((step) => step.key === normalized);
  const activeStep = currentIndex >= 0 ? WORKFLOW[currentIndex] : null;

  const accent = isBlocked ? "#ef4444" : activeStep?.color ?? "#a1a1aa";
  const accentLight = isBlocked ? "#fef2f2" : activeStep?.light ?? "#f4f4f5";

  if (inline) {
    return (
      <div
        className="flex w-full min-w-0 items-center gap-1.5"
        title={status}
      >
        <TimelineTrack
          status={status}
          dotSize={{ current: 8, other: 5 }}
          lineHeight={2}
          blockedDotSize={8}
        />
        <span
          className="max-w-[38%] shrink-0 truncate rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none"
          style={{
            backgroundColor: accentLight,
            color: accent,
            border: `1px solid ${accent}33`,
          }}
        >
          {isBlocked ? "Bloqueado" : activeStep?.label ?? status}
        </span>
      </div>
    );
  }

  return (
    <div
      className={
        compact
          ? "inline-flex w-[248px] flex-col gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 shadow-sm"
          : "inline-flex w-[290px] flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
      }
      title={status}
    >
      <TimelineTrack
        status={status}
        dotSize={{
          current: compact ? 12 : 14,
          other: compact ? 8 : 10,
        }}
        lineHeight={3}
        blockedDotSize={compact ? 12 : 14}
      />

      <div className="flex justify-center">
        <span
          className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full font-semibold ${
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"
          }`}
          style={{
            backgroundColor: accentLight,
            color: accent,
            border: `1px solid ${accent}33`,
          }}
        >
          <span
            className="shrink-0 rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: accent,
            }}
          />
          <span className="truncate">{isBlocked ? "Bloqueado" : status}</span>
        </span>
      </div>
    </div>
  );
}
