import imageCompression from 'browser-image-compression';
// The library runs its web worker from a script URL (a CDN by default). Serving
// our bundled copy keeps compression working when the gym has no internet.
import compressionLibUrl from 'browser-image-compression/dist/browser-image-compression.js?url';

/**
 * Client-side image optimisation before anything is uploaded to Supabase
 * Storage, using browser-image-compression
 * (https://github.com/Donaldcwl/browser-image-compression).
 *
 * Every image is resized to fit `maxDimension`, re-encoded as WebP (alpha is
 * kept, so transparent logos stay transparent) and squeezed under `maxSizeMB`.
 * A 4 MB phone photo typically ends up around 40–80 KB as an athlete photo.
 */

export type ImagePreset = 'avatar' | 'product' | 'logo' | 'card';

interface PresetConfig {
  maxDimension: number;
  maxSizeMB: number;
  quality: number;
}

const PRESETS: Record<ImagePreset, PresetConfig> = {
  // Athlete / worker photos — shown at most ~300px wide (display screen included).
  avatar:  { maxDimension: 640,  maxSizeMB: 0.12, quality: 0.82 },
  product: { maxDimension: 1000, maxSizeMB: 0.25, quality: 0.82 },
  logo:    { maxDimension: 512,  maxSizeMB: 0.15, quality: 0.9 },
  // Card backgrounds are printed, so they keep more detail.
  card:    { maxDimension: 1800, maxSizeMB: 0.6,  quality: 0.88 },
};

/** Formats we can't (or shouldn't) re-encode: GIF would lose its animation, SVG is vector. */
const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml']);

export function canOptimize(file: File): boolean {
  return file.type.startsWith('image/') && !SKIP_TYPES.has(file.type);
}

/**
 * Return a smaller WebP version of `file`. Falls back to the original file if
 * it isn't an optimisable image, if compression fails, or if the "optimised"
 * result would somehow be larger.
 */
export async function optimizeImage(file: File, preset: ImagePreset = 'avatar'): Promise<File> {
  if (!canOptimize(file)) return file;
  const cfg = PRESETS[preset];

  try {
    const blob = await imageCompression(file, {
      maxSizeMB: cfg.maxSizeMB,
      maxWidthOrHeight: cfg.maxDimension,
      initialQuality: cfg.quality,
      fileType: 'image/webp',
      useWebWorker: true,
      libURL: compressionLibUrl,
    });
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch (e) {
    console.warn('Image optimisation failed, uploading the original:', e);
    return file;
  }
}

/** "1.2 MB", "84 KB" — for showing how much was saved. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
