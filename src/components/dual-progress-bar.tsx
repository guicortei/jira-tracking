export function stripedGradient(baseColor: string) {
  return `repeating-linear-gradient(
    -45deg,
    ${baseColor},
    ${baseColor} 6px,
    color-mix(in srgb, ${baseColor} 55%, white) 6px,
    color-mix(in srgb, ${baseColor} 55%, white) 12px
  )`;
}

type TicketSegmentFillProps = {
  total: number;
  done: number;
  inProgress: number;
  doneColor: string;
  inProgressColor: string;
  dividerClassName?: string;
};

export function TicketSegmentFill({
  total,
  done,
  inProgress,
  doneColor,
  inProgressColor,
  dividerClassName = "border-zinc-900/15",
}: TicketSegmentFillProps) {
  if (total <= 0) return null;

  const inProgressEnd = done + inProgress;

  return (
    <>
      {Array.from({ length: total }, (_, index) => {
        const isDone = index < done;
        const isInProgress = !isDone && index < inProgressEnd;

        return (
          <div
            key={index}
            className={`h-full min-w-0 flex-1 border-l first:border-l-0 ${dividerClassName}`}
            style={
              isDone
                ? { backgroundColor: doneColor }
                : isInProgress
                  ? {
                      backgroundColor: inProgressColor,
                      backgroundImage: stripedGradient(inProgressColor),
                    }
                  : undefined
            }
          />
        );
      })}
    </>
  );
}

type DualProgressBarProps = {
  total: number;
  done: number;
  inProgress: number;
  doneColor: string;
  inProgressColor: string;
  className?: string;
};

export function DualProgressBar({
  total,
  done,
  inProgress,
  doneColor,
  inProgressColor,
  className = "h-2.5",
}: DualProgressBarProps) {
  if (total <= 0) {
    return <div className={`rounded-full bg-zinc-300 ${className}`} />;
  }

  const inProgressEnd = done + inProgress;

  return (
    <div
      className={`flex overflow-hidden rounded-full bg-zinc-300 ${className}`}
      role="progressbar"
      aria-valuenow={done + inProgress}
      aria-valuemin={0}
      aria-valuemax={total}
      title={`${done} concluídos · ${inProgress} em andamento · ${total - inProgressEnd} a fazer`}
    >
      <TicketSegmentFill
        total={total}
        done={done}
        inProgress={inProgress}
        doneColor={doneColor}
        inProgressColor={inProgressColor}
      />
    </div>
  );
}
