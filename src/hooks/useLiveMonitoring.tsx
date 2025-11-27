import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface GeneratedSignal {
  strategy_id: string;
  strategy_name: string;
  signal_type: string;
  symbol: string;
  price: number;
  reason: string;
  confidence?: number;
  candle_close_time?: number;
}

interface LiveMonitoringResult {
  success: boolean;
  processed: number;
  generatedSignals: GeneratedSignal[];
  timestamp: string;
}

export const useLiveMonitoring = (enabled: boolean) => {
  const [isActive, setIsActive] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryDelayRef = useRef(30000); // Start with 30s (increased from 10s)
  
  // Signal cache to prevent duplicate toasts
  const shownSignalsRef = useRef<Set<string>>(new Set());

  // Generate unique key for signal deduplication
  const getSignalKey = (signal: GeneratedSignal): string => {
    // Use strategy_id + signal_type + candle_close_time (or timestamp rounded to minute)
    const candleKey = signal.candle_close_time || Math.floor(Date.now() / 60000);
    return `${signal.strategy_id}_${signal.signal_type}_${candleKey}`;
  };

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsActive(false);
      return;
    }

    setIsActive(true);
    
    const checkStrategies = async () => {
      if (inFlight) return;
      
      setInFlight(true);
      
      try {
        const { data, error } = await supabase.functions.invoke<LiveMonitoringResult>(
          'monitor-strategies-realtime',
          {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          }
        );

        if (error) throw error;

        setLastCheck(new Date());
        retryDelayRef.current = 30000; // Reset to 30s on success

        if (data?.generatedSignals && data.generatedSignals.length > 0) {
          // Filter out signals we've already shown
          const newSignals = data.generatedSignals.filter(signal => {
            const key = getSignalKey(signal);
            if (shownSignalsRef.current.has(key)) {
              return false;
            }
            shownSignalsRef.current.add(key);
            return true;
          });

          // Clean old entries (keep last 100)
          if (shownSignalsRef.current.size > 100) {
            const entries = Array.from(shownSignalsRef.current);
            shownSignalsRef.current = new Set(entries.slice(-50));
          }

          // Only show toast for NEW signals
          if (newSignals.length > 0) {
            const signalDetails = newSignals.map(s => 
              `${s.strategy_name}: ${s.signal_type} @ ${s.price.toFixed(2)}`
            ).join('\n');

            toast({
              title: `📊 ${newSignals.length} New Signal(s)`,
              description: signalDetails,
            });
          }
        }
      } catch (error) {
        console.error('[Live Monitoring] Error:', error);
        
        // Exponential backoff: 30s -> 60s -> 120s, max 120s
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 120000);
        
        // Only show error toast once per session
        if (retryDelayRef.current === 60000) {
          toast({
            title: 'Monitoring Error',
            description: 'Retrying with backoff...',
            variant: 'destructive',
          });
        }
        
        // Restart interval with new delay
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(checkStrategies, retryDelayRef.current);
        }
      } finally {
        setInFlight(false);
      }
    };

    // Initial check after 2s delay
    const initialTimeout = setTimeout(checkStrategies, 2000);

    // Set up interval
    intervalRef.current = setInterval(checkStrategies, retryDelayRef.current);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  return {
    isActive,
    lastCheck,
    inFlight,
  };
};
