import { useVideoConfig } from "remotion";

/** Formato atual: vertical (9:16) ou horizontal (16:9), e uma unidade proporcional (1 = 1 px a 1080 de lado menor). */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const u = Math.min(width, height) / 1080;
  return { width, height, vertical, u };
}
