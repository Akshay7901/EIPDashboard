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

const filenameFromContentDisposition = (value: string | null): string | null => {
  if (!value) return null;
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/['"]/g, ''));
  const filenameMatch = value.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ? filenameMatch[1].trim() : null;
};

const safeFilename = (value: string | null, ticket: string, binding: string) => {
  const base = (value || `${ticket}-${BINDING_LABEL[binding]}`).replace(/[\\/:*?"<>|]+/g, '-').trim();
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

    // Proxy the EthicsPress download endpoint server-side. A server-side fetch
    // follows any 302 redirect to S3 and reads the bytes without the browser's
    // cross-origin (CORS) restrictions that block the same call from the client.
    const downloadResponse = await fetch(
      `${API_BASE_URL}/api/proposals/${encodeURIComponent(ticket)}/designer-covers/${encodeURIComponent(binding)}/download`,
      {
        method: 'GET',
        headers: { Authorization: authHeader, Accept: 'image/*, application/octet-stream, */*' },
        redirect: 'follow',
      }
    );

    if (!downloadResponse.ok || !downloadResponse.body) {
      const message = await downloadResponse.text();
      return new Response(JSON.stringify({ error: message || 'Could not download cover' }), {
        status: downloadResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filename =
      filenameFromContentDisposition(downloadResponse.headers.get('content-disposition')) ||
      safeFilename(null, ticket, binding);
    const contentType =
      downloadResponse.headers.get('content-type') || 'image/jpeg';

    return new Response(downloadResponse.body, {
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
