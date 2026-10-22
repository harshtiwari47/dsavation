import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import curriculum from './data/questions.json';
import './style.css';

const questions = curriculum.questions.map((row, index) => ({
  topic: row[0], id: Number(row[1]), title: row[2], difficulty: row[3],
  structures: row[4], pattern: row[5], algorithm: row[6], time: row[7], space: row[8], day: index + 1,
}));
const byId = new Map(questions.map((question) => [question.id, question]));
const localDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'D';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function Icon({ name, size = 17 }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m13 5 7 7-7 7"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></>,
    check: <path d="m5 12 4.3 4.3L19 6.8"/>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></>,
    filter: <><path d="M4 7h16M7 12h10M10 17h4"/><circle cx="7" cy="7" r="2"/><circle cx="16" cy="12" r="2"/></>,
    github: <><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.8A5.3 5.3 0 0 0 18.8 5a4.9 4.9 0 0 0-.1-3S17.5 1.7 15 3.4a13.5 13.5 0 0 0-7 0C5.5 1.7 4.3 2 4.3 2a4.9 4.9 0 0 0-.1 3A5.3 5.3 0 0 0 2.8 7.7c0 5.3 3.1 6.5 6.1 6.8A3.4 3.4 0 0 0 8 17.1V22"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

function QuestionRow({ question, solved, solvedAt, bookmarked, expanded, onSolve, onBookmark, onExpand }) {
  return <article className={`question-card ${solved ? 'is-solved' : ''} ${expanded ? 'is-expanded' : ''}`}>
    <div className="question-main">
      <span className="day-number">{String(question.day).padStart(3, '0')}</span>
      <div className="question-copy">
        <div className="question-title-line"><a className="question-title" href={`https://leetcode.com/problems/${question.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">{question.title}</a><span className="lc-number">LC {question.id}</span></div>
        <div className="question-pattern">{question.pattern}{solvedAt && <span className="completion-date"> · solved {new Date(solvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>}</div>
      </div>
      <div className="question-topic"><Pill>{question.topic}</Pill></div>
      <div className="question-level"><span className={`difficulty ${question.difficulty.toLowerCase()}`}><i/>{question.difficulty}</span></div>
      <div className="question-actions">
        <button className={`icon-button solve-button ${solved ? 'complete' : ''}`} onClick={onSolve} aria-label={solved ? 'Remove from personal progress' : 'Mark in personal progress'} title={solved ? 'Remove from personal progress' : 'Personal progress only'}>{solved ? <Icon name="check" size={15}/> : <span className="check-empty"/>}</button>
        <button className={`icon-button bookmark-button ${bookmarked ? 'saved' : ''}`} onClick={onBookmark} aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'} title="Save for review">{bookmarked ? '◆' : '◇'}</button>
        <button className="icon-button expand-button" onClick={onExpand} aria-label={expanded ? 'Hide analysis' : 'Show analysis'}>{expanded ? '−' : '+'}</button>
      </div>
    </div>
    {expanded && <div className="question-analysis">
      <div className="analysis-intro"><span className="micro-label">INTERVIEW NOTES</span><p>{question.algorithm}. Focus on why <strong>{question.pattern.toLowerCase()}</strong> reduces the work compared with a direct approach.</p></div>
      <div className="analysis-metrics"><div><span>DATA STRUCTURE</span><strong>{question.structures}</strong></div><div><span>RECOMMENDED APPROACH</span><strong>{question.algorithm}</strong></div><div><span>TIME</span><strong className="complexity">{question.time}</strong></div><div><span>AUXILIARY SPACE</span><strong className="complexity">{question.space}</strong></div></div>
      <a className="text-link" href={`https://leetcode.com/problems/${question.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">Open problem on LeetCode <Icon name="external" size={13}/></a>
    </div>}
  </article>;
}

function App() {
  const [view, setView] = useState(() => window.location.pathname === '/dashboard' ? 'dashboard' : 'general');
  const [account, setAccount] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [apiNotice, setApiNotice] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('All topics');
  const [difficulty, setDifficulty] = useState('Any level');
  const [structure, setStructure] = useState('Any data structure');
  const [pattern, setPattern] = useState('Any pattern');
  const [sort, setSort] = useState('day');
  const [expandedId, setExpandedId] = useState(null);
  const [progress, setProgress] = useState({});
  const [fontScale, setFontScale] = useState(() => {
    const saved = Number(localStorage.getItem('dsavation-font-scale'));
    return Number.isFinite(saved) && saved >= .9 && saved <= 1.2 ? saved : 1;
  });
  const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem('dsavation-bookmarks') || '[]'));
  const [club, setClub] = useState({ dateKey: localDay(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [] });
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [commitUrl, setCommitUrl] = useState('');
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [assignmentDate, setAssignmentDate] = useState(localDay());
  const [assignmentQuestion, setAssignmentQuestion] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState('');
  const [memberFilter, setMemberFilter] = useState('pending');
  const [memberQuery, setMemberQuery] = useState('');
  const [publicPreferenceBusy, setPublicPreferenceBusy] = useState(false);

  const patterns = useMemo(() => [...new Set(questions.map((item) => item.pattern))].sort((a, b) => a.localeCompare(b)), []);
  const structures = useMemo(() => [...new Set(questions.map((item) => item.structures))].sort((a, b) => a.localeCompare(b)), []);
  const visibleQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = questions.filter((item) => (!needle || `${item.title} ${item.id} ${item.topic} ${item.pattern} ${item.structures} ${item.algorithm}`.toLowerCase().includes(needle)) &&
      (topic === 'All topics' || item.topic === topic) && (difficulty === 'Any level' || item.difficulty === difficulty) &&
      (structure === 'Any data structure' || item.structures === structure) && (pattern === 'Any pattern' || item.pattern === pattern));
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [query, topic, difficulty, structure, pattern, sort]);
  const solvedCount = Object.keys(progress).length;
  const isLeader = account && ['lead', 'admin'].includes(account.role);
  const isAdmin = account?.role === 'admin';
  const assignedQuestion = club.assignment ? byId.get(Number(club.assignment.questionId)) : null;
  const pendingMembers = members.filter((member) => member.approvalStatus !== 'approved');
  const approvedMembers = members.filter((member) => member.approvalStatus === 'approved');
  const displayedMembers = (memberFilter === 'approved' ? approvedMembers : memberFilter === 'all' ? members : pendingMembers)
    .filter((member) => !memberQuery.trim() || `${member.name} ${member.department} ${member.email} ${member.githubUsername}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));

  async function loadClub() {
    try {
      const [today, assigned, board] = await Promise.all([api('/club/today'), api('/club/assignments'), api('/club/leaderboard')]);
      setClub(today);
      setHistory(assigned.assignments || []);
      setLeaderboard(board.leaderboard || []);
      setApiNotice('');
    } catch (error) {
      setApiNotice(error.message.includes('MONGODB_URI') ? 'Community features need the DSAvation database configured.' : error.message);
    }
  }

  async function loadMemberData(user = account) {
    if (!user) return;
    try {
      const [personal, own] = await Promise.all([api('/progress'), api('/submissions')]);
      setProgress(Object.fromEntries((personal.progress || []).map((item) => [item.questionId, item.solvedAt])));
      setSubmissions(own.submissions || []);
    } catch (error) { setNotice(error.message); }
    if (['lead', 'admin'].includes(user.role)) {
      try { const result = await api('/admin/submissions?status=pending'); setPending(result.submissions || []); }
      catch (error) { setPending([]); setNotice(error.message); }
    } else setPending([]);
    if (user.role === 'admin') {
      try { const result = await api('/admin/members'); setMembers(result.members || []); }
      catch (error) { setMembers([]); }
    } else setMembers([]);
  }

  useEffect(() => {
    api('/auth/me').then(({ user }) => setAccount(user)).catch((error) => {
      setApiNotice(error.message.includes('MONGODB_URI') ? 'Connect MongoDB to enable member accounts and club activity.' : 'Member services are temporarily unavailable.');
    }).finally(() => setAuthReady(true));
    loadClub();
    const params = new URLSearchParams(window.location.search);
    if (params.get('github') === 'connected') {
      setNotice('Your GitHub account is linked and verified.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!authReady || window.location.pathname !== '/dashboard' || isAdmin) return;
    window.history.replaceState({}, '', '/');
    setView('general');
    if (account) setNotice('The member dashboard is available to administrators only.');
  }, [authReady, isAdmin]);

  useEffect(() => {
    const onPopState = () => setView(window.location.pathname === '/dashboard' ? 'dashboard' : 'general');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => { if (account) loadMemberData(account); else { setProgress({}); setSubmissions([]); setPending([]); setMembers([]); } }, [account?.id]);

  function navigate(nextView) {
    const path = nextView === 'dashboard' ? '/dashboard' : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    if (nextView === 'dashboard' && account?.role === 'admin') {
      api('/admin/members').then((result) => setMembers(result.members || [])).catch((error) => setNotice(error.message));
    }
  }

  useEffect(() => { localStorage.setItem('dsavation-bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => {
    const shell = document.querySelector('.app-frame');
    if (shell) shell.style.zoom = String(fontScale);
    localStorage.setItem('dsavation-font-scale', String(fontScale));
  }, [fontScale]);

  async function solvePersonal(questionId) {
    if (!account) { setAuthMode('login'); setAuthOpen(true); setAuthError('Sign in to save private progress. This will not affect the club leaderboard.'); return; }
    const solved = !progress[questionId];
    const previous = progress;
    const next = { ...progress };
    if (solved) next[questionId] = new Date().toISOString(); else delete next[questionId];
    setProgress(next);
    try { await api(`/progress/${questionId}`, { method: 'PUT', body: { solved } }); }
    catch (error) { setProgress(previous); setNotice(error.message); }
  }

  function toggleBookmark(questionId) {
    setBookmarks((old) => old.includes(questionId) ? old.filter((id) => id !== questionId) : [...old, questionId]);
  }

  async function submitAuth(event) {
    event.preventDefault(); setAuthError(''); setAuthBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (authMode === 'signup') {
        const result = await api('/auth/register', { method: 'POST', body: {
          name: values.name, department: values.department, email: values.email,
          password: values.password, githubUsername: values.githubUsername,
          showPublic: values.showPublic === 'on',
        } });
        setAuthOpen(false);
        if (result.user) {
          setAccount(result.user);
          setNotice('Administrator account created and approved. Welcome to DSAvation.');
        } else {
          setNotice('Account created. An administrator must approve it before you can sign in.');
        }
      } else {
        const result = await api('/auth/login', { method: 'POST', body: { email: values.email, password: values.password } });
        setAccount(result.user); setAuthOpen(false); setNotice(`Welcome back, ${result.user.name.split(' ')[0]}.`);
      }
    } catch (error) { setAuthError(error.message); }
    finally { setAuthBusy(false); }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* Expired sessions are already signed out. */ }
    setAccount(null); navigate('general'); setNotice('You have signed out.');
  }

  async function submitClubSolution(event) {
    event.preventDefault(); setSubmissionBusy(true); setNotice('');
    try {
      await api('/submissions', { method: 'POST', body: { assignmentId: club.assignment?.id, commitUrl } });
      setCommitUrl(''); setNotice('Commit received. A club lead will review it before it affects the leaderboard.');
      await loadClub(); await loadMemberData();
    } catch (error) { setNotice(error.message); }
    finally { setSubmissionBusy(false); }
  }

  async function publishAssignment(event) {
    event.preventDefault(); setAssignmentBusy(true); setNotice('');
    try {
      const result = await api('/admin/assignments', { method: 'POST', body: { dateKey: assignmentDate, questionId: Number(assignmentQuestion) } });
      setNotice(`Question of the Day published for ${result.assignment.dateKey}.`);
      await loadClub();
    } catch (error) { setNotice(error.message); }
    finally { setAssignmentBusy(false); }
  }

  async function review(item, status) {
    setMemberBusy(item.id); setNotice('');
    try {
      await api(`/admin/submissions/${item.id}`, { method: 'PATCH', body: { status, note: '' } });
      await loadClub(); await loadMemberData();
      setNotice(status === 'accepted' ? 'Submission accepted and added to the club leaderboard.' : 'Submission declined; no points were awarded.');
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function updateRole(member, role) {
    setMemberBusy(member.id);
    try { await api(`/admin/members/${member.id}`, { method: 'PATCH', body: { role } }); setMembers((old) => old.map((item) => item.id === member.id ? { ...item, role } : item)); }
    catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function setMemberApproval(member, approvalStatus) {
    setMemberBusy(member.id);
    try {
      await api(`/admin/members/${member.id}`, { method: 'PATCH', body: { approvalStatus } });
      setMembers((old) => old.map((item) => item.id === member.id ? { ...item, approvalStatus } : item));
      setNotice(approvalStatus === 'approved' ? `${member.name} is approved and can sign in.` : `${member.name}'s access has been suspended.`);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function deleteMember(member) {
    if (!window.confirm(`Delete ${member.name} (${member.email}) and their saved progress and club submissions? This cannot be undone.`)) return;
    setMemberBusy(member.id);
    try {
      await api(`/admin/members/${member.id}`, { method: 'DELETE' });
      setMembers((old) => old.filter((item) => item.id !== member.id));
      setNotice(`${member.name}'s account and personal records were deleted.`);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function updatePublicPreference(showPublic) {
    setPublicPreferenceBusy(true);
    try { const result = await api('/auth/profile', { method: 'PATCH', body: { showPublic } }); setAccount(result.user); await loadClub(); }
    catch (error) { setNotice(error.message); }
    finally { setPublicPreferenceBusy(false); }
  }

  function changeFontSize(amount) {
    setFontScale((value) => Math.max(.9, Math.min(1.2, Math.round((value + amount) * 100) / 100)));
  }

  const clearFilters = () => { setQuery(''); setTopic('All topics'); setDifficulty('Any level'); setStructure('Any data structure'); setPattern('Any pattern'); };

  return <div className="app-frame">
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('general'); }}><span className="brand-mark">D<span>S</span></span><span>DSAvation</span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={view === 'general' ? 'active' : ''} onClick={() => navigate('general')}><Icon name="book" size={15}/>General</button>
        <button className={view === 'progress' ? 'active' : ''} onClick={() => { navigate('progress'); if (!account) { setAuthMode('login'); setAuthOpen(true); } }}><Icon name="check" size={15}/>My progress</button>
        <button className={view === 'club' ? 'active' : ''} onClick={() => navigate('club')}><Icon name="users" size={15}/>Club challenge</button>
        {isAdmin && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><Icon name="users" size={15}/>Dashboard{pendingMembers.length > 0 && <span className="nav-count">{pendingMembers.length}</span>}</button>}
      </nav>
      <div className="account-actions">
        <div className="font-controls" aria-label="Text size controls"><span>TEXT</span><button onClick={() => changeFontSize(-.05)} aria-label="Decrease text size" disabled={fontScale <= .9}>A−</button><output aria-live="polite">{Math.round(fontScale * 100)}%</output><button onClick={() => changeFontSize(.05)} aria-label="Increase text size" disabled={fontScale >= 1.2}>A+</button></div>
        {account ? <><span className="account-name"><span className="avatar">{initials(account.name)}</span><span>{account.name.split(' ')[0]}{account.role !== 'member' && <small>{account.role}</small>}</span></span>{!account.githubVerified && <button className="button button-quiet github-link" onClick={() => { window.location.href = '/api/auth/github/start'; }}><Icon name="github" size={15}/>Link GitHub</button>}<button className="button button-quiet sign-out" onClick={logout}>Sign out</button></> : <button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button>}
      </div>
    </header>

    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    {apiNotice && <div className="system-banner"><Icon name="lock" size={15}/><span>{apiNotice}</span></div>}

    {view === 'general' && <main className="content-shell">
      <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/>ABES TECHNICAL CLUB · DSA PRACTICE</div><h1>Build the instinct.<br/><em>One problem at a time.</em></h1><p className="hero-subtitle">A shared question library for focused practice, personal progress, and the club’s daily challenge.</p></div><div className="hero-index"><span>THE CURRICULUM</span><strong>220</strong><small>INTERVIEW QUESTIONS</small></div></section>

      <section className="overview-grid" aria-label="Club and personal overview">
        <article className="overview-card today-card"><div className="card-kicker"><span className="live-dot"/>QUESTION OF THE DAY <span className="card-count">01</span></div>
          {assignedQuestion ? <><div className="today-date">{club.assignment.dateKey} <span>·</span> {assignedQuestion.topic}</div><h2>{assignedQuestion.title}</h2><div className="today-details"><Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill><span>LeetCode #{assignedQuestion.id}</span><span>Day {assignedQuestion.day} / 220</span></div><div className="club-participation"><strong>{club.acceptedCount}</strong><span>accepted club submissions</span><span className="participation-divider"/><span>{club.submittedCount} submitted</span><button className="text-button" onClick={() => navigate('club')}>View challenge <Icon name="arrow" size={14}/></button></div></> : <div className="empty-assignment"><h2>No question assigned today</h2><p>Club leads can publish the next Question of the Day. Holidays and break days do not count as missed practice.</p></div>}
        </article>
        <article className="overview-card personal-card"><div className="card-kicker">YOUR PRIVATE TRACKER <span className="card-count">02</span></div><div className="personal-stat"><strong>{account ? solvedCount : '—'}</strong><span><b>{account ? `${Math.round((solvedCount / 220) * 100)}%` : 'Personal'}</b><br/>{account ? 'of the 220 questions tracked' : 'progress stays private'}</span></div><div className="personal-track"><i style={{ width: `${account ? Math.min(100, solvedCount / 220 * 100) : 0}%` }}/></div><p>{account ? 'Your manual checkmarks are visible only to you. They never add club points.' : 'Sign in to save which questions you have solved.'}</p><button className="text-button" onClick={() => { navigate('progress'); if (!account) { setAuthMode('login'); setAuthOpen(true); } }}>{account ? 'Open my progress' : 'Sign in to track'} <Icon name="arrow" size={14}/></button></article>
        <article className="overview-card community-card"><div className="card-kicker"><Icon name="users" size={14}/> CLUB PARTICIPATION <span className="card-count">03</span></div><div className="community-figure"><strong>{club.acceptedCount}</strong><span>members accepted today</span></div>{club.participants?.length ? <div className="participant-list">{club.participants.slice(0, 4).map((person) => <span className="participant" key={`${person.githubUsername}-${person.name}`}><i>{initials(person.name)}</i>{person.name.split(' ')[0]}</span>)}{club.participants.length > 4 && <span className="participant-more">+{club.participants.length - 4}</span>}</div> : <p className="privacy-note">Approved members with accepted club submissions appear here; personal checkmarks stay private.</p>}<button className="text-button" onClick={() => navigate('club')}>See the scoreboard <Icon name="arrow" size={14}/></button></article>
      </section>

      <section className="library-section" id="library"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>THE QUESTION LIBRARY</div><h2>Find your next rep<span>.</span></h2></div><span className="question-total">{visibleQuestions.length} <i>/</i> 220 QUESTIONS</span></div>
        <div className="filter-bar"><label className="search-input"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a title, pattern, algorithm or LC number"/><kbd>/</kbd></label><label className="filter-select"><span>TOPIC</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option>All topics</option>{curriculum.topics.map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>LEVEL</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Any level</option>{['Easy', 'Medium', 'Hard'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>DATA STRUCTURE</span><select value={structure} onChange={(event) => setStructure(event.target.value)}><option>Any data structure</option>{structures.map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>PATTERN</span><select value={pattern} onChange={(event) => setPattern(event.target.value)}><option>Any pattern</option>{patterns.map((item) => <option key={item}>{item}</option>)}</select></label><button className="sort-button" onClick={() => setSort((current) => current === 'day' ? 'title' : 'day')}>Sort: {sort === 'day' ? 'Day' : 'Title'} ↕</button></div>
        <div className="library-meta"><span><Icon name="filter" size={14}/>{visibleQuestions.length === questions.length ? 'All 220 questions' : `${visibleQuestions.length} matching questions`}</span>{(query || topic !== 'All topics' || difficulty !== 'Any level' || structure !== 'Any data structure' || pattern !== 'Any pattern') && <button onClick={clearFilters}>Clear filters</button>}<span className="personal-legend"><i/> Personal completion {account ? '' : '· sign in to track'}</span></div>
        <div className="question-list">{visibleQuestions.length ? visibleQuestions.map((question) => <QuestionRow key={question.id} question={question} solved={Boolean(progress[question.id])} solvedAt={progress[question.id]} bookmarked={bookmarks.includes(question.id)} expanded={expandedId === question.id} onSolve={() => solvePersonal(question.id)} onBookmark={() => toggleBookmark(question.id)} onExpand={() => setExpandedId((id) => id === question.id ? null : question.id)}/>) : <div className="no-results"><span>⌕</span><strong>No questions match those filters.</strong><p>Try a different topic, level, or keyword.</p><button onClick={clearFilters}>Reset filters</button></div>}</div>
      </section>
      <footer className="site-footer"><span>DSAvation · ABES technical club</span><span>220 interview questions · curated from Striver and NeetCode</span></footer>
    </main>}

    {view === 'progress' && <main className="content-shell page-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>PRIVATE WORKSPACE</div><h1>My progress<span>.</span></h1><p>Only your manual checkmarks appear here. They do not affect club points or standings.</p></div><div className="metric-card"><strong>{solvedCount}</strong><span>QUESTIONS TRACKED</span></div></div>
      {!account ? <div className="login-prompt"><span className="prompt-icon"><Icon name="lock" size={23}/></span><div><h2>Your progress is private to your account.</h2><p>Sign in to keep a dated record of questions you have solved.</p></div><button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button></div> : <><div className="progress-summary"><article><span>COMPLETED</span><strong>{solvedCount}<small> / 220</small></strong></article><article><span>CURRICULUM COVERED</span><strong>{Math.round(solvedCount / 220 * 100)}<small>%</small></strong></article><article><span>DAILY PRACTICE</span><strong>{new Set(Object.values(progress).map((value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))).size}<small> sessions</small></strong></article><article><span>SAVED FOR REVIEW</span><strong>{bookmarks.length}<small> questions</small></strong></article></div><div className="section-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR COMPLETIONS</div><h2>{solvedCount ? 'Recently tracked' : 'A clean slate'}</h2></div><button className="button button-quiet" onClick={() => { navigate('general'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Browse questions <Icon name="arrow" size={14}/></button></div>{solvedCount ? <div className="question-list">{Object.entries(progress).sort((a, b) => new Date(b[1]) - new Date(a[1])).map(([id, solvedAt]) => byId.get(Number(id)) && ({ question: byId.get(Number(id)), solvedAt })).filter(Boolean).map(({ question, solvedAt }) => <QuestionRow key={question.id} question={question} solved={true} solvedAt={solvedAt} bookmarked={bookmarks.includes(question.id)} expanded={expandedId === question.id} onSolve={() => solvePersonal(question.id)} onBookmark={() => toggleBookmark(question.id)} onExpand={() => setExpandedId((id) => id === question.id ? null : id)}/>)}</div> : <div className="empty-panel"><span>01</span><h2>Your first question starts the record.</h2><p>Use the personal checkmark in the question library when you finish a problem. Club challenge submissions are tracked separately.</p><button className="button button-dark" onClick={() => navigate('general')}>Browse the library <Icon name="arrow" size={14}/></button></div>}</>}
    </main>}

    {view === 'dashboard' && isAdmin && <main className="content-shell page-content dashboard-page">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ADMINISTRATION</div><h1>Member dashboard<span>.</span></h1><p>Review new accounts, manage access, and keep the club roster current.</p></div><div className="metric-card"><strong>{pendingMembers.length}</strong><span>WAITING FOR APPROVAL</span></div></div>
      <div className="approval-notice"><Icon name="lock" size={17}/><p>Email addresses are checked for the <strong>@abes.ac.in</strong> format, but no verification email is sent. Confirm a member’s identity through the club before approving access.</p></div>
      <section className="panel dashboard-members-panel">
        <div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ACCOUNT ACCESS</div><h2>Club accounts <span className="count-badge">{members.length}</span></h2></div><button className="button button-quiet refresh-members" onClick={() => api('/admin/members').then((result) => setMembers(result.members || [])).catch((error) => setNotice(error.message))}>Refresh</button></div>
        <div className="member-dashboard-toolbar"><div className="member-filter-tabs" role="tablist" aria-label="Filter member accounts">{[['pending', `Pending · ${pendingMembers.length}`], ['approved', `Approved · ${approvedMembers.length}`], ['all', `All · ${members.length}`]].map(([key, label]) => <button key={key} role="tab" aria-selected={memberFilter === key} className={memberFilter === key ? 'selected' : ''} onClick={() => setMemberFilter(key)}>{label}</button>)}</div><label className="member-search"><Icon name="search" size={15}/><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search name, email, department"/></label></div>
        {displayedMembers.length ? <div className="dashboard-member-list">{displayedMembers.map((member) => <article className="dashboard-member-row" key={member.id}>
          <span className="avatar">{initials(member.name)}</span>
          <div className="dashboard-member-identity"><div className="member-name-line"><strong>{member.name}</strong><Pill tone={member.approvalStatus === 'approved' ? 'green' : 'amber'}>{member.approvalStatus === 'approved' ? 'Approved' : 'Pending'}</Pill></div><span>{member.email}</span><small>{member.department} · @{member.githubUsername || 'No GitHub username'}</small><small>Joined {member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'date unavailable'}</small></div>
          <div className="dashboard-member-actions">
            <select aria-label={`Role for ${member.name}`} value={member.role} disabled={memberBusy === member.id || member.id === account.id || member.approvalStatus !== 'approved'} onChange={(event) => updateRole(member, event.target.value)}><option value="member">Member</option><option value="lead">Club lead</option><option value="admin">Admin</option></select>
            {member.approvalStatus === 'approved' ? <button className="button button-quiet" disabled={memberBusy === member.id || member.id === account.id} onClick={() => setMemberApproval(member, 'pending')}>De-approve</button> : <button className="button button-green" disabled={memberBusy === member.id} onClick={() => setMemberApproval(member, 'approved')}>{memberBusy === member.id ? 'Saving…' : 'Approve account'} <Icon name="check" size={14}/></button>}
            <button className="button button-danger" disabled={memberBusy === member.id || member.id === account.id} onClick={() => deleteMember(member)}>Delete</button>
          </div>
        </article>)}</div> : <div className="dashboard-empty"><span>{memberFilter === 'pending' && !memberQuery ? '✓' : '⌕'}</span><h2>{memberFilter === 'pending' && !memberQuery ? 'No accounts are waiting.' : 'No accounts match this filter.'}</h2><p>{memberFilter === 'pending' && !memberQuery ? 'New signups will appear here for review.' : 'Try another name, email, or status filter.'}</p></div>}
      </section>
      <footer className="site-footer"><span>DSAvation · account administration</span><span>De-approved accounts lose access immediately</span></footer>
    </main>}

    {view === 'club' && <main className="content-shell page-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>SHARED CLUB CHALLENGE</div><h1>Show up. Ship a solution<span>.</span></h1><p>Only reviewed submissions to a published Question of the Day count toward these standings.</p></div><div className="club-date-badge"><span>INDIA TIME</span><strong>{club.dateKey || localDay()}</strong></div></div>
      <div className="club-grid">
        <div className="club-main-column">
          <section className="panel qotd-panel"><div className="panel-header"><div><div className="eyebrow"><span className="eyebrow-line"/>TODAY'S ASSIGNMENT</div><h2>{assignedQuestion ? assignedQuestion.title : 'No assignment today'}</h2></div>{assignedQuestion && <Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill>}</div>
            {assignedQuestion ? <><div className="assignment-meta"><span>{club.assignment.dateKey}</span><span>{assignedQuestion.topic}</span><span>LeetCode #{assignedQuestion.id}</span><span>{assignedQuestion.pattern}</span></div><p className="assignment-prompt">Club credit is for this published assignment only. The API checks the active date, your linked GitHub identity, the configured club repository, and the question path in your commit.</p><div className="assignment-counts"><div><strong>{club.submittedCount}</strong><span>SUBMITTED</span></div><div><strong>{club.acceptedCount}</strong><span>ACCEPTED</span></div><a href={`https://leetcode.com/problems/${assignedQuestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">Open problem <Icon name="external" size={14}/></a></div>
              {!account ? <div className="inline-callout"><Icon name="lock" size={16}/><span>Sign in with an approved ABES account to submit a club solution.</span><button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in</button></div> : !account.githubVerified ? <div className="inline-callout"><Icon name="github" size={16}/><span>Link the GitHub username you entered during signup before submitting.</span><button onClick={() => { window.location.href = '/api/auth/github/start'; }}>Link GitHub</button></div> : submissions.some((item) => item.assignment?.dateKey === club.assignment.dateKey) ? <div className="inline-callout submitted"><Icon name="check" size={16}/><span>Your submission for today is {submissions.find((item) => item.assignment?.dateKey === club.assignment.dateKey)?.status}.</span></div> : <form className="submission-form" onSubmit={submitClubSolution}><label htmlFor="commit-url">GITHUB COMMIT URL</label><div className="submission-input-row"><input id="commit-url" type="url" required value={commitUrl} onChange={(event) => setCommitUrl(event.target.value)} placeholder="https://github.com/club/repo/commit/…"/><button className="button button-dark" disabled={submissionBusy}>{submissionBusy ? 'Checking…' : 'Submit for review'} <Icon name="arrow" size={14}/></button></div><small>One attempt per member today. Your solution file must be under <code>submissions/{club.assignment.dateKey}/{account.githubUsername.toLowerCase()}/lc-{assignedQuestion.id}/</code>.</small></form>}</> : <div className="no-assignment-note"><p>A club lead has not assigned a question for this date. Unassigned holidays and breaks are excluded from punctuality calculations.</p></div>}
          </section>

          {account && <section className="panel profile-panel"><div className="profile-head"><span className="avatar large">{initials(account.name)}</span><div><h3>{account.name}</h3><p>{account.department} <span>·</span> @{account.githubUsername || 'GitHub not linked'}</p></div><Pill tone={account.role === 'member' ? 'neutral' : 'green'}>{account.role}</Pill></div><label className="privacy-toggle"><input type="checkbox" checked={account.showPublic} disabled={publicPreferenceBusy} onChange={(event) => updatePublicPreference(event.target.checked)}/><span>Show my full name and department publicly; otherwise use only my GitHub username.</span></label></section>}

          {isLeader && <section className="panel leader-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>LEAD TOOLS</div><h2>Publish a Question of the Day</h2></div><Pill tone="green">{account.role}</Pill></div><form className="publish-form" onSubmit={publishAssignment}><label><span>ASSIGNMENT DATE <i>Asia/Kolkata</i></span><input type="date" value={assignmentDate} min={localDay()} onChange={(event) => setAssignmentDate(event.target.value)} required/></label><label className="wide"><span>QUESTION</span><select value={assignmentQuestion} onChange={(event) => setAssignmentQuestion(event.target.value)} required><option value="">Choose from the 220 question curriculum</option>{questions.map((question) => <option key={question.id} value={question.id}>Day {String(question.day).padStart(3, '0')} · LC {question.id} · {question.title}</option>)}</select></label><button className="button button-green" disabled={assignmentBusy || !assignmentQuestion}>{assignmentBusy ? 'Publishing…' : 'Publish assignment'} <Icon name="arrow" size={14}/></button></form><p className="helper-copy">Leave a date unassigned for a holiday or break. An assignment with a submission cannot be changed.</p></section>}

          {isLeader && <section className="panel review-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>MODERATION</div><h2>Submissions to review <span className="count-badge">{pending.length}</span></h2></div></div>{pending.length ? <div className="review-list">{pending.map((item) => <article className="review-item" key={item.id}><div><strong>{item.member?.name || 'Member'} <span>· {item.member?.department}</span></strong><p>{item.assignment?.dateKey} · LC {item.assignment?.questionId} · {item.assignment?.question}</p><div className="review-evidence">{item.verifiedPusher ? <Pill tone="green">PUSH VERIFIED</Pill> : <Pill tone="amber">COMMIT LINK ONLY</Pill>}<a href={item.commitUrl} target="_blank" rel="noreferrer">Review commit <Icon name="external" size={13}/></a></div></div><div className="review-actions"><button className="button button-quiet" disabled={memberBusy === item.id} onClick={() => review(item, 'rejected')}>Decline</button><button className="button button-green" disabled={memberBusy === item.id} onClick={() => review(item, 'accepted')}>Accept <Icon name="check" size={14}/></button></div></article>)}</div> : <div className="soft-empty">No submissions are waiting for review.</div>}</section>}

        </div>

        <aside className="club-side-column"><section className="panel leaderboard-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>CLUB STANDINGS</div><h2><Icon name="trophy" size={18}/> Leaderboard</h2></div><span className="live-tag">LIVE</span></div><p className="leaderboard-note">One point for each accepted Question of the Day. Holidays with no assignment do not count.</p>{leaderboard.length ? <div className="leaderboard-list">{leaderboard.slice(0, 12).map((person, index) => <div className="leaderboard-row" key={person.githubUsername}><span className={`rank ${index < 3 ? `rank-${index + 1}` : ''}`}>{String(index + 1).padStart(2, '0')}</span><span className="avatar">{initials(person.name)}</span><div className="leader-person"><strong>{person.name}</strong><span>{person.department} · {person.punctuality}% punctuality</span></div><strong className="leader-score">{person.points}<small> pts</small></strong></div>)}</div> : <div className="soft-empty">No reviewed club submissions yet. Be first to get on the board.</div>}</section>
          <section className="panel history-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ASSIGNMENT LOG</div><h2>Published days</h2></div><span className="micro-count">{history.length}</span></div>{history.length ? <div className="history-list">{history.slice(0, 8).map((item) => { const question = byId.get(Number(item.questionId)); return <div className="history-row" key={item.id}><span className="history-date">{item.dateKey.slice(5)}</span><span>{question?.title || `LeetCode #${item.questionId}`}</span></div>; })}</div> : <div className="soft-empty">No questions have been assigned yet.</div>}</section>
          {submissions.length > 0 && <section className="panel my-submissions"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR CLUB SUBMISSIONS</div><h2>Review history</h2></div></div>{submissions.slice(0, 5).map((item) => <div className="my-submission" key={item.id}><span>{item.assignment?.dateKey} · LC {item.assignment?.questionId}</span><Pill tone={item.status === 'accepted' ? 'green' : item.status === 'rejected' ? 'red' : 'amber'}>{item.status}</Pill></div>)}</section>}
        </aside>
      </div>
      <footer className="site-footer"><span>DSAvation · ABES technical club</span><span>Club score comes from reviewed submissions only</span></footer>
    </main>}

    {authOpen && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="eyebrow"><span className="eyebrow-line"/>DSAVATION MEMBER ACCESS</div><h2 id="auth-title">{authMode === 'signup' ? 'Create your account' : 'Welcome back'}<span>.</span></h2><p className="auth-lede">{authMode === 'signup' ? 'Use your college email to request access to the private tracker and club challenge. An administrator must approve your account.' : 'Sign in to save private progress and submit to the club challenge.'}</p>
        <form onSubmit={submitAuth} className="auth-form">
          {authMode === 'signup' && <><label>FULL NAME<input name="name" autoComplete="name" required minLength="2" maxLength="80" placeholder="Your name"/></label><label>DEPARTMENT<input name="department" required maxLength="80" placeholder="e.g. Computer Science"/></label><label>ABES EMAIL<input name="email" type="email" autoComplete="email" required pattern=".+@abes\.ac\.in" title="Use your @abes.ac.in email" placeholder="you@abes.ac.in"/></label><label>GITHUB USERNAME<input name="githubUsername" required pattern="[A-Za-z0-9-]{1,39}" placeholder="your-github-handle"/></label><label>PASSWORD<input name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required placeholder="At least 10 characters"/></label><label className="check-label"><input type="checkbox" name="showPublic"/><span>Show my full name and department publicly for accepted club submissions. If unchecked, the public board uses my GitHub username.</span></label></>}
          {authMode === 'login' && <><label>ABES EMAIL<input name="email" type="email" autoComplete="email" required pattern=".+@abes\.ac\.in" placeholder="you@abes.ac.in"/></label><label>PASSWORD<input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label></>}
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="button button-dark auth-submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Request account' : 'Sign in'} <Icon name="arrow" size={14}/></button>
        </form>
        <div className="auth-switch">{authMode === 'signup' ? 'Already a member?' : 'New to DSAvation?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button></div>
        <p className="auth-privacy"><Icon name="lock" size={13}/> Personal checkmarks are private and never count toward the club scoreboard.</p>
      </section></div>}
    <div className={`mobile-bottom-nav ${isAdmin ? 'admin-nav' : ''}`}><button className={view === 'general' ? 'active' : ''} onClick={() => navigate('general')}><Icon name="book" size={17}/>General</button><button className={view === 'progress' ? 'active' : ''} onClick={() => { navigate('progress'); if (!account) { setAuthMode('login'); setAuthOpen(true); } }}><Icon name="check" size={17}/>Progress</button><button className={view === 'club' ? 'active' : ''} onClick={() => navigate('club')}><Icon name="users" size={17}/>Club</button>{isAdmin && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><Icon name="users" size={17}/>Admin</button>}</div>
  </div>;
}

createRoot(document.getElementById('app')).render(<App/>);
