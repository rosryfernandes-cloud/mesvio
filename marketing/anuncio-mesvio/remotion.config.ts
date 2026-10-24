import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
// Qualidade alta para anúncios (CRF mais baixo = melhor).
Config.setCrf(18);
