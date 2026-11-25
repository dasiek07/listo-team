// Listo Team – wysyłka powiadomień push (Web Push / VAPID).
// Wywoływana przez bazę (trigger na ws_notifications) z nagłówkiem x-push-secret.
// Wdrożenie: Edge Functions → nowa funkcja „push”, wyłączone „Verify JWT”.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;

Deno.serve(async (req) => {
  try {
    if (!cfg) {
      const { data, error } = await sb.rpc('push_config');
      if (error) throw error;
      cfg = data as Record<string, string>;
      webpush.setVapidDetails(cfg.vapid_subject || 'https://dasiek07.github.io/listo-team/', cfg.vapid_public, cfg.vapid_private);
    }
    if (!cfg?.push_secret || req.headers.get('x-push-secret') !== cfg.push_secret) return new Response('forbidden', { status: 403 });
    const { id } = await req.json();
    const { data: n, error } = await sb.from('ws_notifications').select('id, user_id, kind, task_id, title, body').eq('id', id).single();
    if (error || !n) return new Response('not found', { status: 404 });
    const { data: subs } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('user_id', n.user_id);
    const { count } = await sb.from('ws_notifications').select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).eq('read', false);
    const icon: Record<string, string> = { assigned: '👤 ', status: '🔄 ', done: '✅ ', reminder: '⏰ ', comment: '💬 ', test: '🔔 ' };
    const payload = JSON.stringify({ title: (icon[n.kind] || '') + (n.title || 'Listo Team'), body: n.body || '', taskId: n.task_id, tag: n.task_id ? `${n.kind}-${n.task_id}` : undefined, badge: count || 0 });
    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: n.kind === 'reminder' ? 'high' : 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint);
        else console.error('push error', code, (e as Error).message);
      }
    }));
    return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    cfg = null;
    console.error(e);
    return new Response(String((e as Error)?.message || e), { status: 500 });
  }
});
