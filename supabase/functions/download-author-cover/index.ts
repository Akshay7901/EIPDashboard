import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition, content-type',
};

const API_BASE_URL = 'https://api.ethicspress.com';

const safeFilename = (value: string | null) => {
  const cleaned = (value || 'author-reference').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return cleaned || 'author-reference';
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
    if (!ticket) {
      return new Response(JSON.stringify({ error: 'Missing ticket' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metadataResponse = await fetch(
      `${API_BASE_URL}/api/proposals/designer/proposals/${encodeURIComponent(ticket)}/author-cover`,
      { headers: { Authorization: authHeader, Accept: 'application/json' } }
    );

    if (!metadataResponse.ok) {
      const message = await metadataResponse.text();
      return new Response(JSON.stringify({ error: message || 'Could not get image URL' }), {
        status: metadataResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metadata = await metadataResponse.json();
    const imageUrl = metadata?.download_url || metadata?.url || metadata?.presigned_url || metadata?.signed_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'No image URL returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok || !imageResponse.body) {
      return new Response(JSON.stringify({ error: 'Could not download image' }), {
        status: imageResponse.status || 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filename = safeFilename(metadata?.filename || url.searchParams.get('filename'));
    const contentType = imageResponse.headers.get('content-type') || 'application/octet-stream';

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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Download failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});