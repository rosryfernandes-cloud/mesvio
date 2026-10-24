import { Composition } from "remotion";
import { Ad } from "./Ad";
import { POV_FPS, POV_FRAMES, Pov } from "./pov/Pov";
import { FPS, TOTAL_FRAMES } from "./script";

export function Root() {
  return (
    <>
      {/* Website / YouTube (16:9) */}
      <Composition id="Mesvio16x9" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      {/* TikTok / Reels / Stories (9:16) */}
      <Composition id="Mesvio9x16" component={Ad} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
      {/* Com som PROVISÓRIO (voz sintética + efeitos), para avaliar o ritmo */}
      <Composition id="Mesvio16x9ComSom" component={Ad} defaultProps={{ sound: true }} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Mesvio9x16ComSom" component={Ad} defaultProps={{ sound: true }} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} />
      {/* POV do dono num sábado de agosto (TikTok, 15 s) */}
      <Composition id="MesvioPOV9x16" component={Pov} durationInFrames={POV_FRAMES} fps={POV_FPS} width={1080} height={1920} />
    </>
  );
}
