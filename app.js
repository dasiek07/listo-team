'use strict';
(() => {
// ================================================================
//  Stałe
// ================================================================
const KEY = 'listo-data-v2';
var seeded = false; // true, gdy na tym urządzeniu nie było jeszcze danych (świeży start)
var CUR_UID = null;  // identyfikator zalogowanej osoby (ustawiany po zalogowaniu)
const PL_DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const PL_DAYS_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const PL_MON = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const PL_MON_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const PRIO = { 1: '#d1453b', 2: '#eb8909', 3: '#246fe0' };
const COLORS = [
  ['Czerwony', '#db4035'], ['Pomarańczowy', '#ff9933'], ['Żółty', '#fad000'], ['Oliwkowy', '#afb83b'],
  ['Limonkowy', '#7ecc49'], ['Zielony', '#299438'], ['Miętowy', '#6accbc'], ['Turkusowy', '#158fad'],
  ['Błękitny', '#14aaf5'], ['Jasnoniebieski', '#96c3eb'], ['Niebieski', '#4073ff'], ['Winogronowy', '#884dff'],
  ['Fioletowy', '#af38eb'], ['Lawendowy', '#eb96eb'], ['Malinowy', '#e05194'], ['Łososiowy', '#ff8d85'],
  ['Szary', '#808080'], ['Taupe', '#ccac93'],
];
// ustawienia – obecny wygląd i zachowanie to wartości domyślne
const PREF_DEFAULTS = {
  startView: 'home', density: 'normal', scale: 100, anim: 'full', splash: true, confetti: true, navColors: true, showDesc: true,
  pomo: [25, 5, 15], hiddenNav: [], hiddenCards: [], voiceAuto: false, hoverFx: true,
  navOrder: [], cardOrder: [], tileEdit: false, navCounts: true, gcalCal: true, gcalUp: true, gcalToday: true, calWeekNums: false, calHidden: [], who: 'all', calStartHour: 7,
};
const PREF_FALSE = ['voiceAuto', 'tileEdit', 'calWeekNums'];   // przełączniki domyślnie wyłączone
const PREF_REDRAW = ['tileEdit', 'gcalCal', 'gcalUp', 'gcalToday', 'calWeekNums'];
const REC_OPTS =[['', 'Nie powtarzaj'], ['daily', 'Codziennie'], ['weekdays', 'W dni robocze'], ['weekly', 'Co tydzień'], ['monthly', 'Co miesiąc'], ['yearly', 'Co rok']];
const REC_LABEL = Object.fromEntries(REC_OPTS);
const BUILTIN_FILTERS = [
  { id: 'b-p1', name: 'Priorytet 1', query: 'p1', color: '#db4035', builtin: true },
  { id: 'b-overdue', name: 'Po terminie', query: 'overdue', color: '#ff8d85', builtin: true },
  { id: 'b-week', name: 'Najbliższe 7 dni', query: 'overdue | 7 days', color: '#884dff', builtin: true },
  { id: 'b-nodate', name: 'Bez terminu', query: 'no date', color: '#808080', builtin: true },
  { id: 'b-recurring', name: 'Cykliczne', query: 'recurring', color: '#158fad', builtin: true },
];

// ================================================================
//  Narzędzia
// ================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).toLowerCase().replace(/\s+/g, '');
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const pad = n => String(n).padStart(2, '0');
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmtDate(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);
const dow = s => parseDate(s).getDay();
const weekStart = s => addDays(s, -((dow(s) + 6) % 7));
const nextWeekday = (from, wd, allowToday) => { let d = allowToday ? from : addDays(from, 1); while (dow(d) !== wd) d = addDays(d, 1); return d; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isNarrow = () => innerWidth <= 900;
const byOrder = (a, b) => a.order - b.order;
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.time || '99').localeCompare(b.time || '99') || a.priority - b.priority || a.order - b.order;
const plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;

function shortDate(s) {
  const d = parseDate(s);
  let r = d.getDate() + ' ' + PL_MON_SHORT[d.getMonth()];
  if (d.getFullYear() !== new Date().getFullYear()) r += ' ' + d.getFullYear();
  return r;
}
function dueInfo(due, time) {
  if (!due) return null;
  const td = todayStr(), n = diffDays(due, td);
  let label, cls;
  if (n < 0) { label = n === -1 ? 'Wczoraj' : shortDate(due); cls = 'overdue'; }
  else if (n === 0) { label = 'Dziś'; cls = (time && time < nowHM()) ? 'overdue' : 'today'; }
  else if (n === 1) { label = 'Jutro'; cls = 'tomorrow'; }
  else if (n <= 7) { label = cap(PL_DAYS[dow(due)]); cls = 'week'; }
  else { label = shortDate(due); cls = 'later'; }
  if (time) label += ' ' + time;
  return { label, cls };
}
const describe = r => (r.due ? dueInfo(r.due, r.time).label : '') + (r.recurring ? ' · ' + REC_LABEL[r.recurring].toLowerCase() : '');

function fmtText(s) {
  let h = esc(s);
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return h;
}
function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

// ================================================================
//  Ikony
// ================================================================
const sz = (svg, s) => svg.replace(/width="\d+" height="\d+"/, `width="${s}" height="${s}"`);
const sv = (p, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  checkSmall: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
  cal: sv('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 14),
  calBig: sv('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 18),
  inbox: sv('<path d="M3.5 13.5l2.6-7.2A2 2 0 0 1 8 5h8a2 2 0 0 1 1.9 1.3l2.6 7.2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>', 20),
  upcoming: sv('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6"/>', 20),
  filters: sv('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>', 20),
  done: sv('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>', 20),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', 20),
  dots: sv('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', 20),
  viewDoc: sv('<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>', 20),
  commentBig: sv('<path d="M4.5 5.5h15v11h-8.5l-4.5 3.5v-3.5h-2z"/>', 20),
  cloud: sv('<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.5 9.5 4.5 4.5 0 0 0 7 18.5z"/>', 18),
  calMonth: sv('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2"/>', 20),
  timer: sv('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 2.5h4M18.5 6l1.5-1.5"/>', 20),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>', 22),
  edit: sv('<path d="M15 5l4 4L9 19H5v-4z"/><path d="M13 7l4 4"/>'),
  tag: sv('<path d="M3.5 12.3V5a1.5 1.5 0 0 1 1.5-1.5h7.3l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>', 14),
  tagBig: sv('<path d="M3.5 12.3V5a1.5 1.5 0 0 1 1.5-1.5h7.3l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-6.2 6.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>', 18),
  subtask: sv('<path d="M6 4v10a3 3 0 0 0 3 3h9"/><path d="M15 14l3 3-3 3"/>', 14),
  comment: sv('<path d="M4 5h16v11H9l-5 4z"/>', 14),
  repeat: sv('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h16"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>', 12),
  chevron: sv('<path d="M9 6l6 6-6 6"/>', 14),
  chevronDown: sv('<path d="M6 9l6 6 6-6"/>', 14),
  left: sv('<path d="M15 6l-6 6 6 6"/>', 16),
  right: sv('<path d="M9 6l6 6-6 6"/>', 16),
  x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 18),
  trash: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
  sidebar: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>', 20),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  sofa: sv('<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M6 18v2M18 18v2"/>'),
  next: sv('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 12h7.5M12.5 8.8L15.8 12l-3.3 3.2"/>'),
  ban: sv('<circle cx="12" cy="12" r="8"/><path d="M8.6 15.4l6.8-6.8"/>'),
  home: sv('<path d="M4.5 10.5L12 4.5l7.5 6"/><path d="M6.5 9v9.5a1 1 0 0 0 1 1h3v-5h3v5h3a1 1 0 0 0 1-1V9"/>', 20),
  matrix: sv('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 3.5v17M3.5 12h17"/><circle cx="7.8" cy="7.8" r="1.3" fill="currentColor" stroke="none"/>', 20),
  bolt: sv('<path d="M13.5 3.5L6 13.2h5.4l-1 7.3 7.6-9.9h-5.5z"/>', 20),
  play: sv('<path d="M8 5.5v13l10.5-6.5z"/>', 18),
  stop: sv('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>', 18),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 20),
  book: sv('<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v14H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 19.5a2 2 0 0 0 2 1H19v-3M9 8h6"/>', 20),
  mic: sv('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>', 18),
  habit: sv('<path d="M12 21c-4 0-7-2.8-7-6.6 0-3.3 2.4-5.4 3.8-7.9.5 1.6 1.4 2.7 2.6 3.3.2-2.7 1.5-5.1 3.6-6.8-.3 2.6.8 4.4 2.2 6.2 1.2 1.6 1.8 3 1.8 5.1C19 18.2 16 21 12 21z"/>', 20),
  history: sv('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v3.2h3.2M12 8v4.3l2.8 1.7"/>', 18),
  list2: sv('<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r=".9"/><circle cx="5" cy="12" r=".9"/><circle cx="5" cy="17" r=".9"/>', 18),
  clock: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>', 15),
  move: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 16),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', 16),
  moon: sv('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 18),
  auto: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>', 18),
  star: sv('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>', 16),
  board: sv('<rect x="3.5" y="4.5" width="5" height="15" rx="1.5"/><rect x="10" y="4.5" width="5" height="10" rx="1.5"/><rect x="16.5" y="4.5" width="4" height="12" rx="1.5"/>', 20),
  list: sv('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', 20),
  sliders: sv('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', 18),
  keyboard: sv('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>', 18),
  filterDrop: sv('<path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10.5 9 7.5 12 3.5z"/>', 18),
  bell: sv('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', 22),
  pulse: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M6 13h2.5l1.5-3.5 2.5 6 1.5-3.5H18"/>', 20),
  help: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><path d="M12 16.8h.01"/>', 22),
  share: sv('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 19.5a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>', 20),
  party: sv('<path d="M4 20l4.5-12 7.5 7.5z"/><path d="M14 4v2M19 9h2M17.5 5.5l1.5-1.5M12.5 9.5c1.5-1.5 3.5-1.5 5 0"/>', 56),
};
function todayIcon() {
  const d = new Date().getDate();
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9h17"/><text x="12" y="17.8" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${d}</text></svg>`;
}
function flagIcon(p, s = 16) {
  const st = p < 4 ? `style="fill:var(--p${p});stroke:var(--p${p})"` : 'fill="none" stroke="currentColor"';
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" ${st} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M5 21V4.5h12l-2.5 4 2.5 4H5"/></svg>`;
}

// ================================================================
//  Dane
// ================================================================
let state = load();

function newTask(o) {
  return Object.assign({
    id: uid(), title: '', description: '', projectId: 'inbox', sectionId: null, parentId: null,
    priority: 4, due: null, time: null, recurring: null, labels: [], completed: false,
    completedAt: null, createdAt: Date.now(), order: 0, comments: [],
    status: 0, assignees: [], kind: 'task', endTime: null, endDue: null, remind: null, location: '', createdBy: CUR_UID,
  }, o);
}

function seed() {
  // Czysta aplikacja – zadania zespołu przychodzą z serwera po zalogowaniu
  seeded = true;
  const inbox = { id: 'inbox', name: 'Skrzynka', color: '#808080', isInbox: true, view: 'list', order: 0, sections: [] };
  return {
    projects: [inbox], labels: [], tasks: [], history: [], filters: [],
    settings: { theme: 'dark', dailyGoal: 5, userName: '', completedGroup: 'project' },
  };
}

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normalizeState(JSON.parse(s));
  } catch (e) { /* uszkodzone dane – zaczynamy od nowa */ }
  return normalizeState(seed());
}
function normalizeState(d) {
  d.settings = Object.assign({ theme: 'dark', dailyGoal: 5, userName: '', completedGroup: 'project', sound: true }, d.settings || {});
  d.filters = d.filters || []; d.labels = d.labels || []; d.history = d.history || [];
  d.projects = d.projects || []; d.tasks = d.tasks || [];
  if (!d.projects.some(p => p.id === 'inbox')) d.projects.unshift({ id: 'inbox', name: 'Skrzynka', color: '#808080', isInbox: true, view: 'list', order: 0, sections: [] });
  d.projects.forEach(p => { p.sections = p.sections || []; });
  d.settings = Object.assign({}, PREF_DEFAULTS, d.settings);
  d.tasks.forEach(normTask);
  return d;
}
let saveTimer;
function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* brak miejsca / tryb prywatny */ } }
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 120); scheduleRemote(); }
addEventListener('beforeunload', persist);
const snapshot = () => JSON.stringify(state);

// ---- zapytania ----
const proj = id => state.projects.find(p => p.id === id);
const label = id => state.labels.find(l => l.id === id);
const task = id => state.tasks.find(t => t.id === id);
const active = () => state.tasks.filter(t => !t.completed && whoOk(t));
const sectionOf = t => { const p = proj(t.projectId); return p && t.sectionId ? p.sections.find(s => s.id === t.sectionId) : null; };
const kids = (id, all) => state.tasks.filter(t => t.parentId === id && (all || !t.completed)).sort(byOrder);
const userProjects = () => state.projects.filter(p => !p.isInbox).sort(byOrder);
const allFilters = () => [...BUILTIN_FILTERS, ...state.filters];
const nextOrder = () => state.tasks.reduce((m, t) => Math.max(m, t.order || 0), 0) + 1;
function descendants(id) {
  const out = [];
  const walk = i => state.tasks.forEach(t => { if (t.parentId === i) { out.push(t); walk(t.id); } });
  walk(id);
  return out;
}
const projName = p => p ? p.name : 'Skrzynka';

// ================================================================
//  Parser szybkiego dodawania („jutro o 15:00 p1 #Studia @pilne”)
// ================================================================
const WD = {
  'niedziela': 0, 'niedzielę': 0, 'niedziele': 0, 'niedz': 0,
  'poniedziałek': 1, 'poniedzialek': 1, 'pon': 1,
  'wtorek': 2, 'wt': 2,
  'środa': 3, 'środę': 3, 'sroda': 3, 'srode': 3, 'śr': 3,
  'czwartek': 4, 'czw': 4,
  'piątek': 5, 'piatek': 5, 'pt': 5,
  'sobota': 6, 'sobotę': 6, 'sobote': 6, 'sob': 6,
  'sunday': 0, 'sun': 0, 'monday': 1, 'mon': 1, 'tuesday': 2, 'tue': 2, 'wednesday': 3, 'wed': 3,
  'thursday': 4, 'thu': 4, 'friday': 5, 'fri': 5, 'saturday': 6, 'sat': 6,
};
const WD_RE = Object.keys(WD).sort((a, b) => b.length - a.length).join('|');
const MONTHS = {};
[
  'sty stycznia styczeń styczen jan january', 'lut lutego luty feb february', 'mar marca marzec march',
  'kwi kwietnia kwiecień kwiecien apr april', 'maj maja may', 'cze czerwca czerwiec jun june',
  'lip lipca lipiec jul july', 'sie sierpnia sierpień sierpien aug august',
  'wrz września wrzesnia wrzesień wrzesien sep sept september', 'paź paz października pazdziernika październik pazdziernik oct october',
  'lis listopada listopad nov november', 'gru grudnia grudzień grudzien dec december',
].forEach((words, i) => words.split(' ').forEach(w => { MONTHS[w] = i; }));

function mkDate(y, m, d) {
  const dt = new Date(y, m, d);
  return (dt.getMonth() === m && dt.getDate() === d) ? fmtDate(dt) : null;
}
function futureDate(m, d, y) {
  const td = todayStr();
  if (y) return mkDate(y < 100 ? 2000 + y : y, m, d);
  const cy = new Date().getFullYear();
  const r = mkDate(cy, m, d);
  return r && r < td ? mkDate(cy + 1, m, d) : r;
}

function parseQuick(text, opts = {}) {
  let t = ' ' + text + ' ';
  const r = { title: '', priority: null, labels: [], projectId: null, sectionId: null, due: null, time: null, endTime: null, recurring: null, assignees: [] };
  const td = todayStr();
  const take = (re, fn) => { t = t.replace(re, (...a) => fn(...a) === false ? a[0] : ' '); };
  const setDue = d => { if (r.due || !d) return false; r.due = d; };

  take(/\s(p[1-4])(?=\s)/i, (m, p) => { r.priority = +p[1]; });
  // +Imię – przypisanie osoby z zespołu (+ja = do siebie)
  take(/\s\+([^\s+@#]+)(?=\s)/gu, (m, n) => { const id = findMember(n); if (!id) return false; if (!r.assignees.includes(id)) r.assignees.push(id); });
  // przedział czasu: 14:00-15:30, 9-11:30, od 9 do 11
  const hm = (h, mi) => +h < 24 && +(mi || 0) < 60 ? `${pad(+h)}:${mi || '00'}` : null;
  take(/\s(?:o\s|od\s|w\sgodz\.?\s)?(\d{1,2})(?::(\d{2}))?\s?[-–]\s?(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m, h1, m1, h2, m2) => {
    if (!m1 && !m2 && !/^\s(?:o|od)\s/i.test(m)) return false;
    const a = hm(h1, m1), b = hm(h2, m2);
    if (!a || !b || b <= a) return false;
    r.time = a; r.endTime = b;
  });
  if (!r.time) take(/\sod\s(\d{1,2})(?::(\d{2}))?\sdo\s(\d{1,2})(?::(\d{2}))?(?=\s)/i, (m, h1, m1, h2, m2) => {
    const a = hm(h1, m1), b = hm(h2, m2);
    if (!a || !b || b <= a) return false;
    r.time = a; r.endTime = b;
  });
  take(/\s@([^\s@#]+)(?=\s)/gu, (m, l) => { r.labels.push(l); });
  take(/\s#([^\s@#/]+)(?=\s)/u, (m, p) => {
    const n = norm(p);
    const pr = state.projects.find(x => norm(x.name) === n) || state.projects.find(x => norm(x.name).startsWith(n));
    if (!pr) return false;
    r.projectId = pr.id;
  });
  take(/\s\/([^\s/]+)(?=\s)/u, (m, s) => {
    const p = proj(r.projectId || opts.projectId || 'inbox');
    const n = norm(s);
    const se = p && (p.sections.find(x => norm(x.name) === n) || p.sections.find(x => norm(x.name).startsWith(n)));
    if (!se) return false;
    r.sectionId = se.id;
  });

  // powtarzanie
  take(/\s(?:codziennie|każdego dnia|kazdego dnia|every\s?day|daily)(?=\s)/i, () => { r.recurring = 'daily'; });
  if (!r.recurring) take(/\s(?:w dni robocze|w dni powszednie|every weekday|weekdays)(?=\s)/i, () => { r.recurring = 'weekdays'; });
  if (!r.recurring) take(new RegExp(`\\s(?:co|every|każd[yąa]|kazd[yaą])\\s(${WD_RE})(?=\\s)`, 'iu'), (m, w) => { r.recurring = 'weekly'; r.due = nextWeekday(td, WD[w.toLowerCase()], true); });
  if (!r.recurring) take(/\s(?:co tydzień|co tydzien|every week|weekly|tygodniowo)(?=\s)/i, () => { r.recurring = 'weekly'; });
  if (!r.recurring) take(/\s(?:co miesiąc|co miesiac|every month|monthly|miesięcznie)(?=\s)/i, () => { r.recurring = 'monthly'; });
  if (!r.recurring) take(/\s(?:co rok|corocznie|every year|yearly)(?=\s)/i, () => { r.recurring = 'yearly'; });

  // godzina
  if (!r.time) take(/\s(?:o\s|at\s|godz\.?\s?)?(\d{1,2}):(\d{2})(?=\s)/i, (m, h, mi) => { if (+h > 23 || +mi > 59) return false; r.time = `${pad(+h)}:${mi}`; });
  if (!r.time) take(/\s(?:at\s)?(\d{1,2})\s?(am|pm)(?=\s)/i, (m, h, ap) => { let H = +h % 12; if (ap.toLowerCase() === 'pm') H += 12; if (+h > 12) return false; r.time = `${pad(H)}:00`; });
  if (!r.time) take(/\s(?:o|at)\s(\d{1,2})(?=\s*$)/i, (m, h) => { if (+h > 23) return false; r.time = `${pad(+h)}:00`; });
  // czas trwania: „przez 2h”, „1,5 godz”, „45 min” (gdy jest godzina startu)
  if (r.time && !r.endTime) take(/\s(?:przez\s|na\s)?(\d+(?:[.,]\d)?)\s?(h|godz\.?|godzin[ayę]?|min|minut[ayę]?)(?=\s)/i, (m, n, u) => {
    const mins = Math.round(parseFloat(n.replace(',', '.')) * (/^m/i.test(u) ? 1 : 60));
    if (!mins || mins > 24 * 60) return false;
    r.endTime = addMin(r.time, mins);
  });

  // data
  take(/\s(?:dziś|dzis|dzisiaj|today|tod)(?=\s)/i, () => setDue(td));
  take(/\s(?:pojutrze)(?=\s)/i, () => setDue(addDays(td, 2)));
  take(/\s(?:jutro|tomorrow|tmr)(?=\s)/i, () => setDue(addDays(td, 1)));
  take(/\s(?:za|in)\s(\d{1,3})\s(?:dni|dzień|dzien|dnia|days?)(?=\s)/i, (m, n) => setDue(addDays(td, +n)));
  take(/\s(?:za|in)\s(\d{1,2})\s(?:tygodnie|tygodni|tydzień|tydzien|weeks?)(?=\s)/i, (m, n) => setDue(addDays(td, 7 * n)));
  take(/\s(?:za tydzień|za tydzien|w przyszłym tygodniu|w przyszlym tygodniu|przyszły tydzień|przyszly tydzien|next week)(?=\s)/i, () => setDue(nextWeekday(td, 1, false)));
  take(/\s(?:w ten weekend|ten weekend|w weekend|weekend|this weekend)(?=\s)/i, () => setDue(nextWeekday(td, 6, true)));
  take(/\s(\d{4})-(\d{1,2})-(\d{1,2})(?=\s)/, (m, y, mo, d) => setDue(mkDate(+y, mo - 1, +d)));
  take(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/, (m, d, mo, y) => setDue(futureDate(mo - 1, +d, y ? +y : 0)));
  take(/\s(\d{1,2})\s(\p{L}{3,})(?:\s(\d{4}))?(?=\s)/u, (m, d, mo, y) => {
    const k = mo.toLowerCase();
    if (!(k in MONTHS)) return false;
    return setDue(futureDate(MONTHS[k], +d, y ? +y : 0));
  });
  take(new RegExp(`\\s(?:(?:w|we|on|next)\\s)?(${WD_RE})(?=\\s)`, 'iu'), (m, w) => setDue(nextWeekday(td, WD[w.toLowerCase()], false)));

  if ((r.time || r.recurring) && !r.due) r.due = td;
  r.title = t.replace(/\s+/g, ' ').trim();
  return r;
}

// ================================================================
//  Filtry (prosty język zapytań)
// ================================================================
function evalQuery(q, t) {
  q = q.trim();
  if (!q) return true;
  // nawiasy – rekurencyjnie
  let depth = 0, start = -1;
  for (let i = 0; i < q.length; i++) {
    if (q[i] === '(') { if (depth++ === 0) start = i; }
    else if (q[i] === ')' && --depth === 0) {
      const inner = evalQuery(q.slice(start + 1, i), t);
      return evalQuery(q.slice(0, start) + (inner ? ' __true__ ' : ' __false__ ') + q.slice(i + 1), t);
    }
  }
  return q.split('|').some(or => or.split('&').every(term => evalTerm(term.trim(), t)));
}
function evalTerm(term, t) {
  if (!term) return true;
  if (term === '__true__') return true;
  if (term === '__false__') return false;
  if (term.startsWith('!')) return !evalTerm(term.slice(1).trim(), t);
  const s = term.toLowerCase(), td = todayStr();
  if (['today', 'dziś', 'dzis', 'dzisiaj'].includes(s)) return t.due === td;
  if (['tomorrow', 'jutro'].includes(s)) return t.due === addDays(td, 1);
  if (['overdue', 'po terminie', 'zaległe', 'zalegle'].includes(s)) return !!t.due && t.due < td;
  if (['no date', 'bez terminu', 'bez daty'].includes(s)) return !t.due;
  if (['recurring', 'cykliczne'].includes(s)) return !!t.recurring;
  if (['subtask', 'podzadanie'].includes(s)) return !!t.parentId;
  if (['no labels', 'bez etykiet'].includes(s)) return !t.labels.length;
  let m = s.match(/^(?:next\s|najbliższe\s|najblizsze\s)?(\d+)\s*(?:days|dni)$/);
  if (m) return !!t.due && t.due >= td && t.due <= addDays(td, +m[1]);
  m = s.match(/^p([1-4])$/);
  if (m) return t.priority === +m[1];
  if (s.startsWith('@')) { const n = norm(s.slice(1)); return t.labels.some(id => label(id) && norm(label(id).name) === n); }
  if (s.startsWith('##') || s.startsWith('#')) { const n = norm(s.replace(/^#+/, '')); const p = proj(t.projectId); return !!p && norm(p.name) === n; }
  if (s.startsWith('/')) { const se = sectionOf(t); return !!se && norm(se.name) === norm(s.slice(1)); }
  if (s.startsWith('search:')) return (t.title + ' ' + t.description).toLowerCase().includes(s.slice(7).trim());
  return (t.title + ' ' + t.description).toLowerCase().includes(s.replace(/^"|"$/g, ''));
}

// ================================================================
//  Stan interfejsu
// ================================================================
const ui = {
  view: hashView(), addForm: null, addSection: null, collapsed: {}, modal: null, dialog: null,
  sidebar: !isNarrow(), upStart: weekStart(todayStr()), ctxDefaults: {}, showCompleted: {},
  focusSel: null, lastViewKey: null, gPending: false, popOnClose: null, enter: new Set(), bar: {}, stagger: true, rowIdx: 0, calMonth: null, calSel: null,
  selected: new Set(), selAnchor: null, hoverId: null, lastSnap: null,
};

// adres w formie #today, #project-abc123 (prosty #nazwa – działa też w osadzonej stronie)
function viewHash(v) { return v.id ? `${v.type}-${v.id}` : v.type; }
function hashView() {
  const h = decodeURIComponent(location.hash.slice(1));
  const i = h.search(/[-/]/);
  const type = i < 0 ? h : h.slice(0, i), id = i < 0 ? '' : h.slice(i + 1);
  if (['home', 'today', 'upcoming', 'inbox', 'filters', 'completed', 'search', 'reports', 'calendar', 'prefs', 'guide', 'mine', 'team'].includes(type)) return { type };
  if (type === 'person' && id) return { type, id };
  if (type === 'project' && proj(id)) return id === 'inbox' ? { type: 'inbox' } : { type, id };
  if (type === 'label' && label(id)) return { type, id };
  if (type === 'filter' && allFilters().some(f => f.id === id)) return { type, id };
  return { type: 'home' };
}
function setView(v, fromHistory) {
  if (v.type === 'project' && v.id === 'inbox') v = { type: 'inbox' };
  ui.view = v; ui.addForm = null; ui.addSection = null; ui.stagger = true; ui.selected.clear();
  try { localStorage.setItem('listo-last-view', viewHash(v)); } catch (e) { /* */ }
  if (v.type === 'search') { v.q = v.q || ''; ui.focusSel = '.search-input'; }
  const h = '#' + viewHash(v);
  try { if (!fromHistory && location.hash !== h) history.pushState(null, '', h); } catch (e) { /* ramka bez historii */ }
  if (isNarrow()) ui.sidebar = false;
  ui.upStrip = null; ui.upCur = null;
  // na telefonie bez przejść widoku (ciężkie dla słabszych procesorów) – zamiast tego lekki wjazd treści
  if (document.startViewTransition && !REDUCED && document.visibilityState === 'visible' && !isNarrow()) {
    const vt = document.startViewTransition(() => render());
    [vt.ready, vt.finished, vt.updateCallbackDone].forEach(p => p && p.catch(() => {}));
  }
  else render();
}
addEventListener('popstate', () => { const v = hashView(); if (viewHash(v) !== viewHash(ui.view)) { ui.modal = null; setView(v, true); } });

// ================================================================
//  Render
// ================================================================
function commit() { save(); render(); }

function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = dark ? '#1e1e1e' : '#ffffff';
  // motyw kolorystyczny (akcent) – jak „Motywy” w Todoist
  const acc = ACCENTS.find(a => a.id === state.settings.accent);
  const st = document.documentElement.style;
  const vars = ['--accent', '--accent-hover', '--accent-text', '--nav-active', '--nav-active-text'];
  if (!acc || acc.id === 'todoist') { vars.forEach(v => st.removeProperty(v)); return; }
  const c = acc.color;
  st.setProperty('--accent', c);
  st.setProperty('--accent-hover', `color-mix(in srgb, ${c} 85%, #fff)`);
  st.setProperty('--accent-text', dark ? `color-mix(in srgb, ${c} 72%, #fff)` : c);
  st.setProperty('--nav-active', dark ? `color-mix(in srgb, ${c} 24%, #262626)` : `color-mix(in srgb, ${c} 12%, #fff)`);
  st.setProperty('--nav-active-text', dark ? `color-mix(in srgb, ${c} 55%, #fff)` : `color-mix(in srgb, ${c} 82%, #000)`);
}
const ACCENTS = [
  { id: 'todoist', name: 'Todoist', color: '#dc4c3e' }, { id: 'tangerine', name: 'Mandarynka', color: '#e8862a' },
  { id: 'kale', name: 'Jarmuż', color: '#3f9a4b' }, { id: 'blueberry', name: 'Borówka', color: '#4a7cdb' },
  { id: 'lavender', name: 'Lawenda', color: '#9b6bd6' }, { id: 'raspberry', name: 'Malina', color: '#d6336c' },
  { id: 'moonstone', name: 'Kamień księżycowy', color: '#8f9aa6' },
];
function themePicker(anchor) {
  openPopover(anchor, (pop, close) => {
    const draw = () => {
      const curA = state.settings.accent || 'todoist';
      pop.innerHTML = `<div class="menu theme-pick"><div class="menu-label">Motyw kolorystyczny</div><div class="tp-grid">${ACCENTS.map(a => `<button class="tp-item${a.id === curA ? ' on' : ''}" data-acc="${a.id}" style="--c:${a.color}"><span class="tp-sw"><i></i></span><span>${a.name}</span></button>`).join('')}</div>
        <div class="menu-sep"></div><div class="menu-label">Tryb</div><div class="tp-modes">${[['dark', 'Ciemny'], ['light', 'Jasny'], ['auto', 'Systemowy']].map(([v, l]) => `<button class="${state.settings.theme === v ? 'on' : ''}" data-mode="${v}">${l}</button>`).join('')}</div></div>`;
    };
    pop.onclick = e => {
      const b = e.target.closest('[data-acc],[data-mode]');
      if (!b) return;
      document.documentElement.classList.add('theme-fade');
      clearTimeout(themePicker.t); themePicker.t = setTimeout(() => document.documentElement.classList.remove('theme-fade'), 600);
      if (b.dataset.acc) state.settings.accent = b.dataset.acc; else state.settings.theme = b.dataset.mode;
      save(); render(); draw();
    };
    draw();
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function render() {
  const ae = document.activeElement;
  const keep = ['tf-title', 'tf-desc', 'sf-input', 'cm-input', 'search-input'].find(c => ae?.classList?.contains(c));
  if (!ui.focusSel && keep) ui.focusSel = '.' + keep;
  ui.ctxDefaults = {};
  applyTheme();
  applyPrefs();
  renderSidebar();
  renderMain();
  renderModal();
  $$('.task-form .tf-title').forEach(updatePreview);
  ui.enter.clear();
  if (ui.focusSel) {
    const el = $(ui.focusSel);
    ui.focusSel = null;
    if (el) {
      el.focus();
      if (typeof el.value === 'string') { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* */ } }
    }
  }
}

// ---------- pasek boczny ----------
const navAnim = { key: null, top: null, at: -1e9, from: 0, counts: {}, bump: {} };
function renderSidebar() {
  $('#app').classList.toggle('sb-closed', !ui.sidebar);
  const td = todayStr(), act = active(), v = ui.view;
  const overdue = act.some(t => t.due && t.due < td);
  const cnt = { inbox: act.filter(t => t.projectId === 'inbox').length, today: act.filter(t => t.due && t.due <= td).length };
  const nav = (type, icon, text, count, alert) => (state.settings.hiddenNav || []).includes(type) && v.type !== type ? '' : `<button class="nav-item ${v.type === type ? 'active' : ''}" data-act="nav" data-view="${type}" style="--nc:${NAV_HUE[type] || 'var(--accent)'}">${icon}<span class="name">${text}</span>${count ? `<span class="count ${alert ? 'alert' : ''}">${count}</span>` : ''}</button>`;
  const projItem = p => {
    const c = act.filter(t => t.projectId === p.id).length;
    const on = v.type === 'project' && v.id === p.id;
    const hashColor = p.color && p.color !== '#808080' ? `style="color:${p.color}"` : '';
    const exp = sbExpanded(p.id) && p.sections.length;
    return `<div class="nav-item proj ${on ? 'active' : ''} ${p.sections.length ? 'has-secs' : ''}" data-act="nav" data-view="project" data-id="${p.id}" data-drop="project" data-pid="${p.id}" role="button" tabindex="0">
      ${p.sections.length ? `<button class="sb-caret ${exp ? 'open' : ''}" data-act="sb-exp" data-id="${p.id}" title="${exp ? 'Ukryj' : 'Pokaż'} sekcje" aria-label="Pokaż sekcje">${I.chevron}</button>` : ''}
      <span class="hash" ${hashColor}>#</span><span class="name">${esc(p.name)}</span><span class="count">${c || ''}</span>
      <button class="icon-btn more" data-act="proj-menu" data-id="${p.id}" title="Więcej" aria-label="Opcje projektu">${I.dots}</button></div>
      ${exp ? `<div class="sb-secs">${p.sections.map((s, i) => { const sc = act.filter(t => t.projectId === p.id && t.sectionId === s.id).length; return `<button class="nav-item sb-sec" data-act="sb-sec" data-pid="${p.id}" data-sid="${s.id}" style="--d:${i}" data-drop="section" data-sid2="${s.id}"><span class="sb-sec-dot" ${hashColor}></span><span class="name">${esc(s.name)}</span><span class="count">${sc || ''}</span></button>`; }).join('')}</div>` : ''}`;
  };
  const favs = userProjects().filter(p => p.favorite);
  const name = state.settings.userName || 'Ja';
  const sbEl = $('#sidebar');
  // animacje menu przetrwają kolejne przerysowania (np. po przejściu widoku)
  const animateNav = () => {
    if (REDUCED) return;
    const now = performance.now(), na = $('.nav-item.active', sbEl);
    if (na) {
      const key = na.dataset.view + (na.dataset.id || '');
      if (navAnim.key && key !== navAnim.key && navAnim.top != null) { navAnim.from = navAnim.top - na.offsetTop; navAnim.at = now; }
      const el = now - navAnim.at;
      if (el < 420 && navAnim.from) {
        na.style.setProperty('--from', navAnim.from + 'px');
        na.style.animationDelay = (-el) + 'ms';
        na.classList.add('slide');
      }
      navAnim.key = key; navAnim.top = na.offsetTop;
    }
    $$('.nav-item[data-view]', sbEl).forEach(n => {
      const k = n.dataset.view + (n.dataset.id || ''), c = $('.count', n), txt = c ? c.textContent : '';
      if (k in navAnim.counts && navAnim.counts[k] !== txt && txt) navAnim.bump[k] = now;
      navAnim.counts[k] = txt;
      const e = now - (navAnim.bump[k] || -1e9);
      if (c && e < 450) { c.style.animationDelay = (-e) + 'ms'; c.classList.add('bump'); }
    });
  };
  sbEl.innerHTML = `
    <div class="sb-top">
      <button class="user" data-act="user-menu" title="Konto i ustawienia"><span class="avatar">${esc(name[0].toUpperCase())}</span><span>${esc(name)}</span>${I.chevronDown}</button>
      <div class="sb-tools">
        <span class="sync-badge" data-s="${sync.status}" title="${SYNC_LABEL[sync.status]}" ${sync.status === 'local' ? 'hidden' : ''}>${I.cloud}</span>
        <button class="icon-btn" data-act="notifications" title="Powiadomienia">${I.bell}</button>
        <button class="icon-btn" data-act="toggle-sidebar" title="Zwiń menu (M)">${I.sidebar}</button>
      </div>
    </div>
    <button class="nav-item add-btn" data-act="quick-add" title="Szybkie dodawanie (Q)"><span class="add-circle">${I.plus}</span><span>Dodaj zadanie</span></button>
    ${navOrder().map(k => { const d = NAV_DEF[k]; if (!d) return ''; const h = nav(k, d.icon(), d.label, d.count ? d.count(act, cnt) : '', k === 'today' && overdue); return k === 'inbox' ? `<div data-drop="project" data-pid="inbox">${h}</div>` : h; }).join('')}
    <div class="sb-group"><div class="sb-head"><span class="sb-title">Ulubione</span></div>${favs.map(projItem).join('')}</div>
    <div class="sb-group">
      <div class="sb-head">
        <button class="sb-title" data-act="collapse" data-key="projects">Moje projekty</button>
        <button class="icon-btn" data-act="add-project" title="Dodaj projekt">${I.plus}</button>
        <button class="icon-btn caret ${ui.collapsed.projects ? 'closed' : ''}" data-act="collapse" data-key="projects" title="Zwiń">${I.chevron}</button>
      </div>
      ${ui.collapsed.projects ? '' : userProjects().map(projItem).join('')}
    </div>
    <div class="sb-foot">
      ${nav('prefs', I.gear, 'Ustawienia')}
      <button class="nav-item ${v.type === 'guide' ? 'active' : ''}" data-act="nav" data-view="guide" style="--nc:${NAV_HUE.guide}">${I.help}<span class="name">Pomoc i poradnik</span></button>
    </div>`;
  animateNav();
}

// ---------- główny widok ----------
// Nagłówek w treści + dane dla górnego paska (tytuł pokazuje się po przewinięciu)
// zwijany kontener z płynną animacją wysokości
function cbox(key, inner) {
  return `<div class="cbox ${ui.collapsed[key] ? 'is-collapsed' : ''}" data-cbox="${key}"><div class="cbox-inner">${inner}</div></div>`;
}
function header(title, o = {}) {
  ui.bar = { title: o.barTitle || title, icon: o.icon || '', crumb: o.crumb || '', right: o.barRight || '' };
  return `<header class="view-header"><div><h1>${o.icon ? `<span class="h1-icon ${o.iconCls || ''}">${o.icon}</span>` : ''}<span>${title}</span></h1>${o.sub ? `<div class="vh-sub">${o.sub}</div>` : ''}</div><div class="vh-right">${o.right || ''}</div></header>`;
}

function renderMain() {
  const main = $('#main');
  const key = viewHash(ui.view);
  const prevScroll = $('.content', main)?.scrollTop || 0;
  let body = '', wide = false;
  const v = ui.view;
  ui.bar = { title: '', icon: '', crumb: '', right: '' };
  ui.rowIdx = 0;
  switch (v.type) {
    case 'home': body = renderHome(); wide = true; break;
    case 'prefs': body = renderPrefs(); break;
    case 'guide': body = renderGuide(); wide = true; break;
    case 'mine': body = renderMine(); break;
    case 'team': body = renderTeam(); wide = true; break;
    case 'person': body = renderPerson(v.id); break;
    case 'inbox': body = renderProjectView(proj('inbox')); wide = proj('inbox').view === 'board'; break;
    case 'project': { const p = proj(v.id); if (!p) { ui.view = { type: 'inbox' }; return renderMain(); } body = renderProjectView(p); wide = p.view === 'board'; break; }
    case 'today': body = renderToday(); break;
    case 'upcoming': body = renderUpcoming(); break;
    case 'filters': body = renderFiltersLabels(); break;
    case 'label': body = renderLabelView(); break;
    case 'filter': body = renderFilterView(); break;
    case 'completed': body = renderCompleted(); break;
    case 'reports': body = renderReports(); break;
    case 'calendar': body = renderCalendar(); wide = true; break;
    case 'search': body = renderSearch(); break;
    default: body = renderToday();
  }
  if (['project', 'inbox', 'label', 'filter'].includes(v.type)) { const ib = insightBar(v); body = body.includes('class="proj-desc"') ? body.replace('</textarea>', '</textarea>' + ib) : body.replace('</header>', '</header>' + ib); }
  if (v.type === 'completed') body = body.replace('</header>', '</header>' + completedStats());
  if (v.type === 'reports') body = body.replace('<div class="group" style="margin-top:28px">', reportsExtra() + '<div class="group" style="margin-top:28px">');
  main.dataset.view = v.type;
  const ph = v.type === 'project' && proj(v.id)?.color;
  main.style.setProperty('--vh', NAV_HUE[v.type] || (ph && ph !== '#808080' ? ph : 'var(--accent)'));
  const b = ui.bar;
  const tmp = document.createElement('div'); tmp.innerHTML = b.title || '';
  document.title = (tmp.textContent || 'Listo').trim();
  main.innerHTML = `
    <div class="topbar">
      <div class="tb-left">
        ${ui.sidebar ? '' : `<button class="icon-btn" data-act="toggle-sidebar" title="Otwórz menu (M)">${I.sidebar}</button>`}
        <button class="icon-btn" data-act="hist-back" title="Wstecz">${I.left}</button>
        <button class="icon-btn" data-act="hist-fwd" title="Dalej">${I.right}</button>
        ${b.crumb}
      </div>
      <div class="tb-title">${b.icon ? `<span class="tb-icon">${b.icon}</span>` : ''}<span>${b.title}</span></div>
      <div class="tb-right">${b.right}</div>
    </div>
    <div class="content"><div class="content-inner ${wide ? 'wide' : ''} ${ui.stagger ? 'stagger' : ''} ${ui.quiet || (!ui.stagger && ui.lastViewKey === key) ? 'quiet' : ''}">${body}</div></div>
    <button class="fab" data-act="quick-add" aria-label="Dodaj zadanie">${I.plus}</button>`;
  ui.stagger = false; ui.quiet = false;
  const content = $('.content', main), bar = $('.topbar', main);
  if (ui.lastViewKey === key) content.scrollTop = prevScroll;
  ui.lastViewKey = key;
  const onScroll = () => bar.classList.toggle('scrolled', content.scrollTop > 48);
  content.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  $$('.proj-desc', main).forEach(autoGrow);
  if (v.type === 'search') updateSearchResults();
}


// ---------- formularz dodawania ----------
function addTaskButton(ctx, defaults) {
  ui.ctxDefaults[ctx] = defaults;
  if (ui.addForm && ui.addForm.ctx === ctx) return taskForm();
  return `<button class="add-task" data-act="add-open" data-ctx="${esc(ctx)}"><span class="plus">${I.plus}</span>${ctx.startsWith('sub:') ? 'Dodaj zadanie podrzędne' : 'Dodaj zadanie'}</button>`;
}
function freshDraft(d) {
  return { title: '', description: '', projectId: d.projectId || 'inbox', sectionId: d.sectionId || null, parentId: d.parentId || null,
    priority: d.priority || 4, due: d.due || null, time: d.time || null, endTime: d.endTime || null, recurring: null, labels: [...(d.labels || [])],
    kind: d.kind || 'task', assignees: [...(d.assignees || [])], remind: null, location: '' };
}
function openForm(ctx, defaults) {
  defaults = defaults || ui.ctxDefaults[ctx] || {};
  ui.addForm = { ctx, defaults, draft: freshDraft(defaults) };
  ui.addSection = null;
  ui.focusSel = '.task-form .tf-title';
  closePopover();
  render();
}
function cancelForm() {
  if (!ui.addForm) return;
  if (ui.addForm.ctx === 'quick') {
    animateOut($('#modal-root .overlay'), () => { ui.modal = null; ui.addForm = null; render(); });
    return;
  }
  ui.addForm = null;
  render();
}
function taskForm() {
  const f = ui.addForm, d = f.draft;
  const p = proj(d.projectId) || proj('inbox');
  const sec = p.sections.find(s => s.id === d.sectionId);
  const di = dueInfo(d.due, d.time);
  const labelNames = d.labels.map(id => label(id)?.name).filter(Boolean);
  const isSub = f.ctx.startsWith('sub:');
  const ev = d.kind === 'event';
  const dl = di ? di.label + (d.time && d.endTime ? '–' + d.endTime : '') : '';
  return `<div class="task-form ${ev ? 'is-event' : ''}" data-ctx="${esc(f.ctx)}">
    ${isSub ? '' : `<div class="tf-kind seg-inline" role="group" aria-label="Rodzaj"><button type="button" class="${ev ? '' : 'sel'}" data-act="tf-kind" data-v="task">${sz(I.done, 14)} Zadanie</button><button type="button" class="${ev ? 'sel' : ''}" data-act="tf-kind" data-v="event">${sz(I.calBig, 14)} Wydarzenie</button></div>`}
    <div class="tf-inputs">
      <input class="tf-title" placeholder="${isSub ? 'Nazwa zadania podrzędnego' : ev ? 'np. Spotkanie z klientem jutro 10:00-11:30 +Ania #Sprzedaż' : 'np. Przygotować ofertę jutro 15:00 p1 +Ania #Sprzedaż'}" value="${esc(d.title)}" autocomplete="off" aria-label="Nazwa">
      <textarea class="tf-desc" rows="1" placeholder="Opis" aria-label="Opis">${esc(d.description)}</textarea>
      <div class="tf-preview"></div>
      <div class="tf-chips">
        <button type="button" class="chip ${di ? 'set ' + di.cls : ''}" data-act="tf-date">${I.cal}<span>${di ? dl : ev ? 'Kiedy' : 'Termin'}</span>${d.recurring ? I.repeat : ''}${di ? `<span class="chip-x" data-act="tf-clear-date" title="Usuń termin">${I.x}</span>` : ''}</button>
        <button type="button" class="chip ${d.assignees.length ? 'set' : ''}" data-act="tf-assign">${d.assignees.length ? avatars(d.assignees, 16) : sz(I.person, 14)}<span>${d.assignees.length ? esc(d.assignees.map(firstName).join(', ')) : 'Osoby'}</span></button>
        <button type="button" class="chip" data-act="tf-prio">${flagIcon(d.priority, 14)}<span>${d.priority < 4 ? 'P' + d.priority : 'Priorytet'}</span></button>
        <button type="button" class="chip" data-act="tf-labels">${I.tag}<span>${labelNames.length ? labelNames.map(esc).join(', ') : 'Etykiety'}</span></button>
        <button type="button" class="chip mic-chip" data-act="voice" title="Podyktuj zadanie (V)">${I.mic}<span>Głos</span></button>
      </div>
    </div>
    <div class="tf-footer">
      ${isSub ? '<span></span>' : `<button type="button" class="chip" data-act="tf-project">${p.isInbox ? sz(I.inbox, 16) : `<span class="hash" style="color:${p.color}">#</span>`}<span>${esc(projName(p))}${sec ? ' / ' + esc(sec.name) : ''}</span>${I.chevronDown}</button>`}
      <div class="tf-btns">
        <button type="button" class="btn" data-act="tf-cancel">Anuluj</button>
        <button type="button" class="btn primary" data-act="tf-submit" ${d.title.trim() ? '' : 'disabled'}>${ev ? 'Dodaj wydarzenie' : 'Dodaj zadanie'}</button>
      </div>
    </div>
  </div>`;
}
function updatePreview(inp) {
  const form = inp.closest('.task-form');
  if (!form || !ui.addForm) return;
  const box = $('.tf-preview', form), d = ui.addForm.draft;
  const before = inp.value.slice(0, inp.selectionStart ?? inp.value.length);
  const m = before.match(/(^|\s)([#@/+])([^\s#@/+]*)$/u);
  let html = '';
  if (m && document.activeElement === inp) {
    const q = norm(m[3]);
    let items = [];
    if (m[2] === '+') items = team.members.filter(x => !q || fold(memberName(x.user_id)).replace(/\s+/g, '').includes(fold(q)) || fold(x.email || '').startsWith(fold(q))).slice(0, 7)
      .map(x => ({ text: '+' + mentionKey(x.user_id), html: `${avatar(x.user_id, 18)} ${esc(memberName(x.user_id))}${x.user_id === me() ? ' <span class="muted small">(Ty)</span>' : ''}` }));
    else if (m[2] === '#') items = state.projects.filter(p => norm(p.name).includes(q)).slice(0, 6)
      .map(p => ({ text: '#' + p.name.replace(/\s+/g, ''), html: `<span class="hash" style="color:${p.color}">#</span> ${esc(p.name)}` }));
    else if (m[2] === '@') {
      items = state.labels.filter(l => norm(l.name).includes(q)).slice(0, 6).map(l => ({ text: '@' + l.name, html: `<span style="color:${l.color}">${I.tag}</span> ${esc(l.name)}` }));
      if (q && !state.labels.some(l => norm(l.name) === q)) items.push({ text: '@' + m[3], html: `${I.plus} Utwórz etykietę „${esc(m[3])}”` });
    } else {
      const pr = parseQuick(inp.value);
      const p = proj(pr.projectId || d.projectId);
      if (p) items = p.sections.filter(s => norm(s.name).includes(q)).slice(0, 6).map(s => ({ text: '/' + s.name.replace(/\s+/g, ''), html: `/ ${esc(s.name)}` }));
    }
    if (items.length) html = `<div class="suggest">${items.map(it => `<button type="button" class="suggest-item" data-act="tf-suggest" data-text="${esc(it.text)}" data-len="${m[3].length + 1}">${it.html}</button>`).join('')}</div>`;
  }
  const r = parseQuick(inp.value, { projectId: d.projectId });
  const chips = [];
  if (r.due) chips.push(`<span class="pchip due ${dueInfo(r.due, r.time).cls}">${I.cal} ${esc(describe(r))}${r.endTime ? '–' + r.endTime : ''}</span>`);
  r.assignees.forEach(a => chips.push(`<span class="pchip">${avatar(a, 14)} ${esc(memberName(a))}</span>`));
  if (r.priority) chips.push(`<span class="pchip">${flagIcon(r.priority, 12)} P${r.priority}</span>`);
  if (r.projectId) { const p = proj(r.projectId); chips.push(`<span class="pchip"><span class="hash" style="color:${p.color}">#</span> ${esc(p.name)}</span>`); }
  if (r.sectionId) { const p = proj(r.projectId || d.projectId); const s = p?.sections.find(x => x.id === r.sectionId); if (s) chips.push(`<span class="pchip">/ ${esc(s.name)}</span>`); }
  r.labels.forEach(l => chips.push(`<span class="pchip">${I.tag} ${esc(l)}</span>`));
  if (chips.length) html += `<div class="pchips">${chips.join('')}</div>`;
  box.innerHTML = html;
  const btn = $('[data-act="tf-submit"]', form);
  if (btn) btn.disabled = !inp.value.trim();
}
function applySuggest(btn) {
  const inp = $('.tf-title', btn.closest('.task-form'));
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos), after = inp.value.slice(pos);
  const start = before.length - +btn.dataset.len;
  const ins = btn.dataset.text + ' ';
  inp.value = before.slice(0, start) + ins + after.replace(/^\s+/, '');
  const caret = start + ins.length;
  inp.setSelectionRange(caret, caret);
  ui.addForm.draft.title = inp.value;
  updatePreview(inp);
}
function submitForm() {
  const f = ui.addForm;
  if (!f) return;
  const d = f.draft;
  const r = parseQuick(d.title, { projectId: d.projectId });
  if (!r.title) return;
  const labelIds = [...d.labels];
  r.labels.forEach(n => {
    let l = state.labels.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (!l) { l = { id: uid(), name: n, color: '#808080' }; state.labels.push(l); }
    if (!labelIds.includes(l.id)) labelIds.push(l.id);
  });
  let projectId = r.projectId || d.projectId || 'inbox';
  let sectionId = r.projectId && r.projectId !== d.projectId ? r.sectionId : (r.sectionId || d.sectionId);
  let parentId = d.parentId || null;
  if (parentId) { const par = task(parentId); if (par) { projectId = par.projectId; sectionId = par.sectionId; } }
  const time = r.time || (r.due ? null : d.time) || null;
  const t = newTask({
    title: r.title, description: d.description.trim(), projectId, sectionId: sectionId || null, parentId,
    priority: r.priority || d.priority || 4, due: r.due || d.due || null, time,
    endTime: time ? (r.endTime || (r.time ? null : d.endTime) || (d.kind === 'event' ? addMin(time, 60) : null)) : null,
    recurring: r.recurring || d.recurring || null, labels: labelIds, order: nextOrder(),
    kind: d.kind === 'event' ? 'event' : 'task', assignees: [...new Set([...(d.assignees || []), ...r.assignees])], remind: d.remind ?? null, location: d.location || '',
  });
  state.tasks.push(t);
  markEnter(t.id);
  if (f.ctx === 'quick') {
    ui.addForm = null; ui.modal = null;
    commit();
    toast(`Dodano ${t.kind === 'event' ? 'wydarzenie' : 'zadanie'} do: ${projName(proj(projectId))}${t.assignees.length ? ' · ' + t.assignees.map(firstName).join(', ') : ''}`, null, () => openTask(t.id), 'Otwórz');
  } else {
    f.draft = freshDraft(f.defaults);
    ui.focusSel = '.task-form .tf-title';
    commit();
  }
}

// ---------- widok projektu ----------
function renderProjectView(p) {
  const showDone = !!ui.showCompleted[p.id];
  const all = state.tasks.filter(t => t.projectId === p.id);
  const top = sid => all.filter(t => !t.parentId && (t.sectionId || null) === sid && (showDone || !t.completed)).sort((a, b) => (a.completed - b.completed) || a.order - b.order);
  const o = { nested: true, showDone };
  const nComments = (p.comments || []).length;
  const barRight = (p.isInbox ? '' : `<button class="tb-btn" data-act="proj-share" data-id="${p.id}" title="Udostępnij – skopiuj listę zadań">${I.share}<span>Udostępnij</span></button>`) +
    `<button class="icon-btn" data-act="view-menu" data-id="${p.id}" title="Widok">${I.viewDoc}</button>` +
    `<button class="icon-btn" data-act="proj-comments" data-id="${p.id}" title="Komentarze${nComments ? ' (' + nComments + ')' : ''}">${I.commentBig}</button>` +
    `<button class="icon-btn" data-act="proj-menu" data-id="${p.id}" title="Więcej">${I.dots}</button>`;
  let html = p.isInbox
    ? header('Skrzynka', { icon: sz(I.inbox, 22), iconCls: 'red', barRight })
    : header(esc(p.name), { icon: '#', iconCls: 'box', barRight, crumb: `<button class="crumb" data-act="collapse-none">Moje projekty /</button>` })
      + `<textarea class="proj-desc" rows="1" data-pid="${p.id}" placeholder="Dodaj opis" aria-label="Opis projektu">${esc(p.description || '')}</textarea>`;

  if (p.view === 'board') {
    const cols = [];
    if (top(null).length || !p.sections.length) cols.push({ id: null, name: '(Bez sekcji)' });
    cols.push(...p.sections);
    html += `<div class="board">` + cols.map(c => {
      const ts = top(c.id);
      return `<div class="board-col" data-drop="section" data-pid="${p.id}" data-sid="${c.id || ''}">
        <div class="section-head"><h3>${esc(c.name)}</h3><span class="count">${ts.filter(t => !t.completed).length}</span>
        ${c.id ? `<button class="icon-btn" data-act="section-menu" data-pid="${p.id}" data-sid="${c.id}" title="Opcje sekcji">${I.dots}</button>` : ''}</div>
        <div class="col-body">${ts.map(t => taskRow(t, { showDone })).join('')}${addTaskButton(`p:${p.id}:${c.id || ''}`, { projectId: p.id, sectionId: c.id })}</div>
      </div>`;
    }).join('') + `<div class="board-col add-col">${sectionSlot(p, p.sections.length, true)}</div></div>`;
    return html;
  }

  html += `<div class="list" data-drop="section" data-pid="${p.id}" data-sid="">`;
  html += top(null).map(t => taskRow(t, o)).join('') + addTaskButton(`p:${p.id}:`, { projectId: p.id, sectionId: null });
  html += `</div>`;
  html += sectionSlot(p, 0, !p.sections.length);
  p.sections.forEach((s, i) => {
    const ts = top(s.id), col = ui.collapsed['s' + s.id];
    html += `<section class="section" data-drop="section" data-pid="${p.id}" data-sid="${s.id}">
      <div class="section-head">
        <button class="caret ${col ? 'closed' : ''}" data-act="collapse" data-key="s${s.id}" aria-label="Zwiń sekcję">${I.chevron}</button>
        <h3>${esc(s.name)}</h3><span class="count">${ts.filter(t => !t.completed).length}</span>
        <button class="icon-btn" data-act="section-menu" data-pid="${p.id}" data-sid="${s.id}" title="Opcje sekcji">${I.dots}</button>
      </div>
      ${cbox('s' + s.id, `<div class="section-body">${ts.map(t => taskRow(t, o)).join('')}${addTaskButton(`p:${p.id}:${s.id}`, { projectId: p.id, sectionId: s.id })}</div>`)}
    </section>` + sectionSlot(p, i + 1, i === p.sections.length - 1);
  });
  return html;
}
function sectionSlot(p, idx, always) {
  if (ui.addSection && ui.addSection.pid === p.id && ui.addSection.idx === idx) {
    return `<div class="section-form"><input class="sf-input" placeholder="Nazwa sekcji" value="${esc(ui.addSection.name || '')}" maxlength="80">
      <div><button class="btn primary" data-act="sf-submit">Dodaj sekcję</button><button class="btn" data-act="sf-cancel">Anuluj</button></div></div>`;
  }
  return `<button class="add-section ${always ? 'always' : ''}" data-act="add-section" data-pid="${p.id}" data-idx="${idx}">Dodaj sekcję</button>`;
}
function submitSection() {
  const s = ui.addSection;
  const name = ($('.sf-input')?.value || '').trim();
  if (!s || !name) return;
  const p = proj(s.pid);
  p.sections.splice(s.idx, 0, { id: uid(), name });
  ui.addSection = null;
  commit();
}

// ---------- Dziś ----------
function emptyState(title, text) {
  return `<div class="empty">${I.party}<h3>${title}</h3><div>${text}</div></div>`;
}
function renderToday() {
  const td = todayStr(), act = active();
  const overdue = act.filter(t => t.due && t.due < td).sort(byDue);
  const today = act.filter(t => t.due === td).sort(byDue);
  const n = overdue.length + today.length;
  const d = new Date();
  const doneToday = state.history.filter(h => fmtDate(new Date(h.at)) === td).length;
  const goal = state.settings.dailyGoal || 5, pct = Math.min(100, Math.round(doneToday / goal * 100));
  const C = 2 * Math.PI * 8;
  const ring = `<button class="icon-btn prog-btn" data-act="productivity" title="Dzisiaj ukończono ${doneToday} z ${goal}"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="var(--line-2)" stroke-width="2.4"/><circle class="prog-arc" cx="10" cy="10" r="8" fill="none" stroke="var(--accent-text)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 10 10)"/></svg></button>`;
  let html = header('Dziś', {
    icon: todayIcon(), iconCls: 'soft-red',
    sub: (n ? `${sz(I.done, 14)} ${n} ${plural(n, 'zadanie', 'zadania', 'zadań')}` : '') +
      `<span class="day-progress" data-act="productivity" title="Dzienny cel – kliknij, by zobaczyć statystyki"><span class="dp-bar"><i style="--w:${pct}%"></i></span>${doneToday}/${goal} dziś${pct >= 100 ? ' 🎉' : ''}</span>`,
    barRight: ring,
  });
  if (overdue.length) {
    html += `<div class="group"><div class="group-head"><button class="caret ${ui.collapsed.overdue ? 'closed' : ''}" data-act="collapse" data-key="overdue">${I.chevron}</button><h3>Zaległe</h3><button class="btn ghost accent" data-act="reschedule-overdue" title="Przełóż wszystkie zaległe na dziś">Zmień termin</button></div>
      ${cbox('overdue', overdue.map(t => taskRow(t, { showProject: true })).join(''))}</div>`;
  }
  const wd = PL_DAYS[d.getDay()];
  html += `<div class="group" data-drop="day" data-date="${td}"><div class="group-head"><h3>${d.getDate()} ${PL_MON_SHORT[d.getMonth()]} · Dziś · ${wd[0].toUpperCase() + wd.slice(1)}</h3></div>
    ${today.map(t => taskRow(t, { showProject: true, hideToday: true })).join('')}
    ${addTaskButton('today', { due: td })}</div>`;
  if (!n && !(ui.addForm && ui.addForm.ctx === 'today')) html += emptyState('Wszystko na dziś zrobione!', 'Ciesz się wolnym czasem albo zaplanuj coś na jutro.');
  return html;
}

// ---------- Nadchodzące ----------
function renderUpcoming() {
  const td = todayStr(), act = active(), ws = ui.upStart;
  const sws = ui.upStrip || ws;
  const md = parseDate(addDays(sws, 3));
  const days = upStripDays(sws);
  let html = `<div class="up-head">${header(`<span class="up-title">${PL_MON[md.getMonth()]} ${md.getFullYear()}</span>`, {
    right: `<div class="up-nav"><button class="icon-btn" data-act="up-nav" data-n="-7" ${ws <= weekStart(td) ? 'disabled' : ''} title="Poprzedni tydzień">${I.left}</button>
      <button class="btn" data-act="up-nav" data-n="0">Dziś</button>
      <button class="icon-btn" data-act="up-nav" data-n="7" title="Następny tydzień">${I.right}</button></div>`,
  })}<div class="week-strip">${days}</div></div>`;
  if (ws <= td) {
    const overdue = act.filter(t => t.due && t.due < td).sort(byDue);
    if (overdue.length) html += `<div class="group"><div class="group-head"><h3>Zaległe</h3><button class="btn ghost" data-act="reschedule-overdue">Przełóż na dziś</button></div>${overdue.map(t => taskRow(t, { showProject: true })).join('')}</div>`;
  }
  const start = ws < td ? td : ws;
  const end = addDays(ws, 27);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ts = act.filter(t => t.due === d).sort(byDue);
    const n = diffDays(d, td);
    const rel = n === 0 ? ' · Dziś' : n === 1 ? ' · Jutro' : '';
    html += `<div class="group" id="day-${d}" data-drop="day" data-date="${d}">
      <div class="group-head"><h3>${parseDate(d).getDate()} ${PL_MON_SHORT[parseDate(d).getMonth()]}${rel} · ${PL_DAYS[dow(d)]}</h3></div>
      ${ts.map(t => taskRow(t, { showProject: true })).join('')}
      ${addTaskButton('day:' + d, { due: d })}
    </div>`;
  }
  return html;
}

// ---------- Filtry i etykiety ----------
function renderFiltersLabels() {
  const act = active();
  let html = header('Filtry i etykiety');
  html += `<div class="fl-group"><div class="fl-head"><h3>Moje filtry</h3><button class="icon-btn" data-act="filter-add" title="Dodaj filtr">${I.plus}</button></div>
    ${allFilters().map(f => `<div class="fl-item" data-act="nav" data-view="filter" data-id="${f.id}" role="button" tabindex="0">
      <span style="color:${f.color}">${I.filterDrop}</span><span class="grow">${esc(f.name)} <span class="q">${esc(f.query)}</span></span>
      <span class="count">${act.filter(t => evalQuery(f.query, t)).length || ''}</span>
      ${f.builtin ? '<span style="width:28px;flex:none"></span>' : `<button class="icon-btn more" data-act="filter-menu" data-id="${f.id}">${I.dots}</button>`}</div>`).join('')}</div>`;
  html += `<div class="fl-group"><div class="fl-head"><h3>Etykiety</h3><button class="icon-btn" data-act="label-add" title="Dodaj etykietę">${I.plus}</button></div>
    ${state.labels.length ? state.labels.map(l => `<div class="fl-item" data-act="nav" data-view="label" data-id="${l.id}" role="button" tabindex="0">
      <span style="color:${l.color}">${I.tagBig}</span><span class="grow">${esc(l.name)}</span>
      <span class="count">${act.filter(t => t.labels.includes(l.id)).length || ''}</span>
      <button class="icon-btn more" data-act="label-menu" data-id="${l.id}">${I.dots}</button></div>`).join('')
      : '<div class="empty" style="padding:24px">Brak etykiet. Dodaj je przyciskiem + albo wpisując @nazwa przy zadaniu.</div>'}</div>`;
  return html;
}
function renderLabelView() {
  const l = label(ui.view.id);
  if (!l) return renderFiltersLabels();
  const ts = active().filter(t => t.labels.includes(l.id)).sort(byDue);
  return header(`<span style="color:${l.color}">@</span>${esc(l.name)}`, { right: `<button class="icon-btn" data-act="label-menu" data-id="${l.id}">${I.dots}</button>` }) +
    ts.map(t => taskRow(t, { showProject: true })).join('') + addTaskButton('label:' + l.id, { labels: [l.id] }) +
    (ts.length ? '' : emptyState('Brak zadań z tą etykietą', 'Dodaj etykietę do zadania, wpisując @' + esc(l.name) + '.'));
}
function renderFilterView() {
  const f = allFilters().find(x => x.id === ui.view.id);
  if (!f) return renderFiltersLabels();
  const ts = active().filter(t => evalQuery(f.query, t)).sort(byDue);
  return header(esc(f.name), { sub: `<span class="q">${esc(f.query)}</span>`, right: f.builtin ? '' : `<button class="icon-btn" data-act="filter-menu" data-id="${f.id}">${I.dots}</button>` }) +
    ts.map(t => taskRow(t, { showProject: true })).join('') + addTaskButton('filter:' + f.id, {}) +
    (ts.length ? '' : emptyState('Nic tu nie ma', 'Żadne zadanie nie pasuje do tego filtra.'));
}

// ---------- Ukończone ----------
function renderCompleted() {
  const done = state.tasks.filter(t => t.completed);
  const mode = state.settings.completedGroup === 'date' ? 'date' : 'project';
  const right = `<div class="seg-inline" role="group" aria-label="Grupowanie">
      <button class="${mode === 'project' ? 'sel' : ''}" data-act="completed-group" data-v="project">Projekty</button>
      <button class="${mode === 'date' ? 'sel' : ''}" data-act="completed-group" data-v="date">Data ukończenia</button></div>` +
    (done.length ? `<button class="btn ghost" data-act="clear-completed">Usuń wszystkie</button>` : '');
  let html = header('Ukończone', { icon: sz(I.done, 24), sub: `${done.length} ${plural(done.length, 'ukończone zadanie', 'ukończone zadania', 'ukończonych zadań')}`, right });
  if (!done.length) return html + emptyState('Jeszcze nic nie ukończono', 'Odhaczone zadania pojawią się tutaj – z zachowanym priorytetem, terminem, projektem i sekcją.');
  // zadanie pokazujemy na najwyższym poziomie, jeśli jego rodzic nie jest ukończony (wtedy byłoby zagnieżdżone)
  const isTop = t => !t.parentId || !task(t.parentId)?.completed;
  const row = (t, extra) => taskRow(t, Object.assign({ asActive: true, noDrag: true }, extra));
  if (mode === 'date') {
    const td = todayStr();
    let last = null;
    done.filter(isTop).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).forEach(t => {
      const ds = fmtDate(new Date(t.completedAt || Date.now()));
      if (ds !== last) {
        last = ds;
        const n = diffDays(td, ds);
        html += `<div class="group"><div class="group-head"><h3>${shortDate(ds)}${n === 0 ? ' · Dziś' : n === 1 ? ' · Wczoraj' : ''} · ${PL_DAYS[dow(ds)]}</h3></div></div>`;
      }
      html += row(t, { showProject: true });
    });
    return html;
  }
  [proj('inbox'), ...userProjects()].forEach(p => {
    const mine = done.filter(t => t.projectId === p.id && isTop(t));
    if (!mine.length) return;
    const bySec = sid => mine.filter(t => (t.sectionId || null) === sid).sort(byOrder);
    const pk = 'cp' + p.id, pc = ui.collapsed[pk];
    const icon = p.isInbox ? `<span class="h1-icon red" style="width:24px;height:24px">${sz(I.inbox, 18)}</span>` : `<span class="hash">#</span>`;
    html += `<div class="proj-block"><div class="group-head" style="border:0">
        <button class="caret ${pc ? 'closed' : ''}" data-act="collapse" data-key="${pk}">${I.chevron}</button>
        <div class="proj-block-head">${icon}<span>${esc(projName(p))}</span><span class="count">${done.filter(t => t.projectId === p.id).length}</span></div></div>`;
    if (!pc) {
      html += bySec(null).map(t => row(t)).join('');
      p.sections.forEach(s => {
        const ts = bySec(s.id);
        if (!ts.length) return;
        const k = 'cs' + s.id, col = ui.collapsed[k];
        html += `<section class="section"><div class="section-head">
            <button class="caret ${col ? 'closed' : ''}" data-act="collapse" data-key="${k}">${I.chevron}</button>
            <h3>${esc(s.name)}</h3><span class="count">${ts.length}</span></div>
          ${cbox(k, ts.map(t => row(t)).join(''))}</section>`;
      });
    }
    html += `</div>`;
  });
  return html;
}


// ---------- Wyszukiwanie ----------
function renderSearch() {
  return `${header('Szukaj')}<div class="search-box">${I.search}<input class="search-input" placeholder="Szukaj zadań, projektów, etykiet…" value="${esc(ui.view.q || '')}" aria-label="Szukaj"></div><div id="search-results"></div>`;
}
function updateSearchResults() {
  const box = $('#search-results');
  if (!box) return;
  const q = (ui.view.q || '').trim().toLowerCase();
  if (!q) { box.innerHTML = searchHelp(); return; }
  try { const rs = JSON.parse(localStorage.getItem('listo-recent-q') || '[]').filter(x => x !== q); rs.unshift(q); clearTimeout(updateSearchResults.t); updateSearchResults.t = setTimeout(() => { try { localStorage.setItem('listo-recent-q', JSON.stringify(rs.slice(0, 6))); } catch (e) { /* */ } }, 1200); } catch (e) { /* */ }
  const isQuery = /[&|!@#]|^p[1-4]$|^(today|overdue|no date|\d+ days)$/.test(q);
  const tasks = state.tasks.filter(t => isQuery ? (!t.completed && evalQuery(q, t)) : (t.title + ' ' + t.description).toLowerCase().includes(q)).sort((a, b) => a.completed - b.completed || byDue(a, b));
  const projects = state.projects.filter(p => p.name.toLowerCase().includes(q));
  const labels = state.labels.filter(l => l.name.toLowerCase().includes(q));
  let html = '';
  if (projects.length) html += `<div class="search-section">Projekty</div>` + projects.map(p => `<div class="fl-item" data-act="nav" data-view="project" data-id="${p.id}"><span class="hash" style="color:${p.color};width:18px;text-align:center">#</span><span class="grow">${esc(p.name)}</span></div>`).join('');
  if (labels.length) html += `<div class="search-section">Etykiety</div>` + labels.map(l => `<div class="fl-item" data-act="nav" data-view="label" data-id="${l.id}"><span style="color:${l.color}">${I.tag}</span><span class="grow">${esc(l.name)}</span></div>`).join('');
  html += `<div class="search-section">Zadania (${tasks.length})</div>` + (tasks.length ? tasks.slice(0, 100).map(t => taskRow(t, { showProject: true, noDrag: true })).join('') : '<div class="muted" style="padding:12px 0">Brak wyników.</div>');
  box.innerHTML = html;
}

// ---------- modal zadania ----------
function renderModal() {
  const root = $('#modal-root'), m = ui.modal;
  if (!m) { root.innerHTML = ''; root.dataset.key = ''; return; }
  if (m.type === 'quick') {
    if (root.dataset.key === 'quick' && $('.quick-modal', root)) {
      $('.quick-modal', root).innerHTML = addTaskButton('quick', ui.addForm?.defaults || {});
      if (ui.addForm?.ctx === 'quick') return;
    }
    root.dataset.key = 'quick';
    if (!ui.addForm || ui.addForm.ctx !== 'quick') { ui.modal = null; root.innerHTML = ''; return; }
    root.innerHTML = `<div class="overlay top" data-act="modal-bg"><div class="modal quick-modal" role="dialog" aria-label="Szybkie dodawanie">${addTaskButton('quick', ui.addForm.defaults)}</div></div>`;
    return;
  }
  const t = task(m.id);
  if (!t) { ui.modal = null; root.innerHTML = ''; return; }
  const sc = $('.tm-main', root)?.scrollTop || 0;
  const fresh = root.dataset.key !== t.id;
  root.innerHTML = renderTaskModal(t);
  root.dataset.key = t.id;
  if (!fresh) $('.modal', root).style.animation = 'none';
  else if (lastPointer.at && Date.now() - lastPointer.at < 800) {
    // okno zadania „wyrasta” z miejsca kliknięcia
    const md = $('.modal', root), r = md.getBoundingClientRect();
    md.style.transformOrigin = `${Math.round(lastPointer.x - r.left)}px ${Math.round(lastPointer.y - r.top)}px`;
  }
  $$('.tm-title, .tm-desc', root).forEach(autoGrow);
  const main = $('.tm-main', root);
  if (main) main.scrollTop = sc;
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${PL_MON_SHORT[d.getMonth()]} ${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + ' ' : ''}${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function currentTaskList() { return $$('#main .task[data-id]').map(el => el.dataset.id); }
function openTask(id, focusTitle) {
  if (!task(id)) return;
  ui.modal = { type: 'task', id };
  if (ui.addForm && !ui.addForm.ctx.startsWith('sub:' + id)) ui.addForm = null;
  if (focusTitle) ui.focusSel = '.tm-title';
  closePopover();
  render();
}
function closeModal() {
  animateOut($('#modal-root .overlay'), () => {
    if (ui.addForm && (ui.addForm.ctx === 'quick' || ui.addForm.ctx.startsWith('sub:'))) ui.addForm = null;
    ui.modal = null;
    render();
  });
}
// krótka animacja zamykania nakładki, potem właściwa zmiana stanu
function animateOut(overlay, done) {
  if (!overlay || REDUCED || overlay.classList.contains('closing')) { if (!overlay?.classList.contains('closing')) done(); return; }
  overlay.classList.add('closing');
  setTimeout(done, 150);
}
function openQuick() {
  const v = ui.view, d = { projectId: 'inbox' };
  if (v.type === 'project') d.projectId = v.id;
  if (v.type === 'today') d.due = todayStr();
  if (v.type === 'label') d.labels = [v.id];
  if (v.type === 'calendar') d.due = ui.calSel || todayStr();
  ui.modal = { type: 'quick' };
  openForm('quick', d);
}

// ================================================================
//  Akcje na zadaniach
// ================================================================
function nextDue(t) {
  const td = todayStr();
  const step = x => {
    const p = parseDate(x);
    switch (t.recurring) {
      case 'weekdays': { let n = addDays(x, 1); while (dow(n) === 0 || dow(n) === 6) n = addDays(n, 1); return n; }
      case 'weekly': return addDays(x, 7);
      case 'monthly': {
        const day = parseDate(t.due || x).getDate();
        const n = new Date(p.getFullYear(), p.getMonth() + 1, 1);
        n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
        return fmtDate(n);
      }
      case 'yearly': return fmtDate(new Date(p.getFullYear() + 1, p.getMonth(), p.getDate()));
      default: return addDays(x, 1);
    }
  };
  let d = step(t.due || td), guard = 0;
  while (d <= td && guard++ < 2000) d = step(d);
  return d;
}


// ---------- animacje i dźwięk ----------
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
function collapseRow(wrap) {
  if (!wrap || REDUCED) return;
  wrap.style.height = wrap.offsetHeight + 'px';
  wrap.style.overflow = 'hidden';
  void wrap.offsetHeight;
  wrap.classList.add('row-out');
  wrap.style.height = '0px';
}
function celebrate() {
  if (REDUCED || state.settings.confetti === false || state.settings.anim === 'off') return;
  const cols = ['#ff8a80', '#ffd180', '#a5d6a7', '#90caf9', '#ce93d8', '#ffab91', '#80deea'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--dx:${(Math.random() - .5) * 220}px;--r:${(Math.random() - .5) * 1080}deg;animation-delay:${Math.random() * .35}s;animation-duration:${1.6 + Math.random() * 1.1}s;width:${6 + Math.random() * 5}px;height:${8 + Math.random() * 8}px`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3400);
}
let audioCtx;
function playSound(kind) {
  if (state.settings.sound === false) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'done' ? [[784, 0], [1175, 0.07]] : [[660, 0], [523, 0.06]];
    notes.forEach(([f, at]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + at;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.3);
    });
  } catch (e) { /* brak dźwięku */ }
}
// drobne „iskierki” w kolorze priorytetu wokół odhaczonego kółka
function burst(el, prio) {
  if (REDUCED) return;
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = r.left + r.width / 2 + 'px';
  b.style.top = r.top + r.height / 2 + 'px';
  b.style.setProperty('--c', prio < 4 ? `var(--p${prio})` : 'var(--accent)');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.random() * .4, d = 16 + Math.random() * 14;
    const p = document.createElement('i');
    p.style.setProperty('--dx', Math.cos(a) * d + 'px');
    p.style.setProperty('--dy', Math.sin(a) * d + 'px');
    p.style.animationDelay = Math.random() * 40 + 'ms';
    b.appendChild(p);
  }
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 800);
}
// zadanie przywracane / dodane – wjeżdża z animacją przy następnym renderze
function markEnter(id) { ui.enter.add(id); }

function moveTask(t, projectId, sectionId) {
  t.projectId = projectId; t.sectionId = sectionId || null;
  if (t.parentId) { const par = task(t.parentId); if (!par || par.projectId !== projectId || (par.sectionId || null) !== t.sectionId) t.parentId = null; }
  t.order = nextOrder();
  descendants(t.id).forEach(d => { d.projectId = projectId; d.sectionId = t.sectionId; });
  commit();
  toast(`Przeniesiono do: ${projName(proj(projectId))}`);
}
function duplicateTask(t) {
  const map = {};
  const copy = (src, parentId, order) => {
    const n = JSON.parse(JSON.stringify(src));
    n.id = uid(); n.parentId = parentId; n.order = order; n.createdAt = Date.now(); n.comments = n.comments.map(c => ({ ...c, id: uid() }));
    map[src.id] = n.id;
    state.tasks.push(n);
    kids(src.id, true).forEach((k, i) => copy(k, n.id, k.order));
    return n;
  };
  const n = copy(t, t.parentId, t.order + 0.5);
  if (!t.title.endsWith(' (kopia)')) n.title = t.title + ' (kopia)';
  commit();
  toast('Zduplikowano zadanie');
}
function deleteTask(t) {
  const n = descendants(t.id).length;
  confirmDlg('Usunąć zadanie?', `Zadanie <b>${esc(t.title)}</b>${n ? ` oraz ${n} ${plural(n, 'zadanie podrzędne', 'zadania podrzędne', 'zadań podrzędnych')}` : ''} zostanie usunięte.`, 'Usuń', () => {
    const snap = snapshot();
    const ids = new Set([t.id, ...descendants(t.id).map(d => d.id)]);
    state.tasks = state.tasks.filter(x => !ids.has(x.id));
    if (ui.modal?.type === 'task' && ids.has(ui.modal.id)) ui.modal = null;
    commit();
    toast('Usunięto zadanie', snap);
  });
}
function rescheduleOverdue() {
  const snap = snapshot(), td = todayStr();
  const ts = active().filter(t => t.due && t.due < td);
  ts.forEach(t => { t.due = td; });
  commit();
  toast(`Przełożono ${ts.length} ${plural(ts.length, 'zadanie', 'zadania', 'zadań')} na dziś`, snap);
}

// ================================================================
//  Toast z „Cofnij”
// ================================================================
let toastTimer;
function toast(msg, snap, action, actionLabel) {
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  if (snap) ui.lastSnap = snap;
  root.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${snap ? '<button class="toast-undo" data-t="undo">Cofnij</button>' : ''}${action ? `<button class="toast-undo" data-t="act">${esc(actionLabel)}</button>` : ''}<button class="toast-x" data-t="x" aria-label="Zamknij">${sz(I.x, 14)}</button></div>`;
  root.onclick = e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'undo') { state = JSON.parse(snap); commit(); }
    if (b.dataset.t === 'act') action();
    hideToast();
  };
  // pasek odliczania; najechanie wstrzymuje znikanie
  root.onmouseenter = () => clearTimeout(toastTimer);
  root.onmouseleave = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 2500); };
  toastTimer = setTimeout(hideToast, 6000);
}
function hideToast() {
  const el = $('#toast-root .toast');
  if (!el) return;
  el.classList.add('out');
  setTimeout(() => { if (el.parentNode) el.remove(); }, 180);
}

// ================================================================
//  Popover (menu kontekstowe, wybór daty itp.)
// ================================================================
const pop = $('#popover');
function openPopover(anchor, build) {
  closePopover(true);
  pop.onclick = pop.onchange = pop.oninput = pop.onkeydown = null;
  pop.hidden = false;
  build(pop, () => closePopover());
  $$('.menu-item, .dp2-q, .tp-item', pop).forEach((el, i) => el.style.setProperty('--k', Math.min(i, 12)));
  positionPopover(anchor);
  pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in');
}
function positionPopover(anchor) {
  // na telefonie okienka wysuwają się od dołu jak arkusz
  const sheet = innerWidth <= 640;
  pop.classList.toggle('sheet', sheet);
  document.body.classList.toggle('pop-sheet', sheet);
  if (sheet) { pop.style.left = ''; pop.style.top = ''; return; }
  const r = anchor.getBoundingClientRect();
  pop.style.left = '0px'; pop.style.top = '0px';
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let x = r.left, y = r.bottom + 4;
  if (x + pw > innerWidth - 8) x = innerWidth - pw - 8;
  if (x < 8) x = 8;
  if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 4);
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
}
function closePopover(silent) {
  if (pop.hidden) return;
  pop.hidden = true; pop.innerHTML = '';
  document.body.classList.remove('pop-sheet');
  const f = ui.popOnClose; ui.popOnClose = null;
  if (f && !silent) f();
}
document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target)) closePopover(); });
// zamykaj tylko przy zmianie szerokości – wysunięcie klawiatury na telefonie zmienia wysokość i nie może zamykać okienka
let lastW = innerWidth;
addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; closePopover(); } });

// Wybór terminu – układ 1:1 z Todoist: pole z obecnym terminem, szybkie opcje,
// przewijane miesiące z kropkami zadań, podgląd obciążenia dnia, przyciski Czas / Powtarzanie.
const DOW_DOT = ['Niedz.', 'Pon.', 'Wt.', 'Śr.', 'Czw.', 'Pt.', 'Sob.'];
const DOW_LOW = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const capF = s => s.charAt(0).toUpperCase() + s.slice(1);
function datePicker(anchor, cur, cb) {
  const td = todayStr();
  const val = { due: cur.due || null, time: cur.time || null, endTime: cur.endTime || null, recurring: cur.recurring || null };
  const counts = {};
  active().forEach(t => { if (t.due) counts[t.due] = (counts[t.due] || 0) + 1; });
  const start = parseDate(val.due && val.due < td ? val.due : td); start.setDate(1);
  const months = [...Array(13)].map((_, i) => new Date(start.getFullYear(), start.getMonth() + i, 1));
  let mode = null, calScroll = null;
  openPopover(anchor, (pop, close) => {
    const set = (patch, closeIt) => {
      Object.assign(val, patch);
      if (!val.due) { val.time = null; val.recurring = null; }
      if (!val.time || (val.endTime && val.endTime <= val.time)) val.endTime = null;
      cb({ ...val });
      if (closeIt) close(); else draw();
    };
    const right = (d, full) => { const p = parseDate(d); return DOW_DOT[p.getDay()] + (full || diffDays(d, td) > 6 ? ` ${p.getDate()} ${capF(PL_MON_SHORT[p.getMonth()])}` : ''); };
    const quick = (icon, text, date, cls, full) => `<button class="dp2-q" data-date="${date}"><span class="qi ${cls}">${icon}</span><span class="grow">${text}</span>${date ? `<span class="dp2-r">${right(date, full)}</span>` : ''}</button>`;
    const monthHtml = (dt, i) => {
      const y = dt.getFullYear(), m = dt.getMonth();
      const off = (new Date(y, m, 1).getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate();
      let cells = '<span></span>'.repeat(off);
      for (let d = 1; d <= dim; d++) {
        const ds = fmtDate(new Date(y, m, d)), n = counts[ds] || 0;
        const wdN = new Date(y, m, d).getDay();
        cells += `<button class="dp2-day${wdN === 0 || wdN === 6 ? ' we' : ''}${ds === td ? ' today' : ''}${ds === val.due ? ' sel' : ''}${ds < td ? ' past' : ''}" data-date="${ds}" data-n="${n}">${d}${n ? '<i></i>' : ''}</button>`;
      }
      return `<div class="dp2-month" data-i="${i}">${i ? `<div class="dp2-mlabel">${capF(PL_MON_SHORT[m])}${y !== months[0].getFullYear() ? ' ' + y : ''}</div>` : ''}<div class="dp2-grid">${cells}</div></div>`;
    };
    const label = dt => `${capF(PL_MON_SHORT[dt.getMonth()])} ${dt.getFullYear()}`;
    const draw = () => {
      const oldCal = $('.dp2-cal', pop);
      if (oldCal) calScroll = oldCal.scrollTop;
      const curText = val.due ? describe(val) : '';
      pop.innerHTML = `<div class="dp2">
        <div class="dp2-top"><input class="dp2-input" value="${esc(curText)}" placeholder="Wpisz termin, np. pt 15:00" spellcheck="false"><div class="dp2-hint"></div></div>
        <div class="dp2-quick">
          ${quick(I.today || todayIcon(), 'Dziś', td, 'g')}
          ${quick(I.sun, 'Jutro', addDays(td, 1), 'o')}
          ${quick(I.sofa, 'Ten weekend', nextWeekday(td, 6, true), 'b')}
          ${quick(I.next, 'Następny tydzień', nextWeekday(td, 1, false), 'p', true)}
          ${val.due ? quick(I.ban, 'Brak terminu', '', 'n') : ''}
        </div>
        <div class="dp2-head"><strong class="dp2-title">${label(months[0])}</strong><div class="dp2-nav">
          <button data-nav="-1" title="Poprzedni miesiąc">${I.left}</button>
          <button data-nav="0" title="Dzisiaj"><span class="dp2-dot"></span></button>
          <button data-nav="1" title="Następny miesiąc">${I.right}</button></div></div>
        <div class="dp2-sub"><div class="dp2-wd">${['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'].map(x => `<span>${x}</span>`).join('')}</div><div class="dp2-info"></div></div>
        <div class="dp2-cal">${months.map(monthHtml).join('')}</div>
        <div class="dp2-foot">
          ${mode === 'time'
            ? `<div class="dp2-timebox dp2-range"><div class="dp2-tr"><label>Od<input type="time" class="dp2-time" value="${val.time || ''}" step="300"></label><label>Do<input type="time" class="dp2-time2" value="${val.endTime || ''}" step="300"></label></div>
                <div class="dp2-durs">${[[15, '15 min'], [30, '30 min'], [60, '1 h'], [90, '1,5 h'], [120, '2 h'], [240, '4 h']].map(([m, l]) => `<button class="dp2-dur" data-dur="${m}">${l}</button>`).join('')}</div>
                <div class="dp2-tb"><button class="dp2-btn sm primary" data-a="time-ok">Zapisz</button>${val.time ? '<button class="dp2-btn sm" data-a="time-clear" title="Usuń godzinę">Usuń</button>' : ''}</div></div>`
            : `<button class="dp2-btn${val.time ? ' on' : ''}" data-a="time">${I.clock}<span>${val.time ? 'Czas: ' + val.time + (val.endTime ? '–' + val.endTime : '') : 'Czas / przedział'}</span></button>`}
          ${mode === 'rec'
            ? `<div class="dp2-reclist">${REC_OPTS.map(([v, l]) => `<button class="dp2-q${v === (val.recurring || '') ? ' on' : ''}" data-rec="${v}"><span class="grow">${l}</span>${v === (val.recurring || '') ? I.checkSmall : ''}</button>`).join('')}</div>`
            : `<button class="dp2-btn${val.recurring ? ' on' : ''}" data-a="rec">${sz(I.repeat, 15)}<span>${val.recurring ? REC_LABEL[val.recurring] : 'Powtarzanie'}</span></button>`}
        </div></div>`;
      const inp = $('.dp2-input', pop), hint = $('.dp2-hint', pop), cal = $('.dp2-cal', pop), title = $('.dp2-title', pop), sub = $('.dp2-sub', pop), info = $('.dp2-info', pop);
      inp.oninput = () => {
        const q = inp.value.trim(), r = parseQuick(inp.value);
        hint.textContent = q && q !== curText ? (r.due ? '→ ' + describe(r) : 'Nie rozpoznano terminu') : '';
        hint.classList.toggle('show', !!hint.textContent);
      };
      inp.onkeydown = e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (inp.value.trim() === curText) { close(); return; }
        const r = parseQuick(inp.value);
        if (r.due) set({ due: r.due, time: r.time || val.time, recurring: r.recurring || val.recurring }, true);
      };
      const tin = $('.dp2-time', pop);
      if (tin) { tin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-a="time-ok"]', pop).click(); } }; setTimeout(() => tin.focus(), 0); }
      // nagłówek miesiąca podąża za przewijaniem
      const curIdx = () => { const ms = $$('.dp2-month', cal); let k = 0; ms.forEach((m, i) => { if (m.offsetTop - cal.offsetTop <= cal.scrollTop + 24) k = i; }); return k; };
      cal.onscroll = () => { const t = label(months[curIdx()]); if (title.textContent !== t) { title.textContent = t; title.classList.remove('flip'); void title.offsetWidth; title.classList.add('flip'); } };
      cal.onmouseover = e => {
        const d = e.target.closest('.dp2-day');
        if (!d) return;
        const p = parseDate(d.dataset.date), n = +d.dataset.n;
        info.innerHTML = `${DOW_LOW[p.getDay()]} ${p.getDate()} ${PL_MON_SHORT[p.getMonth()]} • <b>${n ? n + ' ' + plural(n, 'zadanie', 'zadania', 'zadań') : 'Brak zadań'}</b>`;
        sub.classList.add('hov');
      };
      cal.onmouseleave = () => sub.classList.remove('hov');
      if (calScroll != null) cal.scrollTop = calScroll;
      else { const target = val.due ? months.findIndex(m => fmtDate(m).slice(0, 7) === val.due.slice(0, 7)) : 0; const el = $(`.dp2-month[data-i="${Math.max(0, target)}"] .dp2-grid`, cal); if (el) cal.scrollTop = el.offsetTop - cal.offsetTop - 4; cal.onscroll(); }
    };
    pop.onclick = e => {
      const du = e.target.closest('[data-dur]');
      if (du) { const s = $('.dp2-time', pop); if (!s.value) s.value = val.time || (new Date().getHours() + 1 > 23 ? '23:00' : pad(new Date().getHours() + 1) + ':00'); $('.dp2-time2', pop).value = addMin(s.value, +du.dataset.dur); $$('.dp2-dur', pop).forEach(x => x.classList.toggle('on', x === du)); return; }
      const b = e.target.closest('[data-date],[data-nav],[data-a],[data-rec]');
      if (!b) return;
      const cal = $('.dp2-cal', pop);
      if (b.dataset.nav !== undefined) {
        const ms = $$('.dp2-month', cal);
        let k = 0; ms.forEach((m, i) => { if (m.offsetTop - cal.offsetTop <= cal.scrollTop + 24) k = i; });
        const n = +b.dataset.nav, to = n === 0 ? months.findIndex(m => fmtDate(m).slice(0, 7) === td.slice(0, 7)) : Math.max(0, Math.min(ms.length - 1, k + n));
        const g = $('.dp2-grid', ms[Math.max(0, to)]);
        cal.scrollTo({ top: g.offsetTop - cal.offsetTop - 4, behavior: REDUCED ? 'auto' : 'smooth' });
        return;
      }
      const a = b.dataset.a;
      if (a === 'time' || a === 'rec') { mode = a; draw(); positionPopover(anchor); return; }
      if (a === 'time-ok') { const v = $('.dp2-time', pop).value, v2 = $('.dp2-time2', pop)?.value; mode = null; set({ time: v || null, endTime: v && v2 && v2 > v ? v2 : null, due: val.due || td }); return; }
      if (a === 'time-clear') { mode = null; set({ time: null, endTime: null }); return; }
      if (b.dataset.rec !== undefined) { mode = null; set({ recurring: b.dataset.rec || null, due: val.due || td }); return; }
      b.classList.add('picked');
      set({ due: b.dataset.date || null }, true);
    };
    draw();
    setTimeout(() => { const i = $('.dp2-input', pop); if (i) { i.focus(); i.select(); } }, 0);
  });
}
// ikona „Dziś” jak w Todoist: kwadrat z numerem dnia
Object.defineProperty(I, 'today', { get: () => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/><text x="12" y="16.1" text-anchor="middle" font-size="8.6" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${new Date().getDate()}</text></svg>` });

function prioPicker(anchor, cur, cb) {
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu">${[1, 2, 3, 4].map(p => `<button class="menu-item ${p === cur ? 'sel' : ''}" data-p="${p}">${flagIcon(p)}<span class="grow">Priorytet ${p}</span>${p === cur ? I.checkSmall : ''}</button>`).join('')}</div>`;
    pop.onclick = e => { const b = e.target.closest('[data-p]'); if (b) { cb(+b.dataset.p); close(); } };
  });
}

function labelPicker(anchor, cur, cb) {
  let sel = [...cur], q = '';
  openPopover(anchor, (pop) => {
    pop.innerHTML = `<div class="menu"><input class="menu-search" placeholder="Wpisz etykietę" aria-label="Szukaj etykiety"><div class="lp-list"></div></div>`;
    const list = $('.lp-list', pop), inp = $('.menu-search', pop);
    const draw = () => {
      const ls = state.labels.filter(l => l.name.toLowerCase().includes(q.toLowerCase()));
      let h = ls.map(l => `<label class="menu-item"><span style="color:${l.color}">${I.tag}</span><span class="grow">${esc(l.name)}</span><input type="checkbox" data-id="${l.id}" ${sel.includes(l.id) ? 'checked' : ''}></label>`).join('');
      if (q && !state.labels.some(l => l.name.toLowerCase() === q.toLowerCase())) h += `<button class="menu-item" data-create>${I.plus}<span>Utwórz etykietę „${esc(q)}”</span></button>`;
      list.innerHTML = h || '<div class="menu-empty">Brak etykiet</div>';
    };
    draw();
    setTimeout(() => inp.focus(), 0);
    inp.oninput = () => { q = inp.value.trim(); draw(); };
    const create = () => {
      const l = { id: uid(), name: q.replace(/\s+/g, '_'), color: COLORS[Math.floor(Math.random() * COLORS.length)][1] };
      state.labels.push(l); sel.push(l.id); q = ''; inp.value = '';
      cb([...sel]); draw();
    };
    inp.onkeydown = e => { if (e.key === 'Enter' && q) { e.preventDefault(); const ex = state.labels.find(l => l.name.toLowerCase() === q.toLowerCase()); if (ex) { if (!sel.includes(ex.id)) sel.push(ex.id); cb([...sel]); q = ''; inp.value = ''; draw(); } else create(); } };
    pop.onchange = e => {
      const c = e.target.closest('input[type=checkbox]');
      if (!c) return;
      sel = c.checked ? [...sel, c.dataset.id] : sel.filter(x => x !== c.dataset.id);
      cb([...sel]);
    };
    pop.onclick = e => { if (e.target.closest('[data-create]')) create(); };
  });
}

function projectPicker(anchor, cur, cb) {
  let q = '';
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu"><input class="menu-search" placeholder="Wpisz nazwę projektu" aria-label="Szukaj projektu"><div class="pp-list"></div></div>`;
    const list = $('.pp-list', pop), inp = $('.menu-search', pop);
    const draw = () => {
      let h = '';
      [proj('inbox'), ...userProjects()].forEach(p => {
        const match = !q || norm(p.name).includes(norm(q));
        const secs = p.sections.filter(s => !q || match || norm(s.name).includes(norm(q)));
        if (!match && !secs.length) return;
        const on = cur.projectId === p.id && !cur.sectionId;
        h += `<button class="menu-item ${on ? 'sel' : ''}" data-p="${p.id}" data-s="">${p.isInbox ? sz(I.inbox, 16) : `<span class="hash" style="color:${p.color};width:16px;text-align:center">#</span>`}<span class="grow">${esc(projName(p))}</span>${on ? I.checkSmall : ''}</button>`;
        secs.forEach(s => {
          const on2 = cur.projectId === p.id && cur.sectionId === s.id;
          h += `<button class="menu-item indent ${on2 ? 'sel' : ''}" data-p="${p.id}" data-s="${s.id}"><span class="muted">/</span><span class="grow">${esc(s.name)}</span>${on2 ? I.checkSmall : ''}</button>`;
        });
      });
      list.innerHTML = h || '<div class="menu-empty">Nie znaleziono projektu</div>';
    };
    draw();
    setTimeout(() => inp.focus(), 0);
    inp.oninput = () => { q = inp.value.trim(); draw(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { const b = $('[data-p]', list); if (b) b.click(); } };
    pop.onclick = e => {
      const b = e.target.closest('[data-p]');
      if (b) { cb({ projectId: b.dataset.p, sectionId: b.dataset.s || null }); close(); }
    };
  });
}

function menu(anchor, items) {
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu">${items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
      `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}">${it.icon || ''}<span class="grow">${it.label}</span></button>`).join('')}</div>`;
    pop.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { close(); items[+b.dataset.i].fn(); } };
  });
}

function taskMenu(anchor, t) {
  const td = todayStr();
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu">
      <button class="menu-item" data-a="edit">${I.edit}<span class="grow">Edytuj zadanie</span></button>
      <div class="menu-sep"></div>
      <div class="menu-label">Termin</div>
      <div class="menu-row">
        <button class="icon-btn" data-due="${td}" title="Dziś" style="color:var(--green)">${I.today}</button>
        <button class="icon-btn" data-due="${addDays(td, 1)}" title="Jutro" style="color:var(--orange)">${I.sun}</button>
        <button class="icon-btn" data-due="${nextWeekday(td, 6, true)}" title="Ten weekend" style="color:var(--blue)">${I.sofa}</button>
        <button class="icon-btn" data-due="${nextWeekday(td, 1, false)}" title="Przyszły tydzień" style="color:var(--purple)">${I.next}</button>
        <button class="icon-btn" data-due="" title="Bez terminu">${I.ban}</button>
        <button class="icon-btn" data-a="date" title="Więcej opcji">${I.dots}</button>
      </div>
      <div class="menu-label">Priorytet</div>
      <div class="menu-row">${[1, 2, 3, 4].map(p => `<button class="icon-btn ${t.priority === p ? 'sel' : ''}" data-p="${p}" title="Priorytet ${p}">${flagIcon(p)}</button>`).join('')}</div>
      <div class="menu-sep"></div>
      <button class="menu-item" data-a="sub">${sz(I.subtask, 16)}<span class="grow">Dodaj zadanie podrzędne</span></button>
      <button class="menu-item" data-a="move">${I.move}<span class="grow">Przenieś do…</span></button>
      <button class="menu-item" data-a="labels">${sz(I.tag, 16)}<span class="grow">Etykiety…</span></button>
      <button class="menu-item" data-a="dup">${I.copy}<span class="grow">Duplikuj</span></button>
      <div class="menu-sep"></div>
      <button class="menu-item danger" data-a="del">${I.trash}<span class="grow">Usuń zadanie</span></button>
    </div>`;
    pop.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.due !== undefined) { t.due = b.dataset.due || null; if (!t.due) { t.time = null; t.recurring = null; } close(); commit(); return; }
      if (b.dataset.p) { t.priority = +b.dataset.p; close(); commit(); return; }
      const a = b.dataset.a;
      close();
      const anc = (anchor instanceof Node ? document.body.contains(anchor) : true) ? anchor : $(`.task[data-id="${t.id}"]`) || document.body;
      if (a === 'edit') openTask(t.id, true);
      else if (a === 'date') datePicker(anc, t, v => { Object.assign(t, v); commit(); });
      else if (a === 'move') projectPicker(anc, t, v => moveTask(t, v.projectId, v.sectionId));
      else if (a === 'labels') labelPicker(anc, t.labels, ids => { t.labels = ids; commit(); });
      else if (a === 'sub') { ui.modal = { type: 'task', id: t.id }; openForm('sub:' + t.id, { parentId: t.id, projectId: t.projectId, sectionId: t.sectionId }); }
      else if (a === 'dup') duplicateTask(t);
      else if (a === 'del') deleteTask(t);
    };
  });
}

// ---------- projekty, sekcje, etykiety, filtry ----------
function projectDialog(p) {
  openDialog({
    title: p ? 'Edytuj projekt' : 'Dodaj projekt', submit: p ? 'Zapisz' : 'Dodaj',
    fields: [
      { key: 'name', label: 'Nazwa', value: p?.name || '', required: true },
      { key: 'color', label: 'Kolor', type: 'color', value: p?.color || '#808080' },
      { key: 'view', label: 'Układ', type: 'select', value: p?.view || 'list', options: [['list', 'Lista'], ['board', 'Tablica']] },
      { key: 'favorite', label: 'Dodaj do ulubionych', type: 'checkbox', value: !!p?.favorite },
    ],
    onSubmit: v => {
      if (p) { Object.assign(p, v); commit(); }
      else {
        const np = { id: uid(), ...v, sections: [], order: Math.max(0, ...state.projects.map(x => x.order || 0)) + 1 };
        state.projects.push(np); save(); setView({ type: 'project', id: np.id });
      }
    },
  });
}
function projectMenu(anchor, p) {
  menu(anchor, [
    { icon: I.edit, label: 'Edytuj projekt', fn: () => projectDialog(p) },
    { icon: I.star, label: p.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', fn: () => { p.favorite = !p.favorite; commit(); } },
    { icon: sz(I.plus, 16), label: 'Dodaj sekcję', fn: () => { if (ui.view.id !== p.id) setView({ type: 'project', id: p.id }); ui.addSection = { pid: p.id, idx: p.sections.length }; ui.focusSel = '.sf-input'; render(); } },
    { icon: p.view === 'board' ? sz(I.list, 16) : sz(I.board, 16), label: p.view === 'board' ? 'Pokaż jako listę' : 'Pokaż jako tablicę', fn: () => { p.view = p.view === 'board' ? 'list' : 'board'; commit(); } },
    '-',
    { icon: I.trash, label: 'Usuń projekt', danger: true, fn: () => {
      const n = state.tasks.filter(t => t.projectId === p.id).length;
      confirmDlg('Usunąć projekt?', `Projekt <b>${esc(p.name)}</b> i wszystkie jego zadania (${n}) zostaną usunięte.`, 'Usuń', () => {
        const snap = snapshot();
        state.projects = state.projects.filter(x => x.id !== p.id);
        state.tasks = state.tasks.filter(t => t.projectId !== p.id);
        if (ui.view.id === p.id) ui.view = { type: 'inbox' };
        setView(ui.view);
        save();
        toast('Usunięto projekt', snap);
      });
    } },
  ]);
}
function sectionMenu(anchor, pid, sid) {
  const p = proj(pid), s = p?.sections.find(x => x.id === sid);
  if (!s) return;
  menu(anchor, [
    { icon: I.edit, label: 'Zmień nazwę', fn: () => openDialog({ title: 'Zmień nazwę sekcji', submit: 'Zapisz', fields: [{ key: 'name', label: 'Nazwa', value: s.name, required: true }], onSubmit: v => { s.name = v.name; commit(); } }) },
    { icon: sz(I.plus, 16), label: 'Dodaj zadanie', fn: () => { ui.collapsed['s' + s.id] = false; openForm(`p:${p.id}:${s.id}`, { projectId: p.id, sectionId: s.id }); } },
    '-',
    { icon: I.trash, label: 'Usuń sekcję', danger: true, fn: () => {
      const n = state.tasks.filter(t => t.sectionId === s.id).length;
      confirmDlg('Usunąć sekcję?', `Sekcja <b>${esc(s.name)}</b> i jej zadania (${n}) zostaną usunięte.`, 'Usuń', () => {
        const snap = snapshot();
        p.sections = p.sections.filter(x => x.id !== s.id);
        state.tasks = state.tasks.filter(t => t.sectionId !== s.id);
        commit();
        toast('Usunięto sekcję', snap);
      });
    } },
  ]);
}
function labelDialog(l) {
  openDialog({
    title: l ? 'Edytuj etykietę' : 'Dodaj etykietę', submit: l ? 'Zapisz' : 'Dodaj',
    fields: [{ key: 'name', label: 'Nazwa', value: l?.name || '', required: true }, { key: 'color', label: 'Kolor', type: 'color', value: l?.color || '#808080' }],
    onSubmit: v => {
      v.name = v.name.replace(/\s+/g, '_').replace(/^@/, '');
      if (state.labels.some(x => x !== l && x.name.toLowerCase() === v.name.toLowerCase())) { alertField('name', 'Etykieta o tej nazwie już istnieje'); return false; }
      if (l) Object.assign(l, v); else state.labels.push({ id: uid(), ...v });
      commit();
    },
  });
}
function labelMenu(anchor, l) {
  menu(anchor, [
    { icon: I.edit, label: 'Edytuj etykietę', fn: () => labelDialog(l) },
    '-',
    { icon: I.trash, label: 'Usuń etykietę', danger: true, fn: () => confirmDlg('Usunąć etykietę?', `Etykieta <b>${esc(l.name)}</b> zostanie usunięta ze wszystkich zadań.`, 'Usuń', () => {
      const snap = snapshot();
      state.labels = state.labels.filter(x => x.id !== l.id);
      state.tasks.forEach(t => { t.labels = t.labels.filter(x => x !== l.id); });
      if (ui.view.type === 'label' && ui.view.id === l.id) setView({ type: 'filters' }); else commit();
      save();
      toast('Usunięto etykietę', snap);
    }) },
  ]);
}
function filterDialog(f) {
  openDialog({
    title: f ? 'Edytuj filtr' : 'Dodaj filtr', submit: f ? 'Zapisz' : 'Dodaj',
    fields: [
      { key: 'name', label: 'Nazwa', value: f?.name || '', required: true },
      { key: 'query', label: 'Zapytanie', value: f?.query || '', required: true, placeholder: 'np. today | overdue',
        hint: 'Łącz warunki: <b>&amp;</b> (i), <b>|</b> (lub), <b>!</b> (nie), nawiasy. Warunki: <code>today</code>, <code>tomorrow</code>, <code>overdue</code>, <code>7 days</code>, <code>no date</code>, <code>p1</code>–<code>p4</code>, <code>@etykieta</code>, <code>#Projekt</code>, <code>/Sekcja</code>, <code>recurring</code>, <code>subtask</code> lub dowolny tekst.' },
      { key: 'color', label: 'Kolor', type: 'color', value: f?.color || '#884dff' },
    ],
    onSubmit: v => {
      if (f) { Object.assign(f, v); commit(); }
      else { const nf = { id: uid(), ...v }; state.filters.push(nf); save(); setView({ type: 'filter', id: nf.id }); }
    },
  });
}
function filterMenu(anchor, f) {
  menu(anchor, [
    { icon: I.edit, label: 'Edytuj filtr', fn: () => filterDialog(f) },
    '-',
    { icon: I.trash, label: 'Usuń filtr', danger: true, fn: () => confirmDlg('Usunąć filtr?', `Filtr <b>${esc(f.name)}</b> zostanie usunięty. Zadania pozostaną bez zmian.`, 'Usuń', () => {
      state.filters = state.filters.filter(x => x.id !== f.id);
      if (ui.view.type === 'filter' && ui.view.id === f.id) setView({ type: 'filters' }); else commit();
      save();
    }) },
  ]);
}
function viewMenu(anchor, p) {
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu">
      <div class="menu-label">Układ</div>
      <div class="seg"><button data-v="list" class="${p.view !== 'board' ? 'sel' : ''}">${I.list}Lista</button><button data-v="board" class="${p.view === 'board' ? 'sel' : ''}">${I.board}Tablica</button></div>
      <div class="menu-sep"></div>
      <label class="menu-item"><span class="grow">Pokaż ukończone zadania</span><input type="checkbox" data-sc ${ui.showCompleted[p.id] ? 'checked' : ''}></label>
    </div>`;
    pop.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { p.view = b.dataset.v; close(); commit(); } };
    pop.onchange = e => { if (e.target.matches('[data-sc]')) { ui.showCompleted[p.id] = e.target.checked; render(); } };
  });
}
// ---------- udostępnianie, komentarze projektu, eksport/import ----------
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) { openDialog({ title: 'Skopiuj ręcznie', html: `<textarea class="copy-area" readonly rows="10">${esc(text)}</textarea>` }); setTimeout(() => $('.copy-area')?.select(), 50); }
}
function shareProject(p) {
  const lines = [`# ${p.name}`];
  const line = t => { const di = dueInfo(t.due, t.time); return `- [ ] ${t.title}${t.priority < 4 ? ' (P' + t.priority + ')' : ''}${di ? ' — ' + di.label : ''}${t.description ? '\n    ' + t.description : ''}`; };
  const act = state.tasks.filter(t => t.projectId === p.id && !t.completed && !t.parentId).sort(byOrder);
  act.filter(t => !t.sectionId).forEach(t => lines.push(line(t)));
  p.sections.forEach(s => { const ts = act.filter(t => t.sectionId === s.id); if (ts.length) { lines.push('', `## ${s.name}`); ts.forEach(t => lines.push(line(t))); } });
  copyText(lines.join('\n'), 'Skopiowano listę zadań – możesz ją wkleić np. na Teams');
}
function projectComments(p) {
  p.comments = p.comments || [];
  const list = p.comments.length ? p.comments.map(c => `<div class="comment"><span class="avatar">${esc((state.settings.userName || 'J')[0])}</span><div class="cbody"><div class="chead"><strong>${esc(state.settings.userName || 'Ty')}</strong><span class="muted small">${fmtDateTime(c.at)}</span></div><div class="ctext">${fmtText(c.text)}</div></div></div>`).join('') : '<p class="muted">Brak komentarzy do projektu.</p>';
  openDialog({
    title: `Komentarze – ${p.isInbox ? 'Skrzynka' : p.name}`, html: `<div style="max-height:40vh;overflow:auto;margin-bottom:10px">${list}</div>`, submit: 'Skomentuj',
    fields: [{ key: 'text', label: 'Nowy komentarz', type: 'textarea', value: '', required: true }],
    onSubmit: v => { p.comments.push({ id: uid(), text: v.text, at: Date.now() }); commit(); },
  });
}
function exportData() {
  copyText(JSON.stringify(state), 'Skopiowano dane – wklej je w „Importuj dane” na innym urządzeniu');
}
function importData() {
  openDialog({
    title: 'Importuj dane', submit: 'Zastąp moje dane', danger: true,
    html: '<p>Wklej dane skopiowane przyciskiem „Eksportuj dane”. Obecne zadania zostaną zastąpione (możesz to cofnąć).</p>',
    fields: [{ key: 'json', label: 'Dane', type: 'textarea', value: '', required: true }],
    onSubmit: v => {
      let d;
      try { d = JSON.parse(v.json); } catch (e) { alertField('json', 'To nie wygląda na dane z Listo'); return false; }
      if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.projects)) { alertField('json', 'To nie wygląda na dane z Listo'); return false; }
      const snap = snapshot();
      state = normalizeState(d);
      ui.view = { type: 'today' };
      commit();
      toast('Zaimportowano dane', snap);
    },
  });
}

// ================================================================
//  Synchronizacja między urządzeniami (gdy aplikacja działa na claude.ai)
// ================================================================

function userMenu(anchor) {
  const th = state.settings.theme;
  menu(anchor, [
    { icon: sz(I.gear, 16), label: 'Ustawienia', fn: () => setView({ type: 'prefs' }) },
    { icon: sz(I.book, 16), label: 'Poradnik i skróty', fn: () => setView({ type: 'guide' }) },
    { icon: sz(I.pulse, 16), label: 'Raportowanie i produktywność', fn: () => setView({ type: 'reports' }) },
    { icon: I.edit, label: 'Zmień nazwę użytkownika', fn: () => openDialog({ title: 'Nazwa użytkownika', submit: 'Zapisz', fields: [{ key: 'name', label: 'Nazwa', value: state.settings.userName || '', required: true }], onSubmit: v => { state.settings.userName = v.name; commit(); } }) },
    '-',
    { icon: `<span class="tp-mini" style="--c:${(ACCENTS.find(a => a.id === state.settings.accent) || ACCENTS[0]).color}"></span>`, label: 'Motyw kolorystyczny…', fn: () => themePicker(anchor) },
    { icon: th === 'dark' ? I.checkSmall : '<span style="width:16px"></span>', label: 'Motyw: ciemny', fn: () => { state.settings.theme = 'dark'; commit(); } },
    { icon: th === 'light' ? I.checkSmall : '<span style="width:16px"></span>', label: 'Motyw: jasny', fn: () => { state.settings.theme = 'light'; commit(); } },
    { icon: th === 'auto' ? I.checkSmall : '<span style="width:16px"></span>', label: 'Motyw: jak w systemie', fn: () => { state.settings.theme = 'auto'; commit(); } },
    '-',
    { icon: state.settings.sound !== false ? I.checkSmall : '<span style="width:16px"></span>', label: 'Dźwięk przy odhaczaniu', fn: () => { state.settings.sound = state.settings.sound === false; commit(); if (state.settings.sound) playSound('done'); } },
    { icon: sz(I.keyboard, 16), label: 'Skróty klawiszowe', fn: shortcutsDialog },
    '-',
    { icon: sz(I.copy, 16), label: 'Eksportuj dane (kopia do schowka)', fn: exportData },
    { icon: sz(I.move, 16), label: 'Importuj dane…', fn: importData },
    { icon: sz(I.cloud, 16), label: SYNC_LABEL[sync.status], fn: () => {} },
  ]);
}
function productivity(anchor) {
  openPopover(anchor, (pop) => {
    const draw = () => {
      const td = todayStr(), goal = state.settings.dailyGoal;
      const days = [...Array(7)].map((_, i) => addDays(td, i - 6));
      const byDay = {};
      state.history.forEach(h => { const d = fmtDate(new Date(h.at)); byDay[d] = (byDay[d] || 0) + 1; });
      const counts = days.map(d => byDay[d] || 0);
      const todayC = counts[6], pct = Math.min(1, todayC / goal);
      let streak = 0;
      for (let d = (byDay[td] || 0) >= goal ? td : addDays(td, -1); (byDay[d] || 0) >= goal; d = addDays(d, -1)) streak++;
      const max = Math.max(goal, ...counts, 1);
      const C = 2 * Math.PI * 26;
      pop.innerHTML = `<div class="prod">
        <h3>Twoja produktywność</h3>
        <div class="prod-ring">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line-2)" stroke-width="7"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}" transform="rotate(-90 32 32)"/></svg>
          <div><div class="big">${todayC}/${goal}</div><div class="muted small">ukończonych dziś</div><div class="small" style="margin-top:4px">🔥 Seria: <b>${streak}</b> ${plural(streak, 'dzień', 'dni', 'dni')}</div></div>
        </div>
        <div class="bars"><div class="goal-line" style="bottom:${goal / max * 100}%"></div>${counts.map(c => `<div class="bar-col"><span class="bar-v">${c || ''}</span><div class="bar ${c < goal ? 'low' : ''}" style="height:${c / max * 78}%"></div></div>`).join('')}</div>
        <div class="bar-l">${days.map(d => `<span>${PL_DAYS_SHORT[dow(d)]}</span>`).join('')}</div>
        <div class="prod-goal"><span>Dzienny cel</span><input type="number" min="1" max="50" value="${goal}" aria-label="Dzienny cel"></div>
      </div>`;
      $('input', pop).onchange = e => { state.settings.dailyGoal = Math.max(1, Math.min(50, +e.target.value || 5)); commit(); draw(); };
    };
    draw();
  });
}

// ================================================================
//  Okna dialogowe
// ================================================================
function openDialog(cfg) {
  closePopover(true);
  ui.dialog = cfg;
  renderDialog();
  setTimeout(() => { const el = $('#dialog-root input:not([type=radio]):not([type=checkbox]), #dialog-root textarea, #dialog-root button[type=submit]'); el?.focus(); el?.select?.(); }, 0);
}
function closeDialog() { ui.dialog = null; renderDialog(); }
function confirmDlg(title, html, btn, fn) { openDialog({ title, html: `<p>${html}</p>`, submit: btn, danger: true, onSubmit: fn }); }
function alertField(key, msg) {
  const f = $(`#dialog-root [name="${key}"]`)?.closest('.field');
  if (!f) return;
  f.classList.add('invalid');
  let s = $('small.err', f);
  if (!s) { s = document.createElement('small'); s.className = 'err'; s.style.color = 'var(--danger)'; f.appendChild(s); }
  s.textContent = msg;
}
function fieldHtml(f) {
  if (f.type === 'checkbox') return `<label class="field-check"><input type="checkbox" name="${f.key}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
  if (f.type === 'color') return `<div class="field"><span class="field-label">${esc(f.label)}</span><div class="swatches">${COLORS.map(([n, hex]) => `<label class="swatch" title="${n}"><input type="radio" name="${f.key}" value="${hex}" ${hex === f.value ? 'checked' : ''}><span style="background:${hex}"></span></label>`).join('')}</div></div>`;
  if (f.type === 'textarea') return `<label class="field"><span class="field-label">${esc(f.label)}</span><textarea name="${f.key}" rows="4">${esc(f.value || '')}</textarea></label>`;
  if (f.type === 'select') return `<label class="field"><span class="field-label">${esc(f.label)}</span><select name="${f.key}">${f.options.map(([v, l]) => `<option value="${v}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<label class="field"><span class="field-label">${esc(f.label)}</span><input name="${f.key}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" maxlength="200" autocomplete="off">${f.hint ? `<small>${f.hint}</small>` : ''}</label>`;
}
function renderDialog() {
  const root = $('#dialog-root'), c = ui.dialog;
  if (!c) { root.innerHTML = ''; return; }
  root.innerHTML = `<div class="overlay" data-dlg="bg"><form class="modal dialog ${c.cls || ''}" novalidate role="dialog" aria-label="${esc(c.title)}">
    <h2>${esc(c.title)}</h2>${c.html || ''}${(c.fields || []).map(fieldHtml).join('')}
    <div class="dlg-foot"><button type="button" class="btn" data-dlg="cancel">${c.submit ? 'Anuluj' : 'Zamknij'}</button>${c.submit ? `<button type="submit" class="btn ${c.danger ? 'danger' : 'primary'}">${esc(c.submit)}</button>` : ''}</div>
  </form></div>`;
  const form = $('form', root);
  form.onsubmit = e => {
    e.preventDefault();
    const vals = {};
    let bad = false;
    (c.fields || []).forEach(f => {
      if (f.type === 'checkbox') vals[f.key] = form.querySelector(`[name="${f.key}"]`).checked;
      else if (f.type === 'color') vals[f.key] = form.querySelector(`[name="${f.key}"]:checked`)?.value || f.value;
      else vals[f.key] = form.querySelector(`[name="${f.key}"]`).value.trim();
      if (f.required && !vals[f.key]) { alertField(f.key, 'To pole jest wymagane'); bad = true; }
    });
    if (bad) return;
    const cfg = ui.dialog;
    const r = cfg.onSubmit?.(vals);
    if (r !== false && ui.dialog === cfg) closeDialog();
  };
  root.onclick = e => {
    const d = e.target.closest('[data-dlg]');
    if (!d) return;
    if (d.dataset.dlg === 'cancel' || (d.dataset.dlg === 'bg' && e.target === d)) closeDialog();
  };
}
function shortcutsDialog() {
  const rows = [
    ['Q', 'Szybkie dodawanie zadania'], ['/', 'Szukaj'], ['M', 'Pokaż / ukryj menu'],
    ['G potem H', 'Start (widok główny)'], ['G potem M', 'Moje zadania'], ['G potem Z', 'Zespół'],
    ['G potem I', 'Skrzynka'], ['G potem T', 'Dziś'], ['G potem U', 'Nadchodzące'], ['G potem F', 'Filtry i etykiety'], ['G potem C', 'Ukończone'],
    ['Ctrl + K', 'Paleta poleceń – szukaj i uruchamiaj wszystko'], ['Ctrl + Z', 'Cofnij ostatnią zmianę'],
    ['Ctrl + klik', 'Zaznacz kilka zadań (Shift + klik – zakres)'], ['Ctrl + A', 'Zaznacz wszystkie widoczne zadania'],
    ['D', 'Ukończ zadanie pod kursorem'], ['T', 'Termin dziś (zadanie pod kursorem)'], ['J', 'Termin jutro (zadanie pod kursorem)'],
    ['1 … 4', 'Priorytet zadania pod kursorem'], ['E', 'Edytuj zadanie pod kursorem'], ['Delete', 'Usuń zadanie pod kursorem'],
    ['Prawy klik', 'Szybkie menu zadania'], ['Ctrl + V', 'Wklej listę (kilka linii) – każda linia to osobne zadanie'],
    ['Enter', 'Zapisz zadanie w formularzu'], ['Tab', 'Zatwierdź podpowiedź #projekt / @etykieta'], ['Esc', 'Zamknij / anuluj'], ['Ctrl + Enter', 'Wyślij komentarz'],
  ];
  const syntax = [
    ['jutro, pojutrze, pt, w sobotę, 24.12, 5 maj', 'termin'], ['o 15:00, 9am', 'godzina'], ['codziennie, co tydzień, co pon', 'powtarzanie'],
    ['p1 … p4', 'priorytet'], ['#Projekt  /Sekcja', 'projekt i sekcja'], ['@etykieta', 'etykieta'],
  ];
  openDialog({
    title: 'Skróty i składnia',
    html: `<table class="kbd-table">${rows.map(([k, d]) => `<tr><td>${k.split(' ').map(x => ['potem', '+'].includes(x) ? ` ${x} ` : `<kbd>${x}</kbd>`).join('')}</td><td>${d}</td></tr>`).join('')}</table>
      <h3 style="font-size:14px;margin:18px 0 6px">Szybkie dodawanie – składnia</h3>
      <table class="kbd-table">${syntax.map(([k, d]) => `<tr><td><code>${esc(k)}</code></td><td>${d}</td></tr>`).join('')}</table>`,
  });
}

// ================================================================
//  Przeciągnij i upuść
// ================================================================
let dragId = null;
const clearDrop = () => $$('.drop-before, .drop-into').forEach(x => x.classList.remove('drop-before', 'drop-into'));
document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('.task[draggable="true"], .cal-chip[draggable="true"], .cal2-chip[draggable="true"], .tm-card[draggable="true"]');
  if (!row) return;
  dragId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  requestAnimationFrame(() => row.classList.add('dragging'));
});
document.addEventListener('dragend', () => { dragId = null; clearDrop(); $$('.dragging').forEach(x => x.classList.remove('dragging')); });
document.addEventListener('dragover', e => {
  if (!dragId) return;
  const tgt = e.target.closest('[data-drop]');
  if (!tgt || (tgt.dataset.drop === 'task' && tgt.dataset.id === dragId)) return;
  e.preventDefault();
  clearDrop();
  tgt.classList.add(tgt.dataset.drop === 'task' ? 'drop-before' : 'drop-into');
});
document.addEventListener('drop', e => {
  if (!dragId) return;
  const tgt = e.target.closest('[data-drop]');
  if (!tgt) return;
  e.preventDefault();
  const id = dragId;
  dragId = null; clearDrop();
  handleDrop(id, tgt);
});
function handleDrop(id, el) {
  const t = task(id);
  if (!t) return;
  const kind = el.dataset.drop;
  const dateView = ['today', 'upcoming', 'calendar'].includes(ui.view.type);
  const relink = () => descendants(t.id).forEach(d => { d.projectId = t.projectId; d.sectionId = t.sectionId; });
  if (kind === 'task') {
    const target = task(el.dataset.id);
    if (!target || target.id === id || descendants(id).some(d => d.id === target.id)) return;
    if (dateView || ['label', 'filter', 'search'].includes(ui.view.type)) {
      if (dateView && target.due) t.due = target.due;
    } else {
      t.projectId = target.projectId; t.sectionId = target.sectionId; t.parentId = target.parentId;
      relink();
    }
    const sibs = state.tasks.filter(x => x !== t && x.projectId === target.projectId && (x.sectionId || null) === (target.sectionId || null) && (x.parentId || null) === (target.parentId || null)).sort(byOrder);
    if (!dateView) {
      const base = Math.min(t.order, ...sibs.map(x => x.order));
      sibs.splice(sibs.indexOf(target), 0, t);
      sibs.forEach((x, k) => { x.order = base + k; });
    }
  } else if (kind === 'section') {
    t.projectId = el.dataset.pid; t.sectionId = el.dataset.sid || null; t.parentId = null; t.order = nextOrder(); relink();
  } else if (kind === 'project') {
    t.projectId = el.dataset.pid; t.sectionId = null; t.parentId = null; t.order = nextOrder(); relink();
    toast(`Przeniesiono do: ${projName(proj(t.projectId))}`);
  } else if (kind === 'person') {
    const pid = el.dataset.uid;
    if (pid === '_none') t.assignees = [];
    else if (!t.assignees.includes(pid)) t.assignees = [pid];
    toast(pid === '_none' ? 'Usunięto przypisanie' : `Przypisano: ${memberName(pid)}`);
  } else if (kind === 'day') {
    t.due = el.dataset.date;
  }
  commit();
}

// ================================================================
//  Zdarzenia
// ================================================================
document.addEventListener('mousedown', e => {
  // nie trać fokusu pola tytułu przy klikaniu podpowiedzi
  if (e.target.closest('.suggest-item')) e.preventDefault();
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act, id = el.dataset.id;
  const f = ui.addForm;
  const formFocus = () => { ui.popOnClose = () => { const i = $('.task-form .tf-title'); if (i) { i.focus(); } }; };
  switch (a) {
    case 'nav':
      if (e.target.closest('.more')) return;
      ui.modal = null;
      setView({ type: el.dataset.view, id: el.dataset.id });
      break;
    case 'toggle-sidebar': ui.sidebar = !ui.sidebar; render(); break;
    case 'toggle': e.stopPropagation(); toggleTask(id); break;
    case 'open': if (e.target.closest('a[href]') || !id) return; openTask(id); break;
    case 'task-edit': openTask(id, true); break;
    case 'task-date': { const t = task(id); datePicker(el, t, v => { Object.assign(t, v); commit(); }); break; }
    case 'task-more': taskMenu(el, task(id)); break;
    case 'tm-prio': { const t = task(id); prioPicker(el, t.priority, p => { t.priority = p; commit(); }); break; }
    case 'tm-labels': { const t = task(id); labelPicker(el, t.labels, ids => { t.labels = ids; commit(); }); break; }
    case 'tm-project': { const t = task(id); projectPicker(el, t, v => moveTask(t, v.projectId, v.sectionId)); break; }
    case 'collapse': {
      const k = el.dataset.key, v = ui.collapsed[k] = !ui.collapsed[k];
      const box = $(`[data-cbox="${k}"]`);
      if (box) { box.classList.toggle('is-collapsed', v); $$(`.caret[data-key="${k}"]`).forEach(c => c.classList.toggle('closed', v)); }
      else render();
      break;
    }
    case 'add-open': openForm(el.dataset.ctx); break;
    case 'tf-cancel': cancelForm(); break;
    case 'tf-submit': submitForm(); break;
    case 'tf-suggest': applySuggest(el); break;
    case 'tf-clear-date': e.stopPropagation(); Object.assign(f.draft, { due: null, time: null, recurring: null }); ui.focusSel = '.task-form .tf-title'; render(); break;
    case 'tf-date': datePicker(el, f.draft, v => { Object.assign(f.draft, v); render(); }); formFocus(); break;
    case 'tf-prio': prioPicker(el, f.draft.priority, p => { f.draft.priority = p; render(); }); formFocus(); break;
    case 'tf-labels': labelPicker(el, f.draft.labels, ids => { f.draft.labels = ids; render(); }); formFocus(); break;
    case 'tf-project': projectPicker(el, f.draft, v => { f.draft.projectId = v.projectId; f.draft.sectionId = v.sectionId; render(); }); formFocus(); break;
    case 'quick-add': openQuick(); break;
    case 'modal-close': closeModal(); break;
    case 'modal-bg': if (e.target === el) { if (ui.modal?.type === 'quick') cancelForm(); else closeModal(); } break;
    case 'proj-menu': e.stopPropagation(); projectMenu(el, proj(id)); break;
    case 'add-project': projectDialog(); break;
    case 'view-menu': viewMenu(el, proj(id)); break;
    case 'section-menu': sectionMenu(el, el.dataset.pid, el.dataset.sid); break;
    case 'add-section': ui.addForm = null; ui.addSection = { pid: el.dataset.pid, idx: +el.dataset.idx, name: '' }; ui.focusSel = '.sf-input'; render(); break;
    case 'sf-submit': submitSection(); break;
    case 'sf-cancel': ui.addSection = null; render(); break;
    case 'up-nav': {
      const n = +el.dataset.n, td = todayStr();
      ui.upStart = n === 0 ? weekStart(td) : addDays(ui.upStrip || ui.upStart, n);
      if (ui.upStart < weekStart(td)) ui.upStart = weekStart(td);
      ui.upStrip = null; ui.upCur = null;
      ui.lastViewKey = null; render();
      const c0 = $('.content'); if (c0) c0.scrollTop = 0;
      break;
    }
    case 'up-day': {
      const g = $('#day-' + el.dataset.date), c = $('.content');
      if (g) c.scrollTo({ top: g.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - $('.up-head').offsetHeight - 8, behavior: 'smooth' });
      break;
    }
    case 'reschedule-overdue': rescheduleOverdue(); break;
    case 'label-add': labelDialog(); break;
    case 'label-menu': e.stopPropagation(); labelMenu(el, label(id)); break;
    case 'filter-add': filterDialog(); break;
    case 'filter-menu': e.stopPropagation(); filterMenu(el, state.filters.find(x => x.id === id)); break;
    case 'comment-add': addComment(id); break;
    case 'comment-del': { const t = task(id); t.comments = t.comments.filter(c => c.id !== el.dataset.cid); commit(); break; }
    case 'theme': { const order = ['auto', 'light', 'dark']; state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3]; commit(); break; }
    case 'productivity': productivity(el); break;
    case 'hist-back': history.back(); break;
    case 'hist-fwd': history.forward(); break;
    case 'user-menu': userMenu(el); break;
    case 'notifications': notifications(el); break;
    case 'completed-group': state.settings.completedGroup = el.dataset.v; commit(); break;
    case 'task-del': deleteTask(task(id)); break;
    case 'cal-day': ui.calSel = el.dataset.date; render(); break;
    case 'cal-nav': {
      const n = +el.dataset.n;
      if (!n) { ui.calMonth = null; ui.calSel = todayStr(); }
      else { const d = parseDate(ui.calMonth || todayStr().slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); ui.calMonth = fmtDate(d); }
      ui.stagger = true; render(); break;
    }
    case 'home-tomorrow': { const t = task(id); if (t) { const snap = snapshot(); t.due = addDays(todayStr(), 1); commit(); toast('Przełożono na jutro', snap); } break; }
    case 'home-skip': (ui.homeSkip = ui.homeSkip || new Set()).add(id); ui.homeAnim = true; render(); break;
    case 'home-day': ui.calSel = el.dataset.date; ui.calMonth = el.dataset.date.slice(0, 8) + '01'; setView({ type: 'calendar' }); break;
    case 'proj-share': shareProject(proj(id)); break;
    case 'proj-comments': projectComments(proj(id)); break;
    case 'shortcuts': shortcutsDialog(); break;
    case 'clear-completed': confirmDlg('Usunąć ukończone zadania?', 'Wszystkie ukończone zadania zostaną trwale usunięte.', 'Usuń', () => {
      const snap = snapshot();
      const ids = new Set(state.tasks.filter(t => t.completed).map(t => t.id));
      state.tasks = state.tasks.filter(t => !ids.has(t.id) && !(t.parentId && ids.has(t.parentId)));
      commit(); toast('Usunięto ukończone zadania', snap);
    }); break;
  }
});
function addComment(id) {
  const inp = $('.cm-input');
  const text = inp?.value.trim();
  if (!text) return;
  task(id).comments.push({ id: uid(), text, at: Date.now(), by: CUR_UID });
  ui.focusSel = '.cm-input';
  commit();
  const main = $('.tm-main'); if (main) main.scrollTop = main.scrollHeight;
}

document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('.tf-title') && ui.addForm) { ui.addForm.draft.title = t.value; updatePreview(t); }
  else if (t.matches('.tf-desc') && ui.addForm) { ui.addForm.draft.description = t.value; autoGrow(t); }
  else if (t.matches('.tm-title, .tm-desc') && ui.modal?.type === 'task') {
    const tk = task(ui.modal.id);
    if (tk) { tk[t.dataset.field] = t.dataset.field === 'title' ? t.value.replace(/\n/g, ' ') : t.value; save(); }
    autoGrow(t);
  }
  else if (t.matches('.cm-input')) autoGrow(t);
  else if (t.matches('.search-input')) { ui.view.q = t.value; updateSearchResults(); }
  else if (t.matches('.sf-input') && ui.addSection) ui.addSection.name = t.value;
  else if (t.matches('.proj-desc')) { const p = proj(t.dataset.pid); if (p) { p.description = t.value; save(); } autoGrow(t); }
});
document.addEventListener('dblclick', e => {
  const cell = e.target.closest('.cal-cell');
  if (cell && !e.target.closest('.cal-chip')) { ui.calSel = cell.dataset.date; openQuick(); }
});
document.addEventListener('change', e => {
  if (e.target.matches?.('.goal-input')) { state.settings.dailyGoal = Math.max(1, Math.min(50, +e.target.value || 5)); commit(); }
});
document.addEventListener('focusout', e => {
  // po edycji w modalu odśwież listę w tle (bez ruszania modala)
  if (e.target.matches?.('.tm-title, .tm-desc')) {
    const tk = ui.modal && task(ui.modal.id);
    if (tk && e.target.matches('.tm-title') && !tk.title.trim()) { tk.title = 'Bez nazwy'; e.target.value = tk.title; }
    renderSidebar(); renderMain();
  }
});
document.addEventListener('keyup', e => {
  if (e.target.matches?.('.tf-title') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updatePreview(e.target);
});

const isTyping = el => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches?.('.tf-title')) {
    const sug = $('.suggest-item', t.closest('.task-form'));
    if (sug && !e.isComposing && (e.key === 'Tab' || (e.key === 'Enter' && +sug.dataset.len > 1))) { e.preventDefault(); applySuggest(sug); return; }
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitForm(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelForm(); return; }
  }
  if (t.matches?.('.tf-desc')) {
    if (e.key === 'Escape') { e.preventDefault(); cancelForm(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitForm(); return; }
  }
  if (t.matches?.('.tm-title') && e.key === 'Enter') { e.preventDefault(); t.blur(); return; }
  if (t.matches?.('.sf-input')) {
    if (e.key === 'Enter') { e.preventDefault(); submitSection(); return; }
    if (e.key === 'Escape') { ui.addSection = null; render(); return; }
  }
  if (t.matches?.('.cm-input') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment(ui.modal.id); return; }
  if (e.key === 'Escape') {
    if (!pop.hidden) { closePopover(); return; }
    if (ui.dialog) { closeDialog(); return; }
    if (isTyping(t)) { t.blur(); if (!ui.modal) return; }
    if (ui.modal) { if (ui.modal.type === 'quick') cancelForm(); else closeModal(); return; }
    if (ui.addForm) { cancelForm(); return; }
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && t.matches?.('[role=button][data-act]')) { e.preventDefault(); t.click(); return; }
  if (isTyping(t) || ui.dialog || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (ui.gPending) {
    ui.gPending = false;
    const map = { h: 'home', i: 'inbox', t: 'today', u: 'upcoming', f: 'filters', c: 'completed', r: 'reports', k: 'calendar', m: 'mine', z: 'team' };
    if (map[k]) { e.preventDefault(); ui.modal = null; setView({ type: map[k] }); }
    return;
  }
  if (k === 'q' || k === 'a') { e.preventDefault(); openQuick(); }
  else if (k === '/') { e.preventDefault(); ui.modal = null; setView({ type: 'search' }); }
  else if (k === 'm') { ui.sidebar = !ui.sidebar; render(); }
  else if (k === 'g') { ui.gPending = true; setTimeout(() => { ui.gPending = false; }, 1200); }
  else if (e.key === '?') { ui.modal = null; setView({ type: 'guide' }); }
  else if (k === 'v') { e.preventDefault(); openVoice(); }
  else if (k === ',') { ui.modal = null; setView({ type: 'prefs' }); }
});

// odświeżenie o północy / po powrocie do karty (zmiana „dziś”)
let lastDay = todayStr();
setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); ui.upStart = weekStart(lastDay); render(); } }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && todayStr() !== lastDay) { lastDay = todayStr(); render(); } });

// ================================================================
//  Start
// ================================================================
// każde nowe uruchomienie (nie odświeżenie) startuje od widoku startowego – domyślnie „Start”
try { const h0 = location.hash; let m0; if ((m0 = h0.match(/^#task-([\w-]+)$/))) localStorage.setItem('lt-open-task', JSON.stringify(m0[1])); if ((m0 = h0.match(/^#join-([a-z0-9]{4,16})$/i))) localStorage.setItem('lt-join', JSON.stringify(m0[1].toLowerCase())); } catch (e) { /* */ }
let freshLaunch = true;
try { freshLaunch = !sessionStorage.getItem('listo-ses'); sessionStorage.setItem('listo-ses', '1'); } catch (e) { /* */ }
if (freshLaunch || !location.hash) {
  const sv0 = state.settings.startView || 'home';
  try { history.replaceState(null, '', '#' + sv0); } catch (e) { /* */ }
  ui.view = hashView();
}
// ================================================================
//  Gesty dotykowe: przesuń w prawo = ukończ, w lewo = termin
// ================================================================
let sw = null, swipeBlockClick = false;
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  const row = e.target.closest('.content .task');
  if (!row || e.target.closest('.check, .caret, button')) return;
  sw = { row, wrap: row.closest('.task-wrap'), x: e.clientX, y: e.clientY, dx: 0, on: false };
}, { passive: true });
document.addEventListener('pointermove', e => {
  if (!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) {
    if (Math.abs(dy) > 10) { sw = null; return; }
    if (Math.abs(dx) < 14) return;
    sw.on = true; sw.row.classList.add('swiping');
  }
  sw.dx = Math.max(-140, Math.min(140, dx));
  sw.row.style.transform = `translateX(${sw.dx}px)`;
  sw.wrap.classList.toggle('swipe-right', sw.dx > 0);
  sw.wrap.classList.toggle('swipe-left', sw.dx < 0);
  sw.wrap.classList.toggle('swipe-armed', Math.abs(sw.dx) > 90);
}, { passive: true });
function endSwipe() {
  if (!sw) return;
  const s = sw; sw = null;
  if (!s.on) return;
  swipeBlockClick = true; setTimeout(() => { swipeBlockClick = false; }, 350);
  s.row.classList.remove('swiping');
  s.row.style.transform = '';
  setTimeout(() => s.wrap.classList.remove('swipe-right', 'swipe-left', 'swipe-armed'), 200);
  const id = s.row.dataset.id, t = task(id);
  if (!t) return;
  if (s.dx > 90) toggleTask(id);
  else if (s.dx < -90) datePicker(s.row, t, v => { Object.assign(t, v); commit(); });
}
document.addEventListener('pointerup', endSwipe);
document.addEventListener('pointercancel', () => { if (sw) { sw.row.classList.remove('swiping'); sw.row.style.transform = ''; sw.wrap.classList.remove('swipe-right', 'swipe-left', 'swipe-armed'); sw = null; } });
document.addEventListener('click', e => { if (swipeBlockClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// ================================================================
//  Wygoda: menu pod prawym przyciskiem, skróty na najechanym zadaniu, Ctrl+Z
// ================================================================
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }) });
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.content .task[data-id], .cal-chip[data-id]');
  if (!row || e.target.closest('a[href], input, textarea')) return;
  const t = task(row.dataset.id);
  if (!t || t.completed) return;
  e.preventDefault();
  if (ui.selected.size > 1 && ui.selected.has(t.id)) { bulkMenu(pointAnchor(e.clientX, e.clientY)); return; }
  taskMenu(pointAnchor(e.clientX, e.clientY), t);
});
document.addEventListener('mouseover', e => {
  const row = e.target.closest?.('.content .task[data-id]');
  ui.hoverId = row ? row.dataset.id : null;
});
function undoLast() {
  if (!ui.lastSnap) { toast('Nie ma czego cofnąć'); return; }
  state = JSON.parse(ui.lastSnap); ui.lastSnap = null;
  commit(); toast('Cofnięto ostatnią zmianę');
}
// skróty działające na zadaniu pod kursorem: D ukończ, T dziś, J jutro, 1–4 priorytet, E edytuj, Delete usuń
function hoverKeys(e) {
  const t = ui.hoverId && task(ui.hoverId);
  if (!t || t.completed || !$(`.content .task[data-id="${t.id}"]`)) return false;
  const k = e.key.toLowerCase(), td = todayStr(), snap = snapshot();
  const done = msg => { commit(); toast(msg, snap); return true; };
  if (k === 'd') { toggleTask(t.id); return true; }
  if (k === 't') { t.due = td; return done('Termin: dziś'); }
  if (k === 'j') { t.due = addDays(td, 1); return done('Termin: jutro'); }
  if (['1', '2', '3', '4'].includes(k)) { t.priority = +k; return done(`Priorytet ${k}`); }
  if (k === 'e') { openTask(t.id, true); return true; }
  if (e.key === 'Delete') { deleteTask(t); return true; }
  return false;
}

// ================================================================
//  Zaznaczanie wielu zadań (Ctrl/Shift + klik) i akcje zbiorcze
// ================================================================
const visibleRowIds = () => [...new Set($$('.content .task[data-id]').filter(r => r.offsetParent).map(r => r.dataset.id))];
function setSelected(ids) {
  ui.selected = new Set(ids.filter(id => { const t = task(id); return t && !t.completed; }));
  $$('.content .task[data-id]').forEach(r => r.classList.toggle('sel', ui.selected.has(r.dataset.id)));
  renderBulkBar();
}
document.addEventListener('click', e => {
  if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
  const row = e.target.closest('.content .task[data-id]');
  if (!row || e.target.closest('.check, .caret, a[href]')) return;
  e.preventDefault(); e.stopPropagation();
  const id = row.dataset.id;
  if (e.shiftKey && ui.selAnchor) {
    const ids = visibleRowIds(), a = ids.indexOf(ui.selAnchor), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) { setSelected([...ui.selected, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)]); return; }
  }
  const s = new Set(ui.selected);
  s.has(id) ? s.delete(id) : s.add(id);
  ui.selAnchor = id;
  setSelected([...s]);
}, true);
function renderBulkBar() {
  let bar = $('#bulk-bar');
  const n = ui.selected.size;
  if (!n) { if (bar) { bar.classList.add('out'); setTimeout(() => { if (!ui.selected.size) bar.remove(); }, 200); } return; }
  if (!bar || bar.classList.contains('out')) { bar?.remove(); bar = document.createElement('div'); bar.id = 'bulk-bar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span class="bb-count"><b>${n}</b> ${plural(n, 'zaznaczone', 'zaznaczone', 'zaznaczonych')}</span>
    <button data-b="done" title="Ukończ zaznaczone">${sz(I.done, 18)}<span>Ukończ</span></button>
    <button data-b="today" title="Ustaw termin na dziś">${sz(I.today || I.calBig, 18)}<span>Dziś</span></button>
    <button data-b="date" title="Wybierz termin">${I.calBig}<span>Termin</span></button>
    <button data-b="prio" title="Priorytet">${flagIcon(1)}<span>Priorytet</span></button>
    <button data-b="move" title="Przenieś">${sz(I.move, 18)}<span>Przenieś</span></button>
    <button data-b="del" class="danger" title="Usuń">${sz(I.trash, 18)}</button>
    <button data-b="x" class="bb-x" title="Wyczyść zaznaczenie (Esc)">${sz(I.x, 16)}</button>`;
  bar.onclick = e => { const b = e.target.closest('[data-b]'); if (b) bulkAction(b.dataset.b, b); };
}
function bulkMenu(anchor) {
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu"><div class="menu-label">${ui.selected.size} zaznaczonych</div>
      ${[['done', 'Ukończ'], ['today', 'Termin: dziś'], ['tomorrow', 'Termin: jutro'], ['date', 'Wybierz termin…'], ['prio', 'Priorytet…'], ['move', 'Przenieś do…'], ['del', 'Usuń']]
        .map(([a, l]) => `<button class="menu-item ${a === 'del' ? 'danger' : ''}" data-b="${a}"><span class="grow">${l}</span></button>`).join('')}</div>`;
    pop.onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; close(); bulkAction(b.dataset.b, $('#bulk-bar') || document.body); };
  });
}
function bulkAction(a, anchor) {
  const ts = [...ui.selected].map(task).filter(Boolean);
  if (a === 'x') { setSelected([]); return; }
  if (!ts.length) return;
  const snap = snapshot(), td = todayStr();
  const finish = msg => { ui.selected.clear(); renderBulkBar(); commit(); toast(msg, snap); };
  const n = ts.length, word = plural(n, 'zadanie', 'zadania', 'zadań');
  if (a === 'done') {
    ts.forEach(t => { const c = $(`.check[data-id="${t.id}"]`); if (c) { c.closest('.task')?.classList.add('completing'); c.classList.add('pop'); burst(c, t.priority); } });
    playSound('done');
    setTimeout(() => {
      ts.forEach(t => {
        state.history.push({ id: t.id, title: t.title, at: Date.now(), projectId: t.projectId, priority: t.priority });
        if (t.recurring) t.due = nextDue(t);
        else { t.completed = true; t.completedAt = Date.now(); descendants(t.id).forEach(d => { if (!d.completed) { d.completed = true; d.completedAt = Date.now(); } }); }
      });
      finish(`Ukończono ${n} ${word}`);
      if (n >= 3) celebrate();
    }, REDUCED ? 0 : 380);
  } else if (a === 'today' || a === 'tomorrow') {
    ts.forEach(t => { t.due = a === 'today' ? td : addDays(td, 1); });
    finish(`Przełożono ${n} ${word} na ${a === 'today' ? 'dziś' : 'jutro'}`);
  } else if (a === 'date') {
    datePicker(anchor, {}, v => { ts.forEach(t => Object.assign(t, v)); save(); render(); renderBulkBar(); ui.lastSnap = snap; });
    ui.popOnClose = () => { ui.selected.clear(); renderBulkBar(); render(); toast(`Zmieniono termin: ${n} ${word}`, snap); };
  } else if (a === 'prio') {
    prioPicker(anchor, 4, p => { ts.forEach(t => { t.priority = p; }); finish(`Priorytet ${p}: ${n} ${word}`); });
  } else if (a === 'move') {
    projectPicker(anchor, { projectId: null, sectionId: null }, v => {
      ts.forEach(t => { t.projectId = v.projectId; t.sectionId = v.sectionId || null; if (t.parentId && !ui.selected.has(t.parentId)) t.parentId = null; t.order = nextOrder(); descendants(t.id).forEach(d => { d.projectId = v.projectId; d.sectionId = t.sectionId; }); });
      finish(`Przeniesiono ${n} ${word} do: ${projName(proj(v.projectId))}`);
    });
  } else if (a === 'del') {
    confirmDlg(`Usunąć ${n} ${word}?`, 'Zaznaczone zadania wraz z podzadaniami zostaną usunięte.', 'Usuń', () => {
      const ids = new Set(ts.flatMap(t => [t.id, ...descendants(t.id).map(d => d.id)]));
      state.tasks = state.tasks.filter(x => !ids.has(x.id));
      finish(`Usunięto ${n} ${word}`);
    });
  }
}

// ================================================================
//  Paleta poleceń (Ctrl + K): skacz do widoków, projektów, zadań, uruchamiaj akcje
// ================================================================
const fold = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
function paletteItems(q) {
  const f = fold(q.trim());
  const go = (type, id) => () => { ui.modal = null; setView({ type, id }); };
  const views = [
    ['Start', 'home', I.home], ['Dziś', 'today', todayIcon()], ['Skrzynka', 'inbox', I.inbox], ['Nadchodzące', 'upcoming', I.upcoming], ['Kalendarz', 'calendar', I.calMonth],
    ['Moje zadania', 'mine', I.person], ['Zespół', 'team', I.team], ['Filtry i etykiety', 'filters', I.filters], ['Raportowanie', 'reports', I.pulse],
    ['Ukończone', 'completed', I.done], ['Szukaj', 'search', I.search],
  ].map(([l, t, ic]) => ({ group: 'Przejdź', label: l, icon: ic, run: go(t) }));
  const projects = userProjects().map(p => ({ group: 'Projekty', label: p.name, icon: `<span class="pal-hash" style="color:${p.color && p.color !== '#808080' ? p.color : 'var(--muted)'}">#</span>`, run: go('project', p.id) }));
  const td = todayStr();
  const cmds = [
    { label: 'Dodaj zadanie', hint: 'Q', icon: I.plus, run: () => openQuick() },
    { label: 'Przełóż zaległe na dziś', icon: I.calBig, run: () => rescheduleOverdue() },
    { label: 'Motyw kolorystyczny…', icon: I.moon, run: () => themePicker($('#sidebar .user') || document.body) },
    { label: 'Cofnij ostatnią zmianę', hint: 'Ctrl Z', icon: I.repeat, run: undoLast },
    { label: 'Dodaj projekt', icon: I.plus, run: () => projectDialog() },
    { label: 'Statystyki produktywności', icon: I.pulse, run: () => setView({ type: 'reports' }) },
    { label: 'Skróty klawiszowe', hint: '?', icon: I.keyboard, run: shortcutsDialog },
  ].map(c => ({ group: 'Polecenia', ...c }));
  const tasks = active().filter(t => !f || fold(t.title).includes(f)).sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).slice(0, f ? 8 : 5)
    .map(t => { const di = dueInfo(t.due, t.time); return { group: 'Zadania', label: t.title, icon: `<span class="check p${t.priority}" style="width:15px;height:15px;margin:0"></span>`, hint: di ? `<span class="meta-item due ${di.cls}">${di.label}</span>` : esc(projName(proj(t.projectId))), run: () => openTask(t.id) }; });
  let items = [...views, ...projects, ...cmds].filter(i => !f || fold(i.label).includes(f));
  items = f ? [...items, ...tasks] : [...cmds.slice(0, 3), ...views.slice(0, 4), ...tasks];
  if (f) items.push({ group: 'Nowe', label: `Dodaj zadanie: „${q.trim()}”`, icon: I.plus, hint: 'Enter', run: () => quickCreate(q.trim()), create: true });
  return items;
}
function quickCreate(text) {
  const r = parseQuick(text, {});
  if (!r.title) return;
  const labels = r.labels.map(n => { let l = state.labels.find(x => x.name.toLowerCase() === n.toLowerCase()); if (!l) { l = { id: uid(), name: n, color: '#808080' }; state.labels.push(l); } return l.id; });
  const t = newTask({ title: r.title, description: '', projectId: r.projectId || 'inbox', sectionId: r.sectionId || null, parentId: null, priority: r.priority || 4, due: r.due || null, time: r.time || null, endTime: r.endTime || null, assignees: r.assignees || [], recurring: r.recurring || null, labels, order: nextOrder() });
  state.tasks.push(t); markEnter(t.id); commit();
  toast(`Dodano zadanie do: ${projName(proj(t.projectId))}`, null, () => openTask(t.id), 'Otwórz');
}
function openPalette() {
  if ($('#palette')) return;
  closePopover(true);
  const root = document.createElement('div');
  root.id = 'palette';
  root.innerHTML = `<div class="pal-box" role="dialog" aria-label="Paleta poleceń">
    <div class="pal-in">${I.search}<input class="pal-input" placeholder="Szukaj zadań, projektów, poleceń… lub wpisz nowe zadanie" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="pal-list" role="listbox"></div>
    <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> wybierz</span><span><kbd>Enter</kbd> otwórz</span><span><kbd>Ctrl</kbd><kbd>K</kbd> zamknij</span></div></div>`;
  document.body.appendChild(root);
  const inp = $('.pal-input', root), list = $('.pal-list', root);
  let items = [], idx = 0;
  const draw = () => {
    items = paletteItems(inp.value);
    idx = Math.min(idx, items.length - 1); if (idx < 0) idx = 0;
    let g = '';
    list.innerHTML = items.map((it, i) => {
      const head = it.group !== g ? `<div class="pal-group">${(g = it.group)}</div>` : '';
      return `${head}<button class="pal-item ${i === idx ? 'on' : ''}" data-i="${i}" role="option"><span class="pal-ic">${it.icon || ''}</span><span class="grow">${esc(it.label)}</span>${it.hint ? `<span class="pal-hint">${it.hint}</span>` : ''}</button>`;
    }).join('') || '<div class="pal-empty">Brak wyników</div>';
  };
  const mark = () => { $$('.pal-item', list).forEach(b => b.classList.toggle('on', +b.dataset.i === idx)); $(`.pal-item[data-i="${idx}"]`, list)?.scrollIntoView({ block: 'nearest' }); };
  const run = i => { const it = items[i]; closePalette(); if (it) it.run(); };
  inp.addEventListener('input', () => { idx = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
  list.addEventListener('mousemove', e => { const b = e.target.closest('.pal-item'); if (b && +b.dataset.i !== idx) { idx = +b.dataset.i; mark(); } });
  list.addEventListener('click', e => { const b = e.target.closest('.pal-item'); if (b) run(+b.dataset.i); });
  root.addEventListener('mousedown', e => { if (e.target === root) closePalette(); });
  draw();
  inp.focus();
}
function closePalette() {
  const root = $('#palette');
  if (!root) return;
  root.classList.add('closing');
  setTimeout(() => root.remove(), REDUCED ? 0 : 150);
}

// ================================================================
//  Wklejenie listy (kilka linii) w pole zadania = kilka zadań naraz
// ================================================================
document.addEventListener('paste', e => {
  const inp = e.target;
  if (!inp.matches?.('.tf-title') || !ui.addForm) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const lines = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•–]|\[[ xX]?\]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  if (lines.length < 2) return;
  e.preventDefault();
  const f = ui.addForm, d = f.draft, snap = snapshot();
  lines.slice(0, 100).forEach((line, i) => {
    const r = parseQuick(line, { projectId: d.projectId });
    if (!r.title) return;
    const labelIds = [...d.labels];
    r.labels.forEach(n => { let l = state.labels.find(x => x.name.toLowerCase() === n.toLowerCase()); if (!l) { l = { id: uid(), name: n, color: '#808080' }; state.labels.push(l); } if (!labelIds.includes(l.id)) labelIds.push(l.id); });
    let projectId = r.projectId || d.projectId || 'inbox', sectionId = r.projectId && r.projectId !== d.projectId ? r.sectionId : (r.sectionId || d.sectionId);
    const parentId = d.parentId || null;
    if (parentId) { const par = task(parentId); if (par) { projectId = par.projectId; sectionId = par.sectionId; } }
    const t = newTask({ title: r.title, description: '', projectId, sectionId: sectionId || null, parentId, priority: r.priority || d.priority || 4,
      due: r.due || d.due || null, time: r.time || null, endTime: r.endTime || null, assignees: [...new Set([...(d.assignees || []), ...(r.assignees || [])])], recurring: r.recurring || d.recurring || null, labels: labelIds, order: nextOrder() + i * 0.001 });
    state.tasks.push(t); markEnter(t.id);
  });
  const n = Math.min(lines.length, 100);
  if (f.ctx === 'quick') { ui.addForm = null; ui.modal = null; } else { f.draft = freshDraft(f.defaults); ui.focusSel = '.task-form .tf-title'; }
  commit();
  toast(`Dodano ${n} ${plural(n, 'zadanie', 'zadania', 'zadań')} z wklejonej listy`, snap);
});

// ================================================================
//  Responsywność: fala po kliknięciu, ostatnia pozycja kursora (dla okien)
// ================================================================
const lastPointer = { x: 0, y: 0, at: 0 };
document.addEventListener('pointerdown', e => {
  lastPointer.x = e.clientX; lastPointer.y = e.clientY; lastPointer.at = Date.now();
  if (REDUCED) return;
  const el = e.target.closest('.nav-item, .btn, .menu-item, .dp2-q, .dp2-btn, .tb-btn, .pal-item, #bulk-bar button, .tp-item, .add-task');
  if (!el || e.button !== 0) return;
  const r = el.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
  const w = document.createElement('span');
  w.className = 'ripple';
  w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  el.appendChild(w);
  setTimeout(() => w.remove(), 600);
}, true);

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); $('#palette') ? closePalette() : openPalette(); return; }
  if ($('#palette')) return;
  if (e.key === 'Escape' && ui.selected.size && pop.hidden && !ui.dialog) { e.preventDefault(); e.stopImmediatePropagation(); setSelected([]); return; }
  if (isTyping(e.target) || ui.dialog || ui.modal) return;
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undoLast(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a' && $('.content .task[data-id]')) { e.preventDefault(); setSelected(visibleRowIds()); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || !pop.hidden || ui.gPending) return;
  if (hoverKeys(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// ================================================================
//  Start – widok główny: wszystko, co ważne, w jednym miejscu
// ================================================================
function homeScore(t, td) {
  let s = (5 - t.priority) * 90;
  if (t.due) { const n = diffDays(t.due, td); s += n < 0 ? 1000 - n * 4 : n === 0 ? 620 : n === 1 ? 320 : n <= 7 ? 170 - n * 12 : 0; }
  if (t.time && t.due === td) s += 40 - parseInt(t.time, 10);
  return s;
}
function countUp() {
  if (REDUCED) return;
  $$('.cnt-up').forEach(el => {
    const to = +el.dataset.to, t0 = performance.now(), d = 700;
    if (!to) return;
    const step = now => { const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e); if (p < 1) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  });
}
document.addEventListener('click', e => { if (e.target.closest('[data-act="home-reset-skip"]')) { ui.homeSkip = new Set(); ui.homeAnim = true; render(); } });
document.addEventListener('keydown', e => {
  const inp = e.target.closest?.('.home-add');
  if (!inp || e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const v = inp.value.trim();
  if (v) { inp.value = ''; homeAdd(v); }
});
document.addEventListener('input', e => {
  const inp = e.target.closest?.('.home-add');
  if (!inp) return;
  const box = $('.hm-qa-prev'), v = inp.value.trim();
  if (!box) return;
  if (!v) { box.innerHTML = ''; return; }
  const r = parseQuick(v, {});
  const due = r.due || todayStr(), di = dueInfo(due, r.time);
  box.innerHTML = `<span class="pchip due ${di.cls}">${I.cal} ${di.label}</span>${r.priority ? `<span class="pchip">${flagIcon(r.priority, 12)} P${r.priority}</span>` : ''}<span class="pchip"># ${esc(projName(proj(r.projectId || 'inbox')))}</span>${r.labels.map(l => `<span class="pchip">@${esc(l)}</span>`).join('')}`;
});
setInterval(() => { const c = $('#home-clock'); if (c) c.textContent = nowHM(); }, 15000);
// ================================================================
//  v9 – kolory zakładek, ustawienia, poradnik, nawyki, głos, ekran startowy
// ================================================================
const NAV_HUE = {
  home: 'var(--accent)', search: '#8f9aa6', inbox: '#4f8ff7', today: '#3ec26a', upcoming: '#9466f0', calendar: '#f5a531', mine: '#ff6f61', team: '#2bb5a3', person: '#2bb5a3',
  filters: '#e05194', label: '#e05194', filter: '#e05194', reports: '#14aaf5',
  completed: '#3ec26a', prefs: '#8f9aa6', guide: '#4f8ff7',
};
function applyPrefs() {
  const s = state.settings, root = document.documentElement;
  root.classList.toggle('dens-compact', s.density === 'compact');
  root.classList.toggle('dens-roomy', s.density === 'roomy');
  root.classList.toggle('no-anim', s.anim === 'off');
  root.classList.toggle('plain-nav', s.navColors === false);
  root.classList.toggle('hide-desc', s.showDesc === false);
  root.classList.toggle('no-hover-fx', s.hoverFx === false);
  const z = (+s.scale || 100) / 100;
  root.style.zoom = z === 1 ? '' : String(z);
  const p = s.pomo || PREF_DEFAULTS.pomo;
}
function setPref(k, v, el) {
  if (k === 'theme' || k === 'accent') { document.documentElement.classList.add('theme-fade'); setTimeout(() => document.documentElement.classList.remove('theme-fade'), 600); }
  state.settings[k] = v;
  // w Ustawieniach zmieniamy tylko klikniętą kontrolkę – bez przerysowania strony (koniec z migotaniem)
  if (el && ui.view.type === 'prefs' && el.isConnected) { save(); applyTheme(); applyPrefs(); renderSidebar(); prefSync(el, k, v); return; }
  commit();
}
function prefSync(el, k, v) {
  const grp = el.closest('.seg-inline, .pf-sw');
  if (grp) { const cls = grp.classList.contains('pf-sw') ? 'on' : 'sel'; $$('button', grp).forEach(b => b.classList.toggle(cls, b === el)); }
  if (el.classList.contains('switch')) { el.classList.toggle('on', !!v); el.setAttribute('aria-checked', String(!!v)); }
  if (el.classList.contains('pf-chk')) el.classList.toggle('on');
  if (el.dataset.act === 'pref-step') { const b = $('b', el.parentElement); if (b) b.textContent = k === 'pomo' ? v[+el.dataset.i] + ' min' : v; b?.classList.remove('bump'); void b?.offsetWidth; b?.classList.add('bump'); }
  if (k === 'accent') { const d = $('.grow span', el.closest('.pf-row')); if (d) d.textContent = ACCENTS.find(a => a.id === v)?.name || ''; }
}

// ---------- wspólne kawałki interfejsu ----------
const segBtns = (k, cur, opts, act = 'pref') => `<div class="seg-inline">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'sel' : ''}" data-act="${act}" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const swBtn = (on, k, act = 'pref-tg', extra = '') => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" data-k="${k}" ${extra} role="switch" aria-checked="${!!on}"><i></i></button>`;
const prefRow = (title, desc, ctrl) => `<div class="pf-row"><div class="grow"><b>${title}</b>${desc ? `<span>${desc}</span>` : ''}</div><div class="pf-ctrl">${ctrl}</div></div>`;
const stepper = (k, val, d, extra = '', unit = '') => `<div class="stepper"><button data-act="pref-step" data-k="${k}" data-d="-${d}" ${extra} aria-label="Mniej">−</button><b>${val}${unit}</b><button data-act="pref-step" data-k="${k}" data-d="${d}" ${extra} aria-label="Więcej">+</button></div>`;

// ---------- pasek statystyk pod nagłówkiem (projekt, skrzynka, etykieta, filtr) ----------
function insightBar(v) {
  const td = todayStr();
  let list, done;
  if (v.type === 'project' || v.type === 'inbox') { const pid = v.type === 'inbox' ? 'inbox' : v.id; list = active().filter(t => t.projectId === pid); done = state.tasks.filter(t => t.projectId === pid && t.completed); }
  else if (v.type === 'label') { list = active().filter(t => t.labels.includes(v.id)); done = state.tasks.filter(t => t.completed && t.labels.includes(v.id)); }
  else { const f = allFilters().find(x => x.id === v.id); if (!f) return ''; list = active().filter(t => evalQuery(f.query, t)); done = []; }
  const od = list.filter(t => t.due && t.due < td).length, tdn = list.filter(t => t.due === td).length;
  const wk = list.filter(t => t.due && t.due > td && t.due <= addDays(td, 7)).length, nod = list.filter(t => !t.due).length;
  const dw = done.filter(t => (t.completedAt || 0) > Date.now() - 7 * 864e5).length;
  const pct = list.length + done.length ? Math.round(done.length / (list.length + done.length) * 100) : 0;
  return `<div class="insight">
    <div class="ins-chips">
      <span class="ins"><b>${list.length}</b> ${plural(list.length, 'otwarte', 'otwarte', 'otwartych')}</span>
      ${od ? `<span class="ins red"><b>${od}</b> po terminie</span>` : ''}
      ${tdn ? `<span class="ins green"><b>${tdn}</b> na dziś</span>` : ''}
      ${wk ? `<span class="ins purple"><b>${wk}</b> w 7 dni</span>` : ''}
      ${nod ? `<span class="ins"><b>${nod}</b> bez terminu</span>` : ''}
      ${dw ? `<span class="ins green">${sz(I.done, 13)} <b>${dw}</b> w tym tyg.</span>` : ''}
    </div>
    ${v.type !== 'filter' ? `<div class="ins-prog" title="${pct}% ukończone"><i style="--w:${pct}%"></i></div><span class="ins-pct">${pct}%</span>` : ''}
  </div>`;
}
function completedStats() {
  const done = state.tasks.filter(t => t.completed && t.completedAt), now = Date.now(), td = todayStr();
  const cnt = ms => done.filter(t => t.completedAt > now - ms).length;
  const today = done.filter(t => fmtDate(new Date(t.completedAt)) === td).length;
  const days = [...Array(14)].map((_, i) => addDays(td, i - 13));
  const per = days.map(d => state.history.filter(h => fmtDate(new Date(h.at)) === d).length);
  const max = Math.max(1, ...per);
  return `<div class="cs">
    <div class="cs-cards"><div><b>${today}</b><span>dziś</span></div><div><b>${cnt(7 * 864e5)}</b><span>7 dni</span></div><div><b>${cnt(30 * 864e5)}</b><span>30 dni</span></div><div><b>${state.history.length}</b><span>łącznie</span></div></div>
    <div class="cs-bars" title="Ukończone w ostatnich 14 dniach">${per.map((c, i) => `<i class="${days[i] === td ? 'today' : ''}" style="--h:${Math.max(6, c / max * 100).toFixed(0)}%;--d:${i}" title="${shortDate(days[i])}: ${c}"></i>`).join('')}</div>
  </div>`;
}
function searchHelp() {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('listo-recent-q') || '[]'); } catch (e) { /* */ }
  const quick = [['today', 'Na dziś', 'green'], ['overdue', 'Po terminie', 'red'], ['p1', 'Priorytet 1', 'red'], ['7 days', 'Najbliższe 7 dni', 'purple'], ['no date', 'Bez terminu', ''], ['p1 & today', 'P1 na dziś', 'red']];
  return `<div class="sh">
    <div class="sh-sec"><h3>Szybkie wyszukiwania</h3><div class="sh-chips">${quick.map(([q, l, c]) => `<button class="sh-chip ${c}" data-act="search-q" data-q="${esc(q)}">${l}<code>${esc(q)}</code></button>`).join('')}</div></div>
    ${recent.length ? `<div class="sh-sec"><h3>Ostatnio szukane</h3><div class="sh-chips">${recent.map(q => `<button class="sh-chip" data-act="search-q" data-q="${esc(q)}">${sz(I.history, 14)} ${esc(q)}</button>`).join('')}</div></div>` : ''}
    <div class="sh-sec"><h3>Projekty i etykiety</h3><div class="sh-chips">${[proj('inbox'), ...userProjects()].map(p => `<button class="sh-chip" data-act="nav" data-view="${p.isInbox ? 'inbox' : 'project'}" ${p.isInbox ? '' : `data-id="${p.id}"`}><span style="color:${p.color && p.color !== '#808080' ? p.color : 'var(--muted)'}">#</span> ${esc(projName(p))}</button>`).join('')}${state.labels.map(l => `<button class="sh-chip" data-act="nav" data-view="label" data-id="${l.id}"><span style="color:${l.color}">@</span>${esc(l.name)}</button>`).join('')}</div></div>
    <div class="sh-tip">${sz(I.bolt, 15)}<span>Łącz zapytania: <code>&amp;</code> (i), <code>|</code> (lub), <code>!</code> (nie), np. <code>p1 &amp; !today</code>, <code>#Studia &amp; 7 days</code>.</span></div>
  </div>`;
}
function reportsExtra() {
  const td = todayStr(), act = active();
  // mapa aktywności – 12 tygodni
  const byDay = {}; state.history.forEach(h => { const d = fmtDate(new Date(h.at)); byDay[d] = (byDay[d] || 0) + 1; });
  const start = addDays(weekStart(td), -77);
  let cells = '';
  for (let d = start; d <= td; d = addDays(d, 1)) { const c = byDay[d] || 0; cells += `<i class="l${c === 0 ? 0 : c < 2 ? 1 : c < 4 ? 2 : c < 6 ? 3 : 4}" title="${shortDate(d)}: ${c}"></i>`; }
  // priorytety
  const pr = [1, 2, 3, 4].map(p => act.filter(t => t.priority === p).length), prT = Math.max(1, act.length);
  // wg projektu (30 dni)
  const pc = {}; state.history.filter(h => h.at > Date.now() - 30 * 864e5).forEach(h => { pc[h.projectId || 'inbox'] = (pc[h.projectId || 'inbox'] || 0) + 1; });
  const pk = Object.keys(pc).sort((a, b) => pc[b] - pc[a]).slice(0, 6), pmax = Math.max(1, ...pk.map(k => pc[k]));
  // godziny
  const hrs = Array(24).fill(0); state.history.forEach(h => { hrs[new Date(h.at).getHours()]++; });
  const hmax = Math.max(1, ...hrs), best = hrs.indexOf(Math.max(...hrs));
  return `<div class="rx-grid">
    <section class="rep-box rx"><h3>Mapa aktywności · 12 tygodni</h3><div class="rx-heat">${cells}</div>
      <div class="rx-leg"><span>mniej</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>więcej</span></div></section>
    <section class="rep-box rx"><h3>Aktywne zadania wg priorytetu</h3><div class="rx-stack">${pr.map((n, i) => n ? `<i style="--w:${n / prT * 100}%;--c:var(--p${i + 1})" title="P${i + 1}: ${n}"></i>` : '').join('')}</div>
      <div class="rx-pl">${pr.map((n, i) => `<span><i style="--c:var(--p${i + 1})"></i>P${i + 1} <b>${n}</b></span>`).join('')}</div></section>
    <section class="rep-box rx"><h3>Ukończone wg projektu · 30 dni</h3>${pk.length ? pk.map(k => { const p = proj(k); const col = p?.color && p.color !== '#808080' ? p.color : 'var(--accent)'; return `<div class="rx-row"><span class="grow">${esc(projName(p))}</span><span class="rx-bar"><i style="--w:${pc[k] / pmax * 100}%;--c:${col}"></i></span><b>${pc[k]}</b></div>`; }).join('') : '<div class="muted small">Brak ukończonych zadań w ostatnich 30 dniach.</div>'}</section>
    <section class="rep-box rx"><h3>Kiedy kończysz zadania</h3><div class="rx-hours">${hrs.map((c, h) => `<i class="${h === best && c ? 'best' : ''}" style="--h:${Math.max(4, c / hmax * 100).toFixed(0)}%" title="${h}:00 – ${c}"></i>`).join('')}</div>
      <div class="rx-hl"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>${hrs[best] ? `<div class="muted small" style="margin-top:6px">Najczęściej o <b>${best}:00</b></div>` : ''}</section>
  </div>`;
}


// ---------- Poradnik ----------
const GUIDE_VIEWS = [
  ['home', I.home, 'Start', 'Widok główny: najważniejsze zadanie „Na teraz”, plan dnia, nawyki, terminy i statystyki w jednym miejscu.', 'G H'],
  ['inbox', I.inbox, 'Skrzynka', 'Miejsce na wszystko, co jeszcze nie ma projektu. Wrzucaj tu pomysły i porządkuj później.', 'G I'],
  ['today', todayIcon(), 'Dziś', 'Zadania na dziś i zaległe. Przycisk „Zmień termin” przenosi zaległe na dziś.', 'G T'],
  ['upcoming', I.upcoming, 'Nadchodzące', 'Plan na kolejne tygodnie – przeciągaj zadania między dniami.', 'G U'],
  ['calendar', I.calMonth, 'Kalendarz', 'Widok miesiąca. Kliknij dzień, by zobaczyć zadania; przeciągnij zadanie, by zmienić termin.', 'G K'],
  ['filters', I.filters, 'Filtry i etykiety', 'Własne widoki oparte na zapytaniach, np. „p1 & today”, oraz etykiety @.', 'G F'],
  ['reports', I.pulse, 'Raportowanie', 'Dzienny cel, serie, mapa aktywności i godziny, w których najczęściej kończysz zadania.', 'G R'],
  ['completed', I.done, 'Ukończone', 'Historia ukończonych zadań – możesz je przywrócić jednym kliknięciem.', 'G C'],
  ['mine', I.person, 'Moje zadania', 'Wszystko, co jest przypisane do Ciebie – podzielone na: w trakcie, do zrobienia i z terminem.', 'G M'],
  ['team', I.team, 'Zespół', 'Tablica osób: kto ma ile zadań, co jest w trakcie, co po terminie. Przeciągnij zadanie na osobę, by je przypisać.', 'G Z'],
  ['prefs', I.gear, 'Ustawienia', 'Wygląd, zespół i zaproszenia, kalendarze Google, powiadomienia push, widoczne zakładki.', ','],
];
const GUIDE_KEYS = [
  ['Nawigacja', [['Ctrl K', 'Paleta poleceń – szukaj i uruchamiaj wszystko'], ['/', 'Szukaj'], ['M', 'Pokaż / ukryj menu'], ['G potem H/I/T/U/K/M/F/R/S/A/C', 'Przejdź do zakładki (patrz wyżej)'], ['?', 'Ten poradnik'], [',', 'Ustawienia']]],
  ['Dodawanie', [['Q', 'Szybkie dodawanie zadania'], ['V', 'Dodaj zadanie głosem'], ['Enter', 'Zapisz zadanie'], ['Tab', 'Zatwierdź podpowiedź #projekt / @etykieta'], ['Ctrl V', 'Wklej listę – każda linia to osobne zadanie']]],
  ['Zadanie pod kursorem', [['D', 'Ukończ'], ['T', 'Termin dziś'], ['J', 'Termin jutro'], ['1 … 4', 'Priorytet'], ['E', 'Edytuj'], ['Delete', 'Usuń']]],
  ['Zaznaczanie i edycja', [['Ctrl klik', 'Zaznacz kilka zadań'], ['Shift klik', 'Zaznacz zakres'], ['Ctrl A', 'Zaznacz wszystkie widoczne'], ['Ctrl Z', 'Cofnij ostatnią zmianę'], ['Esc', 'Zamknij / anuluj / odznacz'], ['Ctrl Enter', 'Wyślij komentarz']]],
];
const GUIDE_EX = ['Oddać sprawozdanie pt 10:00 p1 #Studia', 'Siłownia co pon @sport', 'Zapłacić rachunek 15.12 p2', 'Powtórka za 3 dni o 18:00', 'Kupić prezent w ten weekend'];
const kbd = k => k.split(' ').map(x => ['potem', 'klik'].includes(x) ? ` ${x} ` : `<kbd>${esc(x)}</kbd>`).join('');
function renderGuide() {
  let html = header('Poradnik', { icon: sz(I.book, 24), iconCls: 'tile', sub: 'Wszystko, co musisz wiedzieć o Listo – zakładki, składnia, głos i skróty klawiszowe.' });
  html += `<div class="gd-search">${I.search}<input class="gd-q" placeholder="Szukaj w poradniku, np. „termin”, „głos”, „skrót”…" aria-label="Szukaj w poradniku"></div>
  <section class="gd-sec" data-text="pierwsze kroki start dodaj zadanie termin skup"><h2>Pierwsze kroki</h2><div class="gd-steps">
    ${[[I.plus, 'Dodaj zadanie', 'Naciśnij <kbd>Q</kbd> albo „Dodaj zadanie”. Wpisz np. „Raport jutro 15:00 p1”.', 'quick-add', 'Dodaj teraz'],
       [I.mic, 'Powiedz je na głos', 'Naciśnij <kbd>V</kbd> i powiedz, co masz zrobić – termin i priorytet wykryją się same.', 'voice', 'Wypróbuj'],
       [I.team, 'Przypisz osobę', 'Wpisz +Imię w nazwie zadania albo wybierz „Osoby” – dostanie powiadomienie push.', 'nav:team', 'Zespół'],
       [I.pulse, 'Sprawdzaj postępy', 'Start i Raportowanie pokażą Twój rytm, serie i najbardziej produktywne godziny.', 'nav:reports', 'Zobacz']]
      .map(([ic, t, d, a, b], i) => `<div class="gd-step spot" style="--i:${i}"><span class="gd-n">${i + 1}</span><span class="gd-ic">${sz(ic, 20)}</span><b>${t}</b><p>${d}</p><button class="btn sm" ${a.startsWith('nav:') ? `data-act="nav" data-view="${a.slice(4)}"` : `data-act="${a}"`}>${b}</button></div>`).join('')}
  </div></section>
  <section class="gd-sec"><h2>Zakładki</h2><div class="gd-views">${GUIDE_VIEWS.map(([v, ic, n, d, k], i) => `<div class="gd-view spot" data-text="${esc(fold(n + ' ' + d))}" style="--nc:${NAV_HUE[v]};--i:${i}"><span class="gd-vi">${sz(ic, 20)}</span><div class="grow"><b>${n}${k ? `<span class="gd-k">${kbd(k)}</span>` : ''}</b><p>${d}</p></div><button class="icon-btn" data-act="nav" data-view="${v}" title="Otwórz">${I.right}</button></div>`).join('')}</div></section>
  <section class="gd-sec" data-text="szybkie dodawanie skladnia termin priorytet projekt etykieta powtarzanie godzina"><h2>Szybkie dodawanie – wypróbuj</h2>
    <div class="gd-try"><input class="gd-try-in" placeholder="Wpisz zadanie, np. „Oddać projekt pt 10:00 p1 #Studia”" aria-label="Wypróbuj składnię"><div class="gd-try-out"><span class="muted small">Tu zobaczysz, co rozpozna Listo.</span></div></div>
    <div class="sh-chips" style="margin-top:10px">${GUIDE_EX.map(x => `<button class="sh-chip" data-act="gd-ex" data-t="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <table class="kbd-table gd-tbl">${[['jutro, pojutrze, pt, w sobotę, 24.12, 5 maj, za 3 dni', 'termin'], ['o 15:00, 9am', 'godzina'], ['codziennie, co tydzień, co pon', 'powtarzanie'], ['p1 … p4', 'priorytet (p1 najważniejszy)'], ['#Projekt  /Sekcja', 'projekt i sekcja'], ['@etykieta', 'etykieta']].map(([a, b]) => `<tr data-text="${esc(fold(a + ' ' + b))}"><td><code>${esc(a)}</code></td><td>${b}</td></tr>`).join('')}</table></section>
  <section class="gd-sec" data-text="glos glosowe mowa dyktowanie mikrofon"><h2>Dodawanie głosem</h2>
    <div class="gd-voice spot"><button class="gd-mic" data-act="voice" title="Wypróbuj">${sz(I.mic, 26)}</button><div><p>Naciśnij <kbd>V</kbd>, mikrofon na Starcie albo „Głos” w formularzu i po prostu powiedz zadanie. Listo samo rozpozna:</p>
      <ul><li><b>termin</b> – „jutro”, „w piątek”, „za tydzień”, „do środy”, „24 grudnia”, „na koniec tygodnia”</li><li><b>godzinę</b> – „o 15”, „o piętnastej trzydzieści”, „rano”, „po południu”, „wieczorem”</li>
      <li><b>priorytet</b> – „priorytet pierwszy”, „pilne”, „bardzo ważne” (P1), „ważne” (P2), „mało ważne” (P3)</li><li><b>projekt i etykietę</b> – „w projekcie Studia”, „etykieta sport”</li><li><b>kilka zadań naraz</b> – rozdziel je słowami „następne zadanie”</li></ul>
      <p class="muted small">Przykład: „Oddać sprawozdanie z fizyki w piątek o dziesiątej, pilne, w projekcie Studia”.</p></div></div></section>
  <section class="gd-sec"><h2>Skróty klawiszowe</h2><div class="gd-keys">${GUIDE_KEYS.map(([g, rows]) => `<div class="gd-kg spot"><h3>${g}</h3><table class="kbd-table">${rows.map(([k, d]) => `<tr data-text="${esc(fold(k + ' ' + d + ' skrot'))}"><td>${kbd(k)}</td><td>${d}</td></tr>`).join('')}</table></div>`).join('')}</div></section>
  <section class="gd-sec" data-text="myszka dotyk gesty przeciagnij prawy klik telefon"><h2>Myszka, dotyk i gesty</h2><div class="gd-tips">
    ${[['Prawy klik na zadaniu', 'szybkie menu z terminem, priorytetem i przenoszeniem'], ['Przeciągnij zadanie', 'zmień kolejność, sekcję, projekt (na menu) lub dzień'], ['Kliknij termin pod zadaniem', 'od razu otwiera wybór daty'], ['Najedź na zadanie i naciśnij klawisz', 'D, T, J, 1–4, E działają bez otwierania'], ['Telefon: przesuń w prawo', 'ukończ zadanie'], ['Telefon: przesuń w lewo', 'zmień termin']].map(([a, b]) => `<div class="gd-tip" data-text="${esc(fold(a + ' ' + b))}"><b>${a}</b><span>${b}</span></div>`).join('')}</div></section>
  <section class="gd-sec" data-text="wskazowki porady triki"><h2>Wskazówki</h2><div class="gd-tips">
    ${['Ustaw dzienny cel w Raportowaniu – kółko w „Dziś” pokaże postęp.', 'Suwak przy zadaniu: lewo = nie zaczęte, środek = w trakcie, prawo = ukończone.', 'W Kalendarzu przeciągnij po pustych godzinach, by dodać wydarzenie z przedziałem czasu.', 'Filtr osób u góry (Wszyscy / Ja / osoba) działa w Dziś, Nadchodzących i Kalendarzu.', 'Ctrl+K otwiera paletę: wpisz nazwę zadania, projektu albo polecenia.', 'W Ustawieniach ukryjesz zakładki i kafelki, których nie używasz.'].map(t => `<div class="gd-tip" data-text="${esc(fold(t))}"><span>💡 ${t}</span></div>`).join('')}</div></section>`;
  return html;
}
document.addEventListener('input', e => {
  if (e.target.classList?.contains('gd-q')) {
    const q = fold(e.target.value.trim());
    $$('.gd-sec').forEach(sec => {
      const items = $$('[data-text]', sec).filter(x => x !== sec);
      let any = !q || fold(sec.dataset.text || '').includes(q) || fold($('h2', sec)?.textContent || '').includes(q);
      items.forEach(it => { const hit = !q || fold(it.dataset.text).includes(q); it.classList.toggle('gd-hide', !hit && !(q && fold(sec.dataset.text || '').includes(q))); if (hit) any = true; });
      sec.classList.toggle('gd-hide', !any);
    });
  } else if (e.target.classList?.contains('gd-try-in')) gdTry(e.target.value);
  else if (e.target.classList?.contains('pf-in')) { clearTimeout(e.target._t); const el = e.target; el._t = setTimeout(() => { state.settings[el.dataset.k] = el.value.trim(); save(); renderSidebar(); }, 400); }
});
function gdTry(v) {
  const out = $('.gd-try-out');
  if (!out) return;
  if (!v.trim()) { out.innerHTML = '<span class="muted small">Tu zobaczysz, co rozpozna Listo.</span>'; return; }
  out.innerHTML = parsedChips(parseQuick(v, {}));
}
function parsedChips(r) {
  const di = r.due && dueInfo(r.due, r.time);
  return `<span class="pv-title">${esc(r.title || '…')}</span>${di ? `<span class="pchip due ${di.cls}">${I.cal} ${di.label}</span>` : ''}${r.recurring ? `<span class="pchip">${I.repeat} ${REC_LABEL[r.recurring]}</span>` : ''}${r.priority ? `<span class="pchip">${flagIcon(r.priority, 12)} P${r.priority}</span>` : ''}${r.projectId ? `<span class="pchip"># ${esc(projName(proj(r.projectId)))}${r.sectionId ? ' / ' + esc(sectionOf({ projectId: r.projectId, sectionId: r.sectionId })?.name || '') : ''}</span>` : ''}${r.labels.map(l => `<span class="pchip">@${esc(l)}</span>`).join('')}`;
}

// ---------- Dodawanie głosem ----------
let dictNS = null;
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { el: null, final: '', partial: '', listening: false, rec: null, edited: false };
if (window.claude?.use) {
  claude.use('dictation').then(d => {
    dictNS = d;
    if (!d) return;
    d.onPartial(({ text }) => { voice.partial = text; voiceUpdate(); });
    d.onFinal(({ text }) => { voice.final = (voice.final ? voice.final + ' ' : '') + text; voice.partial = ''; voiceUpdate(); });
    d.onState(({ state: st, reason }) => { if (st === 'idle') { voice.listening = false; voiceEnded(reason); } else if (st === 'listening') { voice.listening = true; voiceSetState('listening'); } });
  }).catch(() => { /* brak dyktowania */ });
}
const NUMW = { jeden: 1, jedną: 1, jedna: 1, dwa: 2, dwie: 2, trzy: 3, cztery: 4, pięć: 5, sześć: 6, siedem: 7, osiem: 8, dziewięć: 9, dziesięć: 10, czternaście: 14 };
const ORDH = { pierwszej: 1, drugiej: 2, trzeciej: 3, czwartej: 4, piątej: 5, szóstej: 6, siódmej: 7, ósmej: 8, dziewiątej: 9, dziesiątej: 10, jedenastej: 11, dwunastej: 12, trzynastej: 13, czternastej: 14, piętnastej: 15, szesnastej: 16, siedemnastej: 17, osiemnastej: 18, dziewiętnastej: 19, dwudziestej: 20, 'dwudziestej pierwszej': 21, 'dwudziestej drugiej': 22, 'dwudziestej trzeciej': 23 };
const MINW = { piętnaście: 15, trzydzieści: 30, 'czterdzieści pięć': 45, dziesięć: 10, dwadzieścia: 20, pięćdziesiąt: 50, czterdzieści: 40 };
const WD_GEN = { poniedziałku: 'poniedziałek', wtorku: 'wtorek', środy: 'środa', czwartku: 'czwartek', piątku: 'piątek', soboty: 'sobota', niedzieli: 'niedziela' };
const fmtDMY = s => { const d = parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
function voiceToQuick(raw) {
  let s = ' ' + raw.replace(/[„”"]/g, '').replace(/[.!?]+\s*$/, '') + ' ';
  const E = '(?=[\\s,.!?])';
  s = s.replace(/^\s*(?:dodaj(?: nowe)? zadanie|nowe zadanie|zadanie|przypomnij mi(?:,)?(?: żeby| że| o)?|muszę|trzeba|zapisz)\s*[:,]?\s*/i, ' ');
  s = s.replace(new RegExp(`(\\s)za (${Object.keys(NUMW).join('|')})${E}`, 'gi'), (m, a, w) => `${a}za ${NUMW[w.toLowerCase()]}`);
  let p = null;
  const PR = [
    [new RegExp(`\\s+priorytet(?:em)?\\s*(?:numer\\s*)?(?:1|jeden|pierwszy|najwyższy|wysoki)${E}`, 'i'), 1],
    [new RegExp(`\\s+priorytet(?:em)?\\s*(?:numer\\s*)?(?:2|dwa|drugi|średni)${E}`, 'i'), 2],
    [new RegExp(`\\s+priorytet(?:em)?\\s*(?:numer\\s*)?(?:3|trzy|trzeci|niski)${E}`, 'i'), 3],
    [new RegExp(`\\s+priorytet(?:em)?\\s*(?:numer\\s*)?(?:4|cztery|czwarty|najniższy|brak)${E}`, 'i'), 4],
    [new RegExp(`[\\s,]+(?:mało ważne|nieważne|bez pośpiechu|kiedyś)${E}`, 'i'), 3],
    [new RegExp(`[\\s,]+(?:bardzo pilne|bardzo ważne|super ważne|na wczoraj|krytyczne|pilnie|pilne|natychmiast)${E}`, 'i'), 1],
    [new RegExp(`[\\s,]+(?:ważne|istotne)${E}`, 'i'), 2],
  ];
  for (const [re, v] of PR) if (re.test(s)) { p = v; s = s.replace(re, ' '); break; }
  const ORDK = Object.keys(ORDH).sort((a, b) => b.length - a.length).join('|'), MINK = Object.keys(MINW).sort((a, b) => b.length - a.length).join('|');
  s = s.replace(new RegExp(`(\\s)o\\s+(?:godzinie\\s+)?(${ORDK})(?:\\s+(${MINK}))?${E}`, 'i'), (m, a, h, mi) => ` o ${ORDH[h.toLowerCase()]}:${pad(mi ? MINW[mi.toLowerCase()] : 0)}`);
  s = s.replace(/(\s)o\s+(?:godzinie\s+)?(\d{1,2})(?:[:.\s](\d{2}))?(?=[\s,.!?])/i, (m, a, h, mi) => +h < 24 && (!mi || +mi < 60) ? ` o ${h}:${mi || '00'}` : m);
  const hasTime = /\so \d{1,2}:\d{2}/.test(s);
  for (const [re, tm] of [[/(\s)(?:rano|z rana|rankiem)(?=[\s,.])/i, '9:00'], [/(\s)w południe(?=[\s,.])/i, '12:00'], [/(\s)po południu(?=[\s,.])/i, '15:00'], [/(\s)wieczorem(?=[\s,.])/i, '19:00'], [/(\s)w nocy(?=[\s,.])/i, '22:00']]) {
    if (re.test(s)) { s = s.replace(re, hasTime ? ' ' : ` o ${tm} `); break; }
  }
  const td = todayStr();
  s = s.replace(/(\s)(?:w|na|we)\s+(?:przyszły|przyszłą|następny|następną|najbliższy|najbliższą)\s+/i, ' w ');
  s = s.replace(new RegExp(`(\\s)(?:do|przed|na)\\s+(${Object.keys(WD_GEN).join('|')})${E}`, 'i'), (m, a, w) => ` w ${WD_GEN[w.toLowerCase()]}`);
  s = s.replace(/(\s)(?:do|na|przed)\s+jutra(?=[\s,.])/i, ' jutro').replace(/(\s)(?:do|na)\s+(?:dziś|dzisiaj)(?=[\s,.])/i, ' dziś').replace(/(\s)na jutro(?=[\s,.])/i, ' jutro');
  s = s.replace(/(\s)(?:na\s+|do\s+)?koń?ca? tygodnia(?=[\s,.])/i, ' w piątek');
  s = s.replace(/(\s)(?:za|w ciągu)\s+miesiąc(?:a)?(?=[\s,.])/i, () => { const d = parseDate(td); d.setMonth(d.getMonth() + 1); return ' ' + fmtDMY(fmtDate(d)); });
  s = s.replace(/(\s)(?:na|do)\s+koniec miesiąca(?=[\s,.])/i, () => { const d = parseDate(td); return ' ' + fmtDMY(fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))); });
  s = s.replace(/(\s)(?:w|do|dla)\s+projek(?:tu|cie|t)\s+([\p{L}\d-]+)/iu, (m, a, n) => ` #${n}`);
  s = s.replace(/(\s)(?:w|do)\s+sekcji\s+([\p{L}\d-]+)/iu, (m, a, n) => ` /${n}`);
  s = s.replace(/(\s)(?:z\s+)?etykiet(?:ą|a|y)\s+([\p{L}\d-]+)/iu, (m, a, n) => ` @${n}`);
  // „do studiów”, „na studia” → #Studia (gdy pasuje do nazwy projektu)
  userProjects().forEach(pr => {
    const stem = fold(pr.name).replace(/\s+/g, '').slice(0, Math.max(4, pr.name.length - 2));
    s = s.replace(/(\s)(?:do|na|w|dla)\s+([\p{L}]+)(?=[\s,.])/giu, (m, a, w) => fold(w).startsWith(stem) && !s.includes('#') ? ` #${pr.name.replace(/\s+/g, '')}` : m);
  });
  const r = parseQuick(s, {});
  if (p) r.priority = p;
  r.title = cap(r.title.replace(/^[,\s-]+|[,\s-]+$/g, '').replace(/[,\s]+(?:i|oraz|a)$/i, '').replace(/\s+,/g, ','));
  return r;
}
function voiceParse(text) {
  return text.split(/(?:[;]|\s(?:następne|kolejne) zadanie[,:]?\s|\.\s+(?=\p{Lu}))/iu).map(x => x.trim()).filter(Boolean).map(voiceToQuick).filter(r => r.title);
}
function openVoice() {
  if (voice.el) return;
  closePopover(true);
  const el = document.createElement('div');
  el.id = 'voice';
  el.innerHTML = `<div class="vc-box" role="dialog" aria-label="Dodawanie głosem">
    <button class="vc-x icon-btn" data-v="close" aria-label="Zamknij">${I.x}</button>
    <button class="vc-mic" data-v="mic" aria-label="Mikrofon"><span class="vc-r r1"></span><span class="vc-r r2"></span><span class="vc-r r3"></span>${sz(I.mic, 34)}</button>
    <div class="vc-state">Przygotowuję mikrofon…</div>
    <div class="vc-wave">${'<i></i>'.repeat(18)}</div>
    <textarea class="vc-text" rows="2" placeholder="Mów… albo wpisz tutaj" spellcheck="false"></textarea>
    <div class="vc-prev"></div>
    <div class="vc-hint">Np. „Oddać sprawozdanie w piątek o dziesiątej, pilne, w projekcie Studia”. Kilka zadań rozdziel słowami „następne zadanie”.</div>
    <div class="vc-foot"><button class="btn" data-v="again">${sz(I.mic, 14)} Mów ponownie</button><span class="grow"></span><button class="btn ghost" data-v="close">Anuluj</button><button class="btn primary" data-v="add">Dodaj <kbd>Enter</kbd></button></div>
  </div>`;
  document.body.appendChild(el);
  voice.el = el; voice.edited = false;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (e.target === el) return voiceClose();
    if (!b) return;
    const a = b.dataset.v;
    if (a === 'close') voiceClose();
    else if (a === 'add') voiceCommit();
    else if (a === 'again' || a === 'mic') { if (voice.listening) voiceStop(); else voiceStart(); }
  });
  const ta = $('.vc-text', el);
  ta.addEventListener('input', () => { voice.edited = true; voicePreview(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); voiceCommit(); } if (e.key === 'Escape') { e.stopPropagation(); voiceClose(); } });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); voiceClose(); } });
  voiceStart();
}
function voiceSetState(st, msg) {
  const el = voice.el;
  if (!el) return;
  el.dataset.st = st;
  const txt = { listening: 'Słucham… mów śmiało', idle: voice.final || voice.partial ? 'Sprawdź i zatwierdź' : 'Kliknij mikrofon, aby mówić', error: msg || 'Nie udało się użyć mikrofonu – możesz wpisać zadanie', unavailable: 'Rozpoznawanie mowy jest niedostępne w tym oknie – wpisz zadanie poniżej' }[st];
  $('.vc-state', el).textContent = txt;
}
function voiceStart() {
  voice.final = ''; voice.partial = ''; voice.edited = false;
  if (voice.el) { $('.vc-text', voice.el).value = ''; voicePreview(); }
  if (dictNS) {
    voice.listening = true; voiceSetState('listening');
    dictNS.start().catch(e => { voice.listening = false; voiceSetState('error', e?.code === 'not_granted' ? 'Brak zgody na mikrofon – możesz wpisać zadanie' : undefined); });
    return;
  }
  if (SpeechRec) {
    try {
      const r = new SpeechRec();
      r.lang = 'pl-PL'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      r.onresult = e => { let fin = '', part = ''; for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript; else part += x[0].transcript; } voice.final = fin.trim(); voice.partial = part; voiceUpdate(); };
      r.onerror = e => { voice.listening = false; voiceSetState('error', e.error === 'not-allowed' ? 'Brak zgody na mikrofon – możesz wpisać zadanie' : e.error === 'no-speech' ? 'Nic nie usłyszałem – spróbuj jeszcze raz' : undefined); };
      r.onend = () => { if (voice.listening) { voice.listening = false; voiceEnded(); } };
      voice.rec = r; r.start(); voice.listening = true; voiceSetState('listening');
    } catch (e) { voiceSetState('error'); }
    return;
  }
  voiceSetState('unavailable');
  setTimeout(() => voice.el && $('.vc-text', voice.el).focus(), 50);
}
function voiceStop() { try { dictNS?.stop(); } catch (e) { /* */ } try { voice.rec?.stop(); } catch (e) { /* */ } }
function voiceUpdate() {
  if (!voice.el) return;
  const ta = $('.vc-text', voice.el);
  if (!voice.edited) ta.value = (voice.final + (voice.partial ? ' ' + voice.partial : '')).trim();
  voicePreview();
}
function voicePreview() {
  if (!voice.el) return;
  const rs = voiceParse($('.vc-text', voice.el).value);
  $('.vc-prev', voice.el).innerHTML = rs.map((r, i) => `<div class="vc-task" style="--i:${i}">${parsedChips(r)}</div>`).join('');
  $('[data-v="add"]', voice.el).disabled = !rs.length;
}
function voiceEnded() {
  if (!voice.el) return;
  voiceSetState('idle');
  const v = $('.vc-text', voice.el).value.trim();
  if (v && state.settings.voiceAuto) setTimeout(voiceCommit, 500);
  else $('.vc-text', voice.el).focus();
}
function voiceCommit() {
  if (!voice.el) return;
  const rs = voiceParse($('.vc-text', voice.el).value);
  if (!rs.length) return;
  const d = ui.addForm?.defaults || {};
  const snap = snapshot();
  rs.forEach(r => {
    const labels = r.labels.map(n => { let l = state.labels.find(x => x.name.toLowerCase() === n.toLowerCase()); if (!l) { l = { id: uid(), name: n, color: '#808080' }; state.labels.push(l); } return l.id; });
    const t = newTask({ title: r.title, description: '', projectId: r.projectId || d.projectId || 'inbox', sectionId: r.sectionId || (r.projectId ? null : d.sectionId) || null, parentId: null,
      priority: r.priority || d.priority || 4, due: r.due || d.due || null, time: r.time || null, endTime: r.endTime || null, assignees: r.assignees || [], recurring: r.recurring || null, labels, order: nextOrder() });
    state.tasks.push(t); markEnter(t.id);
  });
  voiceClose();
  commit();
  playSound('done');
  toast(rs.length === 1 ? `🎙️ Dodano: ${rs[0].title}` : `🎙️ Dodano ${rs.length} zadania`, snap);
}
function voiceClose() {
  voiceStop();
  const el = voice.el;
  voice.el = null; voice.listening = false;
  if (!el) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), REDUCED ? 0 : 220);
}

// ---------- ekran startowy ----------
function showSplash(force) {
  if (!force && (!freshLaunch || state.settings.splash === false || REDUCED || state.settings.anim === 'off')) return;
  const hr = new Date().getHours(), name = state.settings.userName || '';
  const greet = hr < 5 ? 'Dobrej nocy' : hr < 12 ? 'Dzień dobry' : hr < 18 ? 'Miłego popołudnia' : 'Dobry wieczór';
  const now = new Date();
  const dateTxt = `${cap(PL_DAYS[now.getDay()])}, ${now.getDate()} ${PL_MON_SHORT[now.getMonth()]}`;
  const td = todayStr(), act = active();
  const nToday = act.filter(t => t.due && t.due <= td).length;
  const rows = [['var(--p1)', 64], ['var(--p2)', 48], ['var(--p3)', 72]];
  const el = document.createElement('div');
  el.id = 'launch';
  el.innerHTML = `<canvas class="ls-stars" aria-hidden="true"></canvas>
    <div class="ls-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="ls-grid" aria-hidden="true"></div>
    <div class="ls-stage">
      <div class="ls-hold">
        <div class="ls-rows">${rows.map(([c, w], i) => `<div class="ls-row" style="--i:${i};--c:${c};--w:${w}%"><span class="ls-ck"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg></span><span class="ls-line"><i></i></span></div>`).join('')}</div>
        <div class="ls-logo"><span class="ls-wave"></span><span class="ls-wave w2"></span><span class="ls-wave w3"></span>
          <svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lsg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset=".55" stop-color="var(--accent)"/><stop offset="1" stop-color="#b23a6a"/></linearGradient></defs>
            <rect class="ls-sq" x="4" y="4" width="56" height="56" rx="17" fill="url(#lsg)"/><rect class="ls-shine" x="4" y="4" width="56" height="56" rx="17"/><path class="ls-ckp" d="M19 33.5l8.5 8.5L45.5 24"/></svg></div>
      </div>
      <div class="ls-name">${'Listo'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
      <div class="ls-sub"><b>${greet}${name ? ', ' + esc(name) : ''}</b><span>${dateTxt} · ${nToday ? `${nToday} ${plural(nToday, 'zadanie', 'zadania', 'zadań')} na dziś` : 'dzień bez zaległości'}</span></div>
      <div class="ls-load"><div class="ls-bar"><i></i></div><span class="ls-status">Budzę aplikację…</span></div>
    </div>
    <div class="ls-skip">Kliknij, aby pominąć</div>`;
  document.body.appendChild(el);
  const app = $('#app');
  // aplikacja rysuje się pod spodem raz, a jej animacje wejścia czekają wstrzymane – bez przeładowania po animacji
  app.classList.add('app-pre', 'launch', 'launch-wait');
  const lite = innerWidth < 760 || matchMedia('(pointer: coarse)').matches;
  el.classList.toggle('lite', lite);
  // gwiazdy / pyłki w tle
  const cv = $('.ls-stars', el), cx = cv.getContext('2d');
  let W, H, raf = 0, alive = true;
  const fit = () => { const r = Math.min(devicePixelRatio || 1, lite ? 1 : 2); W = cv.width = innerWidth * r; H = cv.height = innerHeight * r; };
  fit();
  const dots = [...Array(lite ? 36 : 90)].map(() => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .3, s: Math.random() * .00025 + .00008, p: Math.random() * 6.28 }));
  const sparks = [];
  const draw = t => {
    if (!alive) return;
    cx.clearRect(0, 0, W, H);
    dots.forEach(d => {
      d.y -= d.s; if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); }
      cx.globalAlpha = .25 + .55 * (.5 + .5 * Math.sin(t / 700 + d.p));
      cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(d.x * W, d.y * H, d.r * (devicePixelRatio || 1), 0, 6.283); cx.fill();
    });
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += .06; s.l -= .018;
      if (s.l <= 0) { sparks.splice(i, 1); continue; }
      cx.globalAlpha = s.l; cx.fillStyle = s.c; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  const burst = (node, color, n = 22) => {
    if (!node || !alive) return;
    const r = node.getBoundingClientRect(), k = devicePixelRatio || 1;
    const x = (r.left + r.width / 2) * k, y = (r.top + r.height / 2) * k;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (Math.random() * 3.2 + 1.2) * k; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5 * k, r: (Math.random() * 2.2 + 1) * k, l: 1, c: color }); }
  };
  const css = getComputedStyle(document.documentElement);
  const pc = ['--p1', '--p2', '--p3'].map(v => css.getPropertyValue(v).trim() || '#ff7066');
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  $$('.ls-row', el).forEach((row, i) => at(820 + i * 260, () => { row.classList.add('done'); burst($('.ls-ck', row), pc[i]); }));
  at(1720, () => burst($('.ls-logo', el), css.getPropertyValue('--accent').trim() || '#dc4c3e', 46));
  const st = $('.ls-status', el);
  at(900, () => { st.textContent = 'Układam Twoje zadania…'; });
  at(1800, () => { st.textContent = sync.ref ? 'Synchronizuję z chmurą…' : 'Przygotowuję widok…'; });
  at(2650, () => { st.textContent = 'Gotowe ✓'; el.classList.add('ready'); });
  let out = false;
  const done = () => {
    if (out) return; out = true;
    timers.forEach(clearTimeout);
    launchIntroPrep();
    // logo odlatuje na swoje miejsce w aplikacji
    const logo = $('.ls-logo', el), lr = logo.getBoundingClientRect();
    const tgt = [...$$('#sidebar .add-circle, #tabbar [data-view="home"] svg, .hm-greet h1')].find(n => { const r = n.getBoundingClientRect(); return r.width && r.left >= 0 && r.left < innerWidth; });
    if (tgt && lr.width) {
      const fly = logo.cloneNode(true); fly.className = 'ls-fly'; document.body.appendChild(fly);
      Object.assign(fly.style, { left: lr.left + 'px', top: lr.top + 'px', width: lr.width + 'px', height: lr.height + 'px' });
      const tr = tgt.getBoundingClientRect(), s = Math.max(.18, Math.min(tr.width, tr.height) / lr.width);
      requestAnimationFrame(() => requestAnimationFrame(() => { fly.style.transform = `translate(${tr.left + tr.width / 2 - (lr.left + lr.width / 2)}px, ${tr.top + tr.height / 2 - (lr.top + lr.height / 2)}px) scale(${s})`; fly.classList.add('go'); }));
      setTimeout(() => { fly.remove(); tgt.classList.add('ls-land'); setTimeout(() => tgt.classList.remove('ls-land'), 700); }, 900);
      logo.style.visibility = 'hidden';
    }
    el.classList.add('out');
    app.classList.remove('app-pre', 'launch-wait');
    setTimeout(countUp, 900);
    setTimeout(() => { alive = false; cancelAnimationFrame(raf); el.remove(); }, 1100);
    setTimeout(() => app.classList.remove('launch'), 3400);
  };
  el.addEventListener('click', done);
  addEventListener('keydown', function sk(e) { if (out) { removeEventListener('keydown', sk); return; } if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); done(); } });
  addEventListener('resize', fit);
  at(3150, done);
}

// ---------- obsługa kliknięć nowych elementów ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act, k = el.dataset.k, s = state.settings;
  switch (a) {
    case 'voice': e.preventDefault(); openVoice(); break;
    case 'pref': { let v = el.dataset.v; if (['scale', 'mxDays'].includes(k)) v = +v; if (String(s[k]) !== String(v)) setPref(k, v, el); break; }
    case 'pref-tg': { const v = !(PREF_FALSE.includes(k) ? !!s[k] : s[k] !== false); if (PREF_REDRAW.includes(k)) { state.settings[k] = v; ui.quiet = true; commit(); if (k === 'karma' && v) karmaDaily(); } else setPref(k, v, el); break; }
    case 'pref-step': {
      const d = +el.dataset.d;
      if (k === 'pomo') { const i = +el.dataset.i, arr = [...s.pomo]; arr[i] = Math.max(1, Math.min(120, arr[i] + d)); setPref('pomo', arr, el); }
      else setPref(k, Math.max(1, Math.min(50, (s[k] || 5) + d)), el);
      break;
    }
    case 'pref-nav': { const v = el.dataset.v, h = new Set(s.hiddenNav || []); h.has(v) ? h.delete(v) : h.add(v); setPref('hiddenNav', [...h], el); break; }
    case 'pref-card': { const v = el.dataset.v, h = new Set(s.hiddenCards || []); h.has(v) ? h.delete(v) : h.add(v); setPref('hiddenCards', [...h], el); break; }
    case 'pref-reset': confirmDlg('Przywrócić ustawienia domyślne?', 'Wygląd i zachowanie wrócą do ustawień początkowych. Zadania, nawyki i historia zostaną bez zmian.', 'Przywróć', () => {
      const keep = { userName: s.userName, dailyGoal: s.dailyGoal, completedGroup: s.completedGroup };
      state.settings = Object.assign({}, PREF_DEFAULTS, { theme: 'dark', accent: 'todoist', sound: true, mxDays: 2 }, keep);
      ui.quiet = true; commit(); toast('Przywrócono ustawienia domyślne');
    }); break;
    case 'splash-preview': showSplash(true); break;
    case 'search-q': { const i = $('.search-input'); if (i) { i.value = el.dataset.q; ui.view.q = el.dataset.q; updateSearchResults(); i.focus(); } break; }
    case 'gd-ex': { const i = $('.gd-try-in'); if (i) { i.value = el.dataset.t; gdTry(i.value); i.focus(); } break; }
  }
});
document.addEventListener('keydown', e => {
});
// poświata pod kursorem na kartach
let spotRaf = 0;
document.addEventListener('pointermove', e => {
  if (spotRaf || e.pointerType === 'touch') return;
  spotRaf = requestAnimationFrame(() => {
    spotRaf = 0;
    const c = e.target.closest?.('.hm-card, .mx-q, .ap-card, .hb-card, .pf-card, .rep-box, .rep-card, .spot, .fz-live, .focus-side, .ins, .cs-cards > div');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
}, { passive: true });
showSplash();
// ================================================================
//  Konta i synchronizacja przez własny serwer (Supabase) + instalowalna aplikacja (PWA)
// ================================================================
// ---------- instalowalna aplikacja (telefon / komputer) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window && !location.hostname.endsWith('claude.ai')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* */ }));
}
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (ui.view.type === 'prefs') render(); });
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-act="pwa-install"]') || !installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => null);
  installEvt = null; render();
});
// ================================================================
//  v12 – kolejność menu, sekcje projektów, kafelki Startu, Nadchodzące, Kalendarz,
//        nowe Ustawienia, Karma, Kalendarz Google, interfejs na telefon
// ================================================================
Object.assign(I, {
  grip: sv('<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>', 16),
  up: sv('<path d="M6 14l6-6 6 6"/>', 16),
  down: sv('<path d="M6 10l6 6 6-6"/>', 16),
  star: sv('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>', 18),
  google: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg>',
});

// ---------- menu boczne: definicje, kolejność, widoczność ----------
const NAV_DEF = {
  search: { label: 'Szukaj', icon: () => I.search },
  home: { label: 'Start', icon: () => I.home },
  inbox: { label: 'Skrzynka', icon: () => I.inbox, count: (a, c) => c.inbox },
  today: { label: 'Dziś', icon: () => todayIcon(), count: (a, c) => c.today },
  mine: { label: 'Moje zadania', icon: () => I.person, count: () => myOpen().length || '' },
  team: { label: 'Zespół', icon: () => I.team },
  upcoming: { label: 'Nadchodzące', icon: () => I.upcoming },
  calendar: { label: 'Kalendarz', icon: () => I.calMonth },
  filters: { label: 'Filtry i etykiety', icon: () => I.filters },
  reports: { label: 'Raportowanie', icon: () => I.pulse },
  completed: { label: 'Ukończone', icon: () => I.done, count: () => state.tasks.filter(t => t.completed).length },
};
function navOrder() {
  const o = (state.settings.navOrder || []).filter(k => NAV_DEF[k]);
  Object.keys(NAV_DEF).forEach(k => { if (!o.includes(k)) o.push(k); });
  return o;
}
function sbExpanded(id, set) {
  let a = [];
  try { a = JSON.parse(localStorage.getItem('listo-sb-exp') || '[]'); } catch (e) { /* */ }
  if (set === undefined) return a.includes(id);
  a = a.filter(x => x !== id); if (set) a.push(id);
  try { localStorage.setItem('listo-sb-exp', JSON.stringify(a)); } catch (e) { /* */ }
}

// ---------- kafelki Startu: własna kolejność ----------
function cardOrder(keys) {
  const o = state.settings.cardOrder || [];
  return [...keys].sort((a, b) => (o.indexOf(a) < 0 ? 99 + keys.indexOf(a) : o.indexOf(a)) - (o.indexOf(b) < 0 ? 99 + keys.indexOf(b) : o.indexOf(b)));
}
function moveCard(key, toKey, d) {
  const vis = $$('.hm-masonry .hm-card').map(c => c.dataset.card);
  const all = cardOrder([...new Set([...vis, ...(state.settings.cardOrder || [])])]);
  const i = all.indexOf(key);
  if (i < 0) return;
  all.splice(i, 1);
  let j = toKey ? all.indexOf(toKey) : i + d;
  j = Math.max(0, Math.min(all.length, j));
  all.splice(j, 0, key);
  state.settings.cardOrder = all;
  ui.quiet = true; ui.movedCard = key;
  commit();
}
let cardDrag = null;
document.addEventListener('dragstart', e => {
  const c = e.target.closest?.('.home.editing .hm-card');
  if (!c) return;
  cardDrag = c.dataset.card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', cardDrag);
  requestAnimationFrame(() => c.classList.add('dragging'));
});
document.addEventListener('dragover', e => {
  if (!cardDrag) return;
  const c = e.target.closest('.hm-card');
  $$('.hm-card.drop-to').forEach(x => x !== c && x.classList.remove('drop-to'));
  if (c && c.dataset.card !== cardDrag) { e.preventDefault(); c.classList.add('drop-to'); }
});
document.addEventListener('drop', e => {
  if (!cardDrag) return;
  const c = e.target.closest('.hm-card'), k = cardDrag;
  cardDrag = null;
  if (!c || c.dataset.card === k) return;
  e.preventDefault(); moveCard(k, c.dataset.card);
});
document.addEventListener('dragend', () => { cardDrag = null; $$('.hm-card.drop-to, .hm-card.dragging').forEach(x => x.classList.remove('drop-to', 'dragging')); });

// ---------- Nadchodzące: pasek dat śledzi przewijanie ----------
function upStripDays(sws) {
  const td = todayStr(), act = active();
  return [...Array(7)].map((_, i) => addDays(sws, i)).map(d => `<button class="day-chip ${d === td ? 'today' : ''} ${d === ui.upCur ? 'cur' : ''}" data-act="up-day" data-date="${d}" ${d < td ? 'disabled' : ''}>
      <span>${PL_DAYS_SHORT[dow(d)]}</span><strong>${parseDate(d).getDate()}</strong>${act.some(t => t.due === d) || gcalEventsOn(d, 'gcalUp').length ? '<i class="dot"></i>' : ''}</button>`).join('');
}
function upTrack() {
  if (ui.view.type !== 'upcoming') return;
  const c = $('.content'), head = $('.up-head');
  if (!c || !head) return;
  const lim = head.getBoundingClientRect().bottom + 6;
  let cur = null;
  for (const g of $$('.group[id^="day-"]', c)) { if (g.getBoundingClientRect().bottom > lim) { cur = g.id.slice(4); break; } }
  if (!cur || cur === ui.upCur) return;
  ui.upCur = cur;
  const strip = $('.week-strip'), sws = weekStart(cur), old = ui.upStrip || ui.upStart;
  if (!strip) return;
  if (sws !== old) {
    ui.upStrip = sws;
    strip.innerHTML = upStripDays(sws);
    strip.classList.remove('sl', 'sr'); void strip.offsetWidth; strip.classList.add(sws > old ? 'sl' : 'sr');
    const md = parseDate(addDays(sws, 3)), t = $('.up-title');
    if (t) { t.textContent = `${PL_MON[md.getMonth()]} ${md.getFullYear()}`; t.classList.remove('flip'); void t.offsetWidth; t.classList.add('flip'); }
  } else $$('.day-chip', strip).forEach(b => b.classList.toggle('cur', b.dataset.date === cur));
}



function isoWeek(s) { const d = parseDate(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); }

// przeciąganie zakładek w Ustawieniach → Pasek boczny
let nvDrag = null;
document.addEventListener('dragstart', e => { const r = e.target.closest?.('.nv-row'); if (!r) return; nvDrag = r.dataset.nv; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', nvDrag); requestAnimationFrame(() => r.classList.add('dragging')); });
document.addEventListener('dragover', e => { if (!nvDrag) return; const r = e.target.closest('.nv-row'); $$('.nv-row.drop-to').forEach(x => x !== r && x.classList.remove('drop-to')); if (r && r.dataset.nv !== nvDrag) { e.preventDefault(); r.classList.add('drop-to'); } });
document.addEventListener('drop', e => { if (!nvDrag) return; const r = e.target.closest('.nv-row'), k = nvDrag; nvDrag = null; if (!r || r.dataset.nv === k) return; e.preventDefault(); const o = navOrder().filter(x => x !== k); o.splice(o.indexOf(r.dataset.nv), 0, k); state.settings.navOrder = o; ui.navMoved = k; ui.quiet = true; commit(); });
document.addEventListener('dragend', () => { nvDrag = null; $$('.nv-row.drop-to, .nv-row.dragging').forEach(x => x.classList.remove('drop-to', 'dragging')); });

// gest: przesuń od lewej krawędzi, by otworzyć menu; w lewo, by zamknąć
(() => {
  let sx = 0, sy = 0, mode = null;
  document.addEventListener('touchstart', e => {
    if (!isNarrow() || e.touches.length !== 1) return;
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    mode = !ui.sidebar && sx < 22 ? 'open' : ui.sidebar && e.target.closest('#sidebar, .sb-backdrop') ? 'close' : null;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!mode) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (mode === 'open' && dx > 60 && dy < 60) { ui.sidebar = true; render(); }
    if (mode === 'close' && dx < -60 && dy < 60) { ui.sidebar = false; render(); }
    mode = null;
  }, { passive: true });
})();
// delikatna wibracja przy odhaczaniu na telefonie
document.addEventListener('click', e => { if (e.target.closest('.check[data-act="toggle"], .hb-today, .hb-d, .hm-hb-i') && navigator.vibrate && matchMedia('(pointer: coarse)').matches) navigator.vibrate(12); }, true);

// ---------- wejście aplikacji po animacji startowej ----------
function launchIntroPrep() {
  const h1 = $('.hm-greet h1');
  if (h1 && !h1.dataset.split) {
    h1.dataset.split = '1';
    let n = 0;
    const walk = node => [...node.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(w => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
          const ws = document.createElement('span'); ws.className = 'lw';
          [...w].forEach(ch => { const s = document.createElement('span'); s.className = 'lc'; s.textContent = ch; s.style.setProperty('--c', n++); ws.appendChild(s); });
          frag.appendChild(ws);
        });
        c.replaceWith(frag);
      } else walk(c);
    });
    walk(h1);
  }
  const cx = innerWidth / 2, by = innerHeight;
  $$('.hm-card').forEach((c, i) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--dx', Math.round(cx - (r.left + r.width / 2)) + 'px');
    c.style.setProperty('--dy', Math.round(by - r.top) + 'px');
    c.style.setProperty('--rot', ((i % 2 ? 1 : -1) * (5 + (i % 4) * 3)) + 'deg');
  });
  $$('#sidebar > *, #sidebar .nav-item').forEach((el, i) => el.style.setProperty('--n', Math.min(i, 22)));
  $$('#tabbar button').forEach((el, i) => el.style.setProperty('--n', i));
}

// ---------- po każdym rysowaniu ----------
const baseRender = render;
render = function () {
  const app = $('#app');
  // rysowanie w trakcie wejścia po starcie nie może odtworzyć animacji od nowa
  if (app.classList.contains('launch') && !app.classList.contains('launch-wait')) app.classList.remove('launch');
  baseRender();
  renderTabbar();
  document.documentElement.classList.toggle('no-nav-counts', state.settings.navCounts === false);
  const v = ui.view.type, content = $('.content');
  if (v === 'upcoming' && content) {
    let last = 0, tm = 0;
    content.addEventListener('scroll', () => {
      const now = Date.now();
      if (now - last > 50) { last = now; upTrack(); }
      clearTimeout(tm); tm = setTimeout(upTrack, 80);
    }, { passive: true });
    upTrack();
  }
  if (ui.movedCard) { const c = $(`.hm-card[data-card="${ui.movedCard}"]`); c?.classList.add('moved'); c?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); ui.movedCard = null; }
};

// ---------- kliknięcia ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act;
  switch (a) {
    case 'sb-exp': e.stopPropagation(); sbExpanded(el.dataset.id, !sbExpanded(el.dataset.id)); renderSidebar(); break;
    case 'sb-sec': {
      const pid = el.dataset.pid, sid = el.dataset.sid;
      ui.modal = null;
      if (!(ui.view.type === 'project' && ui.view.id === pid)) setView({ type: 'project', id: pid });
      setTimeout(() => { const s = $(`.section[data-sid="${sid}"]`); if (s) { s.scrollIntoView({ block: 'start', behavior: 'smooth' }); s.classList.remove('flash-sec'); void s.offsetWidth; s.classList.add('flash-sec'); } }, 120);
      break;
    }
    case 'home-edit': ui.homeEdit = !ui.homeEdit; ui.quiet = true; render(); if (!ui.homeEdit) toast('Zapisano układ kafelków'); break;
    case 'card-mv': e.stopPropagation(); moveCard(el.dataset.k, null, +el.dataset.d); break;
    case 'card-reset': state.settings.cardOrder = []; ui.quiet = true; commit(); toast('Przywrócono domyślny układ kafelków'); break;
    case 'pref-tab': ui.prefTab = el.dataset.t; ui.stagger = true; render(); $('.content') && ($('.content').scrollTop = 0); break;
    case 'pref-open': ui.prefTab = el.dataset.t; setView({ type: 'prefs' }); break;
    case 'nav-mv': { const k = el.dataset.k, o = navOrder(), i = o.indexOf(k), j = i + +el.dataset.d; if (j < 0 || j >= o.length) break; o.splice(i, 1); o.splice(j, 0, k); state.settings.navOrder = o; ui.navMoved = k; ui.quiet = true; commit(); break; }
    case 'nav-vis': { const k = el.dataset.k, h = new Set(state.settings.hiddenNav || []); h.has(k) ? h.delete(k) : h.add(k); state.settings.hiddenNav = [...h]; el.classList.toggle('on', !h.has(k)); el.closest('.nv-row')?.classList.toggle('off', h.has(k)); save(); renderSidebar(); break; }
    case 'nav-reset': state.settings.navOrder = []; state.settings.hiddenNav = []; ui.quiet = true; commit(); toast('Przywrócono domyślne menu'); break;
    case 'tb-more': ui.sidebar = !ui.sidebar; render(); break;
  }
});

// ================================================================
//  LISTO TEAM – firma, osoby, przypisania, statusy, synchronizacja na żywo
// ================================================================
Object.assign(I, {
  person: sv('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>', 20),
  team: sv('<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><circle cx="17" cy="9.5" r="2.6"/><path d="M15.8 14.2a5 5 0 0 1 5.7 5.3"/>', 20),
  pin: sv('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 14),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 16),
  eye: sv('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', 16),
  eyeOff: sv('<path d="M4 4l16 16M10.6 6.1A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3 3.6M6.4 7.6A16 16 0 0 0 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3.6-.8"/>', 16),
  send: sv('<path d="M4 12l16-8-6 16-2.5-6.5z"/>', 16),
});

// ---------- konfiguracja ----------
const CFG = Object.assign({ supabaseUrl: '', supabaseKey: '', siteUrl: '', vapidPublic: '' }, window.LISTO_CONFIG || {});
const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const auth = { sb: null, user: null, ready: false };
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { if (v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
function addMin(hm, mins) {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number), t = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + mins));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
const hmMin = hm => { if (!hm) return 0; const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const minHm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// ---------- osoby ----------
const team = {
  ws: null, list: [], members: [], ready: false, pushing: false, again: false, timer: null, chans: [],
  shadow: lsGet('lt-shadow', {}), notifs: [], cals: [], ev: lsGet('lt-ics', {}), prefsTimer: null,
};
const me = () => auth.user?.id || CUR_UID || 'local';
const member = id => team.members.find(m => m.user_id === id);
const MCOL = ['#4f8ff7', '#e05194', '#3ec26a', '#f5a531', '#9466f0', '#14aaf5', '#ff6f61', '#2bb5a3', '#c77dff', '#7ecc49'];
const hashStr = s => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function memberName(id) {
  const m = member(id);
  if (!m) return id === me() ? (state.settings.userName || 'Ty') : 'Była osoba';
  return m.name || (m.email || '').split('@')[0] || 'Osoba';
}
const firstName = id => memberName(id).split(/\s+/)[0];
const memberColor = id => member(id)?.color || MCOL[hashStr(id) % MCOL.length];
const initials = id => { const n = memberName(id).trim().split(/\s+/); return ((n[0] || '?')[0] + (n[1] ? n[1][0] : '')).toUpperCase(); };
const avatar = (id, s = 22) => `<span class="av" style="--c:${memberColor(id)};--s:${s}px" title="${esc(memberName(id))}">${esc(initials(id))}</span>`;
const avatars = (ids, s = 20, max = 3) => `<span class="avs">${ids.slice(0, max).map(i => avatar(i, s)).join('')}${ids.length > max ? `<span class="av more" style="--s:${s}px">+${ids.length - max}</span>` : ''}</span>`;
const isAdmin = () => ['owner', 'admin'].includes(member(me())?.role);
const mentionKey = id => fold(firstName(id)).replace(/[^a-z0-9]/g, '') || 'osoba';
function findMember(n) {
  const q = fold(n).replace(/[^a-z0-9]/g, '');
  if (!q) return null;
  if (['ja', 'mnie', 'me', 'siebie'].includes(q)) return me();
  const ms = team.members;
  const hit = ms.find(m => mentionKey(m.user_id) === q) || ms.find(m => fold(memberName(m.user_id)).replace(/[^a-z0-9]/g, '') === q)
    || ms.find(m => fold(m.email || '').split('@')[0] === q) || ms.find(m => mentionKey(m.user_id).startsWith(q));
  return hit ? hit.user_id : null;
}
const myOpen = () => state.tasks.filter(t => !t.completed && t.assignees.includes(me()));

// ---------- zadanie: pola zespołowe ----------
function normTask(t) {
  t.labels = Array.isArray(t.labels) ? t.labels : [];
  t.comments = Array.isArray(t.comments) ? t.comments : [];
  t.assignees = Array.isArray(t.assignees) ? t.assignees : [];
  t.kind = t.kind === 'event' ? 'event' : 'task';
  if (t.completed) t.status = 2; else if (t.status !== 1) t.status = 0;
  if (t.endTime && (!t.time || t.endTime <= t.time)) t.endTime = null;
  return t;
}
const ST_LABEL = ['Nie zaczęte', 'W trakcie', 'Ukończone'];
const stOf = t => t.completed ? 2 : (t.status === 1 ? 1 : 0);
function stSlider(t, big) {
  const s = stOf(t);
  return `<button type="button" class="st3 ${big ? 'big' : ''}" data-st="${s}" data-id="${t.id}" role="slider" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${s}" aria-valuetext="${ST_LABEL[s]}" aria-label="Status: ${ST_LABEL[s]}" title="Status: ${ST_LABEL[s]}"><span class="st3-t"><i></i><i></i><i></i></span><b class="st3-k"></b></button>`;
}
function setStatus(id, s) {
  const t = task(id);
  if (!t) return;
  const cur = stOf(t);
  if (s === cur) return;
  $$(`.st3[data-id="${id}"]`).forEach(b => { b.dataset.st = s; });
  if (s === 2) { toggleTask(id); return; }
  if (cur === 2) { t.status = s; toggleTask(id); return; }
  const snap = snapshot();
  setTimeout(() => {
    t.status = s; t.statusAt = Date.now(); t.statusBy = me();
    if (s === 1 && !t.assignees.length) t.assignees = [me()];
    commit();
    toast(`${s === 1 ? '🟡' : '⚪'} ${ST_LABEL[s]}: ${t.title}`, snap);
  }, REDUCED ? 0 : 170);
}
// osoba widzi zadanie w filtrze „Pokaż”
function whoOk(t) {
  const w = state.settings.who || 'all';
  if (w === 'all') return true;
  if (w === 'me') return t.assignees.includes(me()) || (!t.assignees.length && t.createdBy === me());
  if (w === 'none') return !t.assignees.length;
  return t.assignees.includes(w);
}
const whoLabel = () => { const w = state.settings.who || 'all'; return w === 'all' ? 'Wszyscy' : w === 'me' ? 'Ja' : w === 'none' ? 'Nieprzypisane' : firstName(w); };
function whoPicker(anchor) {
  const w = state.settings.who || 'all';
  const row = (v, icon, l) => `<button class="menu-item ${w === v ? 'sel' : ''}" data-w="${v}">${icon}<span class="grow">${l}</span>${w === v ? I.checkSmall : ''}</button>`;
  openPopover(anchor, (pop, close) => {
    pop.innerHTML = `<div class="menu"><div class="menu-label">Pokaż zadania</div>
      ${row('all', sz(I.team, 16), 'Wszystkich')}${row('me', avatar(me(), 18), 'Moje')}${row('none', sz(I.ban, 16), 'Nieprzypisane')}
      ${team.members.length ? '<div class="menu-sep"></div>' + team.members.filter(m => m.user_id !== me()).map(m => row(m.user_id, avatar(m.user_id, 18), esc(memberName(m.user_id)))).join('') : ''}</div>`;
    pop.onclick = e => { const b = e.target.closest('[data-w]'); if (!b) return; close(); state.settings.who = b.dataset.w; ui.stagger = true; commit(); };
  });
}
// wybór osób przypisanych
function assignPicker(anchor, cur, cb) {
  let sel = [...cur], q = '';
  openPopover(anchor, (pop) => {
    pop.innerHTML = `<div class="menu as-menu"><input class="menu-search" placeholder="Szukaj osoby" aria-label="Szukaj osoby"><div class="as-list"></div>
      <div class="menu-sep"></div><button class="menu-item" data-a="me">${sz(I.person, 16)}<span class="grow">Przypisz do mnie</span></button>
      <button class="menu-item" data-a="none">${sz(I.ban, 16)}<span class="grow">Bez przypisania</span></button>
      ${team.ws ? '' : '<div class="menu-empty">Zaloguj się i dołącz do zespołu, aby przypisywać osoby.</div>'}</div>`;
    const list = $('.as-list', pop), inp = $('.menu-search', pop);
    const draw = () => {
      const ms = team.members.filter(m => !q || fold(memberName(m.user_id) + ' ' + (m.email || '')).includes(fold(q)));
      list.innerHTML = ms.map(m => { const n = state.tasks.filter(t => !t.completed && t.assignees.includes(m.user_id)).length; return `<label class="menu-item">${avatar(m.user_id, 22)}<span class="grow">${esc(memberName(m.user_id))}${m.user_id === me() ? ' <span class="muted small">(Ty)</span>' : ''}<br><span class="muted small">${n} ${plural(n, 'otwarte zadanie', 'otwarte zadania', 'otwartych zadań')}</span></span><input type="checkbox" data-id="${m.user_id}" ${sel.includes(m.user_id) ? 'checked' : ''}></label>`; }).join('') || '<div class="menu-empty">Brak osób</div>';
    };
    draw();
    setTimeout(() => inp.focus(), 0);
    inp.oninput = () => { q = inp.value.trim(); draw(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { const c = $('input[type=checkbox]', list); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); } } };
    pop.onchange = e => {
      const c = e.target.closest('input[type=checkbox]');
      if (!c) return;
      sel = c.checked ? [...sel, c.dataset.id] : sel.filter(x => x !== c.dataset.id);
      cb([...sel]);
    };
    pop.onclick = e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      sel = b.dataset.a === 'me' ? [...new Set([...sel, me()])] : [];
      cb([...sel]); draw();
    };
  });
}

// ---------- status synchronizacji ----------
const SYNC_LABEL = { local: 'Niezalogowano', connecting: 'Łączenie z zespołem…', synced: 'Zsynchronizowano z zespołem', offline: 'Brak połączenia – zmiany wyślę później' };
const sync = { ref: null, status: 'local' };
function renderSyncBadge() {
  $$('.sync-badge').forEach(b => { b.dataset.s = sync.status; b.title = SYNC_LABEL[sync.status]; b.hidden = sync.status === 'local'; });
  $$('.acc-dot').forEach(b => { b.dataset.s = sync.status; });
}
function setSync(s) { if (sync.status !== s) { sync.status = s; renderSyncBadge(); } }

// ================================================================
//  Synchronizacja: każde zadanie/projekt/etykieta/filtr = osobny wiersz w bazie.
//  Zmiany wysyłamy jako różnice, zmiany innych osób przychodzą na żywo (Realtime).
// ================================================================
const SHARED = { tasks: 'task', projects: 'project', labels: 'label', filters: 'filter' };
const KIND_COL = { task: 'tasks', project: 'projects', label: 'labels', filter: 'filters' };
const saveShadow = () => lsSet('lt-shadow', team.shadow);
function sharedItems() {
  const out = new Map();
  Object.entries(SHARED).forEach(([col, kind]) => (state[col] || []).forEach(x => { if (x && x.id && !x.builtin) out.set(x.id, { kind, x }); }));
  return out;
}
function scheduleRemote() {
  if (!team.ready) return;
  clearTimeout(team.timer);
  team.timer = setTimeout(teamPush, 450);
  clearTimeout(team.prefsTimer);
  team.prefsTimer = setTimeout(pushPrefs, 2500);
}
async function teamPush() {
  if (!team.ready || !auth.sb || !team.ws) return;
  if (team.pushing) { team.again = true; return; }
  team.pushing = true; team.again = false;
  const ws = team.ws.id, cur = sharedItems(), ups = [], dels = [];
  cur.forEach(({ kind, x }, id) => { const j = JSON.stringify(x); if (team.shadow[id] !== j) ups.push({ row: { workspace_id: ws, id, kind, data: JSON.parse(j), updated_by: me() }, j }); });
  Object.keys(team.shadow).forEach(id => { if (!cur.has(id)) dels.push(id); });
  try {
    for (let i = 0; i < ups.length; i += 200) {
      const part = ups.slice(i, i + 200);
      const { error } = await auth.sb.from('ws_items').upsert(part.map(p => p.row));
      if (error) throw error;
      part.forEach(p => { team.shadow[p.row.id] = p.j; });
    }
    for (let i = 0; i < dels.length; i += 200) {
      const part = dels.slice(i, i + 200);
      const { error } = await auth.sb.from('ws_items').delete().eq('workspace_id', ws).in('id', part);
      if (error) throw error;
      part.forEach(id => { delete team.shadow[id]; });
    }
    saveShadow();
    setSync('synced');
  } catch (e) {
    console.warn('Listo Team: zapis', e);
    setSync('offline');
    clearTimeout(team.retry); team.retry = setTimeout(teamPush, 8000);
  }
  team.pushing = false;
  if (team.again) teamPush();
}
// zmiana z serwera → do stanu lokalnego (o ile nie mamy własnej, jeszcze niewysłanej zmiany tego elementu)
function applyRemote(row) {
  const col = KIND_COL[row.kind];
  if (!col || !row.data) return false;
  const arr = state[col], i = arr.findIndex(x => x.id === row.id), j = JSON.stringify(row.data);
  if (team.shadow[row.id] === j) return false;
  if (i >= 0) {
    const local = JSON.stringify(arr[i]);
    if (local === j) { team.shadow[row.id] = j; return false; }
    if (team.shadow[row.id] !== undefined && local !== team.shadow[row.id]) return false; // lokalna zmiana wygrywa – zaraz ją wyślemy
  }
  const d = JSON.parse(j);
  if (row.kind === 'task') normTask(d);
  if (row.kind === 'project') d.sections = d.sections || [];
  if (i >= 0) arr[i] = d; else arr.push(d);
  team.shadow[row.id] = j;
  return true;
}
function removeRemote(id) {
  for (const col of Object.keys(SHARED)) {
    const arr = state[col], i = arr.findIndex(x => x.id === id);
    if (i < 0) continue;
    if (team.shadow[id] !== undefined && JSON.stringify(arr[i]) !== team.shadow[id]) return false;
    if (id === 'inbox') return false;
    arr.splice(i, 1);
    if (ui.modal?.id === id) ui.modal = null;
    delete team.shadow[id];
    return true;
  }
  delete team.shadow[id];
  return false;
}
let redrawT = 0;
function remoteRedraw() {
  clearTimeout(redrawT);
  redrawT = setTimeout(() => {
    persist(); saveShadow();
    const ae = document.activeElement;
    // nie przerywamy pisania w polu tytułu / komentarza – odświeżymy, gdy skończysz
    if (ae && ae.matches?.('.tm-title, .tm-desc, .cm-input, .tf-title, .tf-desc, .sf-input, .search-input, .pf-in, .home-add')) { remoteRedraw.pending = true; return; }
    ui.quiet = true; render();
  }, 120);
}
document.addEventListener('focusout', () => { if (remoteRedraw.pending) { remoteRedraw.pending = false; setTimeout(() => { ui.quiet = true; render(); }, 60); } });
async function fullLoad() {
  if (!auth.sb || !team.ws) return;
  const ws = team.ws.id;
  let rows = [], from = 0;
  for (;;) {
    const { data, error } = await auth.sb.from('ws_items').select('id, kind, data, updated_at').eq('workspace_id', ws).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  let changed = false;
  const seen = new Set();
  rows.forEach(r => { seen.add(r.id); if (applyRemote(r)) changed = true; });
  // usunięte przez innych, kiedy byliśmy offline
  Object.keys(team.shadow).forEach(id => { if (!seen.has(id) && removeRemote(id)) changed = true; });
  team.ready = true;
  if (changed) remoteRedraw(); else saveShadow();
  teamPush();
}
function subscribeRealtime() {
  team.chans.forEach(c => { try { auth.sb.removeChannel(c); } catch (e) { /* */ } });
  team.chans = [];
  const ws = team.ws.id, uid0 = me();
  const ch = auth.sb.channel('ws-' + ws)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ws_items', filter: `workspace_id=eq.${ws}` }, p => { if (applyRemote(p.new)) remoteRedraw(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ws_items', filter: `workspace_id=eq.${ws}` }, p => { if (applyRemote(p.new)) remoteRedraw(); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ws_items' }, p => { if (p.old?.workspace_id === ws && removeRemote(p.old.id)) remoteRedraw(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ws_members', filter: `workspace_id=eq.${ws}` }, () => loadMembers().then(() => { ui.quiet = true; render(); }))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ws_notifications', filter: `user_id=eq.${uid0}` }, p => onNotif(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ws_calendars', filter: `workspace_id=eq.${ws}` }, () => loadCalendars(true))
    .subscribe(st => {
      if (st === 'SUBSCRIBED') { if (team.wasDown) { team.wasDown = false; fullLoad().catch(() => setSync('offline')); } setSync('synced'); }
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { team.wasDown = true; setSync('offline'); }
    });
  team.chans.push(ch);
}
async function loadMembers() {
  const { data, error } = await auth.sb.from('ws_members').select('user_id, role, name, email, color, joined_at').eq('workspace_id', team.ws.id).order('joined_at');
  if (!error) team.members = data || [];
  lsSet('lt-members-' + team.ws.id, team.members);
}
// ustawienia osobiste (wygląd, filtry widoku) – osobno dla każdej osoby
async function pullPrefs() {
  const { data } = await auth.sb.from('team_prefs').select('state').eq('user_id', me()).maybeSingle();
  if (data?.state) {
    const keep = { who: state.settings.who };
    state.settings = Object.assign({}, PREF_DEFAULTS, state.settings, data.state.settings || {}, keep);
    if (Array.isArray(data.state.history) && data.state.history.length > state.history.length) state.history = data.state.history;
    persist(); ui.quiet = true; render();
  }
}
async function pushPrefs() {
  if (!auth.sb || !auth.user) return;
  try { await auth.sb.from('team_prefs').upsert({ user_id: me(), state: { settings: state.settings, history: state.history.slice(-500) }, saved_at: new Date().toISOString() }); } catch (e) { /* */ }
}

// ================================================================
//  Logowanie, firma (przestrzeń zespołu), zaproszenia
// ================================================================
async function initSync() {
  if (!CFG.supabaseUrl || !CFG.supabaseKey) { toast('Brak konfiguracji serwera (config.js)'); return; }
  try {
    if (!window.supabase?.createClient) await loadScript(SB_LIB);
  } catch (e) { setSync('offline'); toast('Brak internetu – pracujesz na kopii z tego urządzenia'); setTimeout(initSync, 30000); return; }
  const sb = auth.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'listo-team-auth' } });
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') newPasswordDialog();
    if (ev === 'SIGNED_OUT' && auth.user) { auth.user = null; wipeLocal(); location.reload(); }
    if (ev === 'SIGNED_IN' && session?.user && !auth.user) startAccount(session.user);
  });
  const { data } = await sb.auth.getSession();
  auth.ready = true;
  if (data?.session?.user) startAccount(data.session.user);
  else showAuth(pendingJoin() ? 'up' : 'in');
}
function wipeLocal() {
  ['lt-shadow', 'lt-ws', 'lt-ics', 'listo-last-user'].forEach(k => lsSet(k));
  try { localStorage.removeItem(KEY); } catch (e) { /* */ }
}
function resetShared() {
  state.tasks = []; state.labels = []; state.filters = [];
  state.projects = [{ id: 'inbox', name: 'Skrzynka', color: '#808080', isInbox: true, view: 'list', order: 0, sections: [] }];
  team.shadow = {}; saveShadow(); persist();
}
const pendingJoin = () => { const m = location.hash.match(/^#join-([a-z0-9]{4,16})$/i) || [null, lsGet('lt-join', null)]; return m[1] || null; };
async function startAccount(user) {
  if (auth.user) return;
  auth.user = user; CUR_UID = user.id;
  hideAuth();
  if (lsGet('listo-last-user', null) !== user.id) { wipeLocal(); resetShared(); }
  lsSet('listo-last-user', user.id);
  setSync('connecting');
  try {
    const code = pendingJoin();
    if (code) { lsSet('lt-join'); await joinWorkspace(code, true); try { history.replaceState(null, '', '#home'); } catch (e) { /* */ } }
    await loadWorkspaces();
    if (!team.list.length) { showOnboard(); return; }
    const last = lsGet('lt-ws', null);
    await openWorkspace(team.list.find(w => w.id === last) || team.list[0]);
  } catch (e) { console.warn(e); setSync('offline'); toast('Nie udało się połączyć z serwerem – spróbuję ponownie'); setTimeout(() => { auth.user = null; startAccount(user); }, 15000); }
}
async function loadWorkspaces() {
  const { data, error } = await auth.sb.from('workspaces').select('id, name, invite_code, timezone, created_by').order('created_at');
  if (error) throw error;
  team.list = data || [];
}
async function openWorkspace(ws) {
  if (lsGet('lt-ws', null) !== ws.id) resetShared();
  team.ws = ws; lsSet('lt-ws', ws.id);
  team.members = lsGet('lt-members-' + ws.id, []);
  await loadMembers();
  const m = member(me());
  if (m && !m.name && state.settings.userName) auth.sb.from('ws_members').update({ name: state.settings.userName }).eq('workspace_id', ws.id).eq('user_id', me());
  if (m?.name && !state.settings.userName) state.settings.userName = m.name;
  subscribeRealtime();
  await fullLoad();
  setSync('synced');
  pullPrefs();
  loadNotifs();
  loadCalendars();
  pushAutoResubscribe();
  ui.quiet = true; render();
  openDeepTask();
}
async function createWorkspace(name, myName) {
  const { data, error } = await auth.sb.rpc('create_workspace', { ws_name: name, member_name: myName || state.settings.userName || '' });
  if (error) throw error;
  await loadWorkspaces();
  const ws = team.list.find(w => w.id === data) || team.list[0];
  resetShared();
  seedTeam();
  lsSet('lt-ws', ws.id);
  await openWorkspace(ws);
}
async function joinWorkspace(code, quiet) {
  const { data, error } = await auth.sb.rpc('join_workspace', { code: code.trim().toLowerCase(), member_name: state.settings.userName || '' });
  if (error || !data) { if (!quiet) throw error || new Error('Nie znaleziono zespołu z tym kodem'); toast('Nieprawidłowy kod zaproszenia'); return null; }
  toast('Dołączono do zespołu 🎉');
  return data;
}
function seedTeam() {
  const td = todayStr();
  const p = { id: uid(), name: 'Start zespołu', color: '#14aaf5', favorite: true, view: 'list', order: 1, description: 'Krótki przewodnik dla zespołu – przesuwaj suwaki, przypisuj osoby, potem usuń ten projekt.', sections: [{ id: uid(), name: 'Pierwsze kroki' }] };
  state.projects.push(p);
  let o = 1;
  const T = (title, x = {}) => state.tasks.push(newTask(Object.assign({ title, projectId: p.id, sectionId: p.sections[0].id, order: o++, createdBy: me() }, x)));
  T('Przesuń suwak w prawo, gdy skończysz – środek oznacza „w trakcie”', { due: td, priority: 1, assignees: [me()] });
  T('Zaproś zespół: Ustawienia → Zespół → skopiuj link zaproszenia', { due: td, priority: 2, assignees: [me()] });
  T('Włącz powiadomienia push na telefonie i komputerze', { due: td, assignees: [me()] });
  T('Podłącz Kalendarz Google firmy (link iCal) w Ustawieniach → Kalendarze', { due: addDays(td, 1) });
  T('Spotkanie zespołu – przykład wydarzenia z przedziałem czasu', { due: addDays(td, 1), time: '10:00', endTime: '11:00', kind: 'event', assignees: [me()] });
}
async function signOut() {
  await teamPush().catch(() => {});
  await pushPrefs();
  try { const reg = await navigator.serviceWorker?.getRegistration(); const s = await reg?.pushManager?.getSubscription(); if (s) { await auth.sb.from('push_subs').delete().eq('endpoint', s.endpoint); await s.unsubscribe(); } } catch (e) { /* */ }
  wipeLocal();
  auth.user = null;
  await auth.sb.auth.signOut();
  location.reload();
}

// ---------- ekran logowania ----------
function showAuth(mode = 'in') {
  let el = $('#auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  const join = pendingJoin();
  el.dataset.mode = mode;
  el.innerHTML = `<div class="au-box">
    <div class="au-logo"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="17" fill="var(--accent)"/><path d="M19 33.5l8.5 8.5L45.5 24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <h1>${mode === 'up' ? 'Załóż konto w Listo Team' : mode === 'reset' ? 'Odzyskaj hasło' : 'Listo Team'}</h1>
    <p class="au-p">${mode === 'reset' ? 'Wyślemy Ci link do ustawienia nowego hasła.' : join ? '👋 Masz zaproszenie do zespołu. Załóż konto lub zaloguj się – dołączysz automatycznie.' : 'Zadania i wydarzenia całego zespołu – zsynchronizowane na żywo na telefonach i komputerach.'}</p>
    ${mode === 'reset' ? '' : `<div class="au-tabs"><button class="${mode === 'in' ? 'sel' : ''}" data-au="in">Logowanie</button><button class="${mode === 'up' ? 'sel' : ''}" data-au="up">Rejestracja</button></div>`}
    <form class="au-form" novalidate>
      ${mode === 'up' ? '<label><span>Imię i nazwisko</span><input name="name" autocomplete="name" maxlength="60" placeholder="Tak zobaczy Cię zespół"></label>' : ''}
      <label><span>E-mail</span><input name="email" type="email" autocomplete="email" required placeholder="ty@firma.pl"></label>
      ${mode === 'reset' ? '' : `<label><span>Hasło</span><input name="pass" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required minlength="6" placeholder="${mode === 'up' ? 'Co najmniej 6 znaków' : 'Twoje hasło'}"></label>`}
      <div class="au-msg" role="status"></div>
      <button class="btn primary au-go" type="submit">${mode === 'up' ? 'Załóż konto' : mode === 'reset' ? 'Wyślij link' : 'Zaloguj się'}</button>
    </form>
    ${mode === 'in' ? '<button class="link-btn au-link" data-au="reset">Nie pamiętasz hasła?</button>' : mode === 'reset' ? '<button class="link-btn au-link" data-au="in">Wróć do logowania</button>' : ''}
  </div>`;
  if (join) lsSet('lt-join', join);
  const form = $('.au-form', el), msg = $('.au-msg', el), go = $('.au-go', el);
  const say = (t, ok) => { msg.textContent = t; msg.classList.toggle('ok', !!ok); };
  el.onclick = e => { const b = e.target.closest('[data-au]'); if (b) showAuth(b.dataset.au); };
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form), email = String(f.get('email') || '').trim(), pass = String(f.get('pass') || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('Podaj poprawny adres e-mail.');
    if (mode !== 'reset' && pass.length < 6) return say('Hasło musi mieć co najmniej 6 znaków.');
    go.disabled = true; say('Chwileczkę…', true);
    try {
      const redirect = CFG.siteUrl || (location.protocol.startsWith('http') ? location.origin + location.pathname : undefined);
      if (mode === 'in') {
        const { error } = await auth.sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else if (mode === 'up') {
        const name = String(f.get('name') || '').trim();
        const { data, error } = await auth.sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirect, data: { name } } });
        if (error) throw error;
        if (name) { state.settings.userName = name; persist(); }
        if (!data.session) { say('Gotowe! Sprawdź skrzynkę e-mail i kliknij link potwierdzający, a potem zaloguj się tutaj.', true); go.disabled = false; return; }
      } else {
        const { error } = await auth.sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        say('Wysłano link – sprawdź skrzynkę e-mail.', true); go.disabled = false; return;
      }
    } catch (err) {
      go.disabled = false;
      const m = String(err?.message || '');
      say(/invalid login/i.test(m) ? 'Nieprawidłowy e-mail lub hasło.' : /already registered/i.test(m) ? 'To konto już istnieje – zaloguj się.' : /not confirmed/i.test(m) ? 'Najpierw potwierdź adres – kliknij link w e-mailu.' : /fetch|network/i.test(m) ? 'Brak połączenia z serwerem.' : 'Nie udało się: ' + m);
    }
  };
  setTimeout(() => $('input', form)?.focus(), 60);
}
function hideAuth() { const el = $('#auth'); if (!el) return; el.classList.add('out'); setTimeout(() => el.remove(), 300); }
function newPasswordDialog() {
  openDialog({ title: 'Ustaw nowe hasło', submit: 'Zapisz hasło', fields: [{ key: 'pass', label: 'Nowe hasło (co najmniej 6 znaków)', required: true }], onSubmit: v => {
    if (v.pass.length < 6) { alertField('pass', 'Co najmniej 6 znaków'); return false; }
    auth.sb.auth.updateUser({ password: v.pass }).then(({ error }) => toast(error ? 'Nie udało się zmienić hasła' : 'Hasło zmienione ✓'));
  } });
}
// ---------- pierwsze kroki: utwórz firmę albo dołącz ----------
function showOnboard() {
  let el = $('#auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  const nm = state.settings.userName || auth.user?.user_metadata?.name || '';
  el.innerHTML = `<div class="au-box ob">
    <div class="au-logo"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="17" fill="var(--accent)"/><path d="M19 33.5l8.5 8.5L45.5 24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <h1>Twój zespół</h1><p class="au-p">Utwórz przestrzeń dla firmy albo dołącz do istniejącej kodem zaproszenia od współpracownika.</p>
    <form class="au-form ob-create"><label><span>Twoje imię i nazwisko</span><input name="me" value="${esc(nm)}" maxlength="60" required placeholder="np. Anna Kowalska"></label>
      <label><span>Nazwa firmy / zespołu</span><input name="ws" maxlength="60" placeholder="np. Kowalski Sp. z o.o."></label>
      <button class="btn primary au-go" type="submit">Utwórz zespół</button></form>
    <div class="au-sep"><span>lub</span></div>
    <form class="au-form ob-join"><label><span>Kod zaproszenia</span><input name="code" maxlength="16" placeholder="np. a1b2c3d4" autocomplete="off" spellcheck="false"></label>
      <button class="btn au-go" type="submit">Dołącz do zespołu</button></form>
    <div class="au-msg" role="status"></div>
    <button class="link-btn au-link" data-ob="out">Wyloguj się</button>
  </div>`;
  const msg = $('.au-msg', el), say = (t, ok) => { msg.textContent = t; msg.classList.toggle('ok', !!ok); };
  const myName = () => { const v = $('[name=me]', el).value.trim(); if (v) { state.settings.userName = v; persist(); } return v; };
  $('.ob-create', el).onsubmit = async e => {
    e.preventDefault();
    const n = $('[name=ws]', el).value.trim(), mn = myName();
    if (!mn) return say('Wpisz swoje imię – tak zobaczy Cię zespół.');
    if (!n) return say('Wpisz nazwę zespołu.');
    say('Tworzę zespół…', true);
    try { await createWorkspace(n, mn); hideAuth(); toast('Zespół utworzony – zaproś osoby w Ustawieniach → Zespół'); } catch (err) { say('Nie udało się: ' + (err?.message || err)); }
  };
  $('.ob-join', el).onsubmit = async e => {
    e.preventDefault();
    const c = $('[name=code]', el).value.trim();
    if (!myName()) return say('Wpisz najpierw swoje imię (pole wyżej).');
    if (!c) return say('Wpisz kod zaproszenia.');
    say('Dołączam…', true);
    try { const id = await joinWorkspace(c); if (!id) return say('Nie znaleziono zespołu z tym kodem.'); await loadWorkspaces(); hideAuth(); await openWorkspace(team.list.find(w => w.id === id) || team.list[0]); } catch (err) { say('Nie znaleziono zespołu z tym kodem.'); }
  };
  el.onclick = e => { if (e.target.closest('[data-ob="out"]')) signOut(); };
}
const inviteLink = () => (CFG.siteUrl || location.origin + location.pathname) + '#join-' + (team.ws?.invite_code || '');
function openDeepTask() {
  const m = (location.hash.match(/^#task-([\w-]+)$/) || [])[1] || lsGet('lt-open-task', null);
  lsSet('lt-open-task');
  if (m && task(m)) { try { history.replaceState(null, '', '#' + viewHash(ui.view)); } catch (e) { /* */ } openTask(m); }
}
addEventListener('hashchange', () => { const m = location.hash.match(/^#task-([\w-]+)$/); if (m && task(m[1])) openTask(m[1]); });

// ================================================================
//  Wiersz zadania, ukończenie, okno zadania
// ================================================================
const timeRange = t => t.time ? t.time + (t.endTime ? '–' + t.endTime : '') : '';
function dueLabel(t) {
  const di = dueInfo(t.due, t.time);
  if (!di) return null;
  return { cls: di.cls, label: di.label + (t.time && t.endTime ? '–' + t.endTime : '') + (t.endDue && t.endDue !== t.due ? ' → ' + shortDate(t.endDue) : '') };
}
function taskRow(t, o = {}) {
  const p = proj(t.projectId), sec = sectionOf(t);
  const subs = state.tasks.filter(x => x.parentId === t.id);
  const subsDone = subs.filter(x => x.completed).length;
  const di = dueLabel(t), st = stOf(t), ev = t.kind === 'event';
  const meta = [];
  if (ev) meta.push(`<span class="meta-item ev-tag">${sz(I.calBig, 12)} Wydarzenie</span>`);
  if (st === 1) meta.push(`<span class="meta-item st-tag">W trakcie</span>`);
  if (subs.length) meta.push(`<span class="meta-item">${I.subtask} ${subsDone}/${subs.length}</span>`);
  if (di && !(o.hideToday && di.cls === 'today' && !t.time && !t.recurring)) meta.push(`<span class="meta-item due ${t.completed && !o.asActive ? '' : di.cls}"${t.completed ? '' : ` data-act="task-date" data-id="${t.id}" title="Zmień termin"`}>${I.cal} ${di.label}${t.recurring ? ' ' + I.repeat : ''}</span>`);
  if (t.location) meta.push(`<span class="meta-item">${I.pin} ${esc(t.location)}</span>`);
  if (t.comments.length) meta.push(`<span class="meta-item">${I.comment} ${t.comments.length}</span>`);
  t.labels.forEach(id => { const l = label(id); if (l) meta.push(`<span class="meta-item" style="color:${l.color}">${I.tag} ${esc(l.name)}</span>`); });
  if ((o.showProject || o.asActive) && t.parentId && task(t.parentId) && !(o.asActive && task(t.parentId).completed)) meta.push(`<span class="meta-item">${I.subtask} ${esc(task(t.parentId).title)}</span>`);
  if (o.asActive && t.completedBy) meta.push(`<span class="meta-item">${sz(I.done, 12)} ${esc(firstName(t.completedBy))}</span>`);
  const projHtml = o.showProject && p ? `<span class="meta-proj" data-act="nav" data-view="${p.isInbox ? 'inbox' : 'project'}" ${p.isInbox ? '' : `data-id="${p.id}"`} title="Przejdź do projektu">${esc(projName(p))}${sec ? ' / ' + esc(sec.name) : ''} <span class="hash" ${p.color !== '#808080' ? `style="color:${p.color}"` : ''}>#</span></span>` : '';
  const who = t.assignees.length ? `<button class="row-avs" data-act="assign" data-id="${t.id}" title="Przypisane: ${esc(t.assignees.map(memberName).join(', '))}">${avatars(t.assignees, 22)}</button>`
    : (t.completed ? '' : `<button class="row-avs empty" data-act="assign" data-id="${t.id}" title="Przypisz osobę">${sz(I.person, 15)}</button>`);
  const childList = o.asActive ? state.tasks.filter(x => x.parentId === t.id && x.completed).sort(byOrder) : o.nested ? kids(t.id, o.showDone) : [];
  const collapsed = ui.collapsed['t' + t.id];
  const idx = Math.min(ui.rowIdx++, 16);
  return `<div class="task-wrap" style="--i:${idx}">
    <div class="task st-${st} ${ev ? 'is-event' : ''} ${t.completed && !o.asActive ? 'done' : ''}${ui.enter.has(t.id) ? ' enter' : ''}${ui.selected.has(t.id) ? ' sel' : ''}" data-id="${t.id}" draggable="${!t.completed && !o.noDrag}" data-drop="task" style="--pc:var(--p${t.priority})"${o.asActive && t.completedAt ? ` title="Ukończono: ${fmtDateTime(t.completedAt)}${t.completedBy ? ' · ' + esc(memberName(t.completedBy)) : ''}"` : ''}>
      ${childList.length ? `<button class="caret ${collapsed ? 'closed' : ''}" data-act="collapse" data-key="t${t.id}" aria-label="Zwiń">${I.chevron}</button>` : ''}
      ${o.asActive ? `<button class="check checked p${t.priority}" data-act="toggle" data-id="${t.id}" aria-label="Przywróć zadanie" title="Przywróć">${I.check}</button>` : stSlider(t)}
      <div class="task-main" data-act="open" data-id="${t.id}">
        <div class="task-title">${t.priority < 4 ? `<span class="pflag">${flagIcon(t.priority, 13)}</span>` : ''}${fmtText(t.title)}</div>
        ${t.description ? `<div class="task-desc">${esc(t.description.split('\n')[0])}</div>` : ''}
        ${meta.length || projHtml ? `<div class="task-meta"><div class="meta-l">${meta.join('')}</div>${projHtml}</div>` : ''}
      </div>
      ${who}
      ${o.asActive ? `<div class="task-actions">
        <button class="restore-btn" data-act="toggle" data-id="${t.id}" title="Przywróć do listy zadań">${sz(I.repeat, 14)} Przywróć</button>
        <button class="icon-btn" data-act="task-del" data-id="${t.id}" title="Usuń na stałe">${I.trash}</button>
      </div>` : `<div class="task-actions">
        <button class="icon-btn" data-act="task-edit" data-id="${t.id}" title="Edytuj">${I.edit}</button>
        <button class="icon-btn" data-act="task-date" data-id="${t.id}" title="Ustaw termin">${I.calBig}</button>
        <button class="icon-btn" data-act="task-more" data-id="${t.id}" title="Więcej akcji">${I.dots}</button>
      </div>`}
    </div>
    ${childList.length ? cbox('t' + t.id, `<div class="subtasks">${childList.map(k => taskRow(k, o)).join('')}</div>`) : ''}
  </div>`;
}

function toggleTask(id) {
  const t = task(id);
  if (!t) return;
  const snap = snapshot();
  if (t.completed) {
    const rows = $$(`.task[data-id="${id}"]`);
    rows.forEach(r => r.classList.add('restoring'));
    playSound('restore');
    if (ui.view.type === 'completed') rows.forEach(r => collapseRow(r.closest('.task-wrap')));
    setTimeout(() => {
      const at0 = (t.completedAt || Date.now()) - 120000;
      for (let i = state.history.length - 1; i >= 0; i--) {
        const h = state.history[i];
        if (h.id ? h.id === t.id : (h.title === t.title && h.projectId === t.projectId && h.at >= at0)) { state.history.splice(i, 1); break; }
      }
      t.completed = false; t.completedAt = null; t.completedBy = null;
      if (t.status === 2 || t.status == null) t.status = 0;
      let par = t.parentId && task(t.parentId);
      while (par) { if (par.completed) { par.completed = false; par.completedAt = null; par.status = 0; } par = par.parentId && task(par.parentId); }
      markEnter(id);
      commit();
      toast(t.status === 1 ? 'Zadanie znów w trakcie' : 'Zadanie przywrócone', snap);
    }, REDUCED ? 0 : 260);
    return;
  }
  const rows = $$(`.task[data-id="${id}"]`);
  rows.forEach(r => r.classList.add('completing'));
  $$(`.st3[data-id="${id}"], .check[data-id="${id}"]`).forEach(c => { c.dataset.st = 2; c.classList.add('pop'); burst(c, 4); });
  playSound('done');
  const keep = t.recurring || !!ui.showCompleted[t.projectId];
  setTimeout(() => {
    if (!keep) rows.forEach(r => collapseRow(r.closest('.task-wrap')));
    setTimeout(() => {
      state.history.push({ id: t.id, title: t.title, at: Date.now(), projectId: t.projectId, priority: t.priority });
      if (state.history.length > 1000) state.history.splice(0, state.history.length - 1000);
      if (t.recurring) {
        t.due = nextDue(t); t.status = 0;
        commit();
        toast(`Następny termin: ${dueInfo(t.due, t.time).label}`, snap);
      } else {
        const now = Date.now();
        t.completed = true; t.completedAt = now; t.completedBy = me(); t.status = 2;
        descendants(t.id).forEach(d => { if (!d.completed) { d.completed = true; d.completedAt = now; d.completedBy = me(); d.status = 2; } });
        commit();
        toast(`🟢 Ukończono: ${t.title}`, snap);
      }
      const td = todayStr();
      const doneToday = state.history.filter(h => fmtDate(new Date(h.at)) === td).length;
      if (doneToday === (state.settings.dailyGoal || 5)) { celebrate(); toast(`🎉 Dzienny cel osiągnięty: ${doneToday} zadań!`, snap); }
    }, keep ? 60 : 240);
  }, REDUCED ? 0 : 230);
}

// ---------- suwak statusu: klik w lewo / środek / prawo albo przeciągnięcie ----------
(() => {
  let drag = null;
  const zone = (b, x) => { const r = b.getBoundingClientRect(); return Math.max(0, Math.min(2, Math.floor((x - r.left) / r.width * 3))); };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.st3');
    if (!b || e.button > 0) return;
    e.stopPropagation();
    drag = { b, x: e.clientX, moved: false, start: +b.dataset.st };
    try { b.setPointerCapture(e.pointerId); } catch (er) { /* */ }
  }, true);
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
    if (!drag.moved) return;
    const r = drag.b.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    drag.b.style.setProperty('--f', f.toFixed(3)); drag.b.classList.add('drag');
    drag.b.dataset.st = Math.round(f * 2);
  });
  document.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    d.b.classList.remove('drag'); d.b.style.removeProperty('--f');
    let s = d.moved ? +d.b.dataset.st : zone(d.b, e.clientX);
    if (!d.moved && s === d.start) s = (d.start + 1) % 3; // klik w obecny stan → następny
    d.b.dataset.st = d.start;
    if (navigator.vibrate && e.pointerType === 'touch') navigator.vibrate(10);
    setStatus(d.b.dataset.id, s);
  });
  document.addEventListener('pointercancel', () => { if (drag) { drag.b.classList.remove('drag'); drag.b.dataset.st = drag.start; drag = null; } });
  document.addEventListener('click', e => { if (e.target.closest('.st3')) { e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('keydown', e => {
    const b = e.target.closest?.('.st3');
    if (!b) return;
    const s = +b.dataset.st;
    if (e.key === 'ArrowRight' && s < 2) { e.preventDefault(); setStatus(b.dataset.id, s + 1); }
    else if (e.key === 'ArrowLeft' && s > 0) { e.preventDefault(); setStatus(b.dataset.id, s - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatus(b.dataset.id, (s + 1) % 3); }
  });
})();

// ---------- okno zadania ----------
const REMIND = [[-1, 'Bez przypomnienia'], [0, 'W chwili rozpoczęcia'], [5, '5 min wcześniej'], [10, '10 min wcześniej'], [15, '15 min wcześniej'], [30, '30 min wcześniej'], [60, '1 godz. wcześniej'], [1440, '1 dzień wcześniej']];
const remindLabel = t => (REMIND.find(r => r[0] === (t.remind ?? 10)) || REMIND[3])[1];
function gcalTemplate(t) {
  const d = (t.due || todayStr()).replace(/-/g, '');
  let dates;
  if (t.time) { const s = t.time.replace(':', '') + '00', e = (t.endTime || addMin(t.time, t.kind === 'event' ? 60 : 30)).replace(':', '') + '00'; dates = `${d}T${s}/${(t.endDue || t.due || todayStr()).replace(/-/g, '')}T${e}`; }
  else dates = `${d}/${addDays(t.endDue || t.due || todayStr(), 1).replace(/-/g, '')}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: t.title, dates, details: (t.description || '') + '\n\n— z Listo Team', location: t.location || '', ctz: team.ws?.timezone || 'Europe/Warsaw' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
function renderTaskModal(t) {
  const p = proj(t.projectId), sec = sectionOf(t), parent = t.parentId ? task(t.parentId) : null;
  const di = dueLabel(t), st = stOf(t), ev = t.kind === 'event';
  const subs = kids(t.id, true);
  const subsDone = subs.filter(s => s.completed).length;
  const siblings = currentTaskList();
  const idx = siblings.indexOf(t.id);
  const hist = [t.createdBy ? `Utworzone przez <b>${esc(memberName(t.createdBy))}</b> · ${fmtDateTime(t.createdAt)}` : `Utworzono ${fmtDateTime(t.createdAt)}`,
    t.statusAt && t.status === 1 ? `W trakcie od ${fmtDateTime(t.statusAt)}${t.statusBy ? ' · ' + esc(firstName(t.statusBy)) : ''}` : '',
    t.completedAt ? `Ukończone ${fmtDateTime(t.completedAt)}${t.completedBy ? ' · ' + esc(firstName(t.completedBy)) : ''}` : ''].filter(Boolean);
  return `<div class="overlay" data-act="modal-bg"><div class="modal task-modal" role="dialog" aria-label="Szczegóły zadania">
    <div class="tm-head">
      <div class="crumbs"><span class="hash" style="color:${p?.color}">#</span><a data-act="nav" data-view="project" data-id="${p?.id}">${esc(projName(p))}</a>${sec ? ` / <span>${esc(sec.name)}</span>` : ''}${parent ? ` / <a data-act="open" data-id="${parent.id}">${esc(parent.title)}</a>` : ''}</div>
      <div style="display:flex;gap:2px">
        <button class="icon-btn" data-act="task-link" data-id="${t.id}" title="Kopiuj link do zadania">${I.link}</button>
        <button class="icon-btn" data-act="open" data-id="${siblings[idx - 1] || ''}" ${idx > 0 ? '' : 'disabled'} title="Poprzednie zadanie" aria-label="Poprzednie">${I.left.replace('M15 6l-6 6 6 6', 'M6 15l6-6 6 6')}</button>
        <button class="icon-btn" data-act="open" data-id="${siblings[idx + 1] || ''}" ${idx >= 0 && idx < siblings.length - 1 ? '' : 'disabled'} title="Następne zadanie" aria-label="Następne">${I.chevronDown}</button>
        <button class="icon-btn" data-act="task-more" data-id="${t.id}" title="Więcej">${I.dots}</button>
        <button class="icon-btn" data-act="modal-close" title="Zamknij (Esc)">${I.x}</button>
      </div>
    </div>
    <div class="tm-body">
      <div class="tm-main">
        <div class="tm-kind seg-inline"><button class="${ev ? '' : 'sel'}" data-act="tm-kind" data-id="${t.id}" data-v="task">${sz(I.done, 14)} Zadanie</button><button class="${ev ? 'sel' : ''}" data-act="tm-kind" data-id="${t.id}" data-v="event">${sz(I.calBig, 14)} Wydarzenie</button></div>
        <div class="tm-title-row">
          <textarea class="tm-title" rows="1" data-field="title" aria-label="Nazwa">${esc(t.title)}</textarea>
        </div>
        <div class="tm-status st-${st}">
          ${stSlider(t, true)}
          <div class="tm-st-l">${ST_LABEL.map((l, i) => `<button class="${i === st ? 'on' : ''}" data-act="st-set" data-id="${t.id}" data-s="${i}"><i></i>${l}</button>`).join('')}</div>
        </div>
        <textarea class="tm-desc" rows="1" data-field="description" placeholder="Opis, notatki, linki…" aria-label="Opis">${esc(t.description)}</textarea>
        <div class="tm-block">
          <h4>Zadania podrzędne ${subs.length ? `<span class="muted">${subsDone}/${subs.length}</span>` : ''}</h4>
          <div class="subtasks">${subs.map(k => taskRow(k, { nested: true, showDone: true })).join('')}</div>
          ${addTaskButton('sub:' + t.id, { parentId: t.id, projectId: t.projectId, sectionId: t.sectionId })}
        </div>
        <div class="tm-block">
          <h4>Komentarze ${t.comments.length ? `<span class="muted">${t.comments.length}</span>` : ''}</h4>
          ${t.comments.map(c => `<div class="comment">${c.by ? avatar(c.by, 28) : '<span class="avatar">?</span>'}<div class="cbody">
            <div class="chead"><strong>${c.by ? esc(memberName(c.by)) : 'Ktoś'}</strong><span class="muted small">${fmtDateTime(c.at)}</span>
            ${!c.by || c.by === me() || isAdmin() ? `<button class="icon-btn" data-act="comment-del" data-id="${t.id}" data-cid="${c.id}" title="Usuń komentarz">${I.trash}</button>` : ''}</div>
            <div class="ctext">${fmtText(c.text)}</div></div></div>`).join('')}
          <div class="comment-form"><textarea class="cm-input" rows="1" placeholder="Napisz komentarz… (Ctrl+Enter)" aria-label="Komentarz"></textarea><button class="btn primary" data-act="comment-add" data-id="${t.id}">Skomentuj</button></div>
        </div>
        <div class="tm-hist muted small">${hist.join('<br>')}</div>
      </div>
      <aside class="tm-side">
        <div class="side-field"><label>Osoby</label><button class="side-btn tm-who" data-act="assign" data-id="${t.id}">${t.assignees.length ? t.assignees.map(a => `<span class="tm-person">${avatar(a, 20)} ${esc(memberName(a))}</span>`).join('') : `${sz(I.person, 16)} Przypisz osobę`}</button></div>
        <div class="side-field"><label>${ev ? 'Kiedy' : 'Termin'}</label><button class="side-btn ${di ? di.cls : ''}" data-act="task-date" data-id="${t.id}">${I.cal} ${di ? di.label : 'Bez terminu'} ${t.recurring ? I.repeat + ' ' + REC_LABEL[t.recurring].toLowerCase() : ''}</button>
          ${t.due ? `<div class="tm-mini"><button class="link-btn" data-act="tm-enddue" data-id="${t.id}">${t.endDue ? 'Do: ' + shortDate(t.endDue) : '+ kilka dni'}</button>${t.time ? ` · <button class="link-btn" data-act="tm-remind" data-id="${t.id}">🔔 ${remindLabel(t)}</button>` : ''}</div>` : ''}</div>
        <div class="side-field"><label>Projekt</label><button class="side-btn" data-act="tm-project" data-id="${t.id}"><span class="hash" style="color:${p?.color}">#</span> ${esc(projName(p))}${sec ? ' / ' + esc(sec.name) : ''}</button></div>
        <div class="side-field"><label>Priorytet</label><button class="side-btn" data-act="tm-prio" data-id="${t.id}">${flagIcon(t.priority)} P${t.priority}</button></div>
        <div class="side-field"><label>Miejsce</label><input class="side-in tm-loc" data-id="${t.id}" value="${esc(t.location || '')}" placeholder="${ev ? 'Sala, adres lub link do spotkania' : 'Opcjonalnie'}" maxlength="200"></div>
        <div class="side-field"><label>Etykiety</label><button class="side-btn" data-act="tm-labels" data-id="${t.id}">${I.tag} ${t.labels.length ? 'Zmień' : 'Dodaj etykiety'}</button>
          ${t.labels.length ? `<div class="label-chips">${t.labels.map(id => label(id)).filter(Boolean).map(l => `<span class="label-chip" style="color:${l.color}">${I.tag} ${esc(l.name)}</span>`).join('')}</div>` : ''}</div>
        <div class="side-field" style="border:0"><label>Kalendarz Google</label><a class="side-btn" href="${esc(gcalTemplate(t))}" target="_blank" rel="noopener">${I.google} Dodaj do mojego kalendarza</a></div>
      </aside>
    </div>
  </div></div>`;
}
document.addEventListener('change', e => {
  if (e.target.matches?.('.tm-loc')) { const t = task(e.target.dataset.id); if (t) { t.location = e.target.value.trim(); commit(); } }
});

// ---------- akcje zespołowe ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case 'assign': {
      e.stopPropagation();
      const t = task(id); if (!t) return;
      assignPicker(el, t.assignees, ids => { t.assignees = ids; save(); ui.quiet = true; renderMain(); renderModal(); renderSidebar(); });
      break;
    }
    case 'tf-assign': { const f = ui.addForm; if (!f) return; assignPicker(el, f.draft.assignees, ids => { f.draft.assignees = ids; render(); }); ui.popOnClose = () => $('.task-form .tf-title')?.focus(); break; }
    case 'tf-kind': { const f = ui.addForm; if (!f) return; f.draft.kind = el.dataset.v; if (f.draft.kind === 'event' && f.draft.time && !f.draft.endTime) f.draft.endTime = addMin(f.draft.time, 60); ui.focusSel = '.task-form .tf-title'; render(); break; }
    case 'tm-kind': { const t = task(id); if (t) { t.kind = el.dataset.v; if (t.kind === 'event' && t.time && !t.endTime) t.endTime = addMin(t.time, 60); commit(); } break; }
    case 'st-set': setStatus(id, +el.dataset.s); break;
    case 'task-link': copyText(location.origin + location.pathname + '#task-' + id, 'Skopiowano link do zadania – wyślij go komuś z zespołu'); break;
    case 'tm-remind': {
      const t = task(id); if (!t) return;
      openPopover(el, (pop, close) => {
        pop.innerHTML = `<div class="menu"><div class="menu-label">Przypomnienie push</div>${REMIND.map(([v, l]) => `<button class="menu-item ${(t.remind ?? 10) === v ? 'sel' : ''}" data-r="${v}"><span class="grow">${l}</span>${(t.remind ?? 10) === v ? I.checkSmall : ''}</button>`).join('')}</div>`;
        pop.onclick = ev2 => { const b = ev2.target.closest('[data-r]'); if (b) { t.remind = +b.dataset.r; close(); commit(); } };
      });
      break;
    }
    case 'tm-enddue': {
      const t = task(id); if (!t) return;
      datePicker(el, { due: t.endDue || t.due }, v => { t.endDue = v.due && v.due > t.due ? v.due : null; commit(); });
      break;
    }
    case 'who': whoPicker(el); break;
    case 'notif-open': { const n = team.notifs.find(x => String(x.id) === String(el.dataset.nid)); if (n) markRead([n]); if (id && task(id)) openTask(id); else if (id) toast('To zadanie zostało usunięte'); break; }
    case 'person': ui.modal = null; setView({ type: 'person', id: el.dataset.uid }); break;
  }
});
// zadanie w menu kontekstowym: przypisz / status
const baseTaskMenu = taskMenu;
taskMenu = function (anchor, t) {
  baseTaskMenu(anchor, t);
  const m = $('#popover .menu');
  if (!m || !t) return;
  m.insertAdjacentHTML('afterbegin', `<div class="menu-label">Status</div><div class="menu-row st-row">${ST_LABEL.map((l, i) => `<button class="st-pill s${i} ${stOf(t) === i ? 'sel' : ''}" data-tst="${i}" title="${l}"><i></i>${l}</button>`).join('')}</div><div class="menu-sep"></div>`);
  const sep = m.querySelector('[data-a="sub"]');
  sep?.insertAdjacentHTML('beforebegin', `<button class="menu-item" data-ta="assign">${sz(I.person, 16)}<span class="grow">Przypisz osoby…</span>${t.assignees.length ? avatars(t.assignees, 16) : ''}</button>`);
  m.addEventListener('click', e => {
    const s = e.target.closest('[data-tst]'), as = e.target.closest('[data-ta="assign"]');
    if (s) { e.stopPropagation(); closePopover(); setStatus(t.id, +s.dataset.tst); }
    if (as) { e.stopPropagation(); closePopover(); const anc = document.body.contains(anchor) ? anchor : $(`.task[data-id="${t.id}"]`) || document.body; assignPicker(anc, t.assignees, ids => { t.assignees = ids; commit(); }); }
  }, true);
};

// ================================================================
//  Widoki zespołu: Moje zadania, Zespół (tablica osób), Osoba, Start, Raporty
// ================================================================
const openAll = () => state.tasks.filter(t => !t.completed);
const byStatusDue = (a, b) => stOf(b) - stOf(a) || byDue(a, b);
function groupBlock(key, title, list, o = {}) {
  if (!list.length && !o.always) return '';
  return `<div class="group" ${o.drop || ''}><div class="group-head"><button class="caret ${ui.collapsed[key] ? 'closed' : ''}" data-act="collapse" data-key="${key}">${I.chevron}</button><h3>${title}</h3><span class="count">${list.length || ''}</span>${o.right || ''}</div>
    ${cbox(key, list.map(t => taskRow(t, { showProject: true })).join('') + (o.add || ''))}</div>`;
}
function personTasksHtml(uid0, mine) {
  const td = todayStr(), list = openAll().filter(t => t.assignees.includes(uid0));
  const prog = list.filter(t => stOf(t) === 1).sort(byDue);
  const rest = list.filter(t => stOf(t) === 0);
  const over = rest.filter(t => t.due && t.due < td).sort(byDue), today = rest.filter(t => t.due === td).sort(byDue);
  const later = rest.filter(t => t.due && t.due > td).sort(byDue), nod = rest.filter(t => !t.due).sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt);
  const pre = mine ? 'm' : 'p' + uid0;
  let html = groupBlock(pre + 'prog', '🟡 W trakcie', prog)
    + groupBlock(pre + 'over', '<span style="color:var(--due-overdue)">Po terminie</span>', over, { right: mine && over.length ? `<button class="btn ghost accent" data-act="mine-today" title="Przełóż wszystkie zaległe na dziś">Na dziś</button>` : '' })
    + groupBlock(pre + 'today', 'Dziś', today, { always: mine, add: mine ? addTaskButton('mine', { due: td, assignees: [uid0] }) : '' })
    + groupBlock(pre + 'later', 'Zaplanowane', later)
    + groupBlock(pre + 'nod', 'Bez terminu', nod);
  if (!list.length) html += emptyState(mine ? 'Nie masz przypisanych zadań' : 'Brak przypisanych zadań', mine ? 'Gdy ktoś przypisze Ci zadanie, pojawi się tutaj – dostaniesz też powiadomienie.' : 'Przeciągnij zadanie na tę osobę w widoku Zespół albo wpisz +imię przy dodawaniu.');
  return html;
}
function renderMine() {
  const list = myOpen(), prog = list.filter(t => stOf(t) === 1).length;
  const done7 = state.tasks.filter(t => t.completed && t.completedBy === me() && t.completedAt > Date.now() - 7 * 864e5).length;
  return header('Moje zadania', { icon: avatar(me(), 26), iconCls: 'plain',
    sub: `${list.length} ${plural(list.length, 'otwarte', 'otwarte', 'otwartych')} · ${prog} w trakcie · ${done7} ${plural(done7, 'ukończone', 'ukończone', 'ukończonych')} w 7 dni` }) + personTasksHtml(me(), true);
}
function renderPerson(uid0) {
  if (!member(uid0)) return emptyState('Nie znaleziono osoby', 'Ta osoba nie należy już do zespołu.');
  const m = member(uid0), list = openAll().filter(t => t.assignees.includes(uid0));
  const done7 = state.tasks.filter(t => t.completed && t.completedBy === uid0 && t.completedAt > Date.now() - 7 * 864e5).length;
  return header(esc(memberName(uid0)), { icon: avatar(uid0, 26), iconCls: 'plain', barTitle: esc(memberName(uid0)),
    sub: `${esc(m.email || '')} · ${list.length} otwartych · ${done7} ukończonych w 7 dni`,
    right: `<button class="btn" data-act="quick-add-for" data-uid="${uid0}">${sz(I.plus, 15)} Zadanie dla ${esc(firstName(uid0))}</button>` }) + personTasksHtml(uid0, false);
}
function renderTeam() {
  const td = todayStr(), all = openAll();
  const cols = [...team.members.map(m => m.user_id), '_none'];
  const mode = ui.teamMode || 'board';
  let html = header('Zespół', { icon: sz(I.team, 24), iconCls: 'tile',
    sub: `${team.members.length} ${plural(team.members.length, 'osoba', 'osoby', 'osób')} · ${all.length} otwartych zadań · ${all.filter(t => !t.assignees.length).length} nieprzypisanych`,
    right: `<div class="seg-inline"><button class="${mode === 'board' ? 'sel' : ''}" data-act="team-mode" data-v="board">Tablica</button><button class="${mode === 'load' ? 'sel' : ''}" data-act="team-mode" data-v="load">Obciążenie</button></div>
      <button class="btn" data-act="pref-open" data-t="team">${sz(I.share, 15)} Zaproś</button>` });
  if (!team.ws) return html + emptyState('Brak zespołu', 'Zaloguj się i utwórz zespół lub dołącz do niego kodem zaproszenia.');
  if (mode === 'load') {
    const days = [...Array(14)].map((_, i) => addDays(td, i));
    html += `<div class="tl-load"><div class="tl-row tl-h"><span class="tl-n"></span>${days.map(d => `<span class="tl-d ${dow(d) === 0 || dow(d) === 6 ? 'we' : ''} ${d === td ? 'today' : ''}">${PL_DAYS_SHORT[dow(d)]}<b>${parseDate(d).getDate()}</b></span>`).join('')}</div>
      ${cols.map(u => { const ts = all.filter(t => u === '_none' ? !t.assignees.length : t.assignees.includes(u)); return `<div class="tl-row"><span class="tl-n">${u === '_none' ? `<span class="av none" style="--s:22px">?</span> Nieprzypisane` : `${avatar(u, 22)} ${esc(firstName(u))}`}</span>
        ${days.map(d => { const n = ts.filter(t => t.due === d || (t.endDue && t.due < d && d <= t.endDue)).length, od = d === td ? ts.filter(t => t.due && t.due < td).length : 0; const v = n + od; return `<button class="tl-c l${v === 0 ? 0 : v < 2 ? 1 : v < 4 ? 2 : v < 6 ? 3 : 4}" data-act="tl-cell" data-uid="${u}" data-date="${d}" title="${shortDate(d)}: ${n}${od ? ` + ${od} po terminie` : ''}">${v || ''}</button>`; }).join('')}</div>`; }).join('')}</div>
      <p class="muted small" style="margin-top:10px">Liczba zadań i wydarzeń na osobę w kolejnych 14 dniach (dziś razem z zaległymi). Kliknij komórkę, by otworzyć kalendarz tego dnia.</p>`;
    return html;
  }
  html += `<div class="board team-board">${cols.map(u => {
    const ts = all.filter(t => u === '_none' ? !t.assignees.length : t.assignees.includes(u)).sort(byStatusDue);
    const prog = ts.filter(t => stOf(t) === 1).length, od = ts.filter(t => t.due && t.due < td).length;
    const m = member(u);
    return `<div class="board-col team-col" data-drop="person" data-uid="${u}">
      <div class="section-head tc-head">${u === '_none' ? `<span class="av none" style="--s:30px">?</span><div class="grow"><h3>Nieprzypisane</h3><span class="muted small">przeciągnij na osobę</span></div>`
        : `<button class="tc-who" data-act="person" data-uid="${u}">${avatar(u, 30)}<div class="grow"><h3>${esc(memberName(u))}${u === me() ? ' <span class="muted small">(Ty)</span>' : ''}</h3><span class="muted small">${m?.role === 'owner' ? 'właściciel' : m?.role === 'admin' ? 'administrator' : 'członek'}</span></div></button>`}
        <span class="count">${ts.length}</span></div>
      <div class="tc-stats">${prog ? `<span class="ins yellow"><b>${prog}</b> w trakcie</span>` : ''}${od ? `<span class="ins red"><b>${od}</b> po terminie</span>` : ''}</div>
      <div class="col-body">${ts.map(t => taskRow(t, { showProject: true })).join('')}${addTaskButton('team:' + u, { assignees: u === '_none' ? [] : [u] })}</div></div>`;
  }).join('')}</div>`;
  return html;
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act;
  if (a === 'team-mode') { ui.teamMode = el.dataset.v; ui.stagger = true; render(); }
  if (a === 'tl-cell') { ui.calSel = el.dataset.date; ui.calMode = 'day'; ui.calDay = el.dataset.date; if (el.dataset.uid !== '_none') state.settings.who = el.dataset.uid; setView({ type: 'calendar' }); }
  if (a === 'quick-add-for') { ui.modal = { type: 'quick' }; openForm('quick', { projectId: 'inbox', assignees: [el.dataset.uid] }); }
  if (a === 'mine-today') { const snap = snapshot(), td = todayStr(); const ts = myOpen().filter(t => t.due && t.due < td); ts.forEach(t => { t.due = td; }); commit(); toast(`Przełożono ${ts.length} na dziś`, snap); }
});

// ---------- Start ----------
function renderHome() {
  const td = todayStr(), now = new Date(), hr = now.getHours();
  const name = (state.settings.userName || '').split(/\s+/)[0];
  const greet = hr < 5 ? 'Dobrej nocy' : hr < 12 ? 'Dzień dobry' : hr < 18 ? 'Miłego popołudnia' : 'Dobry wieczór';
  const tod = hr < 5 ? 'night' : hr < 12 ? 'morning' : hr < 18 ? 'day' : 'evening';
  ui.bar = { title: 'Start', icon: '', crumb: '', right: '' };
  const all = openAll(), mine = myOpen();
  const mProg = mine.filter(t => stOf(t) === 1).sort(byDue), mOver = mine.filter(t => t.due && t.due < td && stOf(t) !== 1).sort(byDue);
  const mToday = mine.filter(t => t.due === td && stOf(t) !== 1).sort(byDue);
  const evToday = [...all.filter(t => t.kind === 'event' && (t.due === td || (t.endDue && t.due <= td && td <= t.endDue))).map(t => ({ t, time: t.time || '', end: t.endTime || '', title: t.title, color: 'var(--p' + t.priority + ')' })),
    ...gcalEventsOn(td, 'gcalToday').map(e => ({ e, time: e.time, end: e.endTime, title: e.title, color: e.color }))].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const teamOver = all.filter(t => t.due && t.due < td).length, unassigned = all.filter(t => !t.assignees.length).length;
  const doneToday = state.tasks.filter(t => t.completed && t.completedAt && fmtDate(new Date(t.completedAt)) === td).length;
  const myDoneToday = state.tasks.filter(t => t.completed && t.completedBy === me() && t.completedAt && fmtDate(new Date(t.completedAt)) === td).length;
  const dateStr = `${cap(PL_DAYS[now.getDay()])}, ${now.getDate()} ${['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'][now.getMonth()]}`;
  const parts = [mToday.length + mOver.length ? `Masz dziś <b>${mToday.length + mOver.length}</b> ${plural(mToday.length + mOver.length, 'zadanie', 'zadania', 'zadań')}` : 'Na dziś nie masz już nic przypisanego'];
  if (mProg.length) parts.push(`<b class="hm-yellow">${mProg.length}</b> w trakcie`);
  if (evToday.length) parts.push(`${evToday.length} ${plural(evToday.length, 'wydarzenie', 'wydarzenia', 'wydarzeń')} w kalendarzu`);
  const myTot = myDoneToday + mToday.length + mOver.length + mProg.length, pct = myTot ? Math.round(myDoneToday / myTot * 100) : 100, CR = 2 * Math.PI * 38;
  const hidden = state.settings.hiddenCards || [], cards = {};
  const card = (key, cls, title, body, extra = '') => { if (!hidden.includes(key)) cards[key] = (i, edit) => `<section class="hm-card ${cls}" data-card="${key}" style="--i:${i}" ${edit ? 'draggable="true"' : ''}><div class="hm-card-h">${edit ? `<span class="hm-grip" title="Przeciągnij">${I.grip}</span>` : ''}<h2>${title}</h2>${edit ? `<span class="hm-mv"><button class="icon-btn" data-act="card-mv" data-k="${key}" data-d="-1" title="Wyżej">${I.up}</button><button class="icon-btn" data-act="card-mv" data-k="${key}" data-d="1" title="Niżej">${I.down}</button></span>` : extra}</div>${body}</section>`; };
  const mini = t => { const di = dueLabel(t), p = proj(t.projectId); return `<div class="task-wrap"><div class="task hm-row st-${stOf(t)}" data-id="${t.id}">${stSlider(t)}
      <div class="grow hm-row-main" data-act="open" data-id="${t.id}"><span class="hm-row-t">${fmtText(t.title)}</span><span class="hm-row-m">${di ? `<span class="due-txt ${di.cls}">${di.label}</span> · ` : ''}${esc(projName(p))}</span></div>
      ${t.assignees.filter(a => a !== me()).length ? avatars(t.assignees.filter(a => a !== me()), 18, 2) : ''}</div></div>`; };
  let html = `<div class="home ${tod} ${ui.homeEdit ? 'editing' : ''}">
  <section class="hm-hero"><div class="hm-hero-grid">
      <div class="hm-greet"><h1>${greet}${name ? `, <span>${esc(name)}</span>` : ''}</h1>
        <p class="hm-date">${dateStr} · <span id="home-clock">${nowHM()}</span>${team.ws ? ` · <b>${esc(team.ws.name)}</b>` : ''}</p>
        <p class="hm-sum">${parts.join(', ')}.</p>
        <div class="hm-chips">
          <button class="hm-chip yellow" data-act="nav" data-view="mine"><b class="cnt-up" data-to="${mProg.length}">${mProg.length}</b><span>w trakcie</span></button>
          <button class="hm-chip green" data-act="nav" data-view="mine"><b class="cnt-up" data-to="${mToday.length}">${mToday.length}</b><span>moje na dziś</span></button>
          <button class="hm-chip red" data-act="nav" data-view="mine"><b class="cnt-up" data-to="${mOver.length}">${mOver.length}</b><span>po terminie</span></button>
          <button class="hm-chip blue" data-act="nav" data-view="team"><b class="cnt-up" data-to="${unassigned}">${unassigned}</b><span>nieprzypisane</span></button>
          <button class="hm-chip purple" data-act="nav" data-view="team"><b class="cnt-up" data-to="${doneToday}">${doneToday}</b><span>zespół ukończył dziś</span></button>
        </div></div>
      <button class="hm-day-ring" data-act="nav" data-view="mine" title="Twój postęp dnia">
        <svg viewBox="0 0 92 92" aria-hidden="true"><circle cx="46" cy="46" r="38" fill="none" stroke="var(--line-2)" stroke-width="8"/>
          <circle class="hm-ring" cx="46" cy="46" r="38" fill="none" stroke="url(#hmg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(CR * pct / 100).toFixed(1)} ${CR.toFixed(1)}" transform="rotate(-90 46 46)"/>
          <defs><linearGradient id="hmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--due-today)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs></svg>
        <span class="hm-dr-v"><b>${pct}%</b><span>Twojego dnia</span></span>
        <span class="hm-dr-l">${myDoneToday} ukończone dziś</span></button>
    </div>
    <div class="hm-qa-row"><label class="hm-qa">${I.plus}<input class="home-add" placeholder="Dodaj zadanie… np. „Oferta dla klienta jutro 15:00 +Ania p1”" autocomplete="off" spellcheck="false" aria-label="Dodaj zadanie"><kbd>Enter</kbd></label>
      <button class="hm-mic" data-act="voice" title="Podyktuj zadanie (V)" aria-label="Podyktuj zadanie">${sz(I.mic, 20)}</button></div>
    <div class="hm-qa-prev"></div>
  </section>`;
  if (!team.ws && auth.ready) html += `<section class="hm-card hm-warn" style="--i:0"><div class="hm-card-h"><h2>${sz(I.team, 16)} Nie jesteś jeszcze w zespole</h2></div><p class="muted">Utwórz zespół albo dołącz kodem zaproszenia, by widzieć wspólne zadania.</p><button class="btn primary" data-act="ob-open">Utwórz lub dołącz</button></section>`;
  if (team.ws && pushState() === 'off') html += `<section class="hm-card hm-push" style="--i:0"><div class="hm-card-h"><h2>${sz(I.bell, 16)} Włącz powiadomienia</h2></div><p class="muted">Dowiesz się od razu, gdy ktoś przypisze Ci zadanie lub zbliża się termin – także przy zamkniętej aplikacji.</p><button class="btn primary" data-act="push-on">Włącz powiadomienia push</button></section>`;
  html += '<div class="hm-masonry">';
  card('prog', 'hm-today', `🟡 Moje w trakcie <span class="hm-cnt">${mProg.length}</span>`, `<div class="hm-list">${mProg.slice(0, 6).map(mini).join('') || `<div class="hm-empty sm">${sz(I.done, 22)}<span>Nic nie jest w trakcie. Przesuń suwak zadania na środek, gdy zaczynasz.</span></div>`}</div>`, `<button class="icon-btn" data-act="nav" data-view="mine" title="Moje zadania">${I.right}</button>`);
  const list = [...mOver, ...mToday];
  card('today', 'hm-today', `${sz(todayIcon(), 16)} Moje na dziś <span class="hm-cnt">${list.length}</span>`, `${mOver.length ? `<button class="hm-od" data-act="mine-today">${sz(I.calBig, 15)} ${mOver.length} po terminie – przełóż na dziś</button>` : ''}
    <div class="hm-list">${list.slice(0, 7).map(mini).join('') || `<div class="hm-empty sm">${sz(I.done, 22)}<span>Dzień czysty – brawo!</span></div>`}${list.length > 7 ? `<button class="hm-more" data-act="nav" data-view="mine">Pokaż wszystkie (${list.length}) ${sz(I.right, 14)}</button>` : ''}</div>`,
    `<button class="icon-btn" data-act="nav" data-view="mine" title="Moje zadania">${I.right}</button>`);
  card('events', 'hm-events', `${sz(I.calMonth, 16)} Dziś w kalendarzu <span class="hm-cnt">${evToday.length}</span>`, evToday.length ? evToday.map(x => `<button class="hm-ev" style="--c:${x.color || 'var(--qi-b)'}" ${x.t ? `data-act="open" data-id="${x.t.id}"` : `data-act="home-day" data-date="${td}"`}><span class="hm-ev-t">${x.time ? x.time + (x.end ? '–' + x.end : '') : 'cały dzień'}</span><span class="grow">${esc(x.title)}</span>${x.e ? `<span class="muted small">${esc(x.e.cal)}</span>` : x.t.assignees.length ? avatars(x.t.assignees, 16, 2) : ''}</button>`).join('') : `<div class="hm-empty sm">${sz(I.calMonth, 22)}<span>Brak wydarzeń dziś.</span></div>`,
    `<button class="icon-btn" data-act="nav" data-view="calendar" title="Kalendarz">${I.right}</button>`);
  const days7 = [...Array(7)].map((_, i) => addDays(td, i)), cnt = days7.map(d => mine.filter(t => t.due === d)), maxC = Math.max(1, ...cnt.map(a => a.length));
  card('week', 'hm-week', `${sz(I.upcoming, 16)} Mój tydzień`, `<div class="hm-days">${days7.map((d, i) => `<button class="hm-day ${i === 0 ? 'today' : ''} ${dow(d) === 0 || dow(d) === 6 ? 'we' : ''}" data-act="home-day" data-date="${d}" title="${shortDate(d)}: ${cnt[i].length}" style="--d:${i}">
      <span class="hm-day-n">${cnt[i].length || ''}</span><span class="hm-day-bar"><i style="--h:${(cnt[i].length / maxC * 100).toFixed(0)}%">${cnt[i].slice(0, 4).map(t => `<em style="--c:var(--p${t.priority})"></em>`).join('')}</i></span>
      <span class="hm-day-l">${i === 0 ? 'Dziś' : PL_DAYS_SHORT[dow(d)]}</span><span class="hm-day-d">${parseDate(d).getDate()}</span></button>`).join('')}</div>
    <div class="hm-sub">Najbliższe terminy</div>
    ${mine.filter(t => t.due && t.due > td).sort(byDue).slice(0, 4).map(t => { const n = diffDays(t.due, td), di = dueInfo(t.due, t.time); return `<button class="hm-dl" data-act="open" data-id="${t.id}"><span class="hm-dl-n ${di.cls}">${n === 1 ? 'jutro' : 'za ' + n + ' dni'}</span><span class="grow">${esc(t.title)}</span><span class="muted small">${shortDate(t.due)}</span></button>`; }).join('') || '<div class="muted small" style="padding:6px 2px">Brak zaplanowanych terminów.</div>'}`,
    `<button class="icon-btn" data-act="nav" data-view="upcoming" title="Nadchodzące">${I.right}</button>`);
  card('team', 'hm-team', `${sz(I.team, 16)} Zespół`, team.members.length ? `<div class="hm-tm">${team.members.map(m => { const ts = all.filter(t => t.assignees.includes(m.user_id)), p = ts.filter(t => stOf(t) === 1).length, od = ts.filter(t => t.due && t.due < td).length; return `<button class="hm-tm-r" data-act="person" data-uid="${m.user_id}">${avatar(m.user_id, 26)}<span class="grow"><b>${esc(memberName(m.user_id))}</b><span class="hm-tm-bar"><i style="--w:${Math.min(100, ts.length * 8)}%"></i></span></span><span class="hm-tm-n">${ts.length}${p ? ` · <em class="y">${p}</em>` : ''}${od ? ` · <em class="r">${od}</em>` : ''}</span></button>`; }).join('')}</div>
    ${teamOver ? `<div class="muted small" style="margin-top:6px">Zespół: <b style="color:var(--due-overdue)">${teamOver}</b> po terminie · ${unassigned} nieprzypisanych</div>` : ''}` : '<div class="muted small">Zaproś osoby w Ustawieniach → Zespół.</div>',
    `<button class="icon-btn" data-act="nav" data-view="team" title="Zespół">${I.right}</button>`);
  const recent = state.tasks.filter(t => t.completed && t.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
  card('done', 'hm-done', `${sz(I.done, 16)} Ostatnio ukończone w zespole`, recent.map(t => `<div class="task-wrap"><div class="task hm-row done-row" data-id="${t.id}">
      <span class="check checked p${t.priority}" style="pointer-events:none">${I.check}</span>
      <div class="grow hm-row-main" data-act="open" data-id="${t.id}"><span class="hm-row-t">${esc(t.title)}</span><span class="hm-row-m">${t.completedBy ? esc(firstName(t.completedBy)) + ' · ' : ''}${fmtDateTime(t.completedAt)}</span></div>
      ${t.completedBy ? avatar(t.completedBy, 18) : ''}</div></div>`).join('') || '<div class="muted small">Jeszcze nic nie ukończono.</div>',
    `<button class="icon-btn" data-act="nav" data-view="completed" title="Ukończone">${I.right}</button>`);
  card('proj', 'hm-proj', `<span class="hash">#</span> Projekty`, [proj('inbox'), ...userProjects()].map(p => {
    const open = all.filter(t => t.projectId === p.id).length, done = state.tasks.filter(t => t.projectId === p.id && t.completed).length;
    const od = all.filter(t => t.projectId === p.id && t.due && t.due < td).length, pc = open + done ? Math.round(done / (open + done) * 100) : 0;
    const col = p.color && p.color !== '#808080' ? p.color : 'var(--muted)';
    return `<button class="hm-p" data-act="nav" data-view="${p.isInbox ? 'inbox' : 'project'}" ${p.isInbox ? '' : `data-id="${p.id}"`}>
      <span class="hm-p-h"><span class="hash" style="color:${col}">#</span><span class="grow">${esc(projName(p))}</span>${od ? `<span class="hm-p-od">${od} po terminie</span>` : ''}<span class="muted small">${open} otw.</span></span>
      <span class="hm-p-bar"><i style="--w:${pc}%;--c:${col}"></i></span><span class="hm-p-pc muted small">${pc}% ukończone</span></button>`;
  }).join(''));
  const edit = !!ui.homeEdit;
  html += cardOrder(Object.keys(cards)).map((k, i) => cards[k](i + 1, edit)).join('');
  html += `</div><div class="hm-foot">${state.settings.tileEdit ? `<button data-act="home-edit" class="${edit ? 'on' : ''}">${sz(I.grip, 14)} ${edit ? 'Gotowe – zapisz układ' : 'Ułóż kafelki'}</button>` : ''}<button data-act="nav" data-view="prefs">${sz(I.gear, 14)} Dostosuj kafelki Startu</button><button data-act="nav" data-view="guide">${sz(I.book, 14)} Poradnik i skróty</button><button data-act="voice">${sz(I.mic, 14)} Dodaj głosem (V)</button></div></div>`;
  if (ui.stagger) setTimeout(countUp, 0);
  return html;
}
// szybkie dodawanie ze Startu: domyślnie dla mnie, na dziś
function homeAdd(text) {
  const r = parseQuick(text, {});
  if (!r.title) return;
  const labels = r.labels.map(n => { let l = state.labels.find(x => x.name.toLowerCase() === n.toLowerCase()); if (!l) { l = { id: uid(), name: n, color: '#808080' }; state.labels.push(l); } return l.id; });
  const t = newTask({ title: r.title, projectId: r.projectId || 'inbox', sectionId: r.sectionId || null, priority: r.priority || 4, due: r.due || todayStr(), time: r.time || null, endTime: r.endTime || null, recurring: r.recurring || null, labels, order: nextOrder(), assignees: r.assignees.length ? r.assignees : [me()] });
  state.tasks.push(t); markEnter(t.id);
  ui.focusSel = '.home-add';
  commit();
  toast(`Dodano: ${dueLabel(t).label} · ${t.assignees.map(firstName).join(', ')}`, null, () => openTask(t.id), 'Otwórz');
}

// ---------- Raportowanie zespołu ----------
function renderReports() {
  const td = todayStr(), all = openAll(), done = state.tasks.filter(t => t.completed && t.completedAt);
  const days = [...Array(14)].map((_, i) => addDays(td, i - 13));
  const per = days.map(d => done.filter(t => fmtDate(new Date(t.completedAt)) === d).length), max = Math.max(1, ...per);
  const wk = done.filter(t => t.completedAt > Date.now() - 7 * 864e5);
  const ontime = wk.filter(t => !t.due || fmtDate(new Date(t.completedAt)) <= t.due).length;
  let html = header('Raportowanie', { icon: sz(I.pulse, 24), sub: team.ws ? esc(team.ws.name) + ' · statystyki całego zespołu' : '' });
  html += `<div class="rep-cards">
    <div class="rep-card"><div class="v">${done.filter(t => fmtDate(new Date(t.completedAt)) === td).length}</div><div class="l">Ukończone dziś</div></div>
    <div class="rep-card"><div class="v">${wk.length}</div><div class="l">Ukończone w 7 dni</div></div>
    <div class="rep-card"><div class="v">${wk.length ? Math.round(ontime / wk.length * 100) : 100}%</div><div class="l">W terminie (7 dni)</div></div>
    <div class="rep-card"><div class="v" style="color:var(--st1)">${all.filter(t => stOf(t) === 1).length}</div><div class="l">W trakcie</div></div>
    <div class="rep-card"><div class="v">${all.length}</div><div class="l">Otwarte</div></div>
    <div class="rep-card"><div class="v" style="color:var(--due-overdue)">${all.filter(t => t.due && t.due < td).length}</div><div class="l">Po terminie</div></div>
  </div>
  <div class="rep-box"><h3>Ukończone przez zespół – ostatnie 14 dni</h3>
    <div class="bars">${per.map(c => `<div class="bar-col"><span class="bar-v">${c || ''}</span><div class="bar" style="height:${c / max * 78}%"></div></div>`).join('')}</div>
    <div class="bar-l">${days.map(d => `<span>${parseDate(d).getDate()}</span>`).join('')}</div></div>
  <div class="rep-box" style="margin-top:16px"><h3>Osoby</h3><table class="rep-tbl"><tr><th></th><th>Otwarte</th><th>W trakcie</th><th>Po terminie</th><th>Ukończone 7 dni</th><th>Ukończone 30 dni</th></tr>
    ${team.members.map(m => { const u = m.user_id, ts = all.filter(t => t.assignees.includes(u)); return `<tr data-act="person" data-uid="${u}"><td>${avatar(u, 22)} ${esc(memberName(u))}</td><td>${ts.length}</td><td>${ts.filter(t => stOf(t) === 1).length || ''}</td><td class="r">${ts.filter(t => t.due && t.due < td).length || ''}</td><td>${wk.filter(t => t.completedBy === u).length || ''}</td><td>${done.filter(t => t.completedBy === u && t.completedAt > Date.now() - 30 * 864e5).length || ''}</td></tr>`; }).join('')}
    <tr><td><span class="av none" style="--s:22px">?</span> Nieprzypisane</td><td>${all.filter(t => !t.assignees.length).length}</td><td></td><td class="r">${all.filter(t => !t.assignees.length && t.due && t.due < td).length || ''}</td><td></td><td></td></tr></table></div>`;
  html += reportsExtra();
  return html;
}

// ---------- powiadomienia w aplikacji ----------
const NOTIF_ICON = { assigned: '👤', status: '🔄', reminder: '⏰', comment: '💬', done: '✅' };
async function loadNotifs() {
  const { data } = await auth.sb.from('ws_notifications').select('*').eq('user_id', me()).order('created_at', { ascending: false }).limit(60);
  team.notifs = data || [];
  renderNotifBadge();
}
function onNotif(n) {
  if (team.notifs.some(x => x.id === n.id)) return;
  team.notifs.unshift(n);
  renderNotifBadge();
  if (!document.hidden) toast(`${NOTIF_ICON[n.kind] || '🔔'} ${n.title}${n.body ? ' – ' + n.body : ''}`, null, n.task_id ? () => openTask(n.task_id) : null, n.task_id ? 'Otwórz' : undefined);
}
function renderNotifBadge() {
  const n = team.notifs.filter(x => !x.read).length;
  $$('[data-act="notifications"]').forEach(b => { b.dataset.n = n ? (n > 99 ? '99+' : n) : ''; b.classList.toggle('has-n', !!n); });
  try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) { /* */ }
}
async function markRead(list) {
  const ids = list.filter(n => !n.read).map(n => n.id);
  if (!ids.length) return;
  list.forEach(n => { n.read = true; });
  renderNotifBadge();
  try { await auth.sb.from('ws_notifications').update({ read: true }).in('id', ids); } catch (e) { /* */ }
}
function notifications(anchor) {
  const td = todayStr();
  const mineDue = myOpen().filter(t => t.due && t.due <= td).sort(byDue);
  openPopover(anchor, (pop, close) => {
    const ns = team.notifs.slice(0, 40);
    pop.innerHTML = `<div class="menu nf-menu" style="width:360px"><div class="menu-label nf-h">Powiadomienia ${ns.some(n => !n.read) ? '<button class="link-btn" data-nf="all">Oznacz jako przeczytane</button>' : ''}</div>
      ${ns.length ? ns.map(n => `<button class="menu-item nf ${n.read ? '' : 'unread'}" data-nid="${n.id}" data-tid="${esc(n.task_id || '')}"><span class="nf-ic">${n.actor_id ? avatar(n.actor_id, 26) : NOTIF_ICON[n.kind] || '🔔'}</span><span class="grow"><b>${esc(n.title || '')}</b><br><span class="small muted">${esc(n.body || '')} · ${fmtDateTime(Date.parse(n.created_at))}</span></span></button>`).join('') : '<div class="menu-empty">Brak powiadomień</div>'}
      <div class="menu-sep"></div><div class="menu-label">Moje na dziś i zaległe (${mineDue.length})</div>
      ${mineDue.slice(0, 8).map(t => { const di = dueLabel(t); return `<button class="menu-item" data-tid="${t.id}"><span class="st-dot s${stOf(t)}"></span><span class="grow">${esc(t.title)}<br><span class="meta-item due ${di.cls}" style="font-size:12px">${I.cal} ${di.label}</span></span></button>`; }).join('') || '<div class="menu-empty">Nic na dziś 🎉</div>'}
      ${pushState() !== 'on' ? `<div class="menu-sep"></div><button class="menu-item" data-nf="push">${sz(I.bell, 16)}<span class="grow">Włącz powiadomienia push</span></button>` : ''}</div>`;
    pop.onclick = e => {
      const all = e.target.closest('[data-nf="all"]'), push = e.target.closest('[data-nf="push"]'), b = e.target.closest('[data-tid]');
      if (all) { markRead(team.notifs); close(); return; }
      if (push) { close(); pushEnable(); return; }
      if (!b) return;
      const n = team.notifs.find(x => String(x.id) === b.dataset.nid);
      if (n) markRead([n]);
      close();
      if (b.dataset.tid && task(b.dataset.tid)) openTask(b.dataset.tid);
    };
  });
}

// ---------- dolny pasek na telefonie ----------
function renderTabbar() {
  let tb = $('#tabbar');
  if (!tb) { tb = document.createElement('nav'); tb.id = 'tabbar'; tb.setAttribute('aria-label', 'Nawigacja'); document.body.appendChild(tb); }
  const td = todayStr(), n = myOpen().filter(t => t.due && t.due <= td).length, v = ui.view.type;
  const items = [['home', I.home, 'Start'], ['mine', I.person, 'Moje'], ['calendar', I.calMonth, 'Kalendarz'], ['team', I.team, 'Zespół']];
  tb.innerHTML = items.map(([k, ic, l]) => `<button class="${v === k && !ui.sidebar ? 'on' : ''}" data-act="nav" data-view="${k}" aria-label="${l}"><span class="tb-ic">${ic}${k === 'mine' && n ? `<b>${n > 99 ? '99+' : n}</b>` : ''}</span><span class="tb-l">${l}</span></button>`).join('')
    + `<button class="${ui.sidebar && isNarrow() ? 'on' : ''}" data-act="tb-more" aria-label="Menu"><span class="tb-ic">${I.menu}</span><span class="tb-l">Menu</span></button>`;
}

// ================================================================
//  Kalendarze Google (link iCal) – zespołowe (widzi każdy) i osobiste (tylko Ty)
// ================================================================
const calVisible = id => !(state.settings.calHidden || []).includes(id);
function toggleCalSource(id) {
  const h = new Set(state.settings.calHidden || []);
  h.has(id) ? h.delete(id) : h.add(id);
  state.settings.calHidden = [...h];
  ui.quiet = true; commit();
}
async function loadCalendars(force) {
  if (!auth.sb || !team.ws) return;
  const { data, error } = await auth.sb.from('ws_calendars').select('id, scope, name, color, owner_id, created_at').eq('workspace_id', team.ws.id).order('created_at');
  if (error) return;
  team.cals = data || [];
  Object.keys(team.ev).forEach(k => { if (!team.cals.some(c => c.id === k)) delete team.ev[k]; });
  await Promise.all(team.cals.map(c => fetchCal(c, force)));
  lsSet('lt-ics', team.ev);
  ui.quiet = true; render();
}
async function fetchCal(c, force) {
  const old = team.ev[c.id];
  if (!force && old && Date.now() - old.at < 15 * 60e3) return;
  try {
    const { data, error } = await auth.sb.functions.invoke('ical', { body: { id: c.id } });
    if (error) { let m = ''; try { m = await error.context?.text?.(); } catch (er) { /* */ } throw new Error(m || error.message); }
    const text = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : String(data || '');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('To nie jest kalendarz iCal');
    team.ev[c.id] = { at: Date.now(), events: parseICS(text), err: null };
  } catch (e) {
    team.ev[c.id] = Object.assign(old || { events: [] }, { at: Date.now(), err: String(e?.message || e) });
  }
}
setInterval(() => { if (team.ws && !document.hidden) loadCalendars(); }, 15 * 60e3);
// ---------- parser iCal (z powtarzaniem RRULE, wyjątkami EXDATE i zmienionymi wystąpieniami) ----------
function tzOffset(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}
function wallToMs(y, mo, d, h, mi, tz) {
  if (!tz) return new Date(y, mo, d, h, mi).getTime();
  try { let g = Date.UTC(y, mo, d, h, mi); g -= tzOffset(g, tz); return Date.UTC(y, mo, d, h, mi) - tzOffset(g, tz); } catch (e) { return new Date(y, mo, d, h, mi).getTime(); }
}
function icsDate(v, params) {
  const m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  if (!m[4] || /VALUE=DATE(?!-)/i.test(params || '') && !m[4]) return { allDay: true, y, mo, d };
  const tz = m[7] ? 'UTC' : ((params || '').match(/TZID=("?)([^;:"]+)\1/i) || [])[2] || null;
  return { allDay: false, y, mo, d, h: +m[4], mi: +m[5], tz };
}
const icsMs = x => x.allDay ? new Date(x.y, x.mo, x.d).getTime() : wallToMs(x.y, x.mo, x.d, x.h, x.mi, x.tz);
function icsUnescape(s) { return String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function parseICS(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const evs = []; let cur = null, depth = 0;
  for (const ln of lines) {
    if (/^BEGIN:VEVENT/i.test(ln)) { cur = { props: {}, exdate: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (/^BEGIN:/i.test(ln)) { depth++; continue; }
    if (/^END:VEVENT/i.test(ln)) { evs.push(cur); cur = null; continue; }
    if (/^END:/i.test(ln)) { depth--; continue; }
    if (depth > 0) continue; // VALARM itp.
    const i = ln.indexOf(':'); if (i < 0) continue;
    const head = ln.slice(0, i), val = ln.slice(i + 1), [name, ...ps] = head.split(';');
    const key = name.toUpperCase(), params = ps.join(';');
    if (key === 'EXDATE') val.split(',').forEach(v => { const x = icsDate(v, params); if (x) cur.exdate.push(x); });
    else cur.props[key] = { val, params };
  }
  const from = addDays(todayStr(), -62), to = addDays(todayStr(), 200);
  const fromMs = parseDate(from).getTime(), toMs = parseDate(to).getTime();
  const overrides = {}, out = [];
  evs.forEach(e => { const r = e.props['RECURRENCE-ID']; if (r) { const x = icsDate(r.val, r.params); if (x) (overrides[e.props.UID?.val] = overrides[e.props.UID?.val] || new Set()).add(icsMs(x)); } });
  const push = (e, sMs, eMs, allDay) => {
    if (eMs < fromMs || sMs > toMs) return;
    const s = new Date(sMs), en = new Date(eMs);
    const date = fmtDate(s);
    if (allDay) { const endD = fmtDate(en); out.push({ id: (e.props.UID?.val || '') + '@' + sMs, title: icsUnescape(e.props.SUMMARY?.val) || '(bez tytułu)', date, end: diffDays(endD, date) > 1 ? endD : null, time: '', endTime: '', allDay: true, location: icsUnescape(e.props.LOCATION?.val || ''), link: e.props.URL?.val || '' }); return; }
    const sameDay = fmtDate(en) === date || (en.getHours() === 0 && en.getMinutes() === 0 && diffDays(fmtDate(en), date) === 1);
    out.push({ id: (e.props.UID?.val || '') + '@' + sMs, title: icsUnescape(e.props.SUMMARY?.val) || '(bez tytułu)', date, end: sameDay ? null : addDays(fmtDate(en), 1), time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
      endTime: sameDay ? (en.getHours() === 0 && en.getMinutes() === 0 ? '23:59' : `${pad(en.getHours())}:${pad(en.getMinutes())}`) : '23:59', allDay: false, location: icsUnescape(e.props.LOCATION?.val || ''), link: e.props.URL?.val || '' });
  };
  const WDI = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  for (const e of evs) {
    if (/CANCELLED/i.test(e.props.STATUS?.val || '')) continue;
    const ds = e.props.DTSTART && icsDate(e.props.DTSTART.val, e.props.DTSTART.params);
    if (!ds) continue;
    const de = e.props.DTEND && icsDate(e.props.DTEND.val, e.props.DTEND.params);
    const sMs0 = icsMs(ds);
    let dur = de ? icsMs(de) - sMs0 : ds.allDay ? 864e5 : 0;
    const du = e.props.DURATION?.val?.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
    if (!de && du) dur = ((+du[1] || 0) * 7 * 1440 + (+du[2] || 0) * 1440 + (+du[3] || 0) * 60 + (+du[4] || 0)) * 6e4;
    if (dur <= 0) dur = ds.allDay ? 864e5 : 30 * 6e4;
    const uidv = e.props.UID?.val;
    const rr = e.props.RRULE?.val;
    if (!rr || e.props['RECURRENCE-ID']) { push(e, sMs0, sMs0 + dur, ds.allDay); continue; }
    const R = Object.fromEntries(rr.split(';').map(kv => kv.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
    const iv = Math.max(1, +R.INTERVAL || 1), cnt = +R.COUNT || 0;
    const until = R.UNTIL ? icsMs(icsDate(R.UNTIL, '') || ds) : Infinity;
    const ex = new Set(e.exdate.map(icsMs)), ov = overrides[uidv] || new Set();
    const byday = (R.BYDAY || '').split(',').filter(Boolean).map(x => { const m = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i); return m ? { n: m[1] ? +m[1] : 0, wd: WDI[m[2].toUpperCase()] } : null; }).filter(Boolean);
    const bymd = (R.BYMONTHDAY || '').split(',').filter(Boolean).map(Number);
    const mk = (y, mo, d) => ds.allDay ? new Date(y, mo, d).getTime() : wallToMs(y, mo, d, ds.h, ds.mi, ds.tz);
    let n = 0, guard = 0;
    const emit = ms => {
      if (ms < sMs0) return true;
      if (ms > until || (cnt && n >= cnt) || ms > toMs) return false;
      n++;
      if (!ex.has(ms) && !ov.has(ms)) push(e, ms, ms + dur, ds.allDay);
      return true;
    };
    const F = (R.FREQ || '').toUpperCase();
    let y = ds.y, mo = ds.mo, d = ds.d, go = true;
    if (F === 'DAILY') { while (go && guard++ < 3000) { go = emit(mk(y, mo, d)); const nd = new Date(y, mo, d + iv); y = nd.getFullYear(); mo = nd.getMonth(); d = nd.getDate(); } }
    else if (F === 'WEEKLY') {
      const days = byday.length ? byday.map(b => b.wd) : [new Date(ds.y, ds.mo, ds.d).getDay()];
      const ord = w => (w + 6) % 7;
      days.sort((a, b) => ord(a) - ord(b));
      const s0 = new Date(ds.y, ds.mo, ds.d); let wk = new Date(s0); wk.setDate(wk.getDate() - ord(s0.getDay()));
      while (go && guard++ < 1500) {
        for (const w of days) { const dd = new Date(wk); dd.setDate(dd.getDate() + ord(w)); if (!(go = emit(mk(dd.getFullYear(), dd.getMonth(), dd.getDate())))) break; }
        wk.setDate(wk.getDate() + 7 * iv);
      }
    } else if (F === 'MONTHLY') {
      while (go && guard++ < 600) {
        const dim = new Date(y, mo + 1, 0).getDate();
        let ds2 = [];
        if (bymd.length) ds2 = bymd.map(x => x < 0 ? dim + x + 1 : x).filter(x => x >= 1 && x <= dim);
        else if (byday.length) byday.forEach(b => {
          const all = []; for (let k = 1; k <= dim; k++) if (new Date(y, mo, k).getDay() === b.wd) all.push(k);
          if (b.n > 0 && all[b.n - 1]) ds2.push(all[b.n - 1]); else if (b.n < 0 && all[all.length + b.n]) ds2.push(all[all.length + b.n]); else if (!b.n) ds2.push(...all);
        });
        else if (ds.d <= dim) ds2 = [ds.d];
        for (const k of ds2.sort((a, b) => a - b)) if (!(go = emit(mk(y, mo, k)))) break;
        mo += iv; if (mo > 11) { y += Math.floor(mo / 12); mo %= 12; }
      }
    } else if (F === 'YEARLY') { while (go && guard++ < 60) { if (new Date(y, ds.mo, ds.d).getMonth() === ds.mo) go = emit(mk(y, ds.mo, ds.d)); y += iv; } }
    else push(e, sMs0, sMs0 + dur, ds.allDay);
    if (out.length > 4000) break;
  }
  return out;
}
// wydarzenia z podłączonych kalendarzy w danym dniu (where: gdzie pokazujemy – ustawienia)
function gcalEventsOn(d, where) {
  if (where && state.settings[where] === false) return [];
  const res = [];
  team.cals.forEach(c => {
    if (!calVisible(c.id)) return;
    (team.ev[c.id]?.events || []).forEach(e => { if (e.date === d || (e.end && e.date < d && d < e.end)) res.push(Object.assign({ cal: c.name, calId: c.id, color: c.color || '#4f8ff7', scope: c.scope }, e)); });
  });
  return res.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

// ================================================================
//  Kalendarz: miesiąc, tydzień, dzień, zespół (kolumna na osobę), lista
// ================================================================
const CAL_MODES = [['month', 'Miesiąc'], ['week', 'Tydzień'], ['day', 'Dzień'], ['team', 'Zespół'], ['agenda', 'Lista']];
const HH = () => isNarrow() ? 44 : 52; // wysokość godziny w px
function itemColor(t) {
  const by = state.settings.calColorBy || 'person';
  if (by === 'prio') return t.priority < 4 ? `var(--p${t.priority})` : 'var(--accent)';
  if (by === 'project') { const p = proj(t.projectId); return p && p.color !== '#808080' ? p.color : 'var(--accent)'; }
  return t.assignees.length ? memberColor(t.assignees[0]) : '#8f9aa6';
}
// zadania Listo na dany dzień (z filtrem źródeł i osób)
function calTasks(d, uidCol) {
  const showDone = calVisible('done');
  return state.tasks.filter(t => t.due && (t.due === d || (t.endDue && t.due < d && d <= t.endDue))
    && (showDone || !t.completed) && whoOk(t) && calVisible(t.kind === 'event' ? 'events' : 'tasks')
    && (uidCol === undefined || (uidCol === '_none' ? !t.assignees.length : t.assignees.includes(uidCol)))).sort(byDue);
}
function calItems(d) { return { ts: calTasks(d).filter(t => !t.completed || calVisible('done')), ev: gcalEventsOn(d, 'gcalCal') }; }
// rozkład nachodzących na siebie bloków w kolumnie
function layoutBlocks(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  let group = [], gEnd = -1;
  const flush = () => { const lanes = []; group.forEach(it => { let l = lanes.findIndex(end => end <= it.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.e; it.lane = l; }); group.forEach(it => { it.lanes = lanes.length; }); group = []; };
  items.forEach(it => { if (it.s >= gEnd && group.length) flush(); group.push(it); gEnd = Math.max(gEnd, it.e); });
  if (group.length) flush();
  return items;
}
function tgBlocks(d, uidCol) {
  const items = [];
  calTasks(d, uidCol).forEach(t => {
    if (!t.time || (t.endDue && t.due !== d)) return;
    const s = hmMin(t.time), e = Math.max(s + 20, t.endTime ? hmMin(t.endTime) : s + (t.kind === 'event' ? 60 : 30));
    items.push({ t, s, e });
  });
  if (uidCol === undefined || uidCol === '_ev') gcalEventsOn(d, 'gcalCal').forEach(ev => { if (ev.allDay || ev.end) return; const s = hmMin(ev.time), e = Math.max(s + 20, hmMin(ev.endTime || addMin(ev.time, 30))); items.push({ ev, s, e }); });
  return layoutBlocks(items);
}
function tgAllDay(d, uidCol) {
  const ts = calTasks(d, uidCol).filter(t => !t.time || (t.endDue && t.endDue !== t.due));
  const ev = uidCol === undefined || uidCol === '_ev' ? gcalEventsOn(d, 'gcalCal').filter(e => e.allDay || e.end) : [];
  return [...ev.map(e => `<div class="cal2-chip ev" style="--c:${e.color}" title="${esc(e.cal + ': ' + e.title)}"><i></i><span>${esc(e.title)}</span></div>`),
    ...ts.map(t => `<div class="cal2-chip st-${stOf(t)} ${t.completed ? 'done' : ''}" draggable="true" data-act="open" data-id="${t.id}" style="--c:${itemColor(t)}" title="${esc(t.title)}"><i></i><span>${esc(t.title)}</span></div>`)].join('');
}
function tgBlockHtml(b, hh) {
  const top = b.s / 60 * hh, h = Math.max(18, (b.e - b.s) / 60 * hh - 2), w = 100 / b.lanes, left = b.lane * w;
  const short = h < 34;
  if (b.ev) {
    const e = b.ev;
    return `<a class="tg-ev ext ${short ? 'short' : ''}" style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);--c:${e.color}" ${e.link && /^https:\/\//.test(e.link) ? `href="${esc(e.link)}" target="_blank" rel="noopener"` : ''} title="${esc(`${e.time}–${e.endTime} ${e.title} (${e.cal})${e.location ? ' · ' + e.location : ''}`)}">
      <b>${esc(e.title)}</b><span>${e.time}–${e.endTime}${e.location ? ' · ' + esc(e.location) : ''}</span></a>`;
  }
  const t = b.t;
  return `<div class="tg-ev st-${stOf(t)} ${t.kind === 'event' ? 'is-event' : 'is-task'} ${t.completed ? 'done' : ''} ${short ? 'short' : ''}" data-tgid="${t.id}" style="top:${top}px;height:${h}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);--c:${itemColor(t)}" title="${esc(t.title)} · ${timeRange(t)}${t.assignees.length ? ' · ' + esc(t.assignees.map(memberName).join(', ')) : ''}">
    <b>${t.kind === 'task' ? `<span class="tg-st s${stOf(t)}"></span>` : ''}${esc(t.title)}</b><span>${timeRange(t)}${t.location ? ' · ' + esc(t.location) : ''}</span>
    ${t.assignees.length && !short ? `<span class="tg-avs">${avatars(t.assignees, 16, 3)}</span>` : ''}<i class="tg-rs" title="Zmień czas trwania"></i></div>`;
}
function timeGrid(cols) {
  const hh = HH(), td = todayStr(), now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = [...Array(24)].map((_, h) => `<div class="tg-hl" style="top:${h * hh}px"><span>${h ? pad(h) + ':00' : ''}</span></div>`).join('');
  return `<div class="tg" style="--hh:${hh}px;--n:${cols.length}">
    <div class="tg-head"><div class="tg-gut"></div>${cols.map(c => `<div class="tg-dh ${c.date === td && !c.uid ? 'today' : ''}" ${c.uid ? '' : `data-act="cal-goday" data-date="${c.date}"`}>${c.head}</div>`).join('')}</div>
    <div class="tg-allday"><div class="tg-gut">cały<br>dzień</div>${cols.map(c => `<div class="tg-ad" data-drop="day" data-date="${c.date}">${tgAllDay(c.date, c.uid)}</div>`).join('')}</div>
    <div class="tg-scroll"><div class="tg-body" style="height:${24 * hh}px">
      <div class="tg-hours">${hours}</div>
      ${cols.map(c => `<div class="tg-col ${c.date === td ? 'today' : ''} ${dow(c.date) === 0 || dow(c.date) === 6 ? 'we' : ''}" data-date="${c.date}" ${c.uid ? `data-uid="${c.uid}"` : ''}>
        ${tgBlocks(c.date, c.uid).map(b => tgBlockHtml(b, hh)).join('')}
        ${c.date === td ? `<div class="tg-now" style="top:${nowMin / 60 * hh}px"></div>` : ''}</div>`).join('')}
    </div></div></div>`;
}
function calTitle(mode, base) {
  if (mode === 'month') { const d = parseDate(base); return `${PL_MON[d.getMonth()]} ${d.getFullYear()}`; }
  if (mode === 'week') { const a = parseDate(base), b = parseDate(addDays(base, 6)); return `${a.getDate()} ${PL_MON_SHORT[a.getMonth()]} – ${b.getDate()} ${PL_MON_SHORT[b.getMonth()]} ${b.getFullYear()}`; }
  if (mode === 'agenda') return 'Najbliższe 30 dni';
  const d = parseDate(base), n = diffDays(base, todayStr());
  return `${cap(PL_DAYS[d.getDay()])}, ${d.getDate()} ${PL_MON_SHORT[d.getMonth()]}${n === 0 ? ' · Dziś' : n === 1 ? ' · Jutro' : n === -1 ? ' · Wczoraj' : ''}`;
}
function calBase(mode) {
  const td = todayStr(), sel = ui.calSel || td;
  if (mode === 'month') return ui.calMonth || sel.slice(0, 8) + '01';
  if (mode === 'week') return ui.calWeek || weekStart(sel);
  if (mode === 'agenda') return td;
  return ui.calDay || sel;
}
function renderCalendar() {
  const td = todayStr(), mode = CAL_MODES.some(m => m[0] === ui.calMode) ? ui.calMode : (isNarrow() ? 'day' : 'week');
  ui.calMode = mode;
  const base = calBase(mode), sel = ui.calSel || td;
  const nCal = team.cals.length, errs = team.cals.filter(c => team.ev[c.id]?.err);
  let html = header(`<span class="cal2-title">${calTitle(mode, base)}</span>`, { icon: sz(I.calMonth, 24), iconCls: 'tile', barTitle: 'Kalendarz',
    sub: `<span class="cal-legend">${nCal ? `${nCal} ${plural(nCal, 'kalendarz Google', 'kalendarze Google', 'kalendarzy Google')}` : '<button class="link-btn" data-act="pref-open" data-t="calendars">+ Podłącz Kalendarz Google</button>'}${errs.length ? ` · <span style="color:var(--due-overdue)" title="${esc(errs.map(c => c.name + ': ' + team.ev[c.id].err).join('\n'))}">${errs.length} z błędem</span>` : ''}</span>`,
    right: `<div class="seg-inline cal-modes">${CAL_MODES.map(([v, l]) => `<button class="${mode === v ? 'sel' : ''}" data-act="cal-mode" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="cal2-nav">${mode === 'agenda' ? '' : `<button class="icon-btn" data-act="cal-step" data-n="-1" title="Wstecz">${I.left}</button>`}<button class="btn" data-act="cal-step" data-n="0">Dziś</button>${mode === 'agenda' ? '' : `<button class="icon-btn" data-act="cal-step" data-n="1" title="Dalej">${I.right}</button>`}</div>
      <button class="btn cal-src" data-act="cal-src">${sz(I.eye, 15)} Kalendarze</button>` });
  if (mode === 'month') {
    const first = parseDate(base), y = first.getFullYear(), m = first.getMonth();
    const start = weekStart(base), end = addDays(weekStart(fmtDate(new Date(y, m + 1, 0))), 6);
    let cells = '', i = 0, maxN = 1;
    for (let d = start; d <= end; d = addDays(d, 1)) maxN = Math.max(maxN, calTasks(d).length);
    const chip = t => `<div class="cal2-chip st-${stOf(t)} ${t.completed ? 'done' : ''} ${t.kind === 'event' ? 'is-event' : ''}" draggable="true" data-act="open" data-id="${t.id}" style="--c:${itemColor(t)}" title="${esc(t.title)}"><i></i><span>${t.time ? `<b>${t.time}</b> ` : ''}${esc(t.title)}</span></div>`;
    const evChip = e => `<div class="cal2-chip ev" style="--c:${e.color}" title="${esc(e.cal + ': ' + e.title)}"><i></i><span>${e.time ? `<b>${e.time}</b> ` : ''}${esc(e.title)}</span></div>`;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const ts = calTasks(d), ev = gcalEventsOn(d, 'gcalCal'), w = dow(d);
      const items = [...ev.map(e => ({ k: e.time || '', h: evChip(e) })), ...ts.map(t => ({ k: t.time || '', h: chip(t) }))].sort((a, b) => a.k.localeCompare(b.k)).map(x => x.h);
      if (w === 1 && state.settings.calWeekNums) cells += `<div class="cal2-wn">${isoWeek(d)}</div>`;
      cells += `<div class="cal2-cell ${parseDate(d).getMonth() === m ? '' : 'other'} ${d === td ? 'today' : ''} ${d === sel ? 'sel' : ''} ${w === 0 || w === 6 ? 'we' : ''} ${d < td ? 'past' : ''}" data-act="cal-day" data-date="${d}" data-drop="day" style="--i:${Math.min(i++, 41)};--load:${(ts.length / maxN).toFixed(2)}">
        <div class="cal2-top"><span class="cal2-num">${parseDate(d).getDate()}</span>${items.length ? `<span class="cal2-n">${items.length}</span>` : ''}</div>
        <div class="cal2-items">${items.slice(0, 4).join('')}${items.length > 4 ? `<span class="cal2-more">+${items.length - 4}</span>` : ''}</div>
        <div class="cal2-dots">${[...ev.map(e => `<i style="--c:${e.color}"></i>`), ...ts.map(t => `<i style="--c:${itemColor(t)}"></i>`)].slice(0, 5).join('')}</div></div>`;
    }
    const grid = `<div class="cal2-wd ${state.settings.calWeekNums ? 'wn' : ''}">${state.settings.calWeekNums ? '<span></span>' : ''}${['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal2-month ${state.settings.calWeekNums ? 'wn' : ''}">${cells}</div>`;
    html += `<div class="cal2 month"><div class="cal2-main">${grid}</div>${dayAgenda(sel)}</div>`;
    return html;
  }
  if (mode === 'agenda') {
    let body = '';
    for (let i = 0; i < 30; i++) {
      const d = addDays(td, i), ts = calTasks(d), ev = gcalEventsOn(d, 'gcalCal');
      if (!ts.length && !ev.length) continue;
      const rows = [...ev.map(e => ({ k: e.time || '00:00', h: `<a class="ag-row ext" style="--c:${e.color}" ${e.link && /^https:\/\//.test(e.link) ? `href="${esc(e.link)}" target="_blank" rel="noopener"` : ''}><span class="ag-t">${e.time ? e.time + '–' + e.endTime : 'cały dzień'}</span><span class="ag-bar"></span><span class="grow"><b>${esc(e.title)}</b>${e.location ? `<span class="muted small"> · ${esc(e.location)}</span>` : ''}</span><span class="ag-cal">${esc(e.cal)}</span></a>` })),
        ...ts.map(t => ({ k: t.time || '00:00', h: `<div class="ag-row st-${stOf(t)}" style="--c:${itemColor(t)}"><span class="ag-t">${t.time ? timeRange(t) : 'cały dzień'}</span><span class="ag-bar"></span>${t.kind === 'task' ? stSlider(t) : ''}<span class="grow" data-act="open" data-id="${t.id}"><b>${esc(t.title)}</b>${t.location ? `<span class="muted small"> · ${esc(t.location)}</span>` : ''}</span>${t.assignees.length ? avatars(t.assignees, 20) : ''}</div>` }))].sort((a, b) => a.k.localeCompare(b.k));
      const n = diffDays(d, td);
      body += `<div class="group ag-day" data-drop="day" data-date="${d}"><div class="group-head"><h3>${parseDate(d).getDate()} ${PL_MON_SHORT[parseDate(d).getMonth()]} · ${n === 0 ? 'Dziś' : n === 1 ? 'Jutro' : cap(PL_DAYS[dow(d)])}</h3><span class="count">${rows.length}</span></div>${rows.map(r => r.h).join('')}</div>`;
    }
    html += body || emptyState('Pusto w kalendarzu', 'W ciągu 30 dni nie ma zaplanowanych zadań ani wydarzeń.');
    return html;
  }
  let cols;
  if (mode === 'week') cols = [...Array(7)].map((_, i) => { const d = addDays(base, i); return { date: d, head: `<span>${PL_DAYS_SHORT[dow(d)]}</span><b>${parseDate(d).getDate()}</b>` }; });
  else if (mode === 'day') cols = [{ date: base, head: `<span>${cap(PL_DAYS[dow(base)])}</span><b>${parseDate(base).getDate()}</b>` }];
  else {
    const who = state.settings.who || 'all';
    const us = team.members.map(m => m.user_id).filter(u => who === 'all' || who === 'none' ? true : who === 'me' ? u === me() : u === who);
    cols = [...us.map(u => ({ date: base, uid: u, head: `<span class="tg-person" data-act="person" data-uid="${u}">${avatar(u, 22)} ${esc(firstName(u))}</span>` })),
      { date: base, uid: '_none', head: '<span class="tg-person"><span class="av none" style="--s:22px">?</span> Nieprzypisane</span>' }];
    if (team.cals.some(c => calVisible(c.id))) cols.push({ date: base, uid: '_ev', head: `<span class="tg-person">${I.google} Kalendarze</span>` });
  }
  html += `<div class="cal2 grid ${mode}">${timeGrid(cols)}</div>
    <p class="cal-hint muted small">${isNarrow() ? 'Dotknij pustej godziny, aby dodać. Przytrzymaj blok, aby go przesunąć.' : 'Kliknij lub przeciągnij po pustych godzinach, aby dodać wydarzenie z przedziałem czasu. Przeciągnij blok, by go przenieść, a dolną krawędź – by zmienić długość.'}</p>`;
  return html;
}
function dayAgenda(sel) {
  const td = todayStr(), ts = calTasks(sel), ev = gcalEventsOn(sel, 'gcalCal'), n = diffDays(sel, td), rel = n === 0 ? 'Dziś' : n === 1 ? 'Jutro' : n === -1 ? 'Wczoraj' : '';
  const sd = parseDate(sel);
  return `<aside class="cal2-agenda group" data-drop="day" data-date="${sel}">
    <div class="cal2-ah"><div class="cal2-big">${sd.getDate()}</div><div><b>${cap(PL_DAYS[sd.getDay()])}${rel ? ` · ${rel}` : ''}</b><span>${PL_MON[sd.getMonth()]} ${sd.getFullYear()} · ${ts.length} ${plural(ts.length, 'pozycja', 'pozycje', 'pozycji')}${ev.length ? ` · ${ev.length} z Google` : ''}</span></div>
      <button class="icon-btn" data-act="cal-goday" data-date="${sel}" title="Otwórz widok dnia">${I.right}</button></div>
    ${ev.length ? `<div class="cal2-evs">${ev.map(e => `<a class="cal2-ev" ${e.link && /^https:\/\//.test(e.link) ? `href="${esc(e.link)}" target="_blank" rel="noopener"` : ''} style="--c:${e.color}"><span class="cal2-evt">${e.time ? `${e.time}${e.endTime ? '–' + e.endTime : ''}` : 'Cały dzień'}</span><span class="grow">${esc(e.title)}</span><span class="cal2-evc">${esc(e.cal)}</span></a>`).join('')}</div>` : ''}
    ${ts.map(t => taskRow(t, { showProject: true })).join('')}
    ${addTaskButton('day:' + sel, { due: sel })}
    ${!ts.length && !ev.length ? `<div class="cal2-empty">${sz(I.calMonth, 26)}<span>Brak planów na ten dzień</span></div>` : ''}
  </aside>`;
}
function calSources(anchor) {
  openPopover(anchor, (pop, close) => {
    const draw = () => {
      const row = (id, color, name, sub) => `<label class="menu-item cs-row"><span class="cs-sw" style="--c:${color}"></span><span class="grow">${name}${sub ? `<br><span class="muted small">${sub}</span>` : ''}</span><input type="checkbox" data-src="${id}" ${calVisible(id) ? 'checked' : ''}></label>`;
      const by = state.settings.calColorBy || 'person';
      const teamC = team.cals.filter(c => c.scope === 'team'), mineC = team.cals.filter(c => c.scope === 'personal');
      const sub = c => { const x = team.ev[c.id]; return x?.err ? `⚠️ ${esc(x.err)}` : x?.at ? `${(x.events || []).length} wydarzeń · ${fmtDateTime(x.at)}` : 'pobieranie…'; };
      pop.innerHTML = `<div class="menu cs-menu" style="width:320px"><div class="menu-label">Listo Team</div>
        ${row('tasks', 'var(--accent)', 'Zadania')}${row('events', '#9466f0', 'Wydarzenia')}${row('done', '#3ec26a', 'Ukończone')}
        <div class="menu-label">Kalendarze zespołu ${sz(I.team, 13)}</div>${teamC.map(c => row(c.id, c.color, esc(c.name), sub(c))).join('') || '<div class="menu-empty">Brak – dodaj w Ustawieniach</div>'}
        <div class="menu-label">Moje kalendarze ${sz(I.person, 13)}</div>${mineC.map(c => row(c.id, c.color, esc(c.name), sub(c))).join('') || '<div class="menu-empty">Brak – dodaj w Ustawieniach</div>'}
        <div class="menu-sep"></div><div class="menu-label">Kolory bloków</div>
        <div class="menu-row cs-by">${[['person', 'Osoba'], ['prio', 'Priorytet'], ['project', 'Projekt']].map(([v, l]) => `<button class="st-pill ${by === v ? 'sel' : ''}" data-by="${v}">${l}</button>`).join('')}</div>
        <div class="menu-sep"></div>
        <button class="menu-item" data-cs="refresh">${sz(I.repeat, 15)}<span class="grow">Odśwież kalendarze Google</span></button>
        <button class="menu-item" data-cs="manage">${sz(I.gear, 15)}<span class="grow">Zarządzaj kalendarzami…</span></button></div>`;
    };
    draw();
    pop.onchange = e => { const c = e.target.closest('[data-src]'); if (c) { const h = new Set(state.settings.calHidden || []); c.checked ? h.delete(c.dataset.src) : h.add(c.dataset.src); state.settings.calHidden = [...h]; save(); ui.quiet = true; renderMain(); } };
    pop.onclick = e => {
      const by = e.target.closest('[data-by]'), cs = e.target.closest('[data-cs]');
      if (by) { state.settings.calColorBy = by.dataset.by; save(); ui.quiet = true; renderMain(); draw(); }
      if (cs?.dataset.cs === 'refresh') { close(); toast('Odświeżam kalendarze…'); loadCalendars(true); }
      if (cs?.dataset.cs === 'manage') { close(); ui.prefTab = 'calendars'; setView({ type: 'prefs' }); }
    };
  });
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  const a = el.dataset.act;
  if (a === 'cal-mode') { ui.calMode = el.dataset.v; const s = ui.calSel || todayStr(); ui.calMonth = s.slice(0, 8) + '01'; ui.calWeek = weekStart(s); ui.calDay = s; ui.stagger = true; ui.tgScroll = null; render(); }
  else if (a === 'cal-step') {
    const n = +el.dataset.n, mode = ui.calMode, td = todayStr();
    if (!n) { ui.calSel = td; ui.calMonth = td.slice(0, 8) + '01'; ui.calWeek = weekStart(td); ui.calDay = td; }
    else if (mode === 'month') { const d = parseDate(calBase('month')); d.setMonth(d.getMonth() + n); ui.calMonth = fmtDate(d); }
    else if (mode === 'week') { ui.calWeek = addDays(calBase('week'), 7 * n); ui.calSel = ui.calWeek; }
    else { ui.calDay = addDays(calBase('day'), n); ui.calSel = ui.calDay; }
    ui.stagger = true; render();
  }
  else if (a === 'cal-goday') { ui.calSel = el.dataset.date; ui.calDay = el.dataset.date; ui.calMode = 'day'; ui.stagger = true; render(); }
  else if (a === 'cal-src') calSources(el);
});
document.addEventListener('dblclick', e => {
  const cell = e.target.closest('.cal2-cell');
  if (cell && !e.target.closest('.cal2-chip')) { ui.calSel = cell.dataset.date; ui.modal = { type: 'quick' }; openForm('quick', { projectId: 'inbox', due: cell.dataset.date }); }
});

// ---------- siatka godzin: dodawanie przez przeciągnięcie, przesuwanie i zmiana długości ----------
(() => {
  let g = null;
  const snap = m => Math.max(0, Math.min(24 * 60, Math.round(m / 15) * 15));
  const minAt = (col, y) => (y - col.getBoundingClientRect().top) / HH() * 60;
  const colAt = (x, y) => { const el = document.elementFromPoint(x, y); return el?.closest?.('.tg-col'); };
  const ghost = (col, s, e2, cls) => {
    let gh = $('.tg-ghost');
    if (!gh || gh.parentElement !== col) { gh?.remove(); gh = document.createElement('div'); gh.className = 'tg-ghost ' + (cls || ''); col.appendChild(gh); }
    gh.style.top = s / 60 * HH() + 'px'; gh.style.height = Math.max(12, (e2 - s) / 60 * HH()) + 'px';
    gh.textContent = `${minHm(s)}–${minHm(Math.min(e2, 1439))}`;
  };
  const start = (e, kind) => {
    const col = e.target.closest('.tg-col'), blk = e.target.closest('.tg-ev[data-tgid]');
    if (kind === 'create') { const s = snap(minAt(col, e.clientY) - 7); g = { kind, col, s, e: s + 60, x: e.clientX, y: e.clientY, moved: false }; }
    else {
      const t = task(blk.dataset.tgid); if (!t) return;
      const s = hmMin(t.time), en = t.endTime ? hmMin(t.endTime) : s + (t.kind === 'event' ? 60 : 30);
      g = { kind, col, blk, t, s, e: en, dur: en - s, off: minAt(col, e.clientY) - s, x: e.clientX, y: e.clientY, moved: false };
    }
  };
  let press = null;
  document.addEventListener('pointerdown', e => {
    if (e.button > 0 || !e.target.closest?.('.tg-col')) return;
    if (e.target.closest('a.tg-ev')) return;
    const kind = e.target.closest('.tg-rs') ? 'resize' : e.target.closest('.tg-ev[data-tgid]') ? 'move' : 'create';
    if (e.pointerType === 'touch') {
      // na dotyku: krótkie dotknięcie = otwórz / dodaj, przytrzymanie = przesuń
      const x = e.clientX, y = e.clientY, tgt = e.target;
      press = { x, y, tgt, kind, t0: Date.now(), timer: kind === 'create' ? null : setTimeout(() => { if (!press) return; start({ target: tgt, clientX: x, clientY: y }, kind); g.moved = true; navigator.vibrate?.(15); tgt.closest('.tg-ev')?.classList.add('lift'); }, 380) };
      return;
    }
    e.preventDefault();
    start(e, kind);
  });
  document.addEventListener('pointermove', e => {
    if (press && !g) { if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.timer); press = null; } return; }
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
    g.moved = true;
    if (e.pointerType === 'touch') e.preventDefault();
    if (g.kind === 'create') { const m = snap(minAt(g.col, e.clientY)); const a = Math.min(g.s, m), b = Math.max(g.s + 15, m); ghost(g.col, a, b, 'new'); g.a = a; g.b = b; }
    else if (g.kind === 'resize') { const m = snap(minAt(g.col, e.clientY)); g.e = Math.max(g.s + 15, m); ghost(g.col, g.s, g.e); g.blk.style.opacity = '.35'; }
    else { const c = colAt(e.clientX, e.clientY) || g.col; g.col2 = c; const s = snap(minAt(c, e.clientY) - g.off); g.ns = Math.max(0, Math.min(24 * 60 - g.dur, s)); ghost(c, g.ns, g.ns + g.dur); g.blk.style.opacity = '.35'; }
  }, { passive: false });
  const end = e => {
    if (press && !g) {
      clearTimeout(press.timer);
      const p = press; press = null;
      if (Date.now() - p.t0 < 500) {
        const blk = p.tgt.closest('.tg-ev[data-tgid]');
        if (blk) openTask(blk.dataset.tgid);
        else { const col = p.tgt.closest('.tg-col'); if (col) { const s = snap(minAt(col, p.y) - 20); quickAt(col, s, s + 60); } }
      }
      return;
    }
    if (!g) return;
    const x = g; g = null; press = null;
    $('.tg-ghost')?.remove();
    if (x.blk) x.blk.style.opacity = '';
    if (x.kind === 'create') { quickAt(x.col, x.moved ? x.a : x.s, x.moved ? x.b : x.s + 60); return; }
    if (!x.moved) { if (x.kind === 'move') openTask(x.t.id); return; }
    const snapT = snapshot(), t = x.t;
    if (x.kind === 'resize') { t.endTime = minHm(Math.min(x.e, 1439)); }
    else {
      const c = x.col2 || x.col;
      t.due = c.dataset.date; t.time = minHm(x.ns); t.endTime = minHm(Math.min(x.ns + x.dur, 1439));
      if (t.endDue && t.endDue < t.due) t.endDue = null;
      const fromU = x.col.dataset.uid, toU = c.dataset.uid;
      if (toU && toU !== fromU && toU !== '_ev') { if (toU === '_none') t.assignees = []; else t.assignees = [...new Set([...t.assignees.filter(a => a !== fromU), toU])]; }
    }
    ui.quiet = true; commit();
    toast(`${t.title}: ${shortDate(t.due)} ${timeRange(t)}${x.col2?.dataset.uid && x.col2.dataset.uid !== x.col.dataset.uid ? ' · ' + (t.assignees.map(firstName).join(', ') || 'nieprzypisane') : ''}`, snapT);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); press = null; } if (g) { $('.tg-ghost')?.remove(); if (g.blk) g.blk.style.opacity = ''; g = null; } });
  document.addEventListener('touchmove', e => { if (g && g.moved) e.preventDefault(); }, { passive: false });
  function quickAt(col, s, e2) {
    const u = col.dataset.uid;
    ui.calSel = col.dataset.date;
    ui.modal = { type: 'quick' };
    openForm('quick', { projectId: 'inbox', due: col.dataset.date, time: minHm(s), endTime: minHm(Math.min(e2, 1439)), kind: 'event', assignees: u && u !== '_none' && u !== '_ev' ? [u] : (state.settings.who && !['all', 'none', 'me'].includes(state.settings.who) ? [state.settings.who] : []) });
  }
})();

// ================================================================
//  Powiadomienia push (Web Push przez Service Worker)
// ================================================================
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !CFG.vapidPublic) return 'na';
  if (Notification.permission === 'denied') return 'denied';
  return lsGet('lt-push', false) && Notification.permission === 'granted' ? 'on' : 'off';
}
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
async function swReg() {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register('sw.js');
  return navigator.serviceWorker.ready.then(() => reg);
}
async function saveSub(sub) {
  const j = sub.toJSON();
  const { error } = await auth.sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: me(), p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 180) });
  if (error) throw error;
}
async function pushEnable() {
  const st = pushState();
  if (st === 'na') { toast(isIOS() && !isStandalone() ? 'iPhone: najpierw Udostępnij → „Do ekranu początkowego”, otwórz Listo Team z ikony i tam włącz powiadomienia' : 'To urządzenie lub przeglądarka nie obsługuje powiadomień push'); return; }
  if (st === 'denied') { toast('Powiadomienia są zablokowane – odblokuj je w ustawieniach przeglądarki dla tej strony'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Nie udzielono zgody na powiadomienia'); return; }
    const reg = await swReg();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapidPublic) });
    await saveSub(sub);
    lsSet('lt-push', true);
    toast('🔔 Powiadomienia włączone na tym urządzeniu');
    ui.quiet = true; render();
  } catch (e) { console.warn(e); toast('Nie udało się włączyć powiadomień: ' + (e?.message || e)); }
}
async function pushDisable() {
  try { const reg = await navigator.serviceWorker.getRegistration(); const s = await reg?.pushManager.getSubscription(); if (s) { await auth.sb.from('push_subs').delete().eq('endpoint', s.endpoint); await s.unsubscribe(); } } catch (e) { /* */ }
  lsSet('lt-push', false); toast('Wyłączono powiadomienia na tym urządzeniu'); ui.quiet = true; render();
}
async function pushAutoResubscribe() {
  if (pushState() !== 'on') return;
  try { const reg = await swReg(); let s = await reg.pushManager.getSubscription(); if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(CFG.vapidPublic) }); await saveSub(s); } catch (e) { /* */ }
}
async function pushTest() {
  const { error } = await auth.sb.rpc('send_test_notification');
  toast(error ? 'Nie udało się wysłać testu: ' + error.message : 'Wysłano testowe powiadomienie – powinno pojawić się za chwilę');
}
navigator.serviceWorker?.addEventListener?.('message', e => { const id = e.data?.taskId; if (e.data?.type === 'open-task' && id) { if (task(id)) openTask(id); else lsSet('lt-open-task', id); } });

// ================================================================
//  Ustawienia z zakładkami
// ================================================================
const PREF_TABS = [['general', 'Ogólne', () => I.gear], ['team', 'Zespół', () => I.team], ['calendars', 'Kalendarze', () => I.calMonth], ['notif', 'Powiadomienia', () => I.bell], ['theme', 'Motyw', () => I.moon], ['sidebar', 'Pasek boczny', () => I.sidebar], ['account', 'Konto', () => I.cloud]];
function renderPrefs() {
  const s = state.settings, tab = PREF_TABS.some(t => t[0] === ui.prefTab) ? ui.prefTab : 'general';
  let html = header('Ustawienia', { icon: sz(I.gear, 24), iconCls: 'tile', sub: team.ws ? `Zespół: <b>${esc(team.ws.name)}</b>` : 'Wygląd, zespół, kalendarze i powiadomienia' });
  const sec = (i, title, body, extra = '') => `<section class="pf-card" style="--i:${i}"><h3>${title}${extra}</h3>${body}</section>`;
  let body = '';
  if (tab === 'general') {
    const cardOpts = [['prog', 'Moje w trakcie'], ['today', 'Moje na dziś'], ['events', 'Dziś w kalendarzu'], ['week', 'Mój tydzień'], ['team', 'Zespół'], ['done', 'Ostatnio ukończone'], ['proj', 'Projekty']];
    body = sec(0, 'Profil', prefRow('Imię i nazwisko', 'Tak widzi Cię zespół', `<input class="pf-in" data-k="userName" value="${esc(s.userName || '')}" maxlength="60" aria-label="Imię">`)
      + prefRow('Widok po uruchomieniu', 'Co widzisz po otwarciu aplikacji', segBtns('startView', s.startView, [['home', 'Start'], ['mine', 'Moje'], ['today', 'Dziś'], ['calendar', 'Kalendarz']])))
      + sec(1, 'Lista zadań', prefRow('Gęstość listy', 'Odstępy między zadaniami', segBtns('density', s.density, [['compact', 'Zwarta'], ['normal', 'Normalna'], ['roomy', 'Przestronna']]))
      + prefRow('Opisy zadań na liście', 'Pierwsza linia opisu pod tytułem', swBtn(s.showDesc !== false, 'showDesc'))
      + prefRow('Dźwięki', 'Przy zmianie statusu i ukończeniu', swBtn(s.sound !== false, 'sound'))
      + prefRow('Skala interfejsu', 'Powiększ lub pomniejsz całą aplikację', segBtns('scale', s.scale, [[90, '90%'], [100, '100%'], [110, '110%'], [120, '120%']])))
      + sec(2, 'Kalendarz', prefRow('Początek dnia w siatce godzin', 'Od której godziny przewijać widok tygodnia i dnia', stepper('calStartHour', s.calStartHour ?? 7, 1, '', ':00'))
      + prefRow('Numery tygodni', 'W widoku miesiąca', swBtn(!!s.calWeekNums, 'calWeekNums'))
      + prefRow('Wydarzenia Google w Nadchodzących', '', swBtn(s.gcalUp !== false, 'gcalUp')) + prefRow('Wydarzenia Google na Starcie', '', swBtn(s.gcalToday !== false, 'gcalToday')))
      + sec(3, 'Animacje', prefRow('Animacje', 'Przejścia, wjazdy list, konfetti', segBtns('anim', s.anim, [['full', 'Pełne'], ['off', 'Wyłączone']]))
      + prefRow('Animacja przy uruchomieniu', '<button class="link-btn" data-act="splash-preview">Pokaż podgląd</button>', swBtn(s.splash !== false, 'splash'))
      + prefRow('Efekty po najechaniu', 'Podświetlenia i poświata pod kursorem', swBtn(s.hoverFx !== false, 'hoverFx')))
      + sec(4, 'Strona Start', `<p class="pf-p">Pokaż tylko potrzebne kafelki.</p><div class="pf-checks">${cardOpts.map(([k, l]) => `<button class="pf-chk ${(s.hiddenCards || []).includes(k) ? '' : 'on'}" data-act="pref-card" data-v="${k}"><span>${l}</span><i>${I.checkSmall}</i></button>`).join('')}</div>`
      + prefRow('Przestawianie kafelków', 'Pokazuje na Starcie przycisk „Ułóż kafelki”', swBtn(!!s.tileEdit, 'tileEdit'))
      + (s.cardOrder?.length ? prefRow('Kolejność kafelków', 'Wróć do układu domyślnego', `<button class="btn sm" data-act="card-reset">Przywróć</button>`) : ''))
      + sec(5, 'Dodawanie głosem', prefRow('Status', (dictNS || SpeechRec) ? '<span class="ok-txt">Rozpoznawanie mowy dostępne</span>' : 'Niedostępne w tym oknie', `<button class="btn sm" data-act="voice">${sz(I.mic, 14)} Wypróbuj</button>`)
      + prefRow('Dodawaj od razu', 'Po zakończeniu mówienia bez potwierdzania', swBtn(!!s.voiceAuto, 'voiceAuto')))
      + sec(6, 'Przywracanie', prefRow('Ustawienia domyślne', 'Wygląd i zachowanie jak na początku (zadania zostają)', `<button class="btn sm" data-act="pref-reset">Przywróć</button>`));
  } else if (tab === 'team') {
    if (!team.ws) body = sec(0, 'Zespół', `<p class="pf-p">Nie należysz jeszcze do żadnego zespołu.</p><button class="btn primary" data-act="ob-open">Utwórz zespół lub dołącz kodem</button>`);
    else {
      const adm = isAdmin();
      body = sec(0, `${sz(I.share, 16)} Zaproś osoby`, `<p class="pf-p">Wyślij link współpracownikom (SMS, e-mail, komunikator). Po założeniu konta dołączą automatycznie. Możesz też podać sam kod.</p>
        <div class="inv-box"><input class="pf-in wide" readonly value="${esc(inviteLink())}" aria-label="Link zaproszenia"><button class="btn sm primary" data-act="ws-copy-link">${sz(I.copy, 14)} Kopiuj link</button>${navigator.share ? `<button class="btn sm" data-act="ws-share">Udostępnij…</button>` : ''}</div>
        ${prefRow('Kod zaproszenia', `<code class="inv-code">${esc(team.ws.invite_code)}</code>`, `<div style="display:flex;gap:6px"><button class="btn sm" data-act="ws-copy-code">Kopiuj</button>${adm ? '<button class="btn sm" data-act="ws-new-code" title="Stary link przestanie działać">Nowy kod</button>' : ''}</div>`)}`)
        + sec(1, `${sz(I.team, 16)} Osoby (${team.members.length})`, `<div class="mb-list">${team.members.map(m => `<div class="mb-row">${avatar(m.user_id, 32)}<div class="grow"><b>${esc(memberName(m.user_id))}${m.user_id === me() ? ' <span class="muted small">(Ty)</span>' : ''}</b><span class="muted small">${esc(m.email || '')}</span></div>
          <span class="mb-col"><input type="color" value="${m.color || memberColor(m.user_id)}" data-act2="m-color" data-uid="${m.user_id}" ${m.user_id === me() || adm ? '' : 'disabled'} title="Kolor osoby w kalendarzu"></span>
          ${adm && m.user_id !== me() && m.role !== 'owner' ? `<select class="pf-sel" data-act2="m-role" data-uid="${m.user_id}"><option value="member" ${m.role === 'member' ? 'selected' : ''}>Członek</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Administrator</option></select>
            <button class="icon-btn" data-act="m-remove" data-uid="${m.user_id}" title="Usuń z zespołu">${I.trash}</button>` : `<span class="mb-role">${m.role === 'owner' ? 'Właściciel' : m.role === 'admin' ? 'Administrator' : 'Członek'}</span>`}</div>`).join('')}</div>
          <p class="muted small">Administratorzy mogą zapraszać, usuwać osoby i zarządzać kalendarzami zespołu. Każdy członek widzi i edytuje wszystkie zadania zespołu.</p>`)
        + sec(2, 'Zespół', prefRow('Nazwa zespołu', adm ? '' : 'Zmienia administrator', adm ? `<input class="pf-in" data-ws="name" value="${esc(team.ws.name)}" maxlength="60" aria-label="Nazwa zespołu">` : `<b>${esc(team.ws.name)}</b>`)
          + (team.list.length > 1 ? prefRow('Przełącz zespół', 'Należysz do kilku zespołów', `<select class="pf-sel" data-act2="ws-switch">${team.list.map(w => `<option value="${w.id}" ${w.id === team.ws.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`) : '')
          + prefRow('Inny zespół', 'Utwórz nowy lub dołącz do kolejnego', `<button class="btn sm" data-act="ob-open">Utwórz / dołącz</button>`)
          + (member(me())?.role !== 'owner' ? prefRow('Opuść zespół', 'Stracisz dostęp do zadań tego zespołu', `<button class="btn sm danger" data-act="ws-leave">Opuść</button>`) : ''));
    }
  } else if (tab === 'calendars') {
    const row = c => { const x = team.ev[c.id]; return `<div class="mb-row"><span class="cs-sw big" style="--c:${c.color}"></span><div class="grow"><b>${esc(c.name)}</b><span class="muted small">${c.scope === 'team' ? 'Zespołowy – widzi każdy' : 'Osobisty – widzisz tylko Ty'} · ${x?.err ? `<span style="color:var(--due-overdue)">⚠️ ${esc(x.err)}</span>` : x?.at ? `${(x.events || []).length} wydarzeń · ${fmtDateTime(x.at)}` : 'pobieranie…'}</span></div>
      <button class="icon-btn" data-act="cal-vis" data-id="${c.id}" title="${calVisible(c.id) ? 'Ukryj' : 'Pokaż'} w kalendarzu">${calVisible(c.id) ? I.eye : I.eyeOff}</button>
      ${c.owner_id === me() || (c.scope === 'team' && isAdmin()) ? `<button class="icon-btn" data-act="cal-del" data-id="${c.id}" title="Odłącz kalendarz">${I.trash}</button>` : ''}</div>`; };
    const teamC = team.cals.filter(c => c.scope === 'team'), mineC = team.cals.filter(c => c.scope === 'personal');
    body = sec(0, `${I.google} Kalendarze zespołu`, (teamC.map(row).join('') || '<p class="pf-p">Brak. Dodaj firmowy kalendarz – zobaczy go każdy w zespole.</p>'), `<button class="btn sm" data-act="cal-refresh" style="margin-left:auto">Odśwież</button>`)
      + sec(1, `${sz(I.person, 16)} Moje kalendarze`, mineC.map(row).join('') || '<p class="pf-p">Brak. Dodaj swój prywatny kalendarz – widzisz go tylko Ty.</p>')
      + sec(2, 'Podłącz Kalendarz Google', `<form class="cal-form">
          <div class="cf-scope seg-inline"><button type="button" class="sel" data-scope="personal">${sz(I.person, 14)} Osobisty (tylko ja)</button><button type="button" data-scope="team">${sz(I.team, 14)} Zespołowy (wszyscy)</button></div>
          <label class="cf-l"><span>Nazwa</span><input name="name" maxlength="60" placeholder="np. Firma – spotkania" required></label>
          <label class="cf-l"><span>Adres iCal (link)</span><input name="url" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" required spellcheck="false" autocomplete="off"></label>
          <div class="cf-colors">${COLORS.slice(0, 14).map(([n, c], i) => `<button type="button" class="cf-c ${i === 10 ? 'on' : ''}" data-color="${c}" style="--c:${c}" title="${n}"></button>`).join('')}</div>
          <button class="btn primary" type="submit">Podłącz kalendarz</button></form>
        <ol class="gc-steps"><li>Otwórz <b>calendar.google.com</b> na komputerze → przy kalendarzu kliknij <b>⋮ → Ustawienia i udostępnianie</b>.</li>
          <li>Przewiń do sekcji <b>Integracja kalendarza</b> i skopiuj <b>„Adres prywatny w formacie iCal”</b> (dla kalendarza publicznego wystarczy „Adres publiczny w formacie iCal”).</li>
          <li>Wklej link powyżej, wybierz <b>Osobisty</b> lub <b>Zespołowy</b> i kliknij „Podłącz”.</li></ol>
        <p class="muted small">Kalendarz zespołowy widzi każdy członek zespołu; link osobisty jest zapisany tak, że ma do niego dostęp wyłącznie Twoje konto. Wydarzenia odświeżają się co 15 minut (lub przyciskiem „Odśwież”). Google aktualizuje link iCal z kilkuminutowym opóźnieniem. Widoczność każdego kalendarza przełączysz w Kalendarzu → „Kalendarze”.</p>`);
  } else if (tab === 'notif') {
    const st = pushState();
    body = sec(0, `${sz(I.bell, 16)} Powiadomienia push na tym urządzeniu`, prefRow('Stan', st === 'on' ? '<span class="ok-txt">Włączone</span>' : st === 'denied' ? 'Zablokowane w przeglądarce – odblokuj je w ustawieniach strony' : st === 'na' ? (isIOS() && !isStandalone() ? 'Na iPhonie dodaj najpierw aplikację do ekranu początkowego (Udostępnij → Do ekranu początkowego) i otwórz ją z ikony' : 'Niedostępne na tym urządzeniu / w tej przeglądarce') : 'Wyłączone',
        st === 'on' ? `<div style="display:flex;gap:6px"><button class="btn sm" data-act="push-test">Wyślij test</button><button class="btn sm" data-act="push-off">Wyłącz</button></div>` : st === 'off' ? `<button class="btn sm primary" data-act="push-on">Włącz</button>` : '')
      + `<p class="pf-p">Włącz powiadomienia na każdym urządzeniu (telefon, laptop), na którym chcesz je dostawać.</p>`)
      + sec(1, 'Kiedy dostaniesz powiadomienie', `<ul class="pf-ul"><li>👤 ktoś <b>przypisze Ci zadanie</b> lub wydarzenie,</li><li>🔄 zmieni się <b>status</b> zadania, które utworzyłeś lub które jest Twoje (w trakcie / ukończone),</li><li>💬 ktoś doda <b>komentarz</b> do Twojego zadania,</li><li>⏰ zbliża się <b>godzina</b> zadania lub wydarzenia z przypisaniem (domyślnie 10 min wcześniej – zmienisz w oknie zadania).</li></ul>
        <p class="muted small">Nie dostajesz powiadomień o własnych zmianach. Lista ostatnich powiadomień jest pod dzwonkiem w menu.</p>`);
  } else if (tab === 'theme') {
    const cur = s.accent || 'todoist';
    body = sec(0, 'Tryb', `<div class="seg-inline th-modes">${[['dark', 'Ciemny'], ['light', 'Jasny'], ['auto', 'Systemowy']].map(([v, l]) => `<button class="${s.theme === v ? 'sel' : ''}" data-act="pref" data-k="theme" data-v="${v}"><span class="th-mp ${v}"><i></i><i></i><i></i></span><span>${l}</span></button>`).join('')}</div>`)
      + sec(1, 'Kolor motywu', `<div class="pf-sw th-grid">${ACCENTS.map(a => `<button class="${cur === a.id ? 'on' : ''}" data-act="pref" data-k="accent" data-v="${a.id}" style="--c:${a.color}"><span class="th-prev"><i class="sb"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="dot"></i></span><span class="th-n">${a.name}</span></button>`).join('')}</div>`)
      + sec(2, 'Wygląd menu', prefRow('Kolorowe ikony zakładek', 'Każda zakładka ma własny kolor', swBtn(s.navColors !== false, 'navColors')));
  } else if (tab === 'sidebar') {
    const ord = navOrder(), hid = s.hiddenNav || [];
    body = sec(0, 'Zakładki w menu', `<p class="pf-p">Zmieniaj kolejność strzałkami lub przeciągając uchwyt. Przełącznik ukrywa zakładkę – ukryte nadal otworzysz z palety (Ctrl+K).</p>
      <div class="nv-list">${ord.map((k, i) => `<div class="nv-row ${hid.includes(k) ? 'off' : ''} ${ui.navMoved === k ? 'moved' : ''}" draggable="true" data-nv="${k}" style="--nc:${NAV_HUE[k] || 'var(--accent)'}">
        <span class="nv-grip" title="Przeciągnij">${I.grip}</span><span class="nv-ic">${NAV_DEF[k].icon()}</span><span class="grow">${NAV_DEF[k].label}</span>
        <button class="icon-btn" data-act="nav-mv" data-k="${k}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Wyżej">${I.up}</button><button class="icon-btn" data-act="nav-mv" data-k="${k}" data-d="1" ${i === ord.length - 1 ? 'disabled' : ''} title="Niżej">${I.down}</button>
        <button class="switch ${hid.includes(k) ? '' : 'on'}" data-act="nav-vis" data-k="${k}" role="switch" aria-checked="${!hid.includes(k)}" aria-label="Pokaż ${NAV_DEF[k].label}"><i></i></button></div>`).join('')}</div>
      <div class="pf-actions"><button class="btn sm" data-act="nav-reset">Przywróć domyślną kolejność</button></div>`)
      + sec(1, 'Wygląd', prefRow('Liczniki zadań', 'Liczby przy zakładkach i projektach', swBtn(s.navCounts !== false, 'navCounts')) + prefRow('Kolorowe ikony', 'Każda zakładka w swoim kolorze', swBtn(s.navColors !== false, 'navColors')));
    ui.navMoved = null;
  } else {
    body = sec(0, 'Konto', auth.user ? prefRow('Zalogowano', esc(auth.user.email || ''), `<button class="btn sm" data-act="acc-out">Wyloguj</button>`) + prefRow('Synchronizacja', SYNC_LABEL[sync.status], `<span class="acc-dot" data-s="${sync.status}"></span>`)
      + prefRow('Hasło', 'Ustaw nowe hasło do konta', `<button class="btn sm" data-act="acc-pass">Zmień</button>`)
      : prefRow('Konto', auth.ready ? 'Nie zalogowano' : 'Łączenie z serwerem…', auth.ready ? `<button class="btn sm primary" data-act="acc-in">Zaloguj się</button>` : ''))
      + sec(1, 'Urządzenia', (installEvt ? prefRow('Zainstaluj aplikację', 'Własne okno i ikona – bez paska przeglądarki', `<button class="btn sm primary" data-act="pwa-install">Zainstaluj</button>`) : '')
        + prefRow('Telefon', 'Otwórz stronę i wybierz „Zainstaluj aplikację” (Android) lub Udostępnij → „Do ekranu początkowego” (iPhone)', '')
        + prefRow('Laptop', 'Chrome / Edge: ikona instalacji w pasku adresu', '')
        + prefRow('Kopia zadań', 'Eksport do schowka (JSON)', `<button class="btn sm" data-act="acc-export">Kopiuj</button>`));
  }
  html += `<div class="pf2"><nav class="pf2-tabs" role="tablist">${PREF_TABS.map(([k, l, ic]) => `<button role="tab" class="${tab === k ? 'sel' : ''}" data-act="pref-tab" data-t="${k}">${sz(ic(), 17)}<span>${l}</span></button>`).join('')}</nav>
    <div class="pf2-body" data-tab="${tab}">${body}</div></div>`;
  return html;
}
// ---------- akcje ustawień ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act], [data-scope], [data-color]');
  if (!el || el.closest('#popover') || el.closest('#dialog-root')) return;
  if (el.dataset.scope) { $$('.cf-scope button').forEach(b => b.classList.toggle('sel', b === el)); return; }
  if (el.dataset.color && el.closest('.cal-form')) { $$('.cf-c').forEach(b => b.classList.toggle('on', b === el)); return; }
  const a = el.dataset.act, sb = auth.sb;
  switch (a) {
    case 'ob-open': showOnboard(); break;
    case 'push-on': pushEnable(); break;
    case 'push-off': pushDisable(); break;
    case 'push-test': pushTest(); break;
    case 'acc-out': confirmDlg('Wylogować się?', 'Twoje zmiany są zapisane w zespole. Dane zostaną usunięte z tego urządzenia.', 'Wyloguj', signOut); break;
    case 'acc-in': showAuth(); break;
    case 'acc-pass': newPasswordDialog(); break;
    case 'acc-export': exportData(); break;
    case 'ws-copy-link': copyText(inviteLink(), 'Skopiowano link zaproszenia'); break;
    case 'ws-copy-code': copyText(team.ws.invite_code, 'Skopiowano kod'); break;
    case 'ws-share': navigator.share?.({ title: 'Dołącz do ' + team.ws.name, text: `Dołącz do zespołu „${team.ws.name}” w Listo Team`, url: inviteLink() }).catch(() => {}); break;
    case 'ws-new-code': confirmDlg('Wygenerować nowy kod?', 'Dotychczasowy link i kod zaproszenia przestaną działać. Osoby w zespole zostają.', 'Nowy kod', async () => {
      const { data, error } = await sb.rpc('regenerate_invite', { ws: team.ws.id });
      if (error) return toast('Nie udało się: ' + error.message);
      team.ws.invite_code = data; ui.quiet = true; render(); toast('Nowy kod: ' + data);
    }); break;
    case 'm-remove': { const u = el.dataset.uid; confirmDlg('Usunąć osobę z zespołu?', `<b>${esc(memberName(u))}</b> straci dostęp do zadań zespołu. Jej zadania zostaną (z przypisaniem).`, 'Usuń', async () => {
      const { error } = await sb.from('ws_members').delete().eq('workspace_id', team.ws.id).eq('user_id', u);
      if (error) return toast('Nie udało się: ' + error.message);
      await loadMembers(); ui.quiet = true; render(); toast('Usunięto z zespołu');
    }); break; }
    case 'ws-leave': confirmDlg('Opuścić zespół?', 'Stracisz dostęp do zadań tego zespołu. Możesz wrócić z nowym zaproszeniem.', 'Opuść', async () => {
      const { error } = await sb.from('ws_members').delete().eq('workspace_id', team.ws.id).eq('user_id', me());
      if (error) return toast('Nie udało się: ' + error.message);
      lsSet('lt-ws'); location.reload();
    }); break;
    case 'cal-del': { const c = team.cals.find(x => x.id === el.dataset.id); if (!c) break; confirmDlg('Odłączyć kalendarz?', `Kalendarz <b>${esc(c.name)}</b> zniknie z Listo Team${c.scope === 'team' ? ' u wszystkich osób' : ''}. W Google nic się nie zmieni.`, 'Odłącz', async () => {
      const { error } = await sb.from('ws_calendars').delete().eq('id', c.id);
      if (error) return toast('Nie udało się: ' + error.message);
      delete team.ev[c.id]; await loadCalendars(); toast('Odłączono kalendarz');
    }); break; }
    case 'cal-vis': toggleCalSource(el.dataset.id); break;
    case 'cal-refresh': toast('Odświeżam kalendarze…'); loadCalendars(true); break;
  }
});
document.addEventListener('submit', async e => {
  const f = e.target.closest?.('.cal-form');
  if (!f) return;
  e.preventDefault();
  const name = f.name.value.trim();
  let url = f.url.value.trim().replace(/^webcal:\/\//i, 'https://');
  const scope = $('.cf-scope .sel', f)?.dataset.scope || 'personal', color = $('.cf-c.on', f)?.dataset.color || '#4073ff';
  if (!name || !/^https:\/\/\S+$/i.test(url)) { toast('Podaj nazwę i poprawny adres zaczynający się od https://'); return; }
  if (/calendar\.google\.com\/calendar\/(u\/\d\/)?r|embed\?/i.test(url)) { toast('To link do strony kalendarza – potrzebny jest „Adres w formacie iCal” (kończy się na .ics)'); return; }
  const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Łączę…';
  const { data, error } = await auth.sb.from('ws_calendars').insert({ workspace_id: team.ws.id, owner_id: me(), scope, name, color, url }).select('id').single();
  btn.disabled = false; btn.textContent = 'Podłącz kalendarz';
  if (error) { toast('Nie udało się: ' + error.message); return; }
  f.reset();
  await loadCalendars(true);
  const x = team.ev[data.id];
  toast(x?.err ? '⚠️ Kalendarz dodany, ale nie udało się go pobrać: ' + x.err : `📅 Podłączono „${name}” – ${(x?.events || []).length} wydarzeń`);
});
document.addEventListener('change', async e => {
  const el = e.target, a = el.dataset?.act2, sb = auth.sb;
  if (el.matches?.('.pf-in[data-k="userName"]') && team.ws) { const v = el.value.trim(); if (v) { await sb.from('ws_members').update({ name: v }).eq('workspace_id', team.ws.id).eq('user_id', me()); await loadMembers(); ui.quiet = true; render(); } }
  if (el.matches?.('.pf-in[data-ws="name"]') && team.ws) { const v = el.value.trim(); if (!v) return; const { error } = await sb.from('workspaces').update({ name: v }).eq('id', team.ws.id); if (!error) { team.ws.name = v; toast('Zmieniono nazwę zespołu'); ui.quiet = true; render(); } }
  if (a === 'm-role') { const { error } = await sb.from('ws_members').update({ role: el.value }).eq('workspace_id', team.ws.id).eq('user_id', el.dataset.uid); toast(error ? 'Nie udało się: ' + error.message : 'Zmieniono rolę'); await loadMembers(); }
  if (a === 'm-color') { const { error } = await sb.from('ws_members').update({ color: el.value }).eq('workspace_id', team.ws.id).eq('user_id', el.dataset.uid); if (!error) { await loadMembers(); ui.quiet = true; render(); } }
  if (a === 'ws-switch') { const ws = team.list.find(w => w.id === el.value); if (ws) { lsSet('lt-ws', ws.id); location.reload(); } }
});
// krok dla „Początek dnia” w ustawieniach kalendarza
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="pref-step"][data-k="calStartHour"]');
  if (!b) return;
  e.stopImmediatePropagation();
  const v = Math.max(0, Math.min(20, (state.settings.calStartHour ?? 7) + +b.dataset.d));
  state.settings.calStartHour = v; save(); ui.tgScroll = null;
  const x = $('b', b.parentElement); if (x) x.textContent = v + ':00';
}, true);

// ================================================================
//  Dodawanie z kontekstu widoku, filtr osób w górnym pasku, po rysowaniu
// ================================================================
openQuick = function () {
  const v = ui.view, d = { projectId: 'inbox' };
  if (v.type === 'project') d.projectId = v.id;
  if (v.type === 'today' || v.type === 'mine') d.due = todayStr();
  if (v.type === 'label') d.labels = [v.id];
  if (v.type === 'calendar') d.due = ui.calSel || todayStr();
  if (v.type === 'mine') d.assignees = [me()];
  if (v.type === 'person') d.assignees = [v.id];
  const w = state.settings.who;
  if (!d.assignees && w && !['all', 'none'].includes(w) && ['today', 'upcoming', 'calendar'].includes(v.type)) d.assignees = [w === 'me' ? me() : w];
  ui.modal = { type: 'quick' };
  openForm('quick', d);
};
const WHO_VIEWS = ['today', 'upcoming', 'calendar', 'filters', 'label', 'filter', 'search', 'inbox', 'project'];
const teamBaseRender = render;
render = function () {
  teamBaseRender();
  const v = ui.view.type, tr = $('.topbar .tb-right');
  if (tr && WHO_VIEWS.includes(v) && !(v === 'project' || v === 'inbox')) {
    const w = state.settings.who || 'all';
    tr.insertAdjacentHTML('afterbegin', `<button class="who-chip ${w !== 'all' ? 'on' : ''}" data-act="who" title="Pokaż zadania osoby">${w === 'all' ? sz(I.team, 16) : w === 'none' ? sz(I.ban, 15) : avatar(w === 'me' ? me() : w, 18)}<span>${esc(whoLabel())}</span>${I.chevronDown}</button>`);
  }
  const u = $('#sidebar .user');
  if (u && team.ws && !$('.ws-name', u)) u.insertAdjacentHTML('beforeend', `<small class="ws-name">${esc(team.ws.name)}</small>`);
  if (u && auth.user) { const av = $('.avatar', u); if (av) av.outerHTML = avatar(me(), 26); }
  renderNotifBadge();
  const sc = $('.tg-scroll');
  if (sc) {
    sc.scrollTop = ui.tgScroll ?? Math.max(0, (state.settings.calStartHour ?? 7) * HH() - 4);
    sc.addEventListener('scroll', () => { ui.tgScroll = sc.scrollTop; }, { passive: true });
  }
};
setInterval(() => { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); $$('.tg-now').forEach(x => { x.style.top = m / 60 * HH() + 'px'; }); }, 60000);

// narzędzie do testów lokalnych (tylko na localhost)
if (location.hostname === 'localhost') window.__lt = { get state() { return state; }, team, ui, render: () => render(), newTask, uid, todayStr, addDays, parseQuick, parseICS };
render();
save();
initSync();
requestAnimationFrame(() => requestAnimationFrame(() => $('#app').classList.add('ready')));
})();
