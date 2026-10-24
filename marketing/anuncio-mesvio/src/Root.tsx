import { Composition } from "remotion";
import { Ad } from "./Ad";
import { FPS, TOTAL_FRAMES } from "./script";

export function Root() {
  return (
    <>
      {/* Website / YouTube (16:9) */}
      <Composition id="Mesvio16x9" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      {/* TikTok / Reels / Stories (9:16) */}
      <Composition id="Mesvio9x16" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
    </>
  );
}
