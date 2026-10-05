import { supabase } from '@/lib/supabase';
import { ImagePreset, optimizeImage } from '@/lib/imageOptimizer';

/**
 * The buckets defined in supabase_schema.sql. Keeping them as a union means a
 * typo in a bucket name is a compile error, not a silent upload failure.
 */
export type Bucket =
  | 'athlete-photos'
  | 'worker-photos'
  | 'store-logos'
  | 'card-images'
  | 'product-images'
  | 'documents';

/** How each image bucket is optimised before upload; 'documents' is left untouched. */
const BUCKET_PRESET: Partial<Record<Bucket, ImagePreset>> = {
  'athlete-photos': 'avatar',
  'worker-photos': 'avatar',
  'product-images': 'product',
  'store-logos': 'logo',
  'card-images': 'card',
};

/**
 * Upload a file to a bucket and return the URL to store in the DB.
 *
 * Images are resized and re-encoded to WebP first (see imageOptimizer.ts), so
 * Storage only ever holds the small version. Pass `optimize: false` when the
 * caller has already optimised the file.
 *
 * Public buckets return a plain public URL (works in <img src>). The private
 * 'documents' bucket returns a long-lived signed URL instead, since its objects
 * are not readable without a token.
 *
 * The DB columns (athletes.photo_url, workers.photo_url, …) store this string —
 * never base64, which is what the old IndexedDB version did.
 */
export async function uploadImage(
  bucket: Bucket,
  original: File,
  keyPrefix = '',
  { optimize = true }: { optimize?: boolean } = {},
): Promise<string> {
  const preset = BUCKET_PRESET[bucket];
  const file = optimize && preset ? await optimizeImage(original, preset) : original;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const name = `${keyPrefix}${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(name, file, {
    cacheControl: '31536000', // names are unique UUIDs, so objects never change
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  if (bucket === 'documents') {
    // ~10 years — effectively permanent, but still a signed token.
    const { data, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(name, 60 * 60 * 24 * 3650);
    if (signErr) throw signErr;
    return data.signedUrl;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(name);
  return data.publicUrl;
}

/**
 * Convert a data URL (legacy base64 or a fresh FileReader result) into a File,
 * so existing FileReader-based upload code can move to bucket storage without a
 * rewrite.
 */
export async function dataUrlToFile(dataUrl: string, filename = 'image'): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.split('/')[1] || 'png';
  return new File([blob], `${filename}.${ext}`, { type: blob.type });
}

/**
 * Best-effort delete of a previously uploaded object, given its stored URL.
 * Silently ignores failures — a dangling object is harmless, and blocking a
 * save because cleanup failed would be worse.
 */
export async function deleteByUrl(bucket: Bucket, url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    // Public URLs look like .../object/public/<bucket>/<path>; signed ones
    // .../object/sign/<bucket>/<path>?token=... — the path is between the
    // bucket segment and any query string.
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length).split('?')[0];
    await supabase.storage.from(bucket).remove([decodeURIComponent(path)]);
  } catch {
    /* ignore cleanup failures */
  }
}
