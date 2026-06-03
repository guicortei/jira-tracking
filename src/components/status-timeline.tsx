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

type StatusTimelineProps = {
  status: string;
};

export function StatusTimeline({ status }: StatusTimelineProps) {
  const normalized = normalizeStatus(status);
  const isBlocked = normalized === "BLOQUEADO";
  const currentIndex = WORKFLOW.findIndex((step) => step.key === normalized);
  const activeStep = currentIndex >= 0 ? WORKFLOW[currentIndex] : null;

  const accent = isBlocked ? "#ef4444" : activeStep?.color ?? "#a1a1aa";
  const accentLight = isBlocked ? "#fef2f2" : activeStep?.light ?? "#f4f4f5";

  return (
    <div
      className="inline-flex w-[290px] flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm"
      title={status}
    >
      <div className="flex w-full items-center">
        {WORKFLOW.map((step, index) => {
          const isDone = !isBlocked && currentIndex > index;
          const isCurrent = !isBlocked && currentIndex === index;
          const isUpcoming = isBlocked || currentIndex < index;
          const lineDone = !isBlocked && currentIndex > index;

          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <div
                title={step.label}
                className="relative z-10 shrink-0 rounded-full transition-all"
                style={{
                  width: isCurrent ? 14 : 10,
                  height: isCurrent ? 14 : 10,
                  backgroundColor: isDone || isCurrent ? step.color : "#e4e4e7",
                  boxShadow: isCurrent
                    ? `0 0 0 3px white, 0 0 0 5px ${step.color}55`
                    : undefined,
                  opacity: isBlocked && isUpcoming ? 0.35 : 1,
                }}
              />

              {index < WORKFLOW.length - 1 && (
                <div
                  className="mx-0.5 h-[3px] min-w-[10px] flex-1 rounded-full"
                  style={{
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
              className="mx-0.5 h-[3px] w-3 shrink-0 rounded-full bg-red-300"
              aria-hidden="true"
            />
            <div
              title="Bloqueado"
              className="relative z-10 shrink-0 rounded-full bg-red-500"
              style={{
                width: 14,
                height: 14,
                boxShadow: "0 0 0 3px white, 0 0 0 5px #ef444455",
              }}
            />
          </>
        )}
      </div>

      <div className="flex justify-center">
        <span
          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
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
