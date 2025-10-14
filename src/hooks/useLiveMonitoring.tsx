import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface LiveMonitoringResult {
  success: boolean;
  processed: number;
  generatedSignals: any[];
  timestamp: string;
}

export const useLiveMonitoring = (enabled: boolean) => {
  const [isActive, setIsActive] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryDelayRef = useRef(10000); // Start with 10s

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
        retryDelayRef.current = 10000; // Reset to 10s on success

        if (data?.generatedSignals && data.generatedSignals.length > 0) {
          toast({
            title: '📊 New Signals Generated',
            description: `${data.generatedSignals.length} signal(s) detected`,
          });
        }
      } catch (error) {
        console.error('[Live Monitoring] Error:', error);
        
        // Exponential backoff: 10s -> 20s -> 40s, max 60s
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 60000);
        
        toast({
          title: 'Monitoring Error',
          description: 'Retrying with backoff...',
          variant: 'destructive',
        });
        
        // Restart interval with new delay
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(checkStrategies, retryDelayRef.current);
        }
      } finally {
        setInFlight(false);
      }
    };

    // Initial check
    checkStrategies();

    // Set up interval
    intervalRef.current = setInterval(checkStrategies, retryDelayRef.current);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, inFlight]);

  return {
    isActive,
    lastCheck,
    inFlight,
  };
};
