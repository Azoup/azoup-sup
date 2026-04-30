import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

// Simple in-memory cache
interface CacheItem {
  data: any;
  timestamp: number;
}
const cache: Record<string, CacheItem> = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Verify authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, payload } = await req.json();

    const digisacUrl = Deno.env.get('DIGISAC_API_URL');
    const digisacToken = Deno.env.get('DIGISAC_API_TOKEN');

    if (!digisacUrl || !digisacToken) {
      return new Response(JSON.stringify({ error: 'Digisac configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fetchDigisac = async (endpoint: string) => {
      const response = await fetch(`${digisacUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${digisacToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        console.error(`Digisac API Error (${endpoint}):`, await response.text());
        throw new Error(`Failed to fetch from Digisac: ${response.statusText}`);
      }
      return response.json();
    };

    if (action === 'geral' || action === 'analistas') {
      // Check cache first
      const cacheKey = 'tickets_data';
      let tickets = [];
      let users = [];

      if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL_MS) {
        console.log("Serving from cache");
        tickets = cache[cacheKey].data.tickets;
        users = cache[cacheKey].data.users;
      } else {
        console.log("Fetching fresh data from Digisac");
        // Digisac typically returns paginated data, assuming we fetch recent tickets.
        // For demonstration, we fetch the default first page of tickets. In a real scenario, you'd iterate pagination or filter by date.
        const ticketsRes = await fetchDigisac('/tickets?where[isOpen]=false'); // Example query for closed tickets, adjust based on actual API
        const usersRes = await fetchDigisac('/users');
        
        tickets = ticketsRes.data || [];
        users = usersRes.data || [];

        cache[cacheKey] = {
          data: { tickets, users },
          timestamp: Date.now()
        };
      }

      // Fetch mappings from DB
      const { data: mappings, error: mappingError } = await supabaseClient
        .from('digisac_analyst_mapping')
        .select(`
          digisac_user_id,
          analysts(id, name)
        `);

      if (mappingError) {
        throw new Error('Failed to fetch analyst mappings');
      }

      // Process Data
      let totalTickets = 0;
      let totalTmaMinutes = 0;
      let ticketsWithTmaCount = 0;

      const analistasStats: Record<string, { id: string, name: string, total: number, tma_minutes: number, closed_count: number }> = {};

      // Initialize mapped analysts
      mappings?.forEach((m: any) => {
        if (m.analysts) {
           analistasStats[m.digisac_user_id] = {
             id: m.analysts.id,
             name: m.analysts.name,
             total: 0,
             tma_minutes: 0,
             closed_count: 0
           };
        }
      });

      tickets.forEach((ticket: any) => {
        totalTickets++;
        
        // Calculate TMA
        if (ticket.createdAt && ticket.closedAt) {
           const opened = new Date(ticket.createdAt).getTime();
           const closed = new Date(ticket.closedAt).getTime();
           const diffMinutes = (closed - opened) / 60000;
           
           if (diffMinutes > 0) {
             totalTmaMinutes += diffMinutes;
             ticketsWithTmaCount++;

             const userId = ticket.userId || ticket.ownerId; // Adjust based on Digisac ticket structure
             if (userId && analistasStats[userId]) {
               analistasStats[userId].total++;
               analistasStats[userId].closed_count++;
               analistasStats[userId].tma_minutes += diffMinutes;
             }
           }
        } else {
           const userId = ticket.userId || ticket.ownerId;
           if (userId && analistasStats[userId]) {
             analistasStats[userId].total++;
           }
        }
      });

      const tmaGeral = ticketsWithTmaCount > 0 ? (totalTmaMinutes / ticketsWithTmaCount) : 0;

      if (action === 'geral') {
        return new Response(JSON.stringify({
          total_chamados: totalTickets,
          tma_geral_minutos: tmaGeral
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (action === 'analistas') {
        const result = Object.values(analistasStats).map(stat => ({
          analyst_id: stat.id,
          name: stat.name,
          total_chamados: stat.total,
          tma_minutos: stat.closed_count > 0 ? (stat.tma_minutes / stat.closed_count) : 0
        }));

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'listar_digisac_users') {
      const usersRes = await fetchDigisac('/users');
      return new Response(JSON.stringify(usersRes.data || []), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
