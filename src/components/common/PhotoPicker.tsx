import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, ImageUp, Trash2, User, X, SwitchCamera, Aperture, Loader2, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ImagePreset, formatBytes, optimizeImage } from '@/lib/imageOptimizer';

interface Props {
  /** Current photo to show (stored URL or a blob: preview). */
  preview: string | null;
  /** Called with the optimised file, or null when the photo is removed. */
  onChange: (file: File | null, previewUrl: string | null) => void;
  t: (key: string) => string;
  preset?: ImagePreset;
}

/**
 * Photo field with two sources — the webcam (captured right here, no extra
 * dialog) or a file from the computer — and automatic size optimisation, so
 * the file handed to `onChange` is already the small WebP that gets uploaded.
 */
export const PhotoPicker: React.FC<Props> = ({ preview, onChange, t, preset = 'avatar' }) => {
  const [cameraOn, setCameraOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ from: number; to: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  // Always release the camera when the form goes away.
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async (idx = deviceIdx) => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    try {
      const deviceId = devices[idx]?.deviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // Device labels are only exposed after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'videoinput'));
    } catch (e) {
      console.warn('Camera error:', e);
      stopCamera();
      toast({ title: t('photo.cameraError'), description: t('photo.cameraErrorDesc'), variant: 'destructive' });
    }
  }, [devices, deviceIdx, stopCamera, t]);

  // Attach the stream once the <video> is mounted.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [cameraOn]);

  const switchCamera = () => {
    const next = (deviceIdx + 1) % devices.length;
    setDeviceIdx(next);
    startCamera(next);
  };

  const accept = async (raw: File) => {
    setBusy(true);
    try {
      const file = await optimizeImage(raw, preset);
      setSaved(file !== raw ? { from: raw.size, to: file.size } : null);
      onChange(file, URL.createObjectURL(file));
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Centre square crop — the photo is shown as a circle/square everywhere.
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    canvas.getContext('2d')!.drawImage(
      video,
      (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side,
      0, 0, side, side,
    );
    stopCamera();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (blob) await accept(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (file) await accept(file);
  };

  const remove = () => {
    setSaved(null);
    onChange(null, null);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Preview / live camera */}
      <div className="relative w-28 h-28 shrink-0 self-center rounded-2xl bg-gym-gold/10 ring-2 ring-gym-gold/30 overflow-hidden">
        {cameraOn ? (
          <>
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
            <span className="pointer-events-none absolute inset-2 rounded-full border-2 border-dashed border-white/50" />
          </>
        ) : preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-10 h-10 text-gym-gold/40" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 text-[10px] text-white">
            <Loader2 className="w-5 h-5 animate-spin" />{t('photo.optimizing')}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-1 space-y-2">
        {cameraOn ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={capture} className="gym-button">
              <Aperture className="w-4 h-4 mr-2" />{t('photo.capture')}
            </Button>
            {devices.length > 1 && (
              <Button type="button" variant="outline" onClick={switchCamera}
                      className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 bg-transparent">
                <SwitchCamera className="w-4 h-4 mr-2" />{t('photo.switchCamera')}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={stopCamera}
                    className="text-gym-gold/70 hover:text-gym-gold hover:bg-gym-gold/10">
              <X className="w-4 h-4 mr-2" />{t('photo.cancel')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => startCamera()} disabled={busy}
                    className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 bg-transparent">
              <Camera className="w-4 h-4 mr-2" />{t('photo.take')}
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}
                    className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 bg-transparent">
              <ImageUp className="w-4 h-4 mr-2" />{t('photo.upload')}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" onClick={remove} disabled={busy}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <Trash2 className="w-4 h-4 mr-2" />{t('photo.remove')}
              </Button>
            )}
          </div>
        )}

        {saved && !cameraOn && (
          <p className="inline-flex items-center gap-1.5 text-xs text-green-400/90 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5" />
            {t('photo.optimized')}: {formatBytes(saved.from)} → {formatBytes(saved.to)}
          </p>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
      </div>
    </div>
  );
};
