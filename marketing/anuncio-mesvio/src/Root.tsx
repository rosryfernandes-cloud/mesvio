import { Composition } from "remotion";
import { Ad } from "./Ad";
import { POV_FPS, POV_FRAMES, Pov } from "./pov/Pov";
import { campaignMetadata, CampaignAd, type CampaignProps } from "./v2/CampaignAd";
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
      {/* Campanhas v2: B — bares de praia, A — restaurantes; 9:16 e 16:9; voz Carlos ou Maria */}
      {(["praia", "restaurante"] as const).flatMap((campaign) =>
        (["carlos", "maria"] as const).flatMap((voice) =>
          ([["9x16", 1080, 1920], ["16x9", 1920, 1080]] as const).map(([format, width, height]) => (
            <Composition
              key={`${campaign}-${voice}-${format}`}
              id={`Campanha-${campaign}-${voice}-${format}`}
              component={CampaignAd}
              defaultProps={{ campaign, voice } as CampaignProps}
              calculateMetadata={campaignMetadata}
              durationInFrames={900}
              fps={FPS}
              width={width}
              height={height}
            />
          )),
        ),
      )}
      {/* POV do dono num sábado de agosto (TikTok, 15 s) */}
      <Composition id="MesvioPOV9x16" component={Pov} durationInFrames={POV_FRAMES} fps={POV_FPS} width={1080} height={1920} />
    </>
  );
}
