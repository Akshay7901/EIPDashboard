import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition, content-type',
};

const API_BASE_URL = 'https://api.ethicspress.com';

const ALLOWED_BINDINGS = new Set(['hb', 'pb', 'ebook']);
const BINDING_LABEL: Record<string, string> = {
  hb: 'hardback',
  pb: 'paperback',
  ebook: 'ebook',
};

const safeFilename = (value: string | null, binding: string) => {
  const base = (value || `${binding}-cover`).replace(/[\\/:*?"<>|]+/g, '-').trim();
  const ext = base.toLowerCase().endsWith('.jpg') || base.toLowerCase().endsWith('.jpeg') ? '' : '.jpg';
  return `${base}${ext}`;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const ticket = url.searchParams.get('ticket');
    const binding = (url.searchParams.get('binding') || '').toLowerCase();

    if (!ticket) {
      return new Response(JSON.stringify({ error: 'Missing ticket' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_BINDINGS.has(binding)) {
      return new Response(JSON.stringify({ error: 'Invalid binding' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ask the EthicsPress API for the presigned cover URL for this binding.
    const coverResponse = await fetch(
      `${API_BASE_URL}/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/cover/${encodeURIComponent(binding)}`,
      { headers: { Authorization: authHeader, Accept: 'application/json' } }
    );

    if (!coverResponse.ok) {
      const message = await coverResponse.text();
      return new Response(JSON.stringify({ error: message || 'Could not get cover URL' }), {
        status: coverResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cover = await coverResponse.json();
    const imageUrl =
      cover?.url || cover?.download_url || cover?.presigned_url || cover?.signed_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'No cover URL returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok || !imageResponse.body) {
      return new Response(JSON.stringify({ error: 'Could not download cover' }), {
        status: imageResponse.status || 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filename = safeFilename(
      cover?.filename || `${ticket}-${BINDING_LABEL[binding]}`,
      binding
    );
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    return new Response(imageResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Download failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
