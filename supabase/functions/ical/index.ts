// Listo Team – pobieranie kalendarza Google (link iCal) w imieniu zalogowanej osoby.
// Adres kalendarza jest czytany z bazy z uprawnieniami użytkownika (RLS) – kalendarz osobisty
// może pobrać tylko jego właściciel, zespołowy – każdy członek zespołu.
// Wdrożenie: Edge Functions → nowa funkcja „ical” (Verify JWT włączone).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { id } = await req.json();
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
    });
    const { data: cal, error } = await sb.from('ws_calendars').select('url').eq('id', id).maybeSingle();
    if (error || !cal) return new Response('Brak dostępu do kalendarza', { status: 404, headers: CORS });
    const url = String(cal.url).replace(/^webcal:\/\//i, 'https://');
    const u = new URL(url);
    if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) return new Response('Niedozwolony adres', { status: 400, headers: CORS });
    const r = await fetch(u.toString(), { headers: { 'User-Agent': 'ListoTeam/1.0 (calendar sync)' }, redirect: 'follow' });
    if (!r.ok) return new Response(`Google odpowiedział: ${r.status}`, { status: 502, headers: CORS });
    const text = await r.text();
    if (text.length > 8_000_000) return new Response('Kalendarz jest zbyt duży', { status: 413, headers: CORS });
    return new Response(text, { headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(String((e as Error)?.message || e), { status: 500, headers: CORS });
  }
});
