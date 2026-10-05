/**
 * useSerialPort — Web Serial API hook for COM4 (9600 baud, 8N1, no flow control)
 *
 * Public APIs:
 *   scanOnce(timeoutMs)        — one-shot scan, returns UID string, rejects on timeout/error
 *   sendAndClose(data)         — open port, write ASCII string, close
 *   sendViaOpenPort(data)      — write through the already-open continuous port if active;
 *                               opens the port (keeping it open) if not yet active.
 *                               NEVER opens a second connection to COM4.
 *   startContinuous(onUid)     — keep port open, fire callback for every UID received
 *   stopContinuous()           — close the continuous port
 *
 * All port operations are async so the React UI never freezes.
 * COM4 settings: 9600 baud, 8 data bits, no parity, 1 stop bit, no flow control.
 */

import { useCallback, useRef, useState } from 'react';

// ── Serial port configuration ────────────────────────────────────────────────
const PORT_OPTIONS: SerialOptions = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};

// Normalise raw bytes into a clean UID string:
// strip whitespace / CR / LF, uppercase, keep only hex-looking chars.
function normaliseUid(raw: string): string {
  return raw.replace(/[\s\r\n]+/g, '').toUpperCase();
}

// Human-readable error messages for common Web Serial failures.
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('already open') || msg.includes('in use')) {
    return 'COM4 is already in use by another application. Close Serial Port Monitor or any other program using COM4 and try again.';
  }
  if (msg.includes('not found') || msg.includes('No port')) {
    return 'COM4 not found. Make sure the RFID reader is connected and the correct port is selected.';
  }
  if (msg.includes('NetworkError') || msg.includes('Failed to open')) {
    return 'Failed to open COM4. Check that the RFID reader is plugged in and no other app is using it.';
  }
  if (msg.includes('SecurityError') || msg.includes('permission')) {
    return 'Serial port access denied. This feature requires Chrome or Edge browser opened via localhost.';
  }
  return `Serial port error: ${msg}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export interface UseSerialPortReturn {
  isScanning: boolean;
  error: string | null;
  scanOnce: (timeoutMs?: number) => Promise<string>;
  sendAndClose: (data: string) => Promise<void>;
  /** Write through the already-open continuous port (if active), or open the port
   *  and keep it open. Never opens a second connection to COM4. */
  sendViaOpenPort: (data: string) => Promise<void>;
  startContinuous: (onUid: (uid: string) => void) => Promise<void>;
  stopContinuous: () => Promise<void>;
}

export function useSerialPort(): UseSerialPortReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Holds the continuously-open port + reader so we can close them later.
  const continuousPort = useRef<SerialPort | null>(null);
  const continuousReader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const continuousRunning = useRef(false);

  // ── Helper: get a port object for COM4 ────────────────────────────────────
  // First checks getPorts() for a previously-authorized port (no dialog).
  // Falls back to requestPort() which shows the browser picker only if needed.
  const getPort = useCallback(async (): Promise<SerialPort> => {
    if (!('serial' in navigator)) {
      throw new Error(
        'SecurityError: Web Serial API is not available. Open the app in Chrome or Edge via localhost.'
      );
    }
    // Check if the user already granted access to a port in a previous session
    const existingPorts = await navigator.serial.getPorts();
    if (existingPorts.length > 0) {
      return existingPorts[0]; // Reuse the first previously-authorized port
    }
    // No previously-authorized port — show the browser picker dialog
    const port = await navigator.serial.requestPort({ filters: [] });
    return port;
  }, []);

  // ── scanOnce ─────────────────────────────────────────────────────────────
  // Opens the port (if not already open), reads one UID, then closes it.
  // If the port is already open (e.g. from a previous session), it reuses it.
  const scanOnce = useCallback(
    async (timeoutMs = 15000): Promise<string> => {
      setError(null);
      setIsScanning(true);
      let port: SerialPort | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let weOpenedPort = false;
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        port = await getPort();

        // Try to open — if already open, this will throw, which is fine
        try {
          await port.open(PORT_OPTIONS);
          weOpenedPort = true;
        } catch (openErr: any) {
          // "InvalidStateError" means the port is already open — reuse it
          if (openErr?.name === 'InvalidStateError' || openErr?.message?.includes('already open')) {
            weOpenedPort = false;
          } else {
            throw openErr;
          }
        }

        const readable = port.readable;
        if (!readable) throw new Error('Port readable stream unavailable');
        reader = readable.getReader();

        const uid = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('TIMEOUT'));
          }, timeoutMs);

          (async () => {
            try {
              while (true) {
                const { value, done } = await reader!.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                // A UID is typically 8 hex chars terminated by CR/LF/space
                const match = buffer.match(/[0-9A-Fa-f]{4,16}/);
                if (match) {
                  clearTimeout(timer);
                  resolve(normaliseUid(match[0]));
                  break;
                }
              }
            } catch (e) {
              clearTimeout(timer);
              reject(e);
            }
          })();
        });

        return uid;
      } catch (err) {
        if (err instanceof Error && err.message === 'TIMEOUT') {
          throw new Error('TIMEOUT');
        }
        const msg = friendlyError(err);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsScanning(false);
        try {
          if (reader) {
            await reader.cancel();
            reader.releaseLock();
          }
        } catch (_) { /* ignore */ }
        // Only close the port if WE opened it (don't close a shared port)
        try {
          if (weOpenedPort && port) await port.close();
        } catch (_) { /* ignore */ }
      }
    },
    [getPort]
  );

  // ── sendAndClose ──────────────────────────────────────────────────────────
  const sendAndClose = useCallback(
    async (data: string): Promise<void> => {
      setError(null);
      let port: SerialPort | null = null;
      let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

      try {
        port = await getPort();
        await port.open(PORT_OPTIONS);

        const writable = port.writable;
        if (!writable) throw new Error('Port writable stream unavailable');
        writer = writable.getWriter();

        const encoder = new TextEncoder();
        await writer.write(encoder.encode(data));
        await writer.close();
      } catch (err) {
        const msg = friendlyError(err);
        setError(msg);
        throw new Error(msg);
      } finally {
        try { writer?.releaseLock(); } catch (_) { /* ignore */ }
        try { if (port) await port.close(); } catch (_) { /* ignore */ }
      }
    },
    [getPort]
  );

  // ── startContinuous ───────────────────────────────────────────────────────
  const startContinuous = useCallback(
    async (onUid: (uid: string) => void): Promise<void> => {
      // Stop any existing continuous session first
      await stopContinuous();

      setError(null);
      setIsScanning(true);
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        const port = await getPort();
        
        // Try to open — if already open, this will throw, which is fine
        try {
          await port.open(PORT_OPTIONS);
        } catch (openErr: any) {
          // "InvalidStateError" means the port is already open — reuse it
          if (!((openErr?.name === 'InvalidStateError' || openErr?.message?.includes('already open')))) {
            throw openErr;
          }
        }
        
        continuousPort.current = port;
        continuousRunning.current = true;

        const readable = port.readable;
        if (!readable) throw new Error('Port readable stream unavailable');
        const reader = readable.getReader();
        continuousReader.current = reader;

        // Run in background — do NOT await this loop
        (async () => {
          try {
            while (continuousRunning.current) {
              const { value, done } = await reader.read();
              if (done || !continuousRunning.current) break;
              buffer += decoder.decode(value, { stream: true });
              const match = buffer.match(/[0-9A-Fa-f]{4,16}/);
              if (match) {
                const uid = normaliseUid(match[0]);
                buffer = buffer.slice(buffer.indexOf(match[0]) + match[0].length);
                onUid(uid);
              }
            }
          } catch (e) {
            if (continuousRunning.current) {
              console.warn('Serial port read error:', e);
              setError(friendlyError(e));
            }
          } finally {
            setIsScanning(false);
          }
        })();
      } catch (err) {
        setIsScanning(false);
        const msg = friendlyError(err);
        setError(msg);
        continuousPort.current = null;
        throw new Error(msg);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getPort]
  );

  // ── stopContinuous ────────────────────────────────────────────────────────
  const stopContinuous = useCallback(async (): Promise<void> => {
    console.log('🛑 Stopping continuous serial port');
    continuousRunning.current = false;
    setIsScanning(false);
    
    try {
      if (continuousReader.current) {
        try {
          await continuousReader.current.cancel();
        } catch (_) { /* ignore */ }
        try {
          continuousReader.current.releaseLock();
        } catch (_) { /* ignore */ }
        continuousReader.current = null;
      }
    } catch (_) { /* ignore */ }
    
    try {
      if (continuousPort.current) {
        try {
          await continuousPort.current.close();
        } catch (_) { /* ignore */ }
        continuousPort.current = null;
      }
    } catch (_) { /* ignore */ }
  }, []);

  // ── sendViaOpenPort ───────────────────────────────────────────────────────
  // The Web Serial API exposes readable and writable as INDEPENDENT streams on
  // the same SerialPort object. Writing to port.writable while port.readable is
  // being consumed by the RFID listener loop is fully supported and does NOT
  // require pausing or cancelling the reader.
  //
  // Strategy:
  //   1. If continuousPort is already open  → write through its writable stream.
  //   2. If not open                        → open the port (keep it open so
  //      the RFID listener can still attach later), then write.
  // In both cases we NEVER call port.open() on an already-open port.
  const sendViaOpenPort = useCallback(
    async (data: string): Promise<void> => {
      setError(null);
      const encoder = new TextEncoder();
      let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          let port: SerialPort;

          if (continuousPort.current && continuousRunning.current) {
            // ── Path A: reuse the already-open port ──────────────────────────
            port = continuousPort.current;
            console.log('📤 Using already-open continuous port');
          } else {
            // ── Path B: port not open or not continuous — open it ───────────
            console.log('🔌 Opening new serial port connection');
            
            // First, try to clean up any stuck port
            if (continuousPort.current) {
              try {
                await stopContinuous();
                // Give it a moment to fully close
                await new Promise(resolve => setTimeout(resolve, 50));
              } catch (_) { /* ignore */ }
            }
            
            port = await getPort();
            
            // Try to open — if already open, this will throw, which is fine
            try {
              await port.open(PORT_OPTIONS);
              continuousPort.current = port;
              console.log('✅ Port opened successfully');
            } catch (openErr: any) {
              // "InvalidStateError" means the port is already open — reuse it
              if (!((openErr?.name === 'InvalidStateError' || openErr?.message?.includes('already open')))) {
                throw openErr;
              }
              continuousPort.current = port;
              console.log('✅ Port already open, reusing');
            }
          }

          const writable = port.writable;
          if (!writable) throw new Error('Port writable stream unavailable');

          writer = writable.getWriter();
          
          // Add a timeout wrapper for the write operation
          const writePromise = writer.write(encoder.encode(data));
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Write operation timeout')), 2000)
          );
          
          await Promise.race([writePromise, timeoutPromise]);
          
          // Flush without closing the stream (so the readable side stays intact)
          await writer.releaseLock();
          writer = null;
          
          // Success — break out of retry loop
          console.log('✅ Serial port write successful');
          return;
        } catch (err) {
          retries++;
          console.warn(`⚠️ Serial port write failed (attempt ${retries}/${maxRetries}):`, err);
          
          // On last retry, throw the error
          if (retries >= maxRetries) {
            const msg = friendlyError(err);
            setError(msg);
            // Reset port on failure
            continuousPort.current = null;
            continuousRunning.current = false;
            throw new Error(msg);
          }
          
          // Short delay before retry (exponential backoff)
          const delayMs = 100 * retries;
          console.log(`⏳ Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } finally {
          // Only release lock if we still hold it (error path)
          try { if (writer) writer.releaseLock(); } catch (_) { /* ignore */ }
        }
      }
    },
    [getPort]
  );

  return { isScanning, error, scanOnce, sendAndClose, sendViaOpenPort, startContinuous, stopContinuous };
}
