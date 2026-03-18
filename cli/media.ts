#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

import { resolveEdgeworkApiKey } from '../src/edgework-api-key';

const DEFAULT_EDGE_BASE_URL = 'https://edge.affectively.ai';
const DEFAULT_IMAGE_MODEL = 'ssd-1b-lcm-int8';
const IMAGE_MODEL_FALLBACK_CHAIN = [DEFAULT_IMAGE_MODEL, 'flux-4b'] as const;
const DEFAULT_VIDEO_MODEL = 'ltx-video';
const VIDEO_MODEL_FALLBACK_CHAIN = [
  DEFAULT_VIDEO_MODEL,
  'ltx-2.3',
  'stable-video-diffusion-img2vid-xt',
  'longcat-video',
  'bfs-face-swap-video',
  'smolvlm2-500m-video',
] as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_READINESS_TIMEOUT_MS = 15_000;
const REMOVED_IMAGE_MODEL_ALIASES = new Set([
  'stable-diffusion-xl-base-1.0',
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/bytedance/stable-diffusion-xl-lightning',
  '@cf/lykon/dreamshaper-8-lcm',
  'dreamshaper-8-lcm',
]);

interface CommonCliOptions {
  edgeUrl?: string;
  apiKey?: string;
  userId?: string;
  subscriptionTier?: string;
  json?: boolean;
}

interface ImageCommandOptions {
  prompt: string;
  model?: string;
  size?: string;
  responseFormat?: 'b64_json' | 'url';
  negativePrompt?: string;
  seed?: number;
  out?: string;
}

interface VideoCommandOptions {
  prompt: string;
  model?: string;
  size?: string;
  responseFormat?: 'b64_json' | 'url';
  negativePrompt?: string;
  seed?: number;
  fps?: number;
  numFrames?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  imageUrl?: string;
  out?: string;
}

type ImageCliOptions = ImageCommandOptions & CommonCliOptions;
type VideoCliOptions = VideoCommandOptions & CommonCliOptions;

interface GenerationItem {
  b64Json?: string;
  url?: string;
  revisedPrompt?: string;
}

interface GenerationPayload {
  model?: string;
  requested_model?: string;
  resolved_model?: string;
  inference_mode?: string;
  video?: unknown;
  data?: unknown;
}

interface ModelListEntry {
  id?: string;
  resolved_model?: string;
  ready?: boolean;
  status_code?: string;
  status_message?: string;
}

interface ModelReadinessResult {
  ready: boolean;
  reason?: string;
}

function parseIntegerOptionValue(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${optionName} must be a valid integer`);
  }
  return parsed;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new Error('Edge URL cannot be empty');
  }

  return trimmed.replace(/\/+$/, '');
}

export function resolveEdgeBaseUrl(explicit?: string): string {
  const envUrl =
    process.env.EDGE_URL ||
    process.env.EDGEWORK_BASE_URL ||
    process.env.AFFECTIVELY_EDGE_URL;
  return normalizeBaseUrl(explicit || envUrl || DEFAULT_EDGE_BASE_URL);
}

export function resolveCliUserId(explicit?: string): string | undefined {
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const envUserId = process.env.EDGEWORK_USER_ID || process.env.USER_ID;
  if (typeof envUserId === 'string' && envUserId.trim().length > 0) {
    return envUserId.trim();
  }

  const shellUser = process.env.USER || process.env.LOGNAME;
  if (typeof shellUser === 'string' && shellUser.trim().length > 0) {
    return `${shellUser.trim()}-cli`;
  }

  return undefined;
}

export function stripDataUriPrefix(value: string): string {
  if (!value.startsWith('data:')) {
    return value;
  }

  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) {
    return value;
  }

  return value.slice(commaIndex + 1);
}

export function extractFirstGenerationItem(payload: unknown): GenerationItem | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  if (typeof first !== 'object' || first === null) {
    return null;
  }

  const firstRecord = first as Record<string, unknown>;
  const item: GenerationItem = {
    b64Json:
      typeof firstRecord.b64_json === 'string'
        ? firstRecord.b64_json
        : undefined,
    url: typeof firstRecord.url === 'string' ? firstRecord.url : undefined,
    revisedPrompt:
      typeof firstRecord.revised_prompt === 'string'
        ? firstRecord.revised_prompt
        : undefined,
  };

  if (!item.b64Json && !item.url) {
    return null;
  }

  return item;
}

function buildRequestHeaders(common: CommonCliOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = resolveEdgeworkApiKey(common.apiKey);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const userId = resolveCliUserId(common.userId);
  if (userId) {
    headers['X-User-ID'] = userId;
  }

  if (
    typeof common.subscriptionTier === 'string' &&
    common.subscriptionTier.trim().length > 0
  ) {
    headers['X-Subscription-Tier'] = common.subscriptionTier.trim();
  }

  return headers;
}

function formatErrorPayload(payload: unknown, rawBody: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const message = record.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    const error = record.error;
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      const errorMessage = (error as { message?: unknown }).message;
      if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
        return errorMessage;
      }
    }
  }

  return rawBody || 'Unknown API error';
}

function resolveTimeoutMs(
  envVarName: string,
  fallbackMs: number
): number {
  const value = process.env[envVarName];
  if (!value) {
    return fallbackMs;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return parsed;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function requestGeneration(
  baseUrl: string,
  endpoint: '/v1/images/generations' | '/v1/video/generations',
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<GenerationPayload> {
  const timeoutMs = resolveTimeoutMs(
    'EDGEWORK_MEDIA_TIMEOUT_MS',
    DEFAULT_REQUEST_TIMEOUT_MS
  );
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${endpoint}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
      timeoutMs
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Request to ${endpoint} failed: ${message}`
    );
  }

  const rawBody = await response.text();
  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}): ${formatErrorPayload(
        payload,
        rawBody
      )}`
    );
  }

  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Generation response was not valid JSON');
  }

  return payload as GenerationPayload;
}

function normalizeModelIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateModelReadiness(
  payload: unknown,
  requestedModel: string
): ModelReadinessResult {
  if (typeof payload !== 'object' || payload === null) {
    return {
      ready: false,
      reason: 'Model catalog response was not valid JSON',
    };
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return {
      ready: false,
      reason: 'Model catalog response did not include a data array',
    };
  }

  const normalizedRequested = normalizeModelIdentifier(requestedModel);
  let matched: ModelListEntry | null = null;

  for (const item of data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === 'string' ? record.id : undefined;
    const resolvedModel =
      typeof record.resolved_model === 'string'
        ? record.resolved_model
        : undefined;
    const normalizedId = id ? normalizeModelIdentifier(id) : '';
    const normalizedResolved = resolvedModel
      ? normalizeModelIdentifier(resolvedModel)
      : '';
    if (
      normalizedId === normalizedRequested ||
      normalizedResolved === normalizedRequested
    ) {
      matched = {
        id,
        resolved_model: resolvedModel,
        ready: typeof record.ready === 'boolean' ? record.ready : undefined,
        status_code:
          typeof record.status_code === 'string'
            ? record.status_code
            : undefined,
        status_message:
          typeof record.status_message === 'string'
            ? record.status_message
            : undefined,
      };
      break;
    }
  }

  if (!matched) {
    return {
      ready: false,
      reason: `Model '${requestedModel}' is not listed in /v1/models`,
    };
  }

  if (matched.ready !== true) {
    const statusCode = matched.status_code || 'MODEL_NOT_READY';
    const statusMessage =
      matched.status_message || 'no readiness details available';
    return {
      ready: false,
      reason: `Model '${requestedModel}' is not ready (${statusCode}): ${statusMessage}`,
    };
  }

  return {
    ready: true,
  };
}

function evaluateModelReadinessFromSingleRecord(
  payload: unknown,
  requestedModel: string
): ModelReadinessResult {
  if (typeof payload !== 'object' || payload === null) {
    return {
      ready: false,
      reason: 'Model readiness response was not valid JSON',
    };
  }

  const record = payload as Record<string, unknown>;
  const ready = record.ready;
  if (ready === true) {
    return { ready: true };
  }

  const statusCode =
    typeof record.status_code === 'string'
      ? record.status_code
      : 'MODEL_NOT_READY';
  const statusMessage =
    typeof record.status_message === 'string'
      ? record.status_message
      : 'no readiness details available';

  return {
    ready: false,
    reason: `Model '${requestedModel}' is not ready (${statusCode}): ${statusMessage}`,
  };
}

async function ensureVideoModelReady(
  baseUrl: string,
  headers: Record<string, string>,
  model: string
): Promise<void> {
  const timeoutMs = resolveTimeoutMs(
    'EDGEWORK_MEDIA_READINESS_TIMEOUT_MS',
    DEFAULT_READINESS_TIMEOUT_MS
  );
  const encodedModel = encodeURIComponent(model);
  const modelResponse = await fetchWithTimeout(
    `${baseUrl}/v1/models/${encodedModel}`,
    {
      method: 'GET',
      headers,
    },
    timeoutMs
  );

  const modelRawBody = await modelResponse.text();
  let modelPayload: unknown = null;
  if (modelRawBody) {
    try {
      modelPayload = JSON.parse(modelRawBody) as unknown;
    } catch {
      modelPayload = null;
    }
  }

  if (modelResponse.ok) {
    const readiness = evaluateModelReadinessFromSingleRecord(modelPayload, model);
    if (!readiness.ready) {
      throw new Error(
        `Video generation unavailable: ${readiness.reason || 'model lane unavailable'}`
      );
    }
    return;
  }

  // Backward-compatible fallback for older environments that only expose /v1/models.
  if (modelResponse.status !== 404) {
    throw new Error(
      `Video readiness check failed (${modelResponse.status}): ${formatErrorPayload(
        modelPayload,
        modelRawBody
      )}`
    );
  }

  const response = await fetchWithTimeout(
    `${baseUrl}/v1/models`,
    {
      method: 'GET',
      headers,
    },
    timeoutMs
  );

  const rawBody = await response.text();
  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Video readiness check failed (${response.status}): ${formatErrorPayload(
        payload,
        rawBody
      )}`
    );
  }

  const readiness = evaluateModelReadiness(payload, model);
  if (!readiness.ready) {
    throw new Error(
      `Video generation unavailable: ${readiness.reason || 'model lane unavailable'}`
    );
  }
}

function shouldBypassVideoReadinessFailure(message: string): boolean {
  return (
    message.includes('is not listed in /v1/models') ||
    message.includes('Video generation unavailable:') ||
    message.includes('MODEL_NOT_READY')
  );
}

export async function resolveGenerationBytes(item: GenerationItem): Promise<Buffer> {
  if (typeof item.b64Json === 'string' && item.b64Json.length > 0) {
    return Buffer.from(stripDataUriPrefix(item.b64Json), 'base64');
  }

  if (typeof item.url === 'string' && item.url.length > 0) {
    if (item.url.startsWith('data:')) {
      return Buffer.from(stripDataUriPrefix(item.url), 'base64');
    }

    const response = await fetch(item.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch generated asset URL (${response.status})`);
    }
    const binary = await response.arrayBuffer();
    return Buffer.from(binary);
  }

  throw new Error('Generation response did not include b64_json or url');
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

interface DecodedPngGrayscale {
  width: number;
  height: number;
  grayscale: Float64Array;
}

function decodePngToGrayscale(bytes: Buffer): DecodedPngGrayscale | null {
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (bytes.length < pngSignature.length) {
    return null;
  }
  if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    return null;
  }

  let cursor = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks: Buffer[] = [];

  while (cursor + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(cursor);
    cursor += 4;

    if (cursor + 4 + chunkLength + 4 > bytes.length) {
      return null;
    }

    const chunkType = bytes.subarray(cursor, cursor + 4).toString('ascii');
    cursor += 4;
    const chunkData = bytes.subarray(cursor, cursor + chunkLength);
    cursor += chunkLength;
    cursor += 4; // CRC

    if (chunkType === 'IHDR') {
      if (chunkData.length < 13) {
        return null;
      }
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlaceMethod = chunkData[12];
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (chunkType === 'IEND') {
      break;
    }
  }

  if (width <= 0 || height <= 0) {
    return null;
  }
  if (bitDepth !== 8 || interlaceMethod !== 0) {
    return null;
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bytesPerPixel) {
    return null;
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const scanlineLength = width * bytesPerPixel;
  const expectedMinimumLength = (scanlineLength + 1) * height;
  if (inflated.length < expectedMinimumLength) {
    return null;
  }

  const grayscale = new Float64Array(width * height);
  let offset = 0;
  let previousRow = new Uint8Array(scanlineLength);

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[offset];
    offset += 1;
    const filtered = inflated.subarray(offset, offset + scanlineLength);
    offset += scanlineLength;
    if (filtered.length !== scanlineLength) {
      return null;
    }

    const reconstructed = new Uint8Array(scanlineLength);
    for (let x = 0; x < scanlineLength; x += 1) {
      const raw = filtered[x] ?? 0;
      const left = x >= bytesPerPixel ? reconstructed[x - bytesPerPixel] : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;

      let value = raw;
      if (filterType === 1) {
        value = (raw + left) & 0xff;
      } else if (filterType === 2) {
        value = (raw + up) & 0xff;
      } else if (filterType === 3) {
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else if (filterType !== 0) {
        return null;
      }

      reconstructed[x] = value;
    }

    let pixelOffset = 0;
    for (let x = 0; x < width; x += 1) {
      const red = reconstructed[pixelOffset] ?? 0;
      const green = reconstructed[pixelOffset + 1] ?? 0;
      const blue = reconstructed[pixelOffset + 2] ?? 0;
      grayscale[y * width + x] = 0.299 * red + 0.587 * green + 0.114 * blue;
      pixelOffset += bytesPerPixel;
    }

    previousRow = reconstructed;
  }

  return { width, height, grayscale };
}

interface ImageAnalysisMetrics {
  entropy: number;
  correlationX: number;
  correlationY: number;
}

const STATIC_NOISE_ENTROPY_THRESHOLD = 6.45;
const STATIC_NOISE_CORRELATION_THRESHOLD = 0.95;
const LOW_DETAIL_ENTROPY_FLOOR = 5.8;
const LOW_DETAIL_ENTROPY_CEILING = 6.4;
const LOW_DETAIL_CORRELATION_THRESHOLD = 0.955;

function finalizeCorrelationAccumulator(accumulator: {
  count: number;
  sumA: number;
  sumB: number;
  sumAA: number;
  sumBB: number;
  sumAB: number;
}): number {
  if (accumulator.count === 0) {
    return 0;
  }
  const meanA = accumulator.sumA / accumulator.count;
  const meanB = accumulator.sumB / accumulator.count;
  const cov =
    accumulator.sumAB / accumulator.count - meanA * meanB;
  const varA =
    accumulator.sumAA / accumulator.count - meanA * meanA;
  const varB =
    accumulator.sumBB / accumulator.count - meanB * meanB;
  if (varA <= 0 || varB <= 0) {
    return 0;
  }
  return cov / Math.sqrt(varA * varB);
}

export function analyzePngImage(bytes: Buffer): ImageAnalysisMetrics | null {
  const decoded = decodePngToGrayscale(bytes);
  if (!decoded) {
    return null;
  }

  const { width, height, grayscale } = decoded;
  const histogram = new Array<number>(256).fill(0);
  for (let index = 0; index < grayscale.length; index += 1) {
    const bucket = Math.max(0, Math.min(255, Math.round(grayscale[index] ?? 0)));
    histogram[bucket] += 1;
  }

  let entropy = 0;
  const total = grayscale.length;
  for (const count of histogram) {
    if (count === 0) {
      continue;
    }
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }

  const corrXAccumulator = {
    count: 0,
    sumA: 0,
    sumB: 0,
    sumAA: 0,
    sumBB: 0,
    sumAB: 0,
  };
  const corrYAccumulator = {
    count: 0,
    sumA: 0,
    sumB: 0,
    sumAA: 0,
    sumBB: 0,
    sumAB: 0,
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const first = grayscale[y * width + x] ?? 0;
      const second = grayscale[y * width + x + 1] ?? 0;
      corrXAccumulator.count += 1;
      corrXAccumulator.sumA += first;
      corrXAccumulator.sumB += second;
      corrXAccumulator.sumAA += first * first;
      corrXAccumulator.sumBB += second * second;
      corrXAccumulator.sumAB += first * second;
    }
  }

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const first = grayscale[y * width + x] ?? 0;
      const second = grayscale[(y + 1) * width + x] ?? 0;
      corrYAccumulator.count += 1;
      corrYAccumulator.sumA += first;
      corrYAccumulator.sumB += second;
      corrYAccumulator.sumAA += first * first;
      corrYAccumulator.sumBB += second * second;
      corrYAccumulator.sumAB += first * second;
    }
  }

  return {
    entropy,
    correlationX: finalizeCorrelationAccumulator(corrXAccumulator),
    correlationY: finalizeCorrelationAccumulator(corrYAccumulator),
  };
}

export function isLikelyStaticNoiseMetrics(metrics: ImageAnalysisMetrics): boolean {
  const absCorrX = Math.abs(metrics.correlationX);
  const absCorrY = Math.abs(metrics.correlationY);

  const staticNoise = (
    metrics.entropy >= STATIC_NOISE_ENTROPY_THRESHOLD &&
    absCorrX >= STATIC_NOISE_CORRELATION_THRESHOLD &&
    absCorrY >= STATIC_NOISE_CORRELATION_THRESHOLD
  );

  // Catch low-detail structured artifacts (banding/blur grids) that are not
  // random static but still clearly degraded and unusable.
  const lowDetailStructuredArtifact =
    metrics.entropy >= LOW_DETAIL_ENTROPY_FLOOR &&
    metrics.entropy <= LOW_DETAIL_ENTROPY_CEILING &&
    absCorrX >= LOW_DETAIL_CORRELATION_THRESHOLD &&
    absCorrY >= LOW_DETAIL_CORRELATION_THRESHOLD;

  return staticNoise || lowDetailStructuredArtifact;
}

export function isProceduralVideoPayload(payload: GenerationPayload): boolean {
  if (typeof payload.video !== 'object' || payload.video === null) {
    return false;
  }

  const videoRecord = payload.video as Record<string, unknown>;
  const hasProceduralPipeline =
    typeof videoRecord.pipeline === 'object' && videoRecord.pipeline !== null;
  const hasBranchDiagnostics =
    typeof videoRecord.branch === 'string' ||
    Array.isArray(videoRecord.candidates) ||
    typeof videoRecord.score === 'number';
  if (hasProceduralPipeline || hasBranchDiagnostics) {
    return true;
  }

  const mimeType =
    typeof videoRecord.mime_type === 'string' ? videoRecord.mime_type : '';
  const hasAssetMetadata =
    mimeType.toLowerCase().startsWith('video/') &&
    (typeof videoRecord.num_frames === 'number' ||
      typeof videoRecord.duration_ms === 'number' ||
      typeof videoRecord.width === 'number' ||
      typeof videoRecord.height === 'number');
  if (hasAssetMetadata) {
    return false;
  }
  return false;
}

export function analyzeVideoFirstFrame(
  bytes: Buffer
): ImageAnalysisMetrics | null {
  const scratchDir = mkdtempSync(join(tmpdir(), 'edgework-media-video-'));
  const inputPath = join(scratchDir, 'input.mp4');
  const framePath = join(scratchDir, 'frame0.png');

  try {
    writeFileSync(inputPath, bytes);
    const ffmpegResult = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        '-vf',
        'select=eq(n\\,0)',
        '-vframes',
        '1',
        framePath,
      ],
      { stdio: 'ignore' }
    );

    if (ffmpegResult.status !== 0) {
      return null;
    }

    const frameBytes = readFileSync(framePath);
    return analyzePngImage(frameBytes);
  } catch {
    return null;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

export function writeOutputFile(outputPath: string, bytes: Buffer): string {
  const absoluteOutputPath = resolve(outputPath);
  mkdirSync(dirname(absoluteOutputPath), { recursive: true });
  writeFileSync(absoluteOutputPath, bytes);
  return absoluteOutputPath;
}

export function getImageModelCandidates(requestedModel: string): string[] {
  const sanitizedRequestedModel = requestedModel.trim() || DEFAULT_IMAGE_MODEL;
  const normalizedRequested = sanitizedRequestedModel.toLowerCase();
  if (
    normalizedRequested === DEFAULT_IMAGE_MODEL ||
    normalizedRequested === 'auto'
  ) {
    const ordered = [
      DEFAULT_IMAGE_MODEL,
      ...IMAGE_MODEL_FALLBACK_CHAIN,
    ].map((candidate) => candidate.trim().toLowerCase());
    return [...new Set(ordered)];
  }
  return [sanitizedRequestedModel];
}

export function getVideoModelCandidates(requestedModel: string): string[] {
  const sanitizedRequestedModel = requestedModel.trim() || DEFAULT_VIDEO_MODEL;
  const normalizedRequested = sanitizedRequestedModel.toLowerCase();
  if (
    normalizedRequested === DEFAULT_VIDEO_MODEL ||
    normalizedRequested === 'auto'
  ) {
    const ordered = [
      DEFAULT_VIDEO_MODEL,
      ...VIDEO_MODEL_FALLBACK_CHAIN,
    ].map((candidate) => candidate.trim().toLowerCase());
    return [...new Set(ordered)];
  }
  return [sanitizedRequestedModel];
}

function printModelSummary(payload: GenerationPayload): void {
  const requested = payload.requested_model;
  const resolved = payload.resolved_model;
  const model = payload.model || resolved || requested;

  if (model) {
    console.log(chalk.gray(`Model: ${model}`));
  }
  if (requested && resolved && requested !== resolved) {
    console.log(chalk.gray(`Alias: ${requested} -> ${resolved}`));
  }
}

async function runImageCommand(
  commandOptions: ImageCommandOptions,
  commonOptions: CommonCliOptions
): Promise<void> {
  if (
    commandOptions.responseFormat &&
    commandOptions.responseFormat !== 'b64_json' &&
    commandOptions.responseFormat !== 'url'
  ) {
    throw new Error('--response-format must be b64_json or url');
  }

  const spinner = ora('Generating image...').start();
  try {
    const baseUrl = resolveEdgeBaseUrl(commonOptions.edgeUrl);
    const headers = buildRequestHeaders(commonOptions);
    const requestedModel = commandOptions.model || DEFAULT_IMAGE_MODEL;
    const normalizedRequestedModel = requestedModel.trim().toLowerCase();
    if (REMOVED_IMAGE_MODEL_ALIASES.has(normalizedRequestedModel)) {
      throw new Error(
        `Model '${requestedModel}' was removed because the alias was misleading; use 'flux-4b' or 'ssd-1b-lcm-int8'`
      );
    }
    const modelCandidates = getImageModelCandidates(requestedModel);
    const attemptErrors: string[] = [];
    let payload: GenerationPayload | null = null;
    let usedModel: string | null = null;
    let outputBytes: Buffer | null = null;

    for (const modelCandidate of modelCandidates) {
      try {
        const candidatePayload = await requestGeneration(
          baseUrl,
          '/v1/images/generations',
          {
            prompt: commandOptions.prompt,
            model: modelCandidate,
            n: 1,
            size: commandOptions.size || '512x512',
            response_format: commandOptions.responseFormat || 'b64_json',
            ...(typeof commandOptions.seed === 'number'
              ? { seed: commandOptions.seed }
              : {}),
            ...(commandOptions.negativePrompt
              ? { negative_prompt: commandOptions.negativePrompt }
              : {}),
          },
          headers
        );

        const item = extractFirstGenerationItem(candidatePayload);
        if (!item) {
          attemptErrors.push(
            `${modelCandidate}: Image response contained no usable asset data`
          );
          continue;
        }

        const candidateOutputBytes = await resolveGenerationBytes(item);
        const imageMetrics = analyzePngImage(candidateOutputBytes);
        if (imageMetrics && isLikelyStaticNoiseMetrics(imageMetrics)) {
          attemptErrors.push(
            `${modelCandidate}: static/noise output ` +
              `(entropy=${imageMetrics.entropy.toFixed(3)}, ` +
              `corrX=${imageMetrics.correlationX.toFixed(4)}, ` +
              `corrY=${imageMetrics.correlationY.toFixed(4)})`
          );
          continue;
        }

        payload = candidatePayload;
        usedModel = modelCandidate;
        outputBytes = candidateOutputBytes;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attemptErrors.push(`${modelCandidate}: ${message}`);
      }
    }

    if (!payload || !usedModel || !outputBytes) {
      throw new Error(
        `All image model attempts failed: ${attemptErrors.join(' | ')}`
      );
    }

    const absoluteOutputPath = writeOutputFile(
      commandOptions.out || 'image.png',
      outputBytes
    );
    spinner.succeed(`Image written to ${absoluteOutputPath}`);
    printModelSummary(payload);

    if (commonOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
    }
  } catch (error) {
    spinner.fail('Image generation failed');
    throw error;
  }
}

async function runVideoCommand(
  commandOptions: VideoCommandOptions,
  commonOptions: CommonCliOptions
): Promise<void> {
  if (
    commandOptions.responseFormat &&
    commandOptions.responseFormat !== 'b64_json' &&
    commandOptions.responseFormat !== 'url'
  ) {
    throw new Error('--response-format must be b64_json or url');
  }

  const spinner = ora('Generating video...').start();
  try {
    const baseUrl = resolveEdgeBaseUrl(commonOptions.edgeUrl);
    const headers = buildRequestHeaders(commonOptions);
    const requestedModel = commandOptions.model || DEFAULT_VIDEO_MODEL;
    const modelCandidates = getVideoModelCandidates(requestedModel);
    const attemptErrors: string[] = [];
    let payload: GenerationPayload | null = null;
    let usedModel: string | null = null;
    let outputBytes: Buffer | null = null;

    for (const modelCandidate of modelCandidates) {
      try {
        try {
          await ensureVideoModelReady(baseUrl, headers, modelCandidate);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (shouldBypassVideoReadinessFailure(message)) {
            spinner.info(
              `Readiness gate rejected '${modelCandidate}'; probing video endpoint directly`
            );
          } else {
            throw error;
          }
        }

        const candidatePayload = await requestGeneration(
          baseUrl,
          '/v1/video/generations',
          {
            prompt: commandOptions.prompt,
            model: modelCandidate,
            n: 1,
            size: commandOptions.size || '256x256',
            response_format: commandOptions.responseFormat || 'b64_json',
            ...(typeof commandOptions.seed === 'number'
              ? { seed: commandOptions.seed }
              : {}),
            ...(typeof commandOptions.fps === 'number'
              ? { fps: commandOptions.fps }
              : {}),
            ...(typeof commandOptions.numFrames === 'number'
              ? { num_frames: commandOptions.numFrames }
              : {}),
            ...(typeof commandOptions.durationSeconds === 'number'
              ? { duration_seconds: commandOptions.durationSeconds }
              : {}),
            ...(typeof commandOptions.width === 'number'
              ? { width: commandOptions.width }
              : {}),
            ...(typeof commandOptions.height === 'number'
              ? { height: commandOptions.height }
              : {}),
            ...(commandOptions.negativePrompt
              ? { negative_prompt: commandOptions.negativePrompt }
              : {}),
            ...(commandOptions.imageUrl
              ? { image_url: commandOptions.imageUrl }
              : {}),
          },
          headers
        );

        if (
          candidatePayload.inference_mode &&
          candidatePayload.inference_mode !== 'model_backed'
        ) {
          attemptErrors.push(
            `${modelCandidate}: inference_mode='${candidatePayload.inference_mode}' is not model_backed`
          );
          continue;
        }

        if (isProceduralVideoPayload(candidatePayload)) {
          attemptErrors.push(
            `${modelCandidate}: coordinator returned procedural fallback output`
          );
          continue;
        }

        const item = extractFirstGenerationItem(candidatePayload);
        if (!item) {
          attemptErrors.push(
            `${modelCandidate}: Video response contained no usable asset data`
          );
          continue;
        }

        const bytes = await resolveGenerationBytes(item);
        const frameMetrics = analyzeVideoFirstFrame(bytes);
        if (frameMetrics && isLikelyStaticNoiseMetrics(frameMetrics)) {
          attemptErrors.push(
            `${modelCandidate}: static/noise output ` +
              `(entropy=${frameMetrics.entropy.toFixed(3)}, ` +
              `corrX=${frameMetrics.correlationX.toFixed(4)}, ` +
              `corrY=${frameMetrics.correlationY.toFixed(4)})`
          );
          continue;
        }

        payload = candidatePayload;
        usedModel = modelCandidate;
        outputBytes = bytes;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attemptErrors.push(`${modelCandidate}: ${message}`);
      }
    }

    if (!payload || !usedModel || !outputBytes) {
      throw new Error(
        `All video model attempts failed: ${attemptErrors.join(' | ')}`
      );
    }

    const absoluteOutputPath = writeOutputFile(
      commandOptions.out || 'ltx.mp4',
      outputBytes
    );
    spinner.succeed(`Video written to ${absoluteOutputPath}`);
    printModelSummary(payload);

    if (commonOptions.json) {
      console.log(JSON.stringify(payload, null, 2));
    }
  } catch (error) {
    spinner.fail('Video generation failed');
    throw error;
  }
}

const program = new Command();

program
  .name('edgework media')
  .description(
    'Generate media through the edge OpenAI-compatible API and write files to disk'
  )
  .showHelpAfterError();

program
  .command('image')
  .description('Generate an image and save it to a file')
  .requiredOption('--prompt <text>', 'Prompt to generate image from')
  .option('--model <model>', 'Image model ID', DEFAULT_IMAGE_MODEL)
  .option('--size <size>', 'Image size', '512x512')
  .option('--response-format <format>', 'Response format: b64_json|url', 'b64_json')
  .option('--negative-prompt <text>', 'Negative prompt')
  .option('--seed <number>', 'Deterministic seed', (value) =>
    parseIntegerOptionValue(value, '--seed')
  )
  .option(
    '--edge-url <url>',
    'Edge API base URL (default: EDGE_URL env or https://edge.affectively.ai)'
  )
  .option(
    '--api-key <key>',
    'API key (default env resolution: EDGEWORK_API_KEY, EDGEWORK_API_TOKEN, EW_API_KEY)'
  )
  .option('--user-id <id>', 'Value for X-User-ID header')
  .option('--subscription-tier <tier>', 'Optional X-Subscription-Tier header')
  .option('--json', 'Print raw response JSON')
  .option('-o, --out <file>', 'Output file path', 'image.png')
  .action(async (commandOptions: ImageCliOptions) => {
    const commonOptions: CommonCliOptions = commandOptions;
    await runImageCommand(commandOptions, commonOptions);
  });

program
  .command('video')
  .description('Generate a video and save it to a file')
  .requiredOption('--prompt <text>', 'Prompt to generate video from')
  .option('--model <model>', 'Video model ID', DEFAULT_VIDEO_MODEL)
  .option('--size <size>', 'Video size', '256x256')
  .option('--response-format <format>', 'Response format: b64_json|url', 'b64_json')
  .option('--negative-prompt <text>', 'Negative prompt')
  .option('--seed <number>', 'Deterministic seed', (value) =>
    parseIntegerOptionValue(value, '--seed')
  )
  .option('--fps <number>', 'Frames per second', (value) =>
    parseIntegerOptionValue(value, '--fps')
  )
  .option('--num-frames <number>', 'Number of frames', (value) =>
    parseIntegerOptionValue(value, '--num-frames')
  )
  .option('--duration-seconds <number>', 'Video duration in seconds', (value) =>
    parseIntegerOptionValue(value, '--duration-seconds')
  )
  .option('--width <number>', 'Override width', (value) =>
    parseIntegerOptionValue(value, '--width')
  )
  .option('--height <number>', 'Override height', (value) =>
    parseIntegerOptionValue(value, '--height')
  )
  .option('--image-url <url>', 'Optional image URL for image-to-video generation')
  .option(
    '--edge-url <url>',
    'Edge API base URL (default: EDGE_URL env or https://edge.affectively.ai)'
  )
  .option(
    '--api-key <key>',
    'API key (default env resolution: EDGEWORK_API_KEY, EDGEWORK_API_TOKEN, EW_API_KEY)'
  )
  .option('--user-id <id>', 'Value for X-User-ID header')
  .option('--subscription-tier <tier>', 'Optional X-Subscription-Tier header')
  .option('--json', 'Print raw response JSON')
  .option('-o, --out <file>', 'Output file path', 'ltx.mp4')
  .action(async (commandOptions: VideoCliOptions) => {
    const commonOptions: CommonCliOptions = commandOptions;
    await runVideoCommand(commandOptions, commonOptions);
  });

if (import.meta.main) {
  program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(
      chalk.red('Media generation failed:'),
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  });
}
