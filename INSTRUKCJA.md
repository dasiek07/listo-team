# Listo Team – zadania i kalendarz zespołu

Aplikacja do rozdzielania zadań i wydarzeń między osoby w firmie. Działa na telefonach (Android, iPhone) i komputerach,
a każda zmiana synchronizuje się na żywo na wszystkich urządzeniach całego zespołu.

**Adres:** https://dasiek07.github.io/listo-team/

## Najważniejsze funkcje

- **Suwak statusu** przy każdym zadaniu: w lewo – *nie zaczęte* (szary), środek – *w trakcie* (żółty), w prawo – *ukończone* (zielony).
  Kliknij lewą/środkową/prawą część albo przeciągnij gałkę.
- **Osoby**: przypisuj zadania (przycisk z awatarem, „Osoby” w formularzu albo wpisz `+Imię` w nazwie). Przypisana osoba dostaje powiadomienie.
- **Zadania i wydarzenia** z godziną lub przedziałem czasu: `jutro 10:00-11:30`, `od 9 do 11`, `pt 14:00 przez 2h`.
- **Kalendarz**: Miesiąc, Tydzień, Dzień (siatka godzin), **Zespół** (kolumna dla każdej osoby) i Lista.
  Przeciągnij po pustych godzinach, aby dodać wydarzenie; przeciągnij blok, aby go przenieść (także na inną osobę); dolną krawędź – aby zmienić długość.
- **Kalendarze Google** – zespołowe (widzi każdy) i osobiste (tylko Ty). Przycisk „Kalendarze” pozwala wybrać, co widać w danej chwili.
- **Widoki**: Start, Skrzynka, Dziś, Moje zadania, Zespół (tablica osób + obciążenie na 14 dni), Nadchodzące, Kalendarz, Filtry i etykiety, Raportowanie, Ukończone.
- **Filtr osób** w górnym pasku (Wszyscy / Ja / Nieprzypisane / konkretna osoba) – działa w Dziś, Nadchodzących i Kalendarzu.
- **Powiadomienia push** (także przy zamkniętej aplikacji): przypisanie, zmiana statusu, komentarz, przypomnienie przed godziną zadania.

## Pierwsze uruchomienie (właściciel firmy)

1. Otwórz adres aplikacji → **Rejestracja** → potwierdź e-mail → zaloguj się.
2. Wpisz swoje imię i nazwę firmy → **Utwórz zespół**.
3. **Ustawienia → Zespół → Kopiuj link** i wyślij go współpracownikom. Po założeniu konta dołączą automatycznie.
4. **Ustawienia → Powiadomienia → Włącz** (na każdym urządzeniu osobno).
5. **Ustawienia → Kalendarze** – podłącz kalendarz Google (instrukcja niżej).

## Instalacja na urządzeniach

| Urządzenie | Jak |
|---|---|
| **Android** | Chrome → adres aplikacji → menu ⋮ → **Zainstaluj aplikację**. |
| **iPhone / iPad** | Safari → adres aplikacji → **Udostępnij → Do ekranu początkowego**. Powiadomienia push działają tylko po otwarciu aplikacji z ikony (iOS 16.4+). |
| **Laptop (Windows / Mac)** | Chrome lub Edge → ikona instalacji w pasku adresu. |

## Kalendarz Google – jak podłączyć

1. Na komputerze otwórz **calendar.google.com** → przy kalendarzu **⋮ → Ustawienia i udostępnianie**.
2. Sekcja **Integracja kalendarza** → skopiuj **„Adres prywatny w formacie iCal”** (dla kalendarza publicznego: „Adres publiczny w formacie iCal”).
3. W Listo Team: **Ustawienia → Kalendarze** → wklej link, wybierz **Osobisty** albo **Zespołowy** → **Podłącz**.

Wydarzenia odświeżają się co 15 minut (lub przyciskiem „Odśwież”). Kalendarz osobisty widzi wyłącznie jego właściciel.
Zadanie możesz też dodać do swojego Kalendarza Google przyciskiem w oknie zadania.

## Jak to działa (technicznie)

- Strona: GitHub Pages (pliki z tego repozytorium, budowane przez GitHub Actions).
- Serwer: Supabase (projekt `listo`) – tabele `workspaces`, `ws_members`, `ws_items` (każde zadanie = jeden wiersz), `ws_calendars`,
  `ws_notifications`, `push_subs`, `team_prefs`. Dostęp chronią reguły RLS: każdy widzi tylko zespoły, do których należy.
- Synchronizacja: zmiany wysyłane są jako różnice, a zmiany innych osób przychodzą przez Supabase Realtime. Działa też offline – wysyła po powrocie internetu.
- Powiadomienia: wyzwalacz w bazie tworzy powiadomienie → funkcja **push** (Supabase Edge Function) wysyła Web Push (klucze VAPID w schemacie `private`).
  Przypomnienia wysyła co minutę zadanie `pg_cron`.
- Kalendarze: funkcja **ical** pobiera link iCal z uprawnieniami zalogowanej osoby, a aplikacja rozwija powtarzające się wydarzenia.

Pliki serwera: `supabase/schema.sql` (baza – można uruchamiać wielokrotnie), `supabase/functions/push`, `supabase/functions/ical`.

## Aktualizacje

Każdy *push* na gałąź `main` publikuje nową wersję strony w ciągu ok. 1–2 minut. Telefony pobiorą ją przy następnym uruchomieniu.
Instalator Windows (opcjonalny) budujesz ręcznie: **Actions → Zbuduj Listo Team → Run workflow**.
