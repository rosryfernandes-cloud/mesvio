"use client";

/**
 * Reconhecimento facial no próprio aparelho (tablet ou telemóvel do dono): deteta a cara, calcula a
 * assinatura (128 números) e o "rácio dos olhos" para saber se a pessoa pisca (prova de vida: uma foto
 * no telemóvel não pisca). Nada é enviado a terceiros; os modelos vêm de /models/face (mesvio.pt).
 */

type FaceApi = typeof import("@vladmandic/face-api");
type Point = { x: number; y: number };

let loading: Promise<FaceApi> | null = null;

export function loadFaceEngine(): Promise<FaceApi> {
  loading ??= (async () => {
    const faceapi = await import("@vladmandic/face-api");
    // Escolhe o melhor motor disponível no aparelho (WebGL; senão CPU).
    await (faceapi.tf as unknown as { ready: () => Promise<void> }).ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri("/models/face"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models/face"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models/face"),
    ]);
    return faceapi;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Rácio de abertura de um olho (6 pontos): desce muito quando o olho fecha. */
function eyeRatio(p: Point[]): number {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]));
}

export interface FaceReading {
  descriptor: number[];
  /** Média dos dois olhos. */
  eyes: number;
  /** Tamanho da cara no vídeo (0–1): para pedir para chegar mais perto. */
  size: number;
}

/** Uma leitura do vídeo, ou null se não houver uma cara clara. */
export async function readFace(faceapi: FaceApi, video: HTMLVideoElement): Promise<FaceReading | null> {
  const r = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!r) return null;
  const pts = r.landmarks.positions;
  const eyes = (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2;
  return { descriptor: Array.from(r.descriptor), eyes, size: r.detection.box.width / Math.max(video.videoWidth, 1) };
}

/** Leitura rápida só dos olhos (sem a assinatura): várias por segundo, para não perder um piscar. */
export async function readEyes(faceapi: FaceApi, video: HTMLVideoElement): Promise<{ eyes: number; size: number; yaw: number } | null> {
  const r = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })).withFaceLandmarks();
  if (!r) return null;
  const pts = r.landmarks.positions;
  // Virar a cara: onde está a ponta do nariz (30) entre os dois lados do queixo (0 e 16). De frente ≈ 0,5.
  const span = pts[16].x - pts[0].x;
  const yaw = span > 0 ? (pts[30].x - pts[0].x) / span : 0.5;
  return { eyes: (eyeRatio(pts.slice(36, 42)) + eyeRatio(pts.slice(42, 48))) / 2, size: r.detection.box.width / Math.max(video.videoWidth, 1), yaw };
}

/** Cara virada para um dos lados (prova de vida: uma foto não vira). */
export const TURNED = (yaw: number) => yaw < 0.36 || yaw > 0.64;
export const FRONTAL = (yaw: number) => yaw > 0.42 && yaw < 0.58;

/** Olhos abertos e depois fechados (um piscar), com folga para cada pessoa. */
export const EYES_OPEN = 0.26;
export const EYES_CLOSED = 0.2;
