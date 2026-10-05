/**
 * useRfidManager Hook
 * Provides simplified RFID scanning management with auto-save capabilities
 * Handles: scanning, validation, storage, and display state management
 */

import { useState, useCallback, useEffect } from 'react';
import { useSerialPort } from './useSerialPort';
import { setAthleteRfid, getAthleteRfid } from '@/lib/api/athletes';

export type RfidState = 'idle' | 'scanning' | 'success' | 'timeout' | 'error';

export interface UseRfidManagerReturn {
  rfidUid: string;
  rfidState: RfidState;
  rfidError: string;
  isRfidChanged: boolean;
  setRfidUid: (uid: string) => void;
  handleScanRfid: () => Promise<void>;
  clearRfid: () => void;
  resetState: () => void;
  saveRfidToAthlete: (athleteId: string) => Promise<void>;
  loadRfidFromAthlete: (athleteId: string) => Promise<string>;
}

export function useRfidManager(initialRfid?: string, originalRfid?: string): UseRfidManagerReturn {
  const { scanOnce } = useSerialPort();
  
  const [rfidUid, setRfidUid] = useState(initialRfid || '');
  const [rfidState, setRfidState] = useState<RfidState>('idle');
  const [rfidError, setRfidError] = useState('');
  const [isRfidChanged, setIsRfidChanged] = useState(false);

  // Track if RFID has changed from original
  useEffect(() => {
    if (originalRfid) {
      setIsRfidChanged(rfidUid !== originalRfid);
    }
  }, [rfidUid, originalRfid]);

  /**
   * Scan RFID card from serial port
   */
  const handleScanRfid = useCallback(async () => {
    setRfidState('scanning');
    setRfidError('');
    
    try {
      const uid = await scanOnce(15000);
      
      // Validate UID format (should be hex string)
      if (!uid || !/^[0-9A-Fa-f]{1,}$/.test(uid)) {
        throw new Error('Invalid RFID card format');
      }

      const normalizedUid = uid.toUpperCase();
      setRfidUid(normalizedUid);
      setRfidState('success');
      setIsRfidChanged(true);
      
      // Auto-clear success state after 3 seconds
      setTimeout(() => {
        if (rfidState === 'success') {
          setRfidState('idle');
        }
      }, 3000);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      
      if (message === 'TIMEOUT') {
        setRfidState('timeout');
        setRfidError('No card detected — timeout after 15s. Place the card on the reader and retry.');
      } else {
        setRfidState('error');
        setRfidError(message);
      }
      
      // Auto-clear error state after 5 seconds
      setTimeout(() => {
        setRfidState('idle');
      }, 5000);
    }
  }, [scanOnce, rfidState]);

  /**
   * Clear current RFID UID
   */
  const clearRfid = useCallback(() => {
    setRfidUid('');
    setRfidState('idle');
    setRfidError('');
  }, []);

  /**
   * Reset RFID state to initial values
   */
  const resetState = useCallback(() => {
    setRfidUid(initialRfid || '');
    setRfidState('idle');
    setRfidError('');
    setIsRfidChanged(false);
  }, [initialRfid]);

  /**
   * Save RFID UID to athlete record in database
   */
  const saveRfidToAthlete = useCallback(async (athleteId: string) => {
    if (!athleteId) {
      throw new Error('Athlete ID is required');
    }

    try {
      // Normalize/validate before sending to API
      const normalized = (rfidUid || '').toString().replace(/[^0-9A-Fa-f]/g, '').trim().toUpperCase();
      if (normalized.length === 0) {
        // clearing the RFID is allowed
        await setAthleteRfid(athleteId, null);
      } else {
        await setAthleteRfid(athleteId, normalized);
      }
      setIsRfidChanged(false);
      setRfidState('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRfidError(message);
      setRfidState('error');
      throw err;
    }
  }, [rfidUid]);

  /**
   * Load RFID UID from athlete record
   */
  const loadRfidFromAthlete = useCallback(async (athleteId: string) => {
    if (!athleteId) {
      throw new Error('Athlete ID is required');
    }

    try {
      const uid = await getAthleteRfid(athleteId);
      setRfidUid(uid);
      return uid;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRfidError(message);
      throw err;
    }
  }, []);

  return {
    rfidUid,
    rfidState,
    rfidError,
    isRfidChanged,
    setRfidUid,
    handleScanRfid,
    clearRfid,
    resetState,
    saveRfidToAthlete,
    loadRfidFromAthlete,
  };
}
