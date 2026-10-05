import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { Athlete, listAthletes } from '@/lib/api/athletes';
import { describeError } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

export const Cards: React.FC = () => {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [position, setPosition] = useState<'left'|'right'|'top'|'bottom'>('left');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { language, storeSettings } = useAuth();
  const { t } = useTranslation(language);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await listAthletes();
        if (mounted) setAthletes(items);
      } catch (e) {
        toast({ title: 'Could not load athletes', description: describeError(e), variant: 'destructive' });
      }
    })();
    return () => { mounted = false };
  }, []);

  useEffect(() => {
    renderCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthlete, imageSrc, position]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const renderCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // base card size
    const w = 600;
    const h = 360;
    canvas.width = w;
    canvas.height = h;

    // background
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0,0,w,h);

    // gym name
    const gymName = storeSettings?.name || 'My Gym';
    ctx.fillStyle = '#f3c969';
    ctx.font = '28px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(gymName, 20, 40);

    // athlete info
    const athlete = athletes.find(a => a.id === selectedAthlete);
    const athleteName = athlete ? athlete.full_name : t('print.selectMember') || 'Select Member';
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(athleteName, 20, 90);

    // draw picture if present
    if (imageSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imageSrc;
      img.onload = () => {
        const pw = 140;
        const ph = 140;
        let x = 20;
        let y = 120;
        if (position === 'left') { x = 20; y = 120; }
        if (position === 'right') { x = w - pw - 20; y = 120; }
        if (position === 'top') { x = (w - pw) / 2; y = 60; }
        if (position === 'bottom') { x = (w - pw) / 2; y = h - ph - 30; }

        // rounded image
        const radius = 12;
        ctx.save();
        roundRect(ctx, x, y, pw, ph, radius);
        ctx.clip();
        ctx.drawImage(img, x, y, pw, ph);
        ctx.restore();
      };
    }
  };

  const roundRect = (ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'athlete_card.png';
    link.click();
  };

  const hiddenFileRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = () => {
    if (hiddenFileRef.current) hiddenFileRef.current.click();
  };

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>Print Card</title></head><body style="margin:0;padding:20px;background:#111;color:#fff"><img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:0 auto"/></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold gradient-text">{t('print.print') || 'Create Cards'}</h1>
      </div>

      <form className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="gym-card">
          <CardHeader>
            <CardTitle className="text-gym-gold">{t('print.selectMember') || 'Select Member'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gym-gold">{t('print.selectMember') || 'Select Member'}</Label>
              <Select onValueChange={(v) => setSelectedAthlete(v)}>
                <SelectTrigger className="gym-input mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gym-gray border-gym-gold/30">
                  {athletes.map(a => (
                    <SelectItem key={a.id} value={a.id} className="text-gym-gold hover:bg-gym-gold/10">{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-gym-gold">{t('print.cardImage') || 'Choose Picture'}</Label>
              <input type="file" accept="image/*" onChange={handleFile} className="mt-2 text-sm text-gym-gold" />
            </div>

            <div>
              <Label className="text-gym-gold">{t('print.position') || 'Position'}</Label>
              <div className="flex gap-2 mt-2">
                <Button type="button" onClick={() => setPosition('left')} className={position==='left'? 'gym-button':'gym-button-outline'}>{t('print.left') || 'Left'}</Button>
                <Button type="button" onClick={() => setPosition('right')} className={position==='right'? 'gym-button':'gym-button-outline'}>{t('print.right') || 'Right'}</Button>
                <Button type="button" onClick={() => setPosition('top')} className={position==='top'? 'gym-button':'gym-button-outline'}>{t('print.top') || 'Top'}</Button>
                <Button type="button" onClick={() => setPosition('bottom')} className={position==='bottom'? 'gym-button':'gym-button-outline'}>{t('print.bottom') || 'Bottom'}</Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" onClick={handleDownload} className="gym-button">{t('print.download') || 'Download'}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="gym-card">
          <CardHeader>
            <CardTitle className="text-gym-gold">{t('scanner.preview') || 'Preview'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4">
            <canvas ref={canvasRef} style={{borderRadius:12, maxWidth:'100%'}} />
            <div className="flex gap-2">
              <input ref={hiddenFileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <Button type="button" onClick={openFilePicker} className="gym-button-outline">{t('print.chooseImage') || 'Choose Image'}</Button>
              <Button type="button" onClick={handlePrint} className="gym-button">{t('print.print') || 'Print'}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default Cards;
