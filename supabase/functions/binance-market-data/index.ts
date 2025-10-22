// This function is disabled: Binance integration removed. Keeping file to avoid deployment references.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
serve((_req) => new Response(JSON.stringify({ success: false, error: 'Binance integration disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 410 }));
