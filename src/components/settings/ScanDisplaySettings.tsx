import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Volume2, MonitorSmartphone, Play, Copy, Check, Wifi } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { VoiceKey, getVoicePrefs, playVoice, setVoicePrefs } from '@/lib/accessVoice';
import {
  isRemoteDisplayEnabled, launchCustomerDisplay, setRemoteDisplayEnabled,
} from '@/lib/customerDisplay';

const TESTS: { key: VoiceKey; label: string; tone: string }[] = [
  { key: 'enter', label: 'scanSettings.enter', tone: 'border-green-500/40 text-green-400 hover:bg-green-500/10' },
  { key: 'not_enter', label: 'scanSettings.notEnter', tone: 'border-red-500/40 text-red-400 hover:bg-red-500/10' },
  { key: 'soon_expire', label: 'scanSettings.soonExpire', tone: 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' },
];

/** Per-device settings for scan feedback: voice messages and the customer display. */
export const ScanDisplaySettings: React.FC = () => {
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const [voice, setVoice] = useState(getVoicePrefs);
  const [remote, setRemote] = useState(isRemoteDisplayEnabled);
  const [copied, setCopied] = useState(false);

  const displayUrl = `${window.location.origin}/display`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the URL is still selectable */
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-gym-gray border-gym-gold/20">
        <CardHeader>
          <CardTitle className="text-gym-gold flex items-center gap-2"><Volume2 className="w-5 h-5" />{t('scanSettings.voiceTitle')}</CardTitle>
          <CardDescription className="text-gym-gold/60">{t('scanSettings.voiceDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="voice-enabled">{t('scanSettings.voiceEnabled')}</Label>
            <Switch
              id="voice-enabled"
              checked={voice.enabled}
              onCheckedChange={(enabled) => setVoice(setVoicePrefs({ enabled }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label>{t('scanSettings.volume')}</Label>
              <span className="text-gym-gold/60 tabular-nums">{Math.round(voice.volume * 100)}%</span>
            </div>
            <Slider
              value={[Math.round(voice.volume * 100)]}
              min={0} max={100} step={5}
              disabled={!voice.enabled}
              onValueChange={([v]) => setVoice(setVoicePrefs({ volume: v / 100 }))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TESTS.map(({ key, label, tone }) => (
              <Button key={key} type="button" variant="outline" onClick={() => playVoice(key, { force: true })}
                      className={`bg-transparent ${tone}`}>
                <Play className="w-4 h-4 me-2" />{t('scanSettings.test')} — {t(label)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gym-gray border-gym-gold/20">
        <CardHeader>
          <CardTitle className="text-gym-gold flex items-center gap-2"><MonitorSmartphone className="w-5 h-5" />{t('scanSettings.displayTitle')}</CardTitle>
          <CardDescription className="text-gym-gold/60">{t('scanSettings.displayDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Button type="button" onClick={() => launchCustomerDisplay(t)} className="gym-button">
              <MonitorSmartphone className="w-4 h-4 me-2" />{t('scanSettings.openDisplay')}
            </Button>
            <p className="text-xs text-gym-gold/50">{t('scanSettings.sameComputerHint')}</p>
          </div>

          <div className="rounded-lg border border-gym-gold/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="remote-display" className="flex items-center gap-2"><Wifi className="w-4 h-4" />{t('scanSettings.remoteTitle')}</Label>
                <p className="text-xs text-gym-gold/50 mt-1">{t('scanSettings.remoteDesc')}</p>
              </div>
              <Switch
                id="remote-display"
                checked={remote}
                onCheckedChange={(on) => { setRemoteDisplayEnabled(on); setRemote(on); }}
              />
            </div>
            {remote && (
              <div className="space-y-1.5 animate-fade-in">
                <Label className="text-xs text-gym-gold/60">{t('scanSettings.displayUrl')}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={displayUrl} className="gym-input font-mono text-sm" onFocus={(e) => e.target.select()} />
                  <Button type="button" variant="outline" onClick={copyUrl}
                          className="border-gym-gold/40 text-gym-gold hover:bg-gym-gold/10 shrink-0">
                    {copied ? <Check className="w-4 h-4 me-2" /> : <Copy className="w-4 h-4 me-2" />}
                    {copied ? t('scanSettings.copied') : t('scanSettings.copy')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
