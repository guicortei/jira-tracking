function hashString(input: string): number {
  const normalized = input.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return hash >>> 0;
}

export function hashStringToHexColor(input: string): string {
  const value = hashString(input) % 0xffffff;
  return `#${value.toString(16).padStart(6, "0")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel)));
  return `#${[r, g, b]
    .map((channel) => clamp(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixChannel(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linear = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export type AssigneeBadgeColors = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

export function getAssigneeBadgeColors(name: string): AssigneeBadgeColors {
  const backgroundColor = hashStringToHexColor(name);
  const [r, g, b] = hexToRgb(backgroundColor);
  const luminance = relativeLuminance(r, g, b);
  const useDarkText = luminance > 0.35;

  const color = useDarkText ? "#18181b" : "#fafafa";
  const borderColor = useDarkText
    ? rgbToHex(
        mixChannel(r, 0, 0.38),
        mixChannel(g, 0, 0.38),
        mixChannel(b, 0, 0.38),
      )
    : rgbToHex(
        mixChannel(r, 255, 0.42),
        mixChannel(g, 255, 0.42),
        mixChannel(b, 255, 0.42),
      );

  return { backgroundColor, color, borderColor };
}
