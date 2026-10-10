import curriculum from './data/questions.json';
import './style.css';

const topics = curriculum.topics;
const questions = curriculum.questions.map((row, index) => ({
  topic: row[0], id: row[1], title: row[2], difficulty: row[3],
  structures: row[4], pattern: row[5], algorithm: row[6],
  time: row[7], space: row[8], day: index + 1,
}));
const storeKey = 'fieldnotes-dsa-progress-v1';
const localDateKey = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const state = JSON.parse(localStorage.getItem(storeKey) || '{"solved":[],"bookmarks":[],"activity":{},"startDate":null}');
state.solved = Array.isArray(state.solved) ? state.solved : [];
state.bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks : [];
state.activity = state.activity && typeof state.activity === 'object' ? state.activity : {};
state.fontScale = Number.isFinite(Number(state.fontScale)) ? Math.min(1.2, Math.max(0.9, Number(state.fontScale))) : 1;
state.startDate ||= localDateKey(new Date());

const filters = { query: '', topic: 'All topics', difficulty: 'Any level', structure: 'Any data structure', pattern: 'Any pattern', status: 'All questions', sort: 'day' };
let expandedId = null;
let mobileNavOpen = false;
let pendingMarkId = null;

const icons = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.2 4.2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4.3 4.3L19 6.8"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.7L6 21z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4M16.5 3v4M4 9.5h16"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 22c4.2 0 7-2.8 7-6.7 0-2.9-1.6-4.8-4.1-7.3.1 2.2-1.1 3.3-2.1 3.8C13.7 7.3 11.6 4 8.4 2c.4 4-2.9 6.5-3.1 11.1C5.1 17.5 7.8 22 12 22Z"/><path d="M12.1 22c1.7-1.3 2.3-2.7 2.1-4.3-.2-1.2-.8-2.1-1.6-3-.1 1.2-.8 1.8-1.5 2.2-.2-1.4-.8-2.4-1.6-3.3-.1 2.9-2 4.8.2 7.1"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};
const icon = (name, cls = '') => `<span class="icon ${cls}">${icons[name]}</span>`;
const safe = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const isSolved = (id) => state.solved.includes(id);
const isBookmarked = (id) => state.bookmarks.includes(id);
function recentActivity() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    return { label: new Intl.DateTimeFormat('en', { weekday: 'narrow' }).format(date), done: Boolean(state.activity[key]?.length) };
  });
}
const solvedToday = () => Boolean(state.activity[localDateKey(new Date())]?.length);
const persist = () => localStorage.setItem(storeKey, JSON.stringify(state));
function applyFontSize() {
  const shell = document.querySelector('.shell');
  if (shell) shell.style.zoom = String(state.fontScale);
  const readout = document.querySelector('#font-size-readout');
  if (readout) readout.textContent = `${Math.round(state.fontScale * 100)}%`;
}
function setSolved(id, solved) {
  state.solved = solved ? [...new Set([...state.solved, id])] : state.solved.filter((x) => x !== id);
  for (const date of Object.keys(state.activity)) {
    state.activity[date] = state.activity[date].filter((x) => x !== id);
    if (!state.activity[date].length) delete state.activity[date];
  }
  if (solved) {
    const date = localDateKey(new Date());
    state.activity[date] ||= [];
    state.activity[date].push(id);
  }
}
const topicCount = (topic) => questions.filter((q) => q.topic === topic).length;
const topicDone = (topic) => questions.filter((q) => q.topic === topic && isSolved(q.id)).length;
const getNextQuestion = () => questions.find((q) => !isSolved(q.id)) || questions[0];

function render() {
  const solvedCount = state.solved.length;
  const next = getNextQuestion();
  const pct = Math.round((solvedCount / questions.length) * 100);
  const week = recentActivity();
  const dayNumber = Math.min(220, Math.max(1, Math.floor((Date.now() - new Date(`${state.startDate}T00:00:00`).getTime()) / 86400000) + 1));
  document.querySelector('#app').innerHTML = `
    <div class="shell ${mobileNavOpen ? 'nav-open' : ''}">
      <aside class="sidebar">
        <a class="brand" href="#top" aria-label="Technovation home"><span class="brand-mark">T.</span><span>Technovation</span></a>
        <div class="side-label">YOUR WORKSPACE</div>
        <button class="side-link ${filters.topic === 'All topics' && filters.status === 'All questions' ? 'active' : ''}" data-action="reset-topic">${icon('grid')}<span>All questions</span><span class="side-count">${questions.length}</span></button>
        <button class="side-link ${filters.status === 'Unsolved' ? 'active' : ''}" data-action="set-status" data-status="Unsolved">${icon('calendar')}<span>Daily path</span><span class="side-count">220 days</span></button>
        <button class="side-link ${filters.status === 'Bookmarked' ? 'active' : ''}" data-action="set-status" data-status="Bookmarked">${icon('bookmark')}<span>Saved for review</span><span class="side-count">${state.bookmarks.length}</span></button>
        <div class="side-section-head"><span class="side-label">TOPIC MAP</span><span class="side-total">${topics.length}</span></div>
        <nav class="topic-nav" aria-label="Filter by topic">
          ${topics.map((topic, i) => `<button class="topic-link ${filters.topic === topic ? 'selected' : ''}" data-action="topic" data-topic="${safe(topic)}"><span class="topic-index">${String(i + 1).padStart(2, '0')}</span><span class="topic-name">${safe(topic)}</span><span class="topic-progress">${topicDone(topic)}<i>/</i>${topicCount(topic)}</span></button>`).join('')}
        </nav>
        <div class="sidebar-bottom"><div class="source-mini"><span class="source-orbit"></span><span>TECHNOVATION DSA PATH</span></div><button class="source-link" data-action="sources">Curriculum notes ${icon('arrow')}</button></div>
      </aside>
      <main class="main" id="top">
        <header class="topbar"><button class="mobile-menu" data-action="toggle-nav" aria-label="Toggle menu">${icon(mobileNavOpen ? 'close' : 'menu')}</button><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>DSA interview path</strong></div><div class="topbar-right"><span class="streak-pill">${icon('flame')}<span>Day ${String(dayNumber).padStart(2, '0')}</span></span><div class="font-controls" aria-label="Text size controls"><span class="font-label">TEXT</span><button data-action="font-down" aria-label="Decrease text size">A−</button><span class="font-size-readout" id="font-size-readout" aria-live="polite">${Math.round(state.fontScale * 100)}%</span><button data-action="font-up" aria-label="Increase text size">A+</button></div><button class="avatar" aria-label="Technovation student profile">T</button></div></header>
        <div class="content">
          <section class="welcome-row"><div><div class="eyebrow"><span class="eyebrow-line"></span>THE COLLEGE INTERVIEW PLAYBOOK</div><h1>Build the instinct.<br><em>One problem at a time.</em></h1></div><div class="hero-stamp"><div class="stamp-number">220</div><div class="stamp-copy"><div class="stamp-label">CURATED QUESTIONS</div><div class="stamp-note">ONE A DAY</div></div></div></section>
          <section class="summary-grid" aria-label="Your progress">
            <article class="summary-card progress-card"><div class="summary-label">YOUR MOMENTUM <span class="summary-mark">01</span></div><div class="progress-row"><strong>${solvedCount}<small> / ${questions.length}</small></strong><span>${pct}% complete</span></div><div class="progress-track"><span style="width:${pct}%"></span></div><div class="summary-foot"><span>${questions.length - solvedCount} questions left in your path</span><span class="tiny-spark">↗</span></div></article>
            <article class="summary-card today-card"><div class="summary-label">TODAY'S FOCUS <span class="summary-mark">02</span></div><div class="today-inner"><span class="day-token">${String(next.day).padStart(2, '0')}</span><div><span class="today-kicker">DAY ${String(next.day).padStart(2, '0')} · ${safe(next.topic.toUpperCase())}</span><strong>${safe(next.title)}</strong><span class="today-meta">${safe(next.difficulty)} <i>·</i> LeetCode #${next.id}</span></div></div><button class="text-action" data-action="focus-next">Go to today's problem ${icon('arrow')}</button></article>
            <article class="summary-card rhythm-card"><div class="summary-label">THE RHYTHM <span class="summary-mark">03</span></div><div class="rhythm-visual"><div class="rhythm-days">${week.map(({label,done}) => `<span class="rhythm-day"><i class="${done ? 'done' : ''}">${done ? '✓' : '·'}</i><b>${label}</b></span>`).join('')}</div><div class="rhythm-note"><span class="rhythm-dot"></span>${solvedToday() ? 'You made time for practice today.' : 'One focused session is enough.'}</div></div><span class="rhythm-caption">LAST 7 DAYS</span></article>
          </section>
          <section class="library-head" id="library"><div class="library-title"><div class="eyebrow"><span class="eyebrow-line"></span>THE QUESTION LIBRARY</div><h2>Your next 220 reps<span class="title-period">.</span></h2></div><div class="library-utilities"><button class="filter-toggle" data-action="toggle-filters">${icon('sliders')}<span>Filters</span><span class="filter-count" id="filter-count"></span></button><label class="search-box">${icon('search')}<input id="search" placeholder="Find a question or pattern" value="${safe(filters.query)}"/><kbd>/</kbd></label></div></section>
          <section class="filter-panel" id="filter-panel"><div class="filter-field"><label for="difficulty">DIFFICULTY</label><select id="difficulty"><option>Any level</option>${['Easy','Medium','Hard'].map(x => `<option ${filters.difficulty===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="filter-field"><label for="structure">DATA STRUCTURE</label><select id="structure"><option>Any data structure</option>${unique('structures').map(x => `<option ${filters.structure===x?'selected':''}>${safe(x)}</option>`).join('')}</select></div><div class="filter-field"><label for="pattern">PATTERN</label><select id="pattern"><option>Any pattern</option>${unique('pattern').map(x => `<option ${filters.pattern===x?'selected':''}>${safe(x)}</option>`).join('')}</select></div><button class="clear-filters" data-action="clear-filters">Clear all</button></section>
          <section class="table-wrap"><div class="table-toolbar"><div class="active-filters" id="active-filters"></div><div class="result-note"><span id="result-count"></span><span class="toolbar-divider"></span><button class="sort-button" data-action="sort">${filters.sort === 'day' ? 'Day order' : 'Question title'} ${icon('chevron')}</button></div></div><div class="table-scroll"><table><thead><tr><th class="th-day">DAY</th><th>QUESTION</th><th>TOPIC</th><th>LEVEL</th><th class="th-status">STATUS</th><th class="th-expand"></th></tr></thead><tbody id="question-list"></tbody></table></div><div class="empty-state" id="empty-state" hidden><span class="empty-icon">⌕</span><h3>No questions match these filters.</h3><p>Try a different topic, keyword, or level.</p><button data-action="clear-filters">Reset filters</button></div><div class="table-footer"><span>TECHNOVATION CURRICULUM <b>·</b> 220 DAYS OF PRACTICE</span><button data-action="sources">How this list was built ${icon('arrow')}</button></div></section>
          <footer class="page-footer"><span>Technovation · College DSA practice</span></footer>
        </div>
      </main>
      <div class="nav-scrim" data-action="toggle-nav"></div>
      <dialog class="source-dialog" id="source-dialog"><button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon('close')}</button><div class="eyebrow"><span class="eyebrow-line"></span>ABOUT THIS CURRICULUM</div><h2>A shared interview core<span class="title-period">.</span></h2><p class="dialog-lede">This 220-day sequence distills recurring foundations, data structures, and interview patterns from the two study paths below, then orders them from first principles to advanced problem solving.</p><div class="source-note"><span class="source-number">01</span><div><strong>Striver's A2Z DSA Sheet</strong><p>Broad topic-by-topic progression, from basics through trees, graphs, and dynamic programming.</p><a href="https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet?page=sheet&open=1995%2C1997%2C2027%2C2013" target="_blank" rel="noreferrer">Open the source sheet ${icon('arrow')}</a></div></div><div class="source-note"><span class="source-number">02</span><div><strong>NeetCode 250</strong><p>Beginner-friendly interview problems organized around data structures and reusable patterns.</p><a href="https://neetcode.io/practice/practice/neetcode250" target="_blank" rel="noreferrer">Open the source sheet ${icon('arrow')}</a></div></div><div class="method-callout"><strong>How to use the labels</strong><p>Each question includes a LeetCode number, a primary pattern, the key data structure, a recommended optimal approach, and its expected time and auxiliary-space complexity. Complexity assumes the standard interview solution; problem constraints can change implementation details.</p></div><button class="dialog-done" data-action="close-dialog">Back to practice ${icon('arrow')}</button></dialog>
      <dialog class="mark-dialog" id="mark-dialog"><button class="dialog-close" type="button" data-action="cancel-mark" aria-label="Cancel marking">${icon('close')}</button><div class="eyebrow"><span class="eyebrow-line"></span>TECHNOVATION PROGRESS</div><h2>Mark this one complete<span class="title-period">.</span></h2><p class="dialog-lede">Enter the Technovation marking password to save this completion.</p><form id="mark-form"><label class="password-label" for="mark-password">MARKING PASSWORD</label><input id="mark-password" class="password-input" type="password" autocomplete="current-password" required /><p id="mark-error" class="form-error" role="alert"></p><div class="mark-actions"><button type="button" class="dialog-cancel" data-action="cancel-mark">Cancel</button><button type="submit" class="dialog-done" id="mark-submit">Verify &amp; mark ${icon('check')}</button></div></form></dialog>
    </div>`;
  applyFontSize();
  renderQuestions();
  bindEvents();
  syncFilterCount();
}

function unique(field) { return [...new Set(questions.map((q) => q[field]))].sort((a,b) => a.localeCompare(b)); }
function getFiltered() {
  let list = questions.filter((q) => {
    const haystack = `${q.title} ${q.id} ${q.topic} ${q.structures} ${q.pattern} ${q.algorithm}`.toLowerCase();
    return (!filters.query || haystack.includes(filters.query.toLowerCase())) &&
      (filters.topic === 'All topics' || q.topic === filters.topic) &&
      (filters.difficulty === 'Any level' || q.difficulty === filters.difficulty) &&
      (filters.structure === 'Any data structure' || q.structures === filters.structure) &&
      (filters.pattern === 'Any pattern' || q.pattern === filters.pattern) &&
      (filters.status === 'All questions' || (filters.status === 'Solved' && isSolved(q.id)) || (filters.status === 'Unsolved' && !isSolved(q.id)) || (filters.status === 'Bookmarked' && isBookmarked(q.id)));
  });
  if (filters.sort === 'title') list = [...list].sort((a,b) => a.title.localeCompare(b.title));
  return list;
}
function renderQuestions() {
  const list = getFiltered();
  const target = document.querySelector('#question-list');
  if (!target) return;
  document.querySelector('#result-count').textContent = `${list.length} ${list.length === 1 ? 'question' : 'questions'}`;
  document.querySelector('#empty-state').hidden = list.length !== 0;
  document.querySelector('.table-scroll').hidden = list.length === 0;
  document.querySelector('#active-filters').innerHTML = [filters.topic !== 'All topics' ? filters.topic : '',filters.difficulty !== 'Any level' ? filters.difficulty : '',filters.structure !== 'Any data structure' ? filters.structure : '',filters.pattern !== 'Any pattern' ? filters.pattern : '',filters.status !== 'All questions' ? filters.status : ''].filter(Boolean).map(x => `<span class="filter-chip">${safe(x)}</span>`).join('');
  target.innerHTML = list.map((q) => `<tr class="question-row ${expandedId === q.id ? 'is-expanded' : ''} ${isSolved(q.id) ? 'is-solved' : ''}" data-id="${q.id}">
    <td class="day-cell"><span class="day-number">${String(q.day).padStart(2, '0')}</span></td>
    <td class="question-cell"><div class="question-title-line"><a href="https://leetcode.com/problems/${slug(q.title)}/" target="_blank" rel="noreferrer" class="question-title" title="Open LeetCode problem">${safe(q.title)}</a><span class="lc-number">#${q.id}</span></div><div class="question-pattern">${safe(q.pattern)}</div></td>
    <td><span class="topic-pill">${safe(q.topic)}</span></td>
    <td><span class="difficulty ${q.difficulty.toLowerCase()}"><i></i>${safe(q.difficulty)}</span></td>
    <td class="status-cell"><button class="row-status ${isSolved(q.id) ? 'complete' : ''}" data-action="solve" data-id="${q.id}" aria-label="${isSolved(q.id) ? 'Mark unsolved' : 'Mark solved'}">${isSolved(q.id) ? icon('check') : ''}</button><button class="bookmark-button ${isBookmarked(q.id) ? 'saved' : ''}" data-action="bookmark" data-id="${q.id}" aria-label="${isBookmarked(q.id) ? 'Remove bookmark' : 'Bookmark'}">${icon('bookmark')}</button></td>
    <td class="expand-cell"><button class="expand-button" data-action="expand" data-id="${q.id}" aria-label="Show question analysis">${icon('chevron')}</button></td>
  </tr>${expandedId === q.id ? `<tr class="analysis-row"><td colspan="6"><div class="analysis-panel"><div class="analysis-heading"><div><span class="analysis-overline">THE INTERVIEW READ</span><h3>What this problem is teaching</h3></div><span class="analysis-day">DAY ${String(q.day).padStart(2,'0')} / 220</span></div><p class="analysis-copy">${safe(insight(q))}</p><div class="analysis-grid"><div><span>DATA STRUCTURE</span><strong>${safe(q.structures)}</strong></div><div><span>CORE PATTERN</span><strong>${safe(q.pattern)}</strong></div><div><span>OPTIMAL APPROACH</span><strong>${safe(q.algorithm)}</strong></div><div class="complexity"><span>TIME</span><strong>${safe(q.time)}</strong></div><div class="complexity"><span>AUXILIARY SPACE</span><strong>${safe(q.space)}</strong></div></div><div class="analysis-footer"><span>Try first without hints. Explain the invariant out loud.</span><a href="https://leetcode.com/problems/${slug(q.title)}/" target="_blank" rel="noreferrer">Practice on LeetCode ${icon('arrow')}</a></div></div></td></tr>` : ''}`).join('');
}
function slug(title) { return title.toLowerCase().replace(/\s*&\s*/g,'-').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function insight(q) {
  const rule = q.pattern.toLowerCase();
  if (rule.includes('sliding window')) return 'The key is to keep a window that represents a valid candidate, then move its boundary only when the invariant requires it. Track just enough state to update the answer in constant time per step.';
  if (rule.includes('two pointer')) return 'Use pointer movement to discard a range of candidates safely. Before coding, state why moving this pointer cannot skip a better answer.';
  if (rule.includes('binary search')) return 'Look for a monotone decision: once a candidate value works (or fails), all values on one side should have the same outcome. Binary search that answer space and prove the boundary.';
  if (rule.includes('dynamic programming') || rule.includes('dp')) return 'Define the smallest state that contains everything the future needs. Write the transition from that definition, then identify base cases and whether memory can be compressed.';
  if (rule.includes('backtracking')) return 'Treat the solution as a decision tree. Choose, recurse, then undo the choice; prune as soon as the partial path can no longer lead to a valid answer.';
  if (rule.includes('bfs') || rule.includes('dfs') || rule.includes('graph') || rule.includes('topological')) return 'Model the relationships explicitly, mark visited state at the right moment, and decide whether the task needs reachability, ordering, components, or shortest unweighted paths.';
  if (rule.includes('monotonic')) return 'Maintain a stack whose values stay ordered. When a new value breaks that order, popped elements have just found the boundary they were waiting for.';
  if (rule.includes('heap') || rule.includes('priority')) return 'A heap keeps the next most useful candidate at the root. Choose min-heap or max-heap based on which item you need to remove or inspect repeatedly.';
  if (rule.includes('interval')) return 'Sort by a meaningful endpoint, then make one local decision at a time. Be explicit about whether touching boundaries count as overlapping.';
  if (rule.includes('prefix')) return 'Store a compact summary of what has been seen so far. Query that summary before updating it so the current item is not accidentally paired with itself.';
  if (rule.includes('tree') || rule.includes('recursive')) return 'Decide what each recursive call returns to its parent. Keep that contract small, and handle empty nodes as a deliberate base case.';
  if (rule.includes('union-find')) return 'Use disjoint sets to track connected components as edges arrive. Path compression and union by rank keep repeated connectivity checks nearly constant time.';
  if (rule.includes('trie')) return 'Represent shared prefixes as shared paths. The structure is useful when many words reuse the same leading characters.';
  if (rule.includes('greedy')) return 'Make the locally best choice only after identifying the exchange argument or invariant that makes the choice safe globally.';
  if (rule.includes('bit')) return 'Reason in binary and use masks or XOR identities to update/check one property at a time. Test zero, sign, and width edge cases.';
  if (rule.includes('hash')) return 'Trade a small amount of memory for fast membership or frequency checks. Define exactly what a stored key means before scanning.';
  return 'Identify the repeated work or hidden structure in the prompt. The recommended approach turns that observation into a clear invariant and avoids unnecessary rescanning.';
}
function syncFilterCount() {
  const count = [filters.topic !== 'All topics',filters.difficulty !== 'Any level',filters.structure !== 'Any data structure',filters.pattern !== 'Any pattern',filters.status !== 'All questions'].filter(Boolean).length;
  document.querySelector('#filter-count').textContent = count ? count : '';
}
function bindEvents() {
  const app = document.querySelector('#app');
  if (app.dataset.eventsBound) return;
  app.dataset.eventsBound = 'true';
  app.addEventListener('click', (e) => {
    const actionTarget = e.target.closest('[data-action]');
    if (actionTarget) handleAction({ currentTarget: actionTarget });
  });
  app.addEventListener('input', (e) => {
    if (e.target.id === 'search') { filters.query = e.target.value.trim(); renderQuestions(); }
  });
  app.addEventListener('change', (e) => {
    if (e.target.id === 'difficulty') filters.difficulty = e.target.value;
    if (e.target.id === 'structure') filters.structure = e.target.value;
    if (e.target.id === 'pattern') filters.pattern = e.target.value;
    if (['difficulty','structure','pattern'].includes(e.target.id)) updateList();
  });
  app.addEventListener('submit', async (e) => {
    if (e.target.id !== 'mark-form') return;
    e.preventDefault();
    await verifyAndMark();
  });
  app.addEventListener('input', (e) => {
    if (e.target.id === 'mark-password') document.querySelector('#mark-error').textContent = '';
  });
}
function updateList() { renderQuestions(); syncFilterCount(); }
function handleAction(e) {
  const button = e.currentTarget;
  const action = button.dataset.action;
  if (action === 'topic') { filters.topic = button.dataset.topic; filters.status = 'All questions'; mobileNavOpen = false; render(); if (innerWidth < 900) document.querySelector('#library').scrollIntoView({behavior:'smooth'}); }
  if (action === 'reset-topic') { filters.topic = 'All topics'; filters.status = 'All questions'; mobileNavOpen = false; render(); }
  if (action === 'set-status') { filters.status = button.dataset.status; filters.topic = 'All topics'; mobileNavOpen = false; render(); }
  if (action === 'toggle-nav') { mobileNavOpen = !mobileNavOpen; render(); }
  if (action === 'toggle-filters') document.querySelector('#filter-panel').classList.toggle('open');
  if (action === 'clear-filters') { filters.topic = 'All topics'; filters.difficulty = 'Any level'; filters.structure = 'Any data structure'; filters.pattern = 'Any pattern'; filters.status = 'All questions'; filters.query = ''; render(); }
  if (action === 'sort') { filters.sort = filters.sort === 'day' ? 'title' : 'day'; renderQuestions(); button.innerHTML = `${filters.sort === 'day' ? 'Day order' : 'Question title'} ${icon('chevron')}`; }
  if (action === 'expand') { expandedId = expandedId === Number(button.dataset.id) ? null : Number(button.dataset.id); renderQuestions(); }
  if (action === 'solve') {
    const id = Number(button.dataset.id);
    if (isSolved(id)) {
      setSolved(id, false); persist(); const pos = window.scrollY; render(); window.scrollTo(0,pos);
    } else {
      pendingMarkId = id;
      document.querySelector('#mark-error').textContent = '';
      document.querySelector('#mark-password').value = '';
      document.querySelector('#mark-dialog').showModal();
      document.querySelector('#mark-password').focus();
    }
  }
  if (action === 'font-up' || action === 'font-down') {
    const change = action === 'font-up' ? 0.05 : -0.05;
    state.fontScale = Math.min(1.2, Math.max(0.9, Math.round((state.fontScale + change) * 100) / 100));
    persist(); applyFontSize();
  }
  if (action === 'bookmark') { const id = Number(button.dataset.id); state.bookmarks = isBookmarked(id) ? state.bookmarks.filter((x) => x !== id) : [...state.bookmarks, id]; persist(); const pos = window.scrollY; render(); window.scrollTo(0,pos); }
  if (action === 'focus-next') { const q = getNextQuestion(); expandedId = q.id; renderQuestions(); document.querySelector(`tr[data-id="${q.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}); }
  if (action === 'sources') document.querySelector('#source-dialog').showModal();
  if (action === 'close-dialog') document.querySelector('#source-dialog').close();
  if (action === 'cancel-mark') { document.querySelector('#mark-dialog').close(); document.querySelector('#mark-password').value = ''; pendingMarkId = null; }
}
async function verifyAndMark() {
  const passwordInput = document.querySelector('#mark-password');
  const error = document.querySelector('#mark-error');
  const submit = document.querySelector('#mark-submit');
  error.textContent = '';
  submit.disabled = true;
  submit.textContent = 'Checking…';
  try {
    const response = await fetch('/api/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pendingMarkId, password: passwordInput.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { error.textContent = result.error || 'Could not verify the password.'; return; }
    const id = pendingMarkId;
    setSolved(id, true);
    persist();
    pendingMarkId = null;
    document.querySelector('#mark-dialog').close();
    passwordInput.value = '';
    const pos = window.scrollY;
    render();
    window.scrollTo(0, pos);
  } catch {
    error.textContent = 'The marking service could not be reached. Run the site with npm run dev or npm run preview.';
  } finally {
    submit.disabled = false;
    submit.innerHTML = `Verify &amp; mark ${icon('check')}`;
  }
}
document.addEventListener('keydown', (e) => { if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); document.querySelector('#search')?.focus(); } if (e.key === 'Escape') { mobileNavOpen = false; pendingMarkId = null; document.querySelector('#source-dialog')?.close(); document.querySelector('#mark-dialog')?.close(); document.querySelector('.shell')?.classList.remove('nav-open'); } });
render();
