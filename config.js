// Ustawienia serwera synchronizacji zespołu (Supabase) i powiadomień push.
// Klucz „publishable/anon” jest publiczny z założenia: dostęp do danych chronią reguły RLS w bazie
// (każdy widzi tylko zespoły, do których należy). Nigdy nie wpisuj tu klucza „service_role”.
window.LISTO_CONFIG = {
  supabaseUrl: 'https://rymgdbonnfrzlsyfdsgb.supabase.co',
  supabaseKey: 'sb_publishable_qhCnlZ-73yDz5fT8tFaHwQ_cef_Gg_h',
  siteUrl: 'https://dasiek07.github.io/listo-team/',
  vapidPublic: 'BIzwD4WK0Nva0mvRnYgk8zXNvNyIhyYFvOjvRv18r6x5UcyFsBPNOTTXG9Juriy-N-aUUSk__8sJzdM9FZdXoPI',
};
