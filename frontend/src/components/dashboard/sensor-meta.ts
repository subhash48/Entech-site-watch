import { Activity, Gauge, Volume2, Wind, type LucideIcon } from "lucide-react";
import { sensorType, titleCase } from "@/lib/format";

/** Presentation for each sensor type. Unknown types fall back to a neutral style. */
const KNOWN: Record<string, { icon: LucideIcon; color: string }> = {
  vibration: { icon: Activity, color: "var(--sensor-vibration)" },
  noise: { icon: Volume2, color: "var(--sensor-noise)" },
  dust: { icon: Wind, color: "var(--sensor-dust)" },
};
const FALLBACK_COLORS = ["var(--chart-3)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)"];

export function sensorMeta(sensor: string, index = 0) {
  const type = sensorType(sensor);
  const known = KNOWN[type];
  return {
    type,
    name: titleCase(type),
    icon: known?.icon ?? Gauge,
    color: known?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
  };
}
