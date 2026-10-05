
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Scan, User, CreditCard, Calendar, Phone, MapPin, Search, QrCode,
  Printer, Download, UserPlus, Clock, Mail, IdCard,
  Wifi, CheckCircle2, AlertTriangle, RefreshCw, WifiOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import {
  Athlete, SeanceHistory, listAthletes, findAthleteByRfid, getSessionInfo, recordSeance,
} from '@/lib/api/athletes';
import { describeError } from '@/lib/supabase';
import { useSerialPort } from '@/hooks/useSerialPort';

export const Scanner: React.FC = () => {
  const { toast } = useToast();
  const { language } = useAuth();
  const { t } = useTranslation(language);
  const { startContinuous, stopContinuous, isScanning, error: serialError } = useSerialPort();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [scannedId, setScannedId] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [selectedAthleteSubscription, setSelectedAthleteSubscription] = useState<any | null>(null);
  const [seancesRemaining, setSeancesRemaining] = useState<number | null>(null);
  const [seancesHistory, setSeancesHistory] = useState<any[]>([]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('scanner');
  const [scanMode, setScanMode] = useState<'manual' | 'rfid'>('rfid');
  const [rfidLastUid, setRfidLastUid] = useState('');
  // Door control removed: keep scanning only
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const hiddenFileRef = useRef<HTMLInputElement | null>(null);

  // Load athletes from Supabase
  useEffect(() => {
    const loadAthletes = async () => {
      try {
        setAthletes(await listAthletes());
      } catch (error) {
        console.error('Error loading athletes:', error);
        toast({
          title: t('common.error'),
          description: describeError(error),
          variant: "destructive",
        });
      }
    };
    loadAthletes();
  }, [toast]);

  // ── RFID continuous mode ───────────────────────────────────────────────────
  // After scanning: look up athlete → check subscription → auto open/deny door
  const handleRfidUid = useCallback(async (uid: string) => {
    setRfidLastUid(uid);
    const found = (await findAthleteByRfid(uid)) ?? undefined;

    if (!found) {
      // ── Card not linked to any athlete ─────────────────────────────────
      setSelectedAthlete(null);
      toast({
        title: '🚫 Unknown Card',
        description: `UID ${uid} is not linked to any athlete.`,
        variant: 'destructive',
      });
      return;
    }

    setSelectedAthlete(found);

    // ── Check subscription status ──────────────────────────────────────
    const expiry = found.subscription_expiry;
    const today = new Date();

    if (!expiry) {
      // No subscription at all
      toast({
        title: '🚫 Access denied — No subscription',
        description: `${found.full_name} has no active subscription.`,
        variant: 'destructive',
      });
      return;
    }

    const expiryDate = new Date(expiry);
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);

    if (daysLeft < 0) {
      // ── Expired ────────────────────────────────────────────────────────
      toast({
        title: '🚫 Access denied — Subscription expired',
        description: `${found.full_name} expired on ${expiryDate.toLocaleDateString('fr-FR')}.`,
        variant: 'destructive',
      });
      return;
    }

    // ── Check for session-based subscriptions ─────────────────────────
    const sessionInfo = await getSessionInfo(found.id);
    const latestSubWithSessions = sessionInfo?.subscription ?? null;

    // If session-based subscription exists, check sessions
    if (sessionInfo && latestSubWithSessions) {
      const history = sessionInfo.history;
      const remaining = sessionInfo.remaining;

      if (remaining <= 0) {
        toast({
          title: '🚫 Access denied — No sessions left',
          description: `${found.full_name} has used all sessions.`,
          variant: 'destructive',
        });
        return;
      }

      // ── Check if session was already used today ──────────────────────
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todaySession = history.find((h) => {
        const usedDate = new Date(h.used_at);
        usedDate.setHours(0, 0, 0, 0);
        return usedDate.getTime() === today.getTime();
      });

      if (todaySession) {
        // ── Already used today → Allow access but don't deduct ─────────
        toast({
          title: '✅ Access granted (courtesy)',
          description: `${found.full_name} - Session already used today. Available again tomorrow.`,
        });
        
        // Still open the door
        // Courtesy door-opening removed; keep only scanning and messaging.
        console.log('Courtesy access: door-opening disabled in this build for', found.first_name);
        return;
      }

      // Session exists → deduct 1 session and open door
      const newRemaining = remaining - 1;
      try {
        await recordSeance({
          athleteId: found.id,
          athleteSubscriptionId: latestSubWithSessions.id,
          seancesRemaining: newRemaining,
          notes: 'Auto-deducted by RFID scan',
        });
        console.log(`📉 Session deducted: ${newRemaining}/${latestSubWithSessions.sessions} remaining for ${found.first_name}`);
      } catch (err) {
        console.error('Failed to record session use:', err);
      }

      // Door-opening removed: only notify via UI/toast
      if (newRemaining === 0) {
        toast({
          title: '⚠️ Last session',
          description: `${found.full_name} - Renewal needed.`,
        });
      } else {
        toast({
          title: '✅ Access recorded',
          description: `Welcome ${found.full_name} — ${newRemaining}/${latestSubWithSessions.sessions} sessions remaining.`,
        });
      }
      return;
    }

    // ── Active or expiring soon → OPEN THE DOOR ────────────────────────
    // Door-opening removed: only notify via toast
    console.log('Access granted (door-opening disabled) for', found.first_name);
    if (daysLeft <= 7) {
      toast({
        title: `⚠️ Expiring soon!`,
        description: `${found.full_name} — ${daysLeft} day(s) remaining.`,
      });
    } else {
      toast({
        title: '✅ Access granted',
        description: `Welcome ${found.full_name} — ${daysLeft} days remaining.`,
      });
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab !== 'scanner') return;
    if (scanMode === 'rfid') {
      startContinuous(handleRfidUid).catch((err) => {
        toast({ title: 'RFID Error', description: err.message, variant: 'destructive' });
      });
    } else {
      stopContinuous();
    }
    return () => { stopContinuous(); };
  }, [scanMode, activeTab]); // eslint-disable-line

  // Stop continuous port when leaving scanner tab
  useEffect(() => {
    if (activeTab !== 'scanner') stopContinuous();
  }, [activeTab]); // eslint-disable-line

  // Door control removed: scanning only

  const handleScan = () => {
    if (!scannedId.trim()) {
      toast({
        title: t('common.error'),
        description: t('scanner.enterValidAthleteId') || "Please enter a valid athlete ID",
        variant: "destructive",
      });
      return;
    }
    
    const athlete = athletes.find(a => a.id === scannedId.toUpperCase());
    if (athlete) {
      setSelectedAthlete(athlete);
      toast({
        title: t('common.success'),
        description: `${athlete.full_name} ${t('scanner.foundSuccess') || 'loaded successfully'}`,
      });
    } else {
      toast({
        title: t('common.error'),
        description: t('scanner.athleteNotFound') || 'No athlete found with this ID',
        variant: "destructive",
      });
    }
    setScannedId('');
    scannerInputRef.current?.focus();
  };

  useEffect(() => {
    const loadSeancesInfo = async () => {
      if (!selectedAthlete) {
        setSelectedAthleteSubscription(null);
        setSeancesRemaining(null);
        setSeancesHistory([]);
        return;
      }

      try {
        const info = await getSessionInfo(selectedAthlete.id);
        if (!info) {
          setSelectedAthleteSubscription(null);
          setSeancesRemaining(null);
          setSeancesHistory([]);
          return;
        }
        setSelectedAthleteSubscription(info.subscription);
        setSeancesHistory(info.history);
        setSeancesRemaining(info.remaining);
      } catch (error) {
        console.error('Failed to load seances info', error);
      }
    };

    loadSeancesInfo();
  }, [selectedAthlete]);

  const filteredAthletes = athletes.filter(athlete =>
    `${athlete.full_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (athlete.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    athlete.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUseSeance = async () => {
    if (!selectedAthlete || !selectedAthleteSubscription || seancesRemaining === null) return;
    if (seancesRemaining <= 0) {
      toast({
        title: t('common.error'),
        description: t('athletes.noSeancesRemaining') || 'No seances remaining',
        variant: 'destructive',
      });
      return;
    }

    try {
      const newRemaining = seancesRemaining - 1;
      await recordSeance({
        athleteId: selectedAthlete.id,
        athleteSubscriptionId: selectedAthleteSubscription.id,
        seancesRemaining: newRemaining,
        notes: '',
      });
      setSeancesRemaining(newRemaining);

      toast({
        title: t('common.success'),
        description: t('scanner.seanceUsedSuccess') || 'Seance used successfully',
      });
    } catch (error) {
      console.error('Failed to use seance', error);
      toast({
        title: t('common.error'),
        description: t('scanner.seanceUseFailed') || 'Failed to use seance',
        variant: 'destructive',
      });
    }
  };

  const generateCard = (athlete: Athlete) => {
    const cardData = {
      athleteId: athlete.id,
      name: `${athlete.full_name}`,
      subscriptionStatus: athlete.subscription_status || 'N/A',
      subscriptionExpiry: athlete.subscription_expiry || 'N/A',
      email: athlete.email,
      phone: athlete.phone,
      generatedAt: new Date().toISOString()
    };
    
    console.log('Carte Générée:', cardData);
    toast({
      title: t('common.success'),
      description: t('scanner.cardGeneratedSuccess')?.replace('{name}', `${athlete.full_name}`) || `Membership card created for ${athlete.full_name}`,
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const openFilePicker = () => {
    if (hiddenFileRef.current) hiddenFileRef.current.click();
  };

  const printCard = (athlete: Athlete | null) => {
    if (!athlete) {
      toast({
        title: t('common.error'),
        description: t('scanner.selectAthleteFirst') || "Please select an athlete first",
        variant: "destructive",
      });
      return;
    }

    // Get the card element and print it
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      const cardHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${t('scanner.cardDetails')} - ${athlete.full_name}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              background-color: #f5f5f5;
            }
            .card {
              width: 400px;
              height: 250px;
              background: linear-gradient(to right, #1a1a1a, #2a2a2a);
              border: 2px solid #D4AF37;
              border-radius: 10px;
              padding: 20px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
              color: #D4AF37;
              margin: 20px auto;
            }
            .card-header {
              text-align: center;
              border-bottom: 1px solid #D4AF37;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .card-header h2 {
              margin: 0;
              font-size: 24px;
            }
            .card-header p {
              margin: 5px 0 0 0;
              font-size: 12px;
              opacity: 0.7;
            }
            .card-info {
              margin-bottom: 10px;
            }
            .card-info h3 {
              margin: 0 0 5px 0;
              font-size: 16px;
            }
            .card-info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
              font-size: 11px;
              margin-bottom: 10px;
            }
            .card-info-grid div {
              display: flex;
              flex-direction: column;
            }
            .card-info-grid label {
              opacity: 0.7;
              font-size: 10px;
            }
            .barcode-zone {
              background-color: white;
              padding: 8px;
              border-radius: 5px;
              text-align: center;
              margin-bottom: 10px;
            }
            .barcode {
              font-family: monospace;
              font-size: 14px;
              font-weight: bold;
              letter-spacing: 2px;
              color: black;
              margin-bottom: 3px;
            }
            .barcode-text {
              font-size: 10px;
              color: #333;
            }
            .card-footer {
              text-align: center;
              border-top: 1px solid #D4AF37;
              padding-top: 5px;
              font-size: 9px;
              opacity: 0.6;
            }
            @media print {
              body { margin: 0; }
              .card { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="card-header">
              <h2>GYM</h2>
              <p>{t('scanner.cardDetails')}</p>
            </div>
            <div class="card-info" style="display:flex;gap:12px;align-items:center">
              ${imageSrc ? `<div style="width:100px;height:100px;border-radius:8px;overflow:hidden"><img src="${imageSrc}" style="width:100%;height:100%;object-fit:cover"/></div>` : `<div style="width:100px;height:100px;border-radius:8px;overflow:hidden;background:#2a2a2a;display:flex;align-items:center;justify-content:center;color:#bfa85a">No Image</div>`}
              <div>
                <h3>${athlete.full_name}</h3>
                <div class="card-info-grid" style="margin-top:8px;">
                  <div>
                    <label>ID:</label>
                    <span>${athlete.id}</span>
                  </div>
                  <div>
                    <label>Téléphone:</label>
                    <span>${athlete.phone || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="barcode-zone">
              <div class="barcode">${athlete.id.split('').map((c: string) => c.charCodeAt(0) % 2 === 0 ? '█' : '░').join('')}</div>
              <div class="barcode-text">${athlete.id}</div>
            </div>
            <div class="card-footer">
              Généré le: ${new Date().toLocaleDateString('fr-FR')}
            </div>
          </div>
        </body>
        </html>
      `;
      printWindow.document.write(cardHTML);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }

    toast({
      title: t('pos.printingInProgress') || 'Printing in progress',
      description: `${t('scanner.cardGeneratedSuccess')?.replace('{name}', `${athlete.full_name}`) || `Membership card for ${athlete.full_name} sent to printer`}`,
    });
  };

  const downloadCard = (athlete: Athlete | null) => {
    if (!athlete) {
      toast({
        title: t('common.error'),
        description: t('scanner.selectAthleteFirst') || "Please select an athlete first",
        variant: "destructive",
      });
      return;
    }

    // Create a canvas-based image of the card and download it
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 800, 0);
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(1, '#2a2a2a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 800, 500);

      // Border
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, 780, 480);

      // Header
      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('GYM', 400, 80);
      
      ctx.font = '20px Arial';
      ctx.fillText('CARTE D\'ADHÉSION', 400, 115);

      // Separator line
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, 140);
      ctx.lineTo(750, 140);
      ctx.stroke();

      // Draw image (left) then draw rest
      function drawRest() {
        // Name
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#D4AF37';
        ctx.fillText(`${athlete.full_name}`, 200, 190);

        // Info grid (ID and Telephone)
        ctx.font = '14px Arial';
        ctx.fillStyle = '#A89968';
        const infos = [
          { label: 'ID:', value: athlete.id },
          { label: 'Téléphone:', value: athlete.phone || 'N/A' }
        ];

        let y = 230;
        for (let i = 0; i < infos.length; i += 2) {
          ctx.fillText(infos[i].label, 200, y);
          ctx.fillStyle = '#D4AF37';
          ctx.fillText(infos[i].value, 300, y);
          ctx.fillStyle = '#A89968';
          
          if (i + 1 < infos.length) {
            ctx.fillText(infos[i + 1].label, 450, y);
            ctx.fillStyle = '#D4AF37';
            ctx.fillText(infos[i + 1].value, 550, y);
            ctx.fillStyle = '#A89968';
          }
          y += 35;
        }

        // Barcode zone (white background)
        ctx.fillStyle = 'white';
        ctx.fillRect(60, 350, 680, 80);

        // Barcode text
        ctx.fillStyle = 'black';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(athlete.id.split('').map((c: string) => c.charCodeAt(0) % 2 === 0 ? '█' : '░').join(''), 400, 400);

        ctx.font = '14px Arial';
        ctx.fillText(athlete.id, 400, 430);

        // Footer
        ctx.fillStyle = '#A89968';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, 400, 480);

        // Download as image
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `carte_${athlete.id}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }, 'image/png');
      }

      if (imageSrc) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 50, 150, 120, 120);
          drawRest();
        };
        img.src = imageSrc;
      } else {
        drawRest();
      }
    }

    toast({
      title: "Carte Téléchargée",
      description: `Carte pour ${athlete.full_name} téléchargée en image`,
    });
  };

  const getStatusBadge = (status: string | undefined, expiryDate: string | undefined, remainingSeances?: number | null) => {
    if (remainingSeances !== undefined && remainingSeances !== null && remainingSeances <= 0) {
      return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">{t('athletes.noSeancesRemaining')}</Badge>;
    }

    if (!expiryDate) {
      return <Badge variant="outline" className="bg-gray-500/20 text-gray-400 border-gray-500/30">{t('workers.inactive')}</Badge>;
    }
    const isExpired = new Date(expiryDate) < new Date();
    if (isExpired) {
      return <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">{t('athletes.expired')}</Badge>;
    }
    return status === 'active' || status === 'Active'
      ? <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">{t('workers.active')}</Badge>
      : <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">{t('workers.inactive')}</Badge>;
  };

  const calculateDaysLeft = (expiryDate: string | undefined) => {
    if (!expiryDate) return 0;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : 0;
  };

  const generateBarcode = (athleteId: string): string => {
    // Generate a simple barcode representation using the athlete ID
    // In production, use a proper barcode library like jsbarcode
    return athleteId.split('').map(char => {
      const code = char.charCodeAt(0);
      return code % 2 === 0 ? '█' : '░';
    }).join('');
  };

  return (
    <div className="min-h-screen bg-gym-black text-gym-gold p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex items-center justify-between animate-slide-up">
          <div>
            <h1 className="text-3xl font-bold gradient-text">{t('pos.barcodeScanner')} &nbsp; - &nbsp; {t('scanner.title')}</h1>
            <p className="text-gym-gold/60 mt-2">{t('scanner.cardDetails') || 'Scan membership cards and create new cards - GYM'}</p>
          </div>
          <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            {t('pos.systemOnline')}
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gym-gray border border-gym-gold/20">
            <TabsTrigger value="scanner" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
              <Scan className="w-4 h-4 mr-2" />
              {t('scanner.title')}
            </TabsTrigger>
            <TabsTrigger value="create" className="data-[state=active]:bg-gym-gold data-[state=active]:text-gym-black">
              <CreditCard className="w-4 h-4 mr-2" />
              {t('scanner.generateCards')}
            </TabsTrigger>
          </TabsList>

          {/* Door control removed: scanning only */}

          {/* Onglet Scanner de Cartes */}
          <TabsContent value="scanner" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Interface Scanner */}
              <Card className="bg-gym-gray border-gym-gold/20 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-gym-gold flex items-center gap-2">
                    <Scan className="w-5 h-5" />
                    {t('pos.barcodeScanner')}
                  </CardTitle>
                  <CardDescription className="text-gym-gold/60">
                    {t('scanner.findAthleteToCreateCard')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Mode toggle */}
                  <div className="flex gap-2 p-1 bg-gym-black/40 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setScanMode('manual')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        scanMode === 'manual' ? 'bg-gym-gold text-gym-black' : 'text-gym-gold/60 hover:text-gym-gold'
                      }`}
                    >
                      <Search className="w-4 h-4" />Manual entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanMode('rfid')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        scanMode === 'rfid' ? 'bg-gym-gold text-gym-black' : 'text-gym-gold/60 hover:text-gym-gold'
                      }`}
                    >
                      <Wifi className="w-4 h-4" />RFID reader
                    </button>
                  </div>

                  {scanMode === 'manual' ? (
                    <>
                      <div className="text-center py-6">
                        <div className="w-24 h-24 bg-gym-gold/10 border-2 border-dashed border-gym-gold/30 rounded-lg mx-auto mb-3 flex items-center justify-center">
                          <QrCode className="w-12 h-12 text-gym-gold/30" />
                        </div>
                        <p className="text-gym-gold/60 text-sm">{t('scanner.positionCard')}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-gym-gold text-sm font-medium">{t('scanner.manualEntryLabel')}</label>
                        <div className="flex gap-2">
                          <Input
                            ref={scannerInputRef}
                            placeholder={t('scanner.enterIdPlaceholder')}
                            value={scannedId}
                            onChange={(e) => setScannedId(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                            className="bg-gym-black border-gym-gold/30 text-gym-gold"
                            autoFocus
                          />
                          <Button onClick={handleScan} className="bg-gym-gold text-gym-black hover:bg-gym-gold/90">
                            <Search className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* RFID mode */
                    <div className="flex flex-col items-center gap-4 py-6">
                      {isScanning ? (
                        <>
                          <div className="relative flex items-center justify-center">
                            <span className="absolute inline-flex h-24 w-24 rounded-full bg-gym-gold/15 animate-ping" />
                            <span className="absolute inline-flex h-16 w-16 rounded-full bg-gym-gold/25 animate-ping" style={{ animationDelay: '0.2s' }} />
                            <div className="relative w-12 h-12 rounded-full bg-gym-gold/20 border-2 border-gym-gold flex items-center justify-center">
                              <Wifi className="w-6 h-6 text-gym-gold" />
                            </div>
                          </div>
                          <p className="text-gym-gold animate-pulse text-sm">RFID reader active — place card on reader</p>
                          {rfidLastUid && <p className="text-gym-gold/50 font-mono text-xs">Last UID: {rfidLastUid}</p>}
                        </>
                      ) : (
                        <>
                          <WifiOff className="w-10 h-10 text-gym-gold/30" />
                          <p className="text-gym-gold/60 text-sm">RFID reader not connected</p>
                          {serialError && <p className="text-red-400 text-xs text-center px-4">{serialError}</p>}
                          <Button onClick={() => startContinuous(handleRfidUid)} className="gym-button">
                            <RefreshCw className="w-4 h-4 mr-2" />Reconnect
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Affichage des Informations de l'Athlète */}
              <Card className="bg-gym-gray border-gym-gold/20 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-gym-gold flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Informations de l'Athlète
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedAthlete ? (
                    <div className="space-y-4">
                      {/* Photo + name + status */}
                      <div className="flex flex-col items-center gap-3 pb-3 border-b border-gym-gold/20">
                        <div className="w-20 h-20 rounded-full border-2 border-gym-gold/40 overflow-hidden bg-gym-gold/10 flex items-center justify-center">
                          {selectedAthlete.photo_url
                            ? <img src={selectedAthlete.photo_url} alt="photo" className="w-full h-full object-cover" />
                            : <User className="w-10 h-10 text-gym-gold/30" />}
                        </div>
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-gym-gold">{selectedAthlete.full_name}</h3>
                          <p className="text-gym-gold/50 text-xs">ID: {selectedAthlete.id}</p>
                          {selectedAthlete.rfid_uid && (
                            <p className="text-gym-gold/50 text-xs font-mono">RFID: {selectedAthlete.rfid_uid}</p>
                          )}
                        </div>
                        {/* Rich subscription status badge */}
                        {(() => {
                          const exp = selectedAthlete.subscription_expiry;
                          const today = new Date();
                          if (!exp) return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">No subscription</Badge>;
                          const expDate = new Date(exp);
                          const daysLeft = Math.ceil((expDate.getTime() - today.getTime()) / 86400000);
                          if (daysLeft < 0) return <Badge className="bg-red-500/20 text-red-400 border border-red-500/30">Expired — {expDate.toLocaleDateString('fr-FR')}</Badge>;
                          if (daysLeft <= 7) return <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30">Expiring soon — {daysLeft}d left</Badge>;
                          return <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">Active — {daysLeft}d left</Badge>;
                        })()}
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gym-gold/50 text-xs">Date of birth:</span><p className="text-gym-gold">{selectedAthlete.date_of_birth || '—'}</p></div>
                        <div><span className="text-gym-gold/50 text-xs">Phone:</span><p className="text-gym-gold">{selectedAthlete.phone || '—'}</p></div>
                        <div><span className="text-gym-gold/50 text-xs">Last payment:</span><p className="text-gym-gold">{selectedAthlete.last_payment ? new Date(selectedAthlete.last_payment).toLocaleDateString('fr-FR') : '—'}</p></div>
                        <div><span className="text-gym-gold/50 text-xs">Expires:</span><p className="text-gym-gold">{selectedAthlete.subscription_expiry ? new Date(selectedAthlete.subscription_expiry).toLocaleDateString('fr-FR') : '—'}</p></div>
                        {seancesRemaining !== null && (
                          <div><span className="text-gym-gold/50 text-xs">Sessions left:</span><p className={seancesRemaining === 0 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{seancesRemaining}</p></div>
                        )}
                      </div>

                      {/* Legacy fields kept */}
                      <div className="flex items-center justify-between">
                        <div></div>
                        {getStatusBadge(selectedAthlete.subscription_status, selectedAthlete.subscription_expiry, seancesRemaining)}
                      </div>

                      {/* Informations de Contact */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-gym-gold">
                          <Mail className="w-4 h-4" />
                          <span>{selectedAthlete.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gym-gold">
                          <Phone className="w-4 h-4" />
                          <span>{selectedAthlete.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gym-gold">
                          <MapPin className="w-4 h-4" />
                          <span>{selectedAthlete.address}</span>
                        </div>
                      </div>

                      {/* Informations d'Adhésion */}
                      <div className="bg-gym-black/50 p-4 rounded-lg space-y-2">
                        <h4 className="font-semibold text-gym-gold">Détails de l'Adhésion</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gym-gold/60">Type:</span>
                            <p className="text-gym-gold font-medium">{selectedAthlete.subscription_status || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gym-gold/60">Expire le:</span>
                            <p className="text-gym-gold font-medium">{selectedAthlete.subscription_expiry ? new Date(selectedAthlete.subscription_expiry).toLocaleDateString('fr-FR') : 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gym-gold/60">Jours restants:</span>
                            <p className={`font-medium ${calculateDaysLeft(selectedAthlete.subscription_expiry) < 7 ? 'text-red-400' : calculateDaysLeft(selectedAthlete.subscription_expiry) > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                              {calculateDaysLeft(selectedAthlete.subscription_expiry)} jours
                            </p>
                          </div>
                          {seancesRemaining !== null && (
                            <div>
                              <span className="text-gym-gold/60">Séances restantes:</span>
                              <p className={`font-medium ${seancesRemaining === 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {seancesRemaining}
                              </p>
                            </div>
                          )}
                          <div>
                            <span className="text-gym-gold/60">Inscription:</span>
                            <p className="text-gym-gold font-medium">{selectedAthlete.last_payment ? new Date(selectedAthlete.last_payment).toLocaleDateString('fr-FR') : 'N/A'}</p>
                          </div>
                        </div>

                        {selectedAthleteSubscription && seancesRemaining !== null && (
                          <div className="mt-4 flex flex-col gap-2">
                            <Button
                              onClick={handleUseSeance}
                              disabled={seancesRemaining <= 0}
                              className="gym-button"
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              {t('scanner.useSeance') || 'Use Seance'}
                            </Button>

                            {seancesRemaining === 0 && (
                              <p className="text-sm text-red-400">{t('athletes.noSeancesRemaining') || 'No seances remaining'}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gym-gold/60">
                      <User className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Scannez une carte pour afficher les informations de l'athlète</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Onglet Créer des Cartes */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recherche d'Athlètes */}
              <Card className="bg-gym-gray border-gym-gold/20 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-gym-gold flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    Rechercher des Athlètes
                  </CardTitle>
                  <CardDescription className="text-gym-gold/60">
                    {t('scanner.findAthleteToCreateCard') || 'Find an athlete to create their membership card'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Rechercher par nom, email ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-gym-black border-gym-gold/30 text-gym-gold"
                  />

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredAthletes.map((athlete) => (
                      <div
                        key={athlete.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedAthlete?.id === athlete.id
                            ? 'border-gym-gold bg-gym-gold/10'
                            : 'border-gym-gold/20 hover:border-gym-gold/40 hover:bg-gym-gold/5'
                        }`}
                        onClick={() => setSelectedAthlete(athlete)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gym-gold">
                              {athlete.full_name}
                            </p>
                            <p className="text-sm text-gym-gold/60">{athlete.email}</p>
                            <p className="text-xs text-gym-gold/40">ID: {athlete.id}</p>
                          </div>
                          {getStatusBadge(athlete.subscription_status, athlete.subscription_expiry)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Aperçu et Génération de Carte */}
              <Card className="bg-gym-gray border-gym-gold/20 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-gym-gold flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    {t('scanner.preview') || 'Card Preview'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedAthlete ? (
                    <div className="space-y-4">
                      {/* Aperçu de la Carte */}
                      <div className="bg-gradient-to-r from-gym-black to-gym-gray border border-gym-gold/30 rounded-lg p-6 shadow-lg relative">
                        {/* En-tête de la Carte */}
                        <div className="text-center mb-4 border-b border-gym-gold/20 pb-4">
                          <h2 className="text-2xl font-bold gradient-text">GYM</h2>
                          <p className="text-gym-gold/60 text-sm">{t('scanner.cardDetails')}</p>
                        </div>

                        {/* Informations du Membre (with image left) */}
                        <div className="space-y-3 mb-4">
                          <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-md overflow-hidden border border-gym-gold/30 bg-gym-gold/5 flex-shrink-0">
                              {imageSrc ? (
                                <img src={imageSrc} alt="athlete" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gym-gold/40">No Image</div>
                              )}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gym-gold">
                                {selectedAthlete.full_name}
                              </h3>
                              <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                                <div>
                                  <span className="text-gym-gold/60">ID:</span>
                                  <p className="text-gym-gold font-mono text-xs">{selectedAthlete.id}</p>
                                </div>
                                <div>
                                  <span className="text-gym-gold/60">Téléphone:</span>
                                  <p className="text-gym-gold text-xs">{selectedAthlete.phone || 'N/A'}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Zone Code-barres */}
                        <div className="bg-white p-4 rounded text-center mb-3">
                          <div className="font-mono text-black text-lg font-bold tracking-widest mb-2">
                            {generateBarcode(selectedAthlete.id)}
                          </div>
                          <p className="text-xs text-gray-600">{selectedAthlete.id}</p>
                        </div>

                        {/* image is rendered inline with member info above */}

                        {/* Pied de Carte */}
                        <div className="text-center mt-4 pt-4 border-t border-gym-gold/20">
                          <p className="text-xs text-gym-gold/40">
                            Généré le: {new Date().toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>

                      {/* Boutons d'Action */}
                      <div>
                        <input ref={hiddenFileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <Button type="button" onClick={openFilePicker} variant="outline" className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10">
                          <UserPlus className="w-4 h-4 mr-1" />
                          Ajouter image
                        </Button>
                        <Button 
                          onClick={() => generateCard(selectedAthlete)}
                          className="bg-gym-gold text-gym-black hover:bg-gym-gold/90"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Générer
                        </Button>
                        <Button 
                          onClick={() => printCard(selectedAthlete)}
                          variant="outline"
                          className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          Imprimer
                        </Button>
                        <Button 
                          onClick={() => downloadCard(selectedAthlete)}
                          variant="outline"
                          className="border-gym-gold/30 text-gym-gold hover:bg-gym-gold/10"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gym-gold/60">
                      <CreditCard className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>{t('scanner.selectAthleteToPreview') || 'Select an athlete to preview their membership card'}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
