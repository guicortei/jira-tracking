import { getAssigneeBadgeColors } from "@/lib/string-color";

type AssigneeBadgeProps = {
  name: string;
  className?: string;
};

export function AssigneeBadge({ name, className = "" }: AssigneeBadgeProps) {
  const colors = getAssigneeBadgeColors(name);

  return (
    <span
      className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-snug ${className}`.trim()}
      style={{
        backgroundColor: colors.backgroundColor,
        color: colors.color,
        borderColor: colors.borderColor,
      }}
      title={name}
    >
      {name}
    </span>
  );
}
