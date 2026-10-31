import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { Icon as IconifyIcon } from '@iconify/react';
import { AVATAR_STYLES, createAvatarDataUri, createAvatarSeeds } from './avatar.js';
import { downloadExplainerImage, copyExplainerImage } from './explainerCard.js';
import { initLiquidGlass } from './liquidGlass.js';
import { AtmosphereBackdrop } from './components/atmosphere/AtmosphereBackdrop.jsx';
import './style.css';

function normalizeQuestions(rows = []) {
  return rows.map((row, index) => ({
    topic: row[0], id: Number(row[1]), title: row[2], difficulty: row[3],
    structures: row[4], pattern: row[5], algorithm: row[6], time: row[7], space: row[8], day: index + 1,
  }));
}
const localDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDay = (dateKey, offset) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const studyYearLabel = (year) => ({ 'first-year': 'First year', 'second-year': 'Second year', 'third-year': 'Third year', 'fourth-year': 'Fourth year', passed: 'Passed out' }[year] || 'Year not provided');
const CLUB_DEPARTMENTS = [
  'Core Team',
  'Technical',
  'Graphics',
  'Event',
  'PR & Outreach',
  'Production',
  'Content',
];
function initialTheme() {
  const theme = localStorage.getItem('dsavation-theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  return theme;
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        'X-Client-Request-Id': requestId,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = payload.error || `Request failed (${response.status}).`;
      console.warn(`[DSAvation API ${response.status}] ${method} /api${path} (ref: ${payload.reqId || requestId}):`, errorMsg);
      const err = new Error(errorMsg);
      err.status = response.status;
      err.payload = payload;
      err.requestId = payload.reqId || requestId;
      throw err;
    }
    return payload;
  } catch (error) {
    if (error.name !== 'AbortError' && !error.status) {
      console.error(`[DSAvation Network Error] ${method} /api${path} (ref: ${requestId}):`, error.message);
    }
    throw error;
  }
}

function Icon({ name, size = 17 }) {
  if (name === 'leetcode') {
    return <IconifyIcon icon="bxl:leetcode" width={size} height={size} />;
  }
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
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
    dice: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><circle cx="15.5" cy="8.5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8.5" cy="15.5" r="1.5"/><circle cx="15.5" cy="15.5" r="1.5"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Pill({ children, tone = '' }) { return <span className={`pill ${tone}`}>{children}</span>; }

function MemberAvatar({ person, style, seed, url, className = '', label = '' }) {
  const avatarStyle = style || person?.avatarStyle || 'critters';
  const customUrl = url || person?.avatarUrl || (avatarStyle === 'custom' ? (seed || person?.avatarSeed) : null);
  const avatarSeed = seed || person?.avatarSeed || person?.id || 'dsavation-member';
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (avatarStyle === 'custom' || customUrl || /^https?:\/\//i.test(String(avatarSeed))) {
      setSrc(customUrl || String(avatarSeed));
      return;
    }
    setSrc('');
    createAvatarDataUri(avatarStyle, avatarSeed).then((dataUri) => {
      if (active) setSrc(dataUri);
    }).catch(() => {});
    return () => { active = false; };
  }, [avatarStyle, avatarSeed, customUrl]);

  if (failed || !src) {
    const fallbackText = (person?.name || label || '?')[0].toUpperCase();
    return <span className={`avatar avatar-image ${className}`} aria-label={label} title={label}>{fallbackText}</span>;
  }

  return <img className={`avatar avatar-image ${className}`} src={src} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)}/>;
}

function ProgressHeatmap({ progress }) {
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);

  const {
    monthsData,
    activeDays,
    activeQuestions,
    currentStreak,
    longestStreak,
  } = useMemo(() => {
    const counts = new Map();
    for (const solvedAt of Object.values(progress || {})) {
      const dateKey = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(solvedAt));
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    }

    const today = localDay();
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    const currentYear = todayDate.getUTCFullYear();
    const currentMonth = todayDate.getUTCMonth();

    // 1. Calculate 12 Months Breakdown
    const mList = [];
    let totalActiveDays = 0;
    let totalQuestionsSolved = 0;

    for (let i = 11; i >= 0; i--) {
      const mDate = new Date(Date.UTC(currentYear, currentMonth - i, 1));
      const year = mDate.getUTCFullYear();
      const monthIndex = mDate.getUTCMonth();
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const monthName = mDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
      const shortMonth = mDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
      const numDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const firstDayOfWeek = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat

      const days = [];
      let totalSolved = 0;
      let monthActiveDays = 0;

      for (let day = 1; day <= numDays; day++) {
        const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
        const inRange = dateKey <= today;
        const count = inRange ? (counts.get(dateKey) || 0) : 0;
        if (count > 0) {
          totalSolved += count;
          monthActiveDays += 1;
        }
        const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
        days.push({
          date: dateKey,
          day,
          dayOfWeek: (firstDayOfWeek + day - 1) % 7,
          count,
          level,
          inRange,
        });
      }

      totalActiveDays += monthActiveDays;
      totalQuestionsSolved += totalSolved;

      mList.push({
        monthKey,
        monthName,
        shortMonth,
        year,
        firstDayOfWeek,
        numDays,
        days,
        totalSolved,
        activeDays: monthActiveDays,
      });
    }

    // 2. Calculate Streaks
    let curStreak = 0;
    let checkDate = today;
    if (!counts.has(checkDate) || counts.get(checkDate) === 0) {
      checkDate = shiftDay(today, -1);
    }
    while (counts.has(checkDate) && counts.get(checkDate) > 0) {
      curStreak++;
      checkDate = shiftDay(checkDate, -1);
    }

    let maxStreak = 0;
    let tempStreak = 0;
    for (let i = 365; i >= 0; i--) {
      const d = shiftDay(today, -i);
      if ((counts.get(d) || 0) > 0) {
        tempStreak++;
        if (tempStreak > maxStreak) maxStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    return {
      monthsData: mList,
      activeDays: totalActiveDays,
      activeQuestions: totalQuestionsSolved,
      currentStreak: curStreak,
      longestStreak: maxStreak,
    };
  }, [progress]);

  // Active month: defaults to the latest month
  const activeMonth = useMemo(() => {
    if (selectedMonthKey) {
      const found = monthsData.find((m) => m.monthKey === selectedMonthKey);
      if (found) return found;
    }
    return monthsData[monthsData.length - 1] || null;
  }, [selectedMonthKey, monthsData]);

  const activeMonthIndex = useMemo(() => {
    if (!activeMonth) return 0;
    const idx = monthsData.findIndex((m) => m.monthKey === activeMonth.monthKey);
    return idx >= 0 ? idx : monthsData.length - 1;
  }, [activeMonth, monthsData]);

  const handlePrevMonth = () => {
    if (activeMonthIndex > 0) {
      setSelectedMonthKey(monthsData[activeMonthIndex - 1].monthKey);
    }
  };

  const handleNextMonth = () => {
    if (activeMonthIndex < monthsData.length - 1) {
      setSelectedMonthKey(monthsData[activeMonthIndex + 1].monthKey);
    }
  };

  return (
    <section className="panel heatmap-panel" aria-labelledby="progress-heatmap-title">
      <div className="panel-heading heatmap-header">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />YOUR PRACTICE HISTORY</div>
          <h2 id="progress-heatmap-title">Question activity</h2>
        </div>
      </div>

      {/* Practice Metrics Strip */}
      <div className="heatmap-stats-strip">
        <div className="heatmap-stat-item">
          <strong>{activeQuestions}</strong>
          <span>Questions Solved</span>
        </div>
        <div className="heatmap-stat-item">
          <strong>{activeDays}</strong>
          <span>Active Days</span>
        </div>
        <div className="heatmap-stat-item">
          <strong>{currentStreak} <small>days</small></strong>
          <span>Current Streak</span>
        </div>
        <div className="heatmap-stat-item">
          <strong>{longestStreak} <small>days</small></strong>
          <span>Longest Streak</span>
        </div>
      </div>

      <p className="heatmap-caption">
        Each square counts questions marked solved that day. This record is private to your account and separate from club points.
      </p>

      {/* Month-wise Heatmap with Navigation Buttons */}
      {activeMonth && (
        <div className="heatmap-month-container">
          {/* Quick Month Selector Tabs */}
          <div className="heatmap-month-selector" role="tablist" aria-label="Select month">
            {monthsData.map((m) => (
              <button
                key={m.monthKey}
                type="button"
                className={`month-tab ${activeMonth.monthKey === m.monthKey ? 'active' : ''}`}
                onClick={() => setSelectedMonthKey(m.monthKey)}
                role="tab"
                aria-selected={activeMonth.monthKey === m.monthKey}
              >
                <span>{m.shortMonth}</span>
                {m.totalSolved > 0 && <span className="month-tab-badge">{m.totalSolved}</span>}
              </button>
            ))}
          </div>

          {/* Single Month Card with Previous / Next Navigation Buttons */}
          <div className="month-detail-card">
            <div className="month-detail-top">
              <div className="month-nav-controls">
                <button
                  type="button"
                  className="month-nav-btn"
                  disabled={activeMonthIndex <= 0}
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  title="Previous month"
                >
                  ‹
                </button>
                <h3>{activeMonth.monthName} {activeMonth.year}</h3>
                <button
                  type="button"
                  className="month-nav-btn"
                  disabled={activeMonthIndex >= monthsData.length - 1}
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  title="Next month"
                >
                  ›
                </button>
              </div>
              <div className="month-detail-totals">
                <span><strong>{activeMonth.totalSolved}</strong> solved</span>
                <span><strong>{activeMonth.activeDays}</strong> active days</span>
              </div>
            </div>

            <div className="month-detail-calendar">
              <div className="month-detail-weekdays">
                <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
              </div>
              <div className="month-detail-grid">
                {Array.from({ length: activeMonth.firstDayOfWeek }).map((_, i) => (
                  <div key={`detail-pad-${i}`} className="month-detail-cell empty" />
                ))}
                {activeMonth.days.map((day) => (
                  <div
                    key={day.date}
                    className={`month-detail-cell level-${day.level} ${day.inRange ? '' : 'outside-range'} ${day.count > 0 ? 'has-activity' : ''}`}
                    title={`${day.count} ${day.count === 1 ? 'question' : 'questions'} on ${day.date}`}
                  >
                    <span className="day-number">{day.day}</span>
                    {day.count > 0 && <span className="day-count-badge">{day.count}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <i key={level} className={`heatmap-cell level-${level}`} title={`Level ${level}`} />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}

function QuestionActionsGuide() {
  return <div className="question-actions-guide" aria-label="Question controls">
    <span><i className="guide-check"><Icon name="check" size={12}/></i>Mark solved for personal progress</span>
    <span><i className="guide-in-progress"><IconifyIcon icon="bi:hourglass" width={13} height={13}/></i>In progress</span>
    <span><i className="guide-expand"><Icon name="arrow" size={12}/></i>Click card to show/hide approach and complexity</span>
  </div>;
}

function QuestionRow({ question, solved, solvedAt, bookmarked, onSolve, onBookmark }) {
  const [expanded, setExpanded] = useState(false);
  const handleCardClick = (e) => {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.question-analysis')) return;
    setExpanded((open) => !open);
  };
  return <article
    className={`question-card fish-card ${solved ? 'is-solved' : ''} ${expanded ? 'is-expanded' : ''}`}
    onClick={handleCardClick}
    role="region"
    aria-expanded={expanded}
  >
    <div className="question-main">
      <span className="day-number">{String(question.day).padStart(3, '0')}</span>
      <div className="question-copy">
        <div className="question-title-line"><a className="question-title" href={`https://leetcode.com/problems/${question.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">{question.title}</a><span className="lc-number">LC {question.id}</span></div>
        <div className="question-pattern">{question.pattern}{solvedAt && <span className="completion-date"> · solved {new Date(solvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>}</div>
      </div>
      <div className="question-topic"><Pill>{question.topic}</Pill></div>
      <div className="question-level"><span className={`difficulty ${question.difficulty.toLowerCase()}`}><i/>{question.difficulty}</span></div>
      <div className="question-actions">
        <button type="button" className={`icon-button solve-button ${solved ? 'complete' : ''}`} onClick={(e) => { e.stopPropagation(); onSolve(); }} aria-label={solved ? 'Remove from personal progress' : 'Mark in personal progress'} title={solved ? 'Remove from personal progress' : 'Mark solved for personal progress'}>{solved ? <Icon name="check" size={15}/> : <span className="check-empty"/>}</button>
        <button type="button" className={`icon-button bookmark-button in-progress-btn ${bookmarked ? 'in-progress-active' : ''}`} onClick={(e) => { e.stopPropagation(); onBookmark(); }} aria-label={bookmarked ? 'Remove from in progress' : 'Mark as in progress'} title={bookmarked ? 'In progress (click to remove)' : 'Mark as in progress'}><IconifyIcon icon="bi:hourglass" width={14} height={14}/></button>
      </div>
    </div>
    {expanded && <div id={`question-analysis-${question.id}`} className="question-analysis">
      <div className="analysis-intro"><span className="micro-label">INTERVIEW NOTES</span><p>{question.algorithm}. Focus on why <strong>{question.pattern.toLowerCase()}</strong> reduces the work compared with a direct approach.</p></div>
      <div className="analysis-metrics"><div><span>DATA STRUCTURE</span><strong>{question.structures}</strong></div><div><span>RECOMMENDED APPROACH</span><strong>{question.algorithm}</strong></div><div><span>TIME</span><strong className="complexity">{question.time}</strong></div><div><span>AUXILIARY SPACE</span><strong className="complexity">{question.space}</strong></div></div>
      <a className="text-link" href={`https://leetcode.com/problems/${question.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">Open problem on LeetCode <Icon name="external" size={13}/></a>
    </div>}
  </article>;
}

function App() {
  const [view, setView] = useState(() => window.location.pathname === '/dashboard' ? 'dashboard' : window.location.pathname === '/members' ? 'members' : window.location.pathname === '/reset-password' ? 'reset-password' : 'general');
  const [account, setAccount] = useState(null);
  const [theme, setTheme] = useState(initialTheme);
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
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
  const [progress, setProgress] = useState({});
  const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem('dsavation-bookmarks') || '[]'));
  const [club, setClub] = useState({ dateKey: localDay(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [], dailyLeaderboard: [] });
  const [history, setHistory] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardScope, setLeaderboardScope] = useState('daily');
  const [submissions, setSubmissions] = useState([]);
  const [pending, setPending] = useState([]);
  const [pendingPagination, setPendingPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [todaySubmissionsData, setTodaySubmissionsData] = useState({ totalAttempted: 0, totalNotAttempted: 0, acceptedCount: 0, pendingCount: 0, submissions: [], notAttempted: [], questionId: null, questionTitle: '' });
  const [todaySubmissionsBusy, setTodaySubmissionsBusy] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersPagination, setMembersPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [memberCounts, setMemberCounts] = useState({ pending: 0, approved: 0 });
  const [directoryMembers, setDirectoryMembers] = useState([]);
  const [directoryDepartments, setDirectoryDepartments] = useState([]);
  const [directoryPagination, setDirectoryPagination] = useState({ page: 1, pageSize: 60, total: 0, totalPages: 1 });
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryDepartment, setDirectoryDepartment] = useState('');
  const [directoryYear, setDirectoryYear] = useState('');
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryLeetcodeStats, setDirectoryLeetcodeStats] = useState({});
  const [leetcodeStatsBusy, setLeetcodeStatsBusy] = useState('');
  const [avatarDraftStyle, setAvatarDraftStyle] = useState('critters');
  const [avatarDraftSeed, setAvatarDraftSeed] = useState('');
  const [avatarDraftCustomUrl, setAvatarDraftCustomUrl] = useState('');
  const [customUrlStatus, setCustomUrlStatus] = useState({ valid: false, type: 'neutral', message: 'Enter a public direct image link (PNG, JPG, WebP, SVG).' });
  const [avatarChoices, setAvatarChoices] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activityPagination, setActivityPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [scoredSubmissions, setScoredSubmissions] = useState([]);
  const [scoredPagination, setScoredPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [leaderboardPagination, setLeaderboardPagination] = useState({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  const [historyPagination, setHistoryPagination] = useState({ page: 1, pageSize: 8, total: 0, totalPages: 1 });
  const [resetLink, setResetLink] = useState(null);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [commitUrl, setCommitUrl] = useState('');
  const [accountSubmissionMethod, setAccountSubmissionMethod] = useState(() => account?.defaultSubmissionMethod || 'github');
  const [submissionHelpOpen, setSubmissionHelpOpen] = useState(false);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [assignmentDate, setAssignmentDate] = useState(localDay());
  const [assignmentQuestion, setAssignmentQuestion] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [selectedExplainer, setSelectedExplainer] = useState(null);
  const [explainerModalOpen, setExplainerModalOpen] = useState(false);
  const [imageExporting, setImageExporting] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [memberBusy, setMemberBusy] = useState('');
  const [memberFilter, setMemberFilter] = useState('pending');
  const [memberQuery, setMemberQuery] = useState('');
  const [publicPreferenceBusy, setPublicPreferenceBusy] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState('attempted');
  const [exportStudyYear, setExportStudyYear] = useState('all');
  const [exportDepartment, setExportDepartment] = useState('all');

  useEffect(() => {
    if (!account) return;
    const isCustom = account.avatarStyle === 'custom' || /^https?:\/\//i.test(String(account.avatarSeed || '')) || Boolean(account.avatarUrl);
    const style = isCustom ? 'custom' : (account.avatarStyle || 'critters');
    const customUrl = account.avatarUrl || (isCustom ? account.avatarSeed : '');
    const seed = account.avatarSeed || account.id;
    const choices = createAvatarSeeds();
    if (!isCustom) choices[0] = seed;
    setAvatarDraftStyle(style);
    setAvatarDraftSeed(isCustom ? (customUrl || seed) : seed);
    setAvatarDraftCustomUrl(customUrl || '');
    setAvatarChoices(choices);
    if (account.defaultSubmissionMethod) {
      setAccountSubmissionMethod(account.defaultSubmissionMethod);
    }
  }, [account?.id, account?.defaultSubmissionMethod]);

  const byId = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const patterns = useMemo(() => [...new Set(questions.map((item) => item.pattern))].sort((a, b) => a.localeCompare(b)), [questions]);
  const structures = useMemo(() => [...new Set(questions.map((item) => item.structures))].sort((a, b) => a.localeCompare(b)), [questions]);
  const visibleQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = questions.filter((item) => (!needle || `${item.title} ${item.id} ${item.topic} ${item.pattern} ${item.structures} ${item.algorithm}`.toLowerCase().includes(needle)) &&
      (topic === 'All topics' || item.topic === topic) && (difficulty === 'Any level' || item.difficulty === difficulty) &&
      (structure === 'Any data structure' || item.structures === structure) && (pattern === 'Any pattern' || item.pattern === pattern));
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [questions, query, topic, difficulty, structure, pattern, sort]);
  const solvedCount = Object.keys(progress).length;
  const personalStreak = useMemo(() => {
    const solvedDays = new Set(Object.values(progress).map((value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))));
    const orderedDays = [...solvedDays].sort();
    let best = 0;
    let run = 0;
    let previous = '';
    for (const day of orderedDays) {
      run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    }
    let cursor = solvedDays.has(localDay()) ? localDay() : shiftDay(localDay(), -1);
    let current = 0;
    while (solvedDays.has(cursor)) {
      current += 1;
      cursor = shiftDay(cursor, -1);
    }
    return { current, best };
  }, [progress]);
  const isLeader = account && ['lead', 'admin'].includes(account.role);
  const isAdmin = account?.role === 'admin';
  const editingTodayAssignment = club.assignment?.dateKey === localDay();
  const assignedQuestion = club.assignment ? byId.get(Number(club.assignment.questionId)) : null;
  const pendingMembers = members.filter((member) => member.approvalStatus !== 'approved');
  const approvedMembers = members.filter((member) => member.approvalStatus === 'approved');
  const displayedMembers = (memberFilter === 'approved' ? approvedMembers : memberFilter === 'all' ? members : pendingMembers)
    .filter((member) => !memberQuery.trim() || `${member.name} ${member.department} ${member.email} ${member.githubUsername}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));

  async function loadClub() {
    try {
      const [today, assigned, board] = await Promise.all([
        api('/club/today'),
        api(`/club/assignments?page=${historyPagination.page}&pageSize=8`),
        api(`/club/leaderboard?page=${leaderboardPagination.page}&pageSize=12`),
      ]);
      setClub(today);
      setHistory(assigned.assignments || []);
      setHistoryPagination(assigned.pagination || { page: 1, pageSize: 8, total: 0, totalPages: 1 });
      setLeaderboard(board.leaderboard || []);
      setLeaderboardPagination(board.pagination || { page: 1, pageSize: 12, total: 0, totalPages: 1 });
      setApiNotice('');
    } catch (error) {
      setApiNotice(error.message.includes('MONGODB_URI') ? 'Community features need the DSAvation database configured.' : error.message);
    }
  }

  async function loadQuestionLibrary(signal) {
    const result = await api('/questions', { signal });
    setQuestions(normalizeQuestions(result.questions));
    setTopics(result.topics || []);
  }

  async function loadMemberData(user = account) {
    if (!user) return;
    try {
      const [personal, own] = await Promise.all([api('/progress'), api('/submissions?page=1&pageSize=10')]);
      setProgress(Object.fromEntries((personal.progress || []).map((item) => [item.questionId, item.solvedAt])));
      setSubmissions(own.submissions || []);
    } catch (error) { setNotice(error.message); }
    if (['lead', 'admin'].includes(user.role)) {
      try {
        const [pendingResult, todayResult] = await Promise.all([
          api(`/admin/submissions?status=pending&page=${pendingPagination.page}&pageSize=10`),
          api('/admin/today-submissions'),
        ]);
        setPending(pendingResult.submissions || []);
        setPendingPagination(pendingResult.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
        setTodaySubmissionsData(todayResult || { totalAttempted: 0, acceptedCount: 0, pendingCount: 0, submissions: [] });
      } catch (error) {
        setPending([]);
        setTodaySubmissionsData({ totalAttempted: 0, acceptedCount: 0, pendingCount: 0, submissions: [] });
        setNotice(error.message);
      }
    } else {
      setPending([]);
      setPendingPagination({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
      setTodaySubmissionsData({ totalAttempted: 0, acceptedCount: 0, pendingCount: 0, submissions: [] });
    }
    if (user.role === 'admin') {
      try {
        const query = new URLSearchParams({ page: String(membersPagination.page), pageSize: '20', status: memberFilter });
        if (memberQuery.trim()) query.set('q', memberQuery.trim());
        const [memberResult, scoredResult, activityResult] = await Promise.all([
          api(`/admin/members?${query}`),
          api('/admin/submissions?status=accepted&page=1&pageSize=10'),
          api('/admin/activity?page=1&pageSize=10'),
        ]);
        setMembers(memberResult.members || []);
        setMembersPagination(memberResult.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
        setMemberCounts(memberResult.counts || { pending: 0, approved: 0 });
        setScoredSubmissions(scoredResult.submissions || []);
        setScoredPagination(scoredResult.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
        setActivity(activityResult.activity || []);
        setActivityPagination(activityResult.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
      } catch (error) { setMembers([]); setScoredSubmissions([]); setActivity([]); setNotice(error.message); }
    } else { setMembers([]); setScoredSubmissions([]); setActivity([]); }
  }

  async function refreshMembers(page = 1, status = memberFilter, search = memberQuery) {
    const params = new URLSearchParams({ page: String(page), pageSize: '20', status });
    if (search.trim()) params.set('q', search.trim());
    try {
      const result = await api(`/admin/members?${params}`);
      if (!(result.members || []).length && page > 1 && page > (result.pagination?.totalPages || 1)) {
        return refreshMembers(result.pagination?.totalPages || 1, status, search);
      }
      setMembers(result.members || []);
      setMembersPagination(result.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      setMemberCounts(result.counts || { pending: 0, approved: 0 });
    } catch (error) { setNotice(error.message); }
  }

  async function loadDirectory(page = 1, search = directoryQuery, department = directoryDepartment, year = directoryYear) {
    setDirectoryBusy(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '60' });
    if (search.trim()) params.set('q', search.trim());
    if (department) params.set('department', department);
    if (year) params.set('year', year);
    try {
      const result = await api(`/members?${params}`);
      setDirectoryMembers(result.members || []);
      setDirectoryDepartments(result.departments || []);
      setDirectoryPagination(result.pagination || { page: 1, pageSize: 60, total: 0, totalPages: 1 });
    } catch (error) {
      setDirectoryMembers([]);
      setNotice(error.message);
    } finally { setDirectoryBusy(false); }
  }

  async function loadDirectoryLeetcodeStats(member) {
    if (!member.leetcodeUsername || leetcodeStatsBusy) return;
    setLeetcodeStatsBusy(member.id);
    try {
      const result = await api(`/members/${member.id}/leetcode-stats`);
      setDirectoryLeetcodeStats((current) => ({ ...current, [member.id]: result }));
    } catch (error) {
      setDirectoryLeetcodeStats((current) => ({ ...current, [member.id]: { available: false, reason: error.message } }));
    } finally { setLeetcodeStatsBusy(''); }
  }

  function isValidHttpUrl(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (avatarDraftStyle !== 'custom') return;
    const trimmed = avatarDraftCustomUrl.trim();
    if (!trimmed) {
      setCustomUrlStatus({ valid: false, type: 'neutral', message: 'Paste a direct link to a PNG, JPG, WebP, or SVG image.' });
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setCustomUrlStatus({ valid: false, type: 'error', message: 'Invalid URL. Must start with http:// or https://' });
      return;
    }
    let active = true;
    setCustomUrlStatus({ valid: false, type: 'loading', message: 'Validating image URL…' });
    const img = new Image();
    img.onload = () => {
      if (active) setCustomUrlStatus({ valid: true, type: 'success', message: 'Valid image verified ✓' });
    };
    img.onerror = () => {
      if (active) setCustomUrlStatus({ valid: false, type: 'error', message: 'Image failed to load. Make sure the link is public and direct to an image.' });
    };
    img.src = trimmed;
    return () => { active = false; };
  }, [avatarDraftCustomUrl, avatarDraftStyle]);

  function chooseAvatarStyle(style) {
    setAvatarDraftStyle(style);
    if (style === 'custom') {
      const url = avatarDraftCustomUrl || (typeof account?.avatarSeed === 'string' && /^https?:\/\//i.test(account.avatarSeed) ? account.avatarSeed : '');
      setAvatarDraftCustomUrl(url);
      setAvatarDraftSeed(url || 'custom-avatar');
    } else {
      const choices = createAvatarSeeds();
      setAvatarDraftSeed(choices[0]);
      setAvatarChoices(choices);
    }
  }

  function shuffleAvatarChoices() {
    if (avatarDraftStyle === 'custom') return;
    const choices = createAvatarSeeds();
    setAvatarDraftSeed(choices[0]);
    setAvatarChoices(choices);
  }

  async function refreshActivity(page = 1) {
    try {
      const result = await api(`/admin/activity?page=${page}&pageSize=10`);
      setActivity(result.activity || []);
      setActivityPagination(result.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
  }

  async function refreshScoredSubmissions(page = 1) {
    try {
      const result = await api(`/admin/submissions?status=accepted&page=${page}&pageSize=10`);
      setScoredSubmissions(result.submissions || []);
      setScoredPagination(result.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
  }

  async function refreshPendingSubmissions(page = 1) {
    try {
      const result = await api(`/admin/submissions?status=pending&page=${page}&pageSize=10`);
      setPending(result.submissions || []);
      setPendingPagination(result.pagination || { page, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
  }

  async function refreshTodaySubmissions() {
    if (!isLeader) return;
    setTodaySubmissionsBusy(true);
    try {
      const result = await api('/admin/today-submissions');
      setTodaySubmissionsData(result || { totalAttempted: 0, acceptedCount: 0, pendingCount: 0, submissions: [] });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setTodaySubmissionsBusy(false);
    }
  }

  const exportPool = useMemo(() => {
    let pool = [];
    if (exportTarget === 'not_attempted') {
      pool = todaySubmissionsData.notAttempted || [];
    } else if (exportTarget === 'all') {
      pool = [...(todaySubmissionsData.submissions || []), ...(todaySubmissionsData.notAttempted || [])];
    } else {
      pool = todaySubmissionsData.submissions || [];
    }
    if (exportStudyYear !== 'all') {
      pool = pool.filter((s) => s.studyYear === exportStudyYear);
    }
    if (exportDepartment !== 'all') {
      pool = pool.filter((s) => s.department === exportDepartment);
    }
    return pool;
  }, [exportTarget, exportStudyYear, exportDepartment, todaySubmissionsData]);

  const matchingExportCount = exportPool.length;

  function executeExportCsv() {
    if (!exportPool.length) {
      setNotice('No members match the selected filter criteria.');
      return;
    }
    const escapeCsv = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
    // LeetCode Username is removed as requested
    const headers = ['Name', 'Email', 'Club Department', 'Year of Study', 'GitHub Username', 'Question ID', 'Status', 'Points', 'Commit URL', 'Submitted At (IST)'];
    const rows = exportPool.map((s) => {
      const formattedStatus = s.status === 'not_attempted'
        ? 'Not Attempted'
        : (s.status ? (s.status.charAt(0).toUpperCase() + s.status.slice(1)) : 'Not Attempted');
      return [
        escapeCsv(s.name),
        escapeCsv(s.email),
        escapeCsv(s.department),
        escapeCsv(studyYearLabel(s.studyYear) || s.studyYear || '—'),
        escapeCsv(s.githubUsername || '—'),
        s.questionId || todaySubmissionsData.questionId || club.assignment?.questionId || '—',
        formattedStatus,
        s.points ?? 0,
        escapeCsv(s.commitUrl || '—'),
        escapeCsv(s.submittedAt ? new Date(s.submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—'),
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const yearPart = exportStudyYear !== 'all' ? `-${exportStudyYear}` : '';
    const deptPart = exportDepartment !== 'all' ? `-${exportDepartment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
    link.setAttribute('download', `dsavation-${exportTarget}${yearPart}${deptPart}-${todaySubmissionsData.dateKey || localDay()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportModalOpen(false);
    setNotice(`Exported ${exportPool.length} member${exportPool.length === 1 ? '' : 's'} to CSV.`);
  }

  const [pickExplainerBusy, setPickExplainerBusy] = useState(false);

  async function handlePickRandomExplainer() {
    const locked = club.assignment?.explainer || todaySubmissionsData.explainer;
    if (locked) {
      setSelectedExplainer(locked);
      setExplainerModalOpen(true);
      return;
    }
    setPickExplainerBusy(true);
    try {
      const res = await api('/admin/pick-explainer', { method: 'POST' });
      if (res.explainer) {
        setSelectedExplainer(res.explainer);
        setClub((prev) => ({
          ...prev,
          assignment: prev.assignment ? { ...prev.assignment, explainer: res.explainer } : prev.assignment,
        }));
        setTodaySubmissionsData((prev) => ({ ...prev, explainer: res.explainer }));
        setExplainerModalOpen(true);
        if (res.isNew) {
          setNotice(`Selected ${res.explainer.name} as today's solution explainer!`);
        }
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setPickExplainerBusy(false);
    }
  }

  async function handleDownloadExplainerImage() {
    if (!selectedExplainer || imageExporting) return;
    setImageExporting(true);
    try {
      await downloadExplainerImage({
        explainer: selectedExplainer,
        question: assignedQuestion || { id: selectedExplainer.questionId, title: selectedExplainer.questionTitle },
        dateKey: club.assignment?.dateKey || localDay(),
      });
      setNotice('Explainer spotlight card downloaded!');
    } catch (err) {
      setNotice(`Image download failed: ${err.message}`);
    } finally {
      setImageExporting(false);
    }
  }

  async function handleCopyExplainerImage() {
    if (!selectedExplainer || imageExporting) return;
    setImageExporting(true);
    try {
      const res = await copyExplainerImage({
        explainer: selectedExplainer,
        question: assignedQuestion || { id: selectedExplainer.questionId, title: selectedExplainer.questionTitle },
        dateKey: club.assignment?.dateKey || localDay(),
      });
      if (res === 'copied') {
        setCopiedNotice(true);
        setTimeout(() => setCopiedNotice(false), 2500);
      } else {
        setNotice('Spotlight card image saved to your device!');
      }
    } catch (err) {
      setNotice(`Copy failed: ${err.message}`);
    } finally {
      setImageExporting(false);
    }
  }

  async function loadLeaderboardPage(page) {
    try {
      const result = await api(`/club/leaderboard?page=${page}&pageSize=12`);
      setLeaderboard(result.leaderboard || []);
      setLeaderboardPagination(result.pagination || { page, pageSize: 12, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
  }

  async function loadHistoryPage(page) {
    try {
      const result = await api(`/club/assignments?page=${page}&pageSize=8`);
      setHistory(result.assignments || []);
      setHistoryPagination(result.pagination || { page, pageSize: 8, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
  }

  useEffect(() => {
    const cleanup = initLiquidGlass();
    return cleanup;
  }, []);

  // Auto-dismiss transient notice toast after 6.5s
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    api('/auth/me').then(({ user }) => setAccount(user)).catch((error) => {
      setApiNotice(error.message.includes('MONGODB_URI') ? 'Connect MongoDB to enable member accounts and club activity.' : 'Member services are temporarily unavailable.');
    }).finally(() => setAuthReady(true));
    const params = new URLSearchParams(window.location.search);
    if (params.get('github') === 'connected') {
      setNotice('Your GitHub account is linked and verified.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/reset-password' && window.location.search) {
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
    const onPopState = () => setView(window.location.pathname === '/dashboard' ? 'dashboard' : window.location.pathname === '/members' ? 'members' : window.location.pathname === '/reset-password' ? 'reset-password' : 'general');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (view === 'members' && account) loadDirectory(1);
  }, [view, account?.id]);

  useEffect(() => {
    if (!authReady) return undefined;
    if (!account) {
      setQuestions([]); setTopics([]); setProgress({}); setSubmissions([]); setPending([]); setMembers([]); setDirectoryMembers([]);
      setHistory([]); setLeaderboard([]);
      setClub({ dateKey: localDay(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [] });
      setAppLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    const startTime = Date.now();
    setAppLoading(true);
    Promise.allSettled([
      loadQuestionLibrary(controller.signal).catch((error) => {
        if (error.name !== 'AbortError') setNotice(error.message);
      }),
      loadMemberData(account),
      loadClub(),
    ]).finally(() => {
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 550;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      setTimeout(() => {
        if (active) setAppLoading(false);
      }, remaining);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [authReady, account?.id]);

  function navigate(nextView) {
    const path = nextView === 'dashboard' ? '/dashboard' : nextView === 'members' ? '/members' : nextView === 'reset-password' ? '/reset-password' : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    if (nextView === 'dashboard' && account?.role === 'admin') refreshMembers(1, memberFilter, memberQuery);
  }

  useEffect(() => { localStorage.setItem('dsavation-bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('dsavation-theme', theme);
  }, [theme]);
  useLayoutEffect(() => {
    localStorage.removeItem('dsavation-font-scale');
    document.documentElement.style.fontSize = '';
  }, []);

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
          studyYear: values.studyYear, password: values.password, githubUsername: values.githubUsername, leetcodeUsername: values.leetcodeUsername,
          showPublic: true,
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
      const result = await api('/submissions', { method: 'POST', body: { assignmentId: club.assignment?.id, commitUrl } });
      setCommitUrl(''); setSubmissionHelpOpen(false); setNotice(`GitHub verified your solution. ${result.submission?.points ?? 1} point${(result.submission?.points ?? 1) === 1 ? '' : 's'} added to the club leaderboard.`);
      await loadClub(); await loadHistoryPage(1); await loadMemberData();
    } catch (error) { setNotice(error.message); }
    finally { setSubmissionBusy(false); }
  }

  async function submitLeetCodeSolution(event) {
    if (event) event.preventDefault();
    setSubmissionBusy(true);
    setNotice('');
    try {
      const result = await api('/submissions', {
        method: 'POST',
        body: { assignmentId: club.assignment?.id, type: 'leetcode' },
      });
      setNotice(`LeetCode verified your solution! ${result.submission?.points ?? 1} point${(result.submission?.points ?? 1) === 1 ? '' : 's'} added to the club leaderboard.`);
      await loadClub();
      await loadHistoryPage(1);
      await loadMemberData();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSubmissionBusy(false);
    }
  }

  async function publishAssignment(event) {
    event.preventDefault(); setAssignmentBusy(true); setNotice('');
    try {
      const isReplacingToday = club.assignment?.dateKey === localDay() && assignmentDate === localDay();
      const result = isReplacingToday
        ? await api(`/admin/assignments/${club.assignment.id}`, { method: 'PATCH', body: { questionId: Number(assignmentQuestion) } })
        : await api('/admin/assignments', { method: 'POST', body: { dateKey: assignmentDate, questionId: Number(assignmentQuestion) } });
      setNotice(isReplacingToday
        ? `Today's question was changed. ${result.assignment.invalidatedSubmissions || 0} previous submission(s) were invalidated; members can submit the corrected question.`
        : `Question of the Day published for ${result.assignment.dateKey}.`);
      await loadClub(); await loadHistoryPage(1); await loadMemberData();
      await refreshActivity(activityPagination.page);
    } catch (error) { setNotice(error.message); }
    finally { setAssignmentBusy(false); }
  }

  async function deleteTodayAssignment() {
    if (!club.assignment?.id || assignmentBusy) return;
    const confirmMsg = `Are you sure you want to delete today's Question of the Day (LC #${club.assignment.questionId})?\n\nThis will remove today's question assignment and any submissions tied to it.`;
    if (!window.confirm(confirmMsg)) return;
    setAssignmentBusy(true);
    setNotice('');
    try {
      await api(`/admin/assignments/${club.assignment.id}`, { method: 'DELETE' });
      setNotice('Today’s Question of the Day was deleted.');
      setExplainerModalOpen(false);
      setSelectedExplainer(null);
      setAssignmentQuestion('');
      await loadClub();
      await loadHistoryPage(1);
      await loadMemberData();
      await refreshTodaySubmissions();
      await refreshActivity(activityPagination.page);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function review(item, status) {
    setMemberBusy(item.id); setNotice('');
    try {
      await api(`/admin/submissions/${item.id}`, { method: 'PATCH', body: { status, note: '' } });
      await loadClub(); await loadMemberData(); await refreshPendingSubmissions(1); await refreshTodaySubmissions();
      await refreshActivity(activityPagination.page);
      setNotice(status === 'accepted' ? 'Submission accepted and added to the club leaderboard.' : 'Submission declined; no points were awarded.');
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function updateRole(member, role) {
    setMemberBusy(member.id);
    try { await api(`/admin/members/${member.id}`, { method: 'PATCH', body: { role } }); setMembers((old) => old.map((item) => item.id === member.id ? { ...item, role } : item)); await refreshActivity(activityPagination.page); }
    catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function setMemberApproval(member, approvalStatus) {
    setMemberBusy(member.id);
    try {
      await api(`/admin/members/${member.id}`, { method: 'PATCH', body: { approvalStatus } });
      setMembers((old) => old.map((item) => item.id === member.id ? { ...item, approvalStatus } : item));
      setNotice(approvalStatus === 'approved' ? `${member.name} is approved and can sign in.` : `${member.name}'s access has been suspended.`);
      await refreshMembers(membersPagination.page); await refreshActivity(activityPagination.page);
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
      await refreshMembers(membersPagination.page); await refreshActivity(activityPagination.page);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function updatePublicPreference(showPublic) {
    setPublicPreferenceBusy(true);
    try { const result = await api('/auth/profile', { method: 'PATCH', body: { showPublic } }); setAccount(result.user); await loadClub(); }
    catch (error) { setNotice(error.message); }
    finally { setPublicPreferenceBusy(false); }
  }

  async function saveProfile(event) {
    event.preventDefault(); setProfileBusy(true); setNotice('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (avatarDraftStyle === 'custom') {
      const trimmedUrl = avatarDraftCustomUrl.trim();
      if (!isValidHttpUrl(trimmedUrl)) {
        setNotice('Please enter a valid image URL starting with http:// or https://');
        setProfileBusy(false);
        return;
      }
    }
    try {
      const result = await api('/auth/profile', { method: 'PATCH', body: {
        name: values.name, department: values.department, studyYear: values.studyYear,
        githubUsername: values.githubUsername, leetcodeUsername: values.leetcodeUsername,
        defaultSubmissionMethod: values.defaultSubmissionMethod || 'github',
        avatarStyle: avatarDraftStyle,
        avatarSeed: avatarDraftStyle === 'custom' ? avatarDraftCustomUrl.trim() : avatarDraftSeed,
        avatarUrl: avatarDraftStyle === 'custom' ? avatarDraftCustomUrl.trim() : '',
      } });
      setAccount(result.user);
      if (result.user.defaultSubmissionMethod) {
        setAccountSubmissionMethod(result.user.defaultSubmissionMethod);
      }
      setNotice(result.user.githubVerified ? 'Your account details were saved.' : 'Details saved. Re-link your GitHub account to verify the updated username.');
    } catch (error) { setNotice(error.message); }
    finally { setProfileBusy(false); }
  }

  async function disconnectGithub() {
    if (!window.confirm('Disconnect GitHub from DSAvation? Existing submissions and points stay in your account. This does not sign you out of github.com.')) return;
    setProfileBusy(true); setNotice('');
    try {
      const result = await api('/auth/github', { method: 'DELETE', body: {} });
      setAccount(result.user);
      setNotice('GitHub was disconnected from DSAvation. Reconnect any time to submit club solutions.');
    } catch (error) { setNotice(error.message); }
    finally { setProfileBusy(false); }
  }

  async function generateResetLink(member) {
    setMemberBusy(member.id);
    try {
      const result = await api(`/admin/members/${member.id}/password-reset`, { method: 'POST', body: {} });
      setResetLink({ name: member.name, url: result.resetUrl, expiresAt: result.expiresAt });
      await refreshActivity(activityPagination.page);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function adjustPoints(item, points) {
    setMemberBusy(item.id);
    try {
      await api(`/admin/submissions/${item.id}`, { method: 'PATCH', body: { points: Number(points), note: 'Adjusted by an administrator.' } });
      await loadClub(); await refreshScoredSubmissions(scoredPagination.page); await refreshActivity(activityPagination.page);
      setNotice(`Points updated for ${item.member?.name || 'the member'}.`);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function completePasswordReset(event) {
    event.preventDefault(); setResetBusy(true); setResetError('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (values.password !== values.confirmPassword) { setResetError('The passwords do not match.'); setResetBusy(false); return; }
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token: resetToken, password: values.password } });
      setResetToken(''); window.history.replaceState({}, '', '/'); setView('general');
      setNotice('Password changed. Sign in with your new password.'); setAuthMode('login'); setAuthOpen(true);
    } catch (error) { setResetError(error.message); }
    finally { setResetBusy(false); }
  }

  async function copyResetLink() {
    try { await navigator.clipboard.writeText(resetLink.url); setNotice('One-time reset link copied. Share it with the member before it expires.'); }
    catch { setNotice('Select the reset link and copy it manually.'); }
  }

  const clearFilters = () => { setQuery(''); setTopic('All topics'); setDifficulty('Any level'); setStructure('Any data structure'); setPattern('Any pattern'); };

  return <div className="app-frame">
    <AtmosphereBackdrop />
    {appLoading && (
      <aside className="global-loader-hud" role="status" aria-live="polite" aria-label="Loading DSAvation">
        <div className="global-loader-scrim" />
        <div className="global-loading" role="progressbar" aria-label="Loading DSAvation" aria-valuetext="Loading">
          <span />
        </div>
        <div className="global-loader-card">
          <img src="/loading-bot.png" alt="DSAvation Mascot Bot" className="global-loader-bot" />
          <div className="global-loader-content">
            <div className="global-loader-title">
              <span className="global-loader-pulse-dot" />
              <strong>Powering up circuits…</strong>
            </div>
            <p className="global-loader-msg">
              DSAvation bot is waking up &amp; preparing your challenges ✨
            </p>
          </div>
        </div>
      </aside>
    )}
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('general'); }}><img className="brand-mark" src="/favicon.svg" alt="" aria-hidden="true"/><span>DSAvation</span></a>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={view === 'general' ? 'active' : ''} onClick={() => navigate('general')}><IconifyIcon icon="bi:journal-bookmark" width={16} height={16}/>General</button>
        {account && <button className={view === 'members' ? 'active' : ''} onClick={() => navigate('members')}><Icon name="users" size={15}/>Members</button>}
        <button className={view === 'club' ? 'active' : ''} onClick={() => navigate('club')}><Icon name="users" size={15}/>Club challenge</button>
        {isAdmin && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><Icon name="users" size={15}/>Dashboard{memberCounts.pending > 0 && <span className="nav-count">{memberCounts.pending}</span>}</button>}
      </nav>
      <div className="account-actions">
        <button className="theme-toggle" type="button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15}/><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
        {account ? (
          <button
            type="button"
            className={`account-profile-btn ${view === 'progress' ? 'active' : ''}`}
            onClick={() => navigate('progress')}
            title="Open Account & Settings"
            aria-label="Open Account & Settings"
          >
            <MemberAvatar person={account} label=""/>
            <span className="account-name-label">
              <strong>{account.name.split(' ')[0]}</strong>
              {account.role !== 'member' && <small>{account.role}</small>}
            </span>
          </button>
        ) : <button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button>}
      </div>
    </header>

    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
    {apiNotice && <div className="system-banner"><Icon name="lock" size={15}/><span>{apiNotice}</span></div>}

    {view === 'reset-password' && <main className="content-shell page-content reset-page"><section className="panel reset-password-panel"><div className="eyebrow"><span className="eyebrow-line"/>ACCOUNT RECOVERY</div><h1>Choose a new password<span>.</span></h1>{resetToken ? <><p>This one-time link expires after 30 minutes and can only be used once.</p><form className="auth-form" onSubmit={completePasswordReset}><label>NEW PASSWORD<input name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required placeholder="At least 10 characters"/></label><label>CONFIRM NEW PASSWORD<input name="confirmPassword" type="password" autoComplete="new-password" minLength="10" maxLength="128" required placeholder="Enter it again"/></label>{resetError && <p className="form-error" role="alert">{resetError}</p>}<button className="button button-dark auth-submit" disabled={resetBusy}>{resetBusy ? 'Updating…' : 'Change password'} <Icon name="arrow" size={14}/></button></form></> : <><p>This reset link is missing or has already been used. Contact an administrator to generate a new one.</p><button className="button button-dark" onClick={() => { window.history.replaceState({}, '', '/'); setView('general'); setAuthMode('login'); setAuthOpen(true); }}>Return to sign in <Icon name="arrow" size={14}/></button></>}</section></main>}

    {view === 'general' && <main className="content-shell">
      <section className="welcome-row">
        <div className="welcome-hero-lead">
          <div className="hero-mascot-wrapper">
            <img src="/technovation-mascot.png" alt="Technovation Club Mascot" className="hero-mascot-img"/>
          </div>
          <div className="hero-content">
            <div className="eyebrow"><span className="eyebrow-line"/>ABES TECHNOVATION CLUB WEBSITE</div>
            <h1>Build the instinct.<br/><em>One problem at a time.</em></h1>
            <p className="hero-subtitle">A shared question library for focused practice, personal progress, and the club’s daily challenge.</p>
          </div>
        </div>
        <div className="hero-index"><span>THE CURRICULUM</span><strong>220</strong><small>INTERVIEW QUESTIONS</small></div>
      </section>

      <section className="overview-grid" aria-label="Club and personal overview">
        <article className="overview-card today-card">
          <div className="card-fluid-mesh" aria-hidden="true">
            <span className="fluid-blob fluid-blob-1" />
            <span className="fluid-blob fluid-blob-2" />
            <span className="fluid-blob fluid-blob-3" />
            <span className="fluid-shimmer-sweep" />
          </div>
          <div className="today-card-content">
            <div className="card-kicker">
              <span className="live-dot" />
              <span>QUESTION OF THE DAY</span>
              <span className="card-count">01</span>
            </div>
            {!account ? (
              <div className="empty-assignment">
                <h2>Sign in to view today’s question</h2>
                <p>Approved members can see the daily question and track their practice.</p>
              </div>
            ) : assignedQuestion ? (
              <>
                <div className="today-date">
                  <span>{club.assignment.dateKey}</span>
                  <span className="date-sep">·</span>
                  <span className="topic-name">{assignedQuestion.topic}</span>
                </div>
                <h2>{assignedQuestion.title}</h2>
                <div className="today-details">
                  <Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill>
                  <span className="meta-badge">LeetCode #{assignedQuestion.id}</span>
                  <span className="meta-badge">Day {assignedQuestion.day} / 220</span>
                </div>
                <div className="club-participation">
                  <div className="participation-stat">
                    <strong>{club.acceptedCount}</strong>
                    <span>accepted</span>
                  </div>
                  <span className="participation-divider" />
                  <span className="participation-sub">{club.submittedCount} submitted</span>
                  <button className="challenge-link-btn" onClick={() => navigate('club')}>
                    View challenge <Icon name="arrow" size={13} />
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-assignment">
                <h2>No question assigned today</h2>
                <p>Club leads can publish the next Question of the Day. Holidays and break days do not count as missed practice.</p>
              </div>
            )}
          </div>
        </article>
        <article className="overview-card personal-card"><div className="card-kicker">YOUR PRIVATE TRACKER <span className="card-count">02</span></div><div className="personal-stat"><strong>{account ? solvedCount : '—'}</strong><span><b>{account ? `${Math.round((solvedCount / 220) * 100)}%` : 'Personal'}</b><br/>{account ? 'of the 220 questions tracked' : 'progress stays private'}</span></div><div className="personal-track"><i style={{ width: `${account ? Math.min(100, solvedCount / 220 * 100) : 0}%` }}/></div><p>{account ? 'Your manual checkmarks are visible only to you. They never add club points.' : 'Sign in to save which questions you have solved.'}</p><button className="text-button" onClick={() => { navigate('progress'); if (!account) { setAuthMode('login'); setAuthOpen(true); } }}>{account ? 'Open my progress' : 'Sign in to track'} <Icon name="arrow" size={14}/></button></article>
        <article className="overview-card community-card"><div className="card-kicker"><Icon name="users" size={14}/> CLUB PARTICIPATION <span className="card-count">03</span></div><div className="community-figure"><strong>{club.acceptedCount}</strong><span>members accepted today</span></div>{club.participants?.length ? <div className="participant-list">{club.participants.slice(0, 4).map((person) => <span className="participant" key={`${person.githubUsername}-${person.name}`}><MemberAvatar person={person} label=""/>{person.name.split(' ')[0]}</span>)}{club.participants.length > 4 && <span className="participant-more">+{club.participants.length - 4}</span>}</div> : <p className="privacy-note">Approved members with accepted club submissions appear here; personal checkmarks stay private.</p>}<button className="text-button" onClick={() => navigate('club')}>See the scoreboard <Icon name="arrow" size={14}/></button></article>
      </section>

      {!account && <section className="library-locked panel"><div><div className="eyebrow"><span className="eyebrow-line"/>THE QUESTION LIBRARY</div><h2>Sign in to access the curriculum<span>.</span></h2><p>Question titles, patterns, and solution notes are available to approved members.</p></div><button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button></section>}
      {account && <section className="library-section" id="library"><div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>THE QUESTION LIBRARY</div><h2>Find your next rep<span>.</span></h2></div><span className="question-total">{visibleQuestions.length} <i>/</i> 220 QUESTIONS</span></div>
        <div className="filter-bar"><label className="search-input"><Icon name="search" size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a title, pattern, algorithm or LC number"/><kbd>/</kbd></label><label className="filter-select"><span>TOPIC</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option>All topics</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>LEVEL</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Any level</option>{['Easy', 'Medium', 'Hard'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>DATA STRUCTURE</span><select value={structure} onChange={(event) => setStructure(event.target.value)}><option>Any data structure</option>{structures.map((item) => <option key={item}>{item}</option>)}</select></label><label className="filter-select"><span>PATTERN</span><select value={pattern} onChange={(event) => setPattern(event.target.value)}><option>Any pattern</option>{patterns.map((item) => <option key={item}>{item}</option>)}</select></label><button className="sort-button" onClick={() => setSort((current) => current === 'day' ? 'title' : 'day')}>Sort: {sort === 'day' ? 'Day' : 'Title'} ↕</button></div>
        <div className="library-meta"><span><Icon name="filter" size={14}/>{visibleQuestions.length === questions.length ? 'All 220 questions' : `${visibleQuestions.length} matching questions`}</span>{(query || topic !== 'All topics' || difficulty !== 'Any level' || structure !== 'Any data structure' || pattern !== 'Any pattern') && <button onClick={clearFilters}>Clear filters</button>}<span className="personal-legend"><i/> Personal completion {account ? '' : '· sign in to track'}</span></div>
        <QuestionActionsGuide/>
        <div className="question-list">{visibleQuestions.length ? visibleQuestions.map((question) => <QuestionRow key={question.id} question={question} solved={Boolean(progress[question.id])} solvedAt={progress[question.id]} bookmarked={bookmarks.includes(question.id)} onSolve={() => solvePersonal(question.id)} onBookmark={() => toggleBookmark(question.id)}/>) : <div className="no-results"><span>⌕</span><strong>No questions match those filters.</strong><p>Try a different topic, level, or keyword.</p><button onClick={clearFilters}>Reset filters</button></div>}</div>
      </section>}
      <footer className="site-footer"><span>DSAvation</span><span>Technovation – The Networking Club</span></footer>
    </main>}

    {view === 'progress' && <main className="content-shell page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line"/>PERSONAL ACCOUNT</div>
          <h1>Account<span>.</span></h1>
          <p>Update your member details and review your private DSA progress. Personal checkmarks never affect club points.</p>
        </div>
        <div className="account-heading-actions">
          <div className="metric-card"><strong>{solvedCount}</strong><span>QUESTIONS TRACKED</span></div>
          {account && (
            <button
              type="button"
              className="button button-quiet sign-out-tab-btn"
              onClick={logout}
              title="Sign out"
            >
              <Icon name="logout" size={14}/><span>Sign out</span>
            </button>
          )}
        </div>
      </div>
      {!account ? <div className="login-prompt"><span className="prompt-icon"><Icon name="lock" size={23}/></span><div><h2>Your account and progress are private.</h2><p>Sign in to update your member details and keep a dated record of solved questions.</p></div><button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button></div> : <><section className="panel account-settings"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>MEMBER DETAILS</div><h2>Your profile</h2></div>{account.githubVerified ? <Pill tone="green">GitHub verified</Pill> : <Pill tone="amber">GitHub not verified</Pill>}</div><form className="account-form" key={`${account.id}:${account.githubUsername}:${account.githubVerified}:${account.defaultSubmissionMethod}`} onSubmit={saveProfile}><label>FULL NAME<input name="name" defaultValue={account.name} required minLength="2" maxLength="80" autoComplete="name"/></label><label>CLUB DEPARTMENT<select name="department" defaultValue={account.department || ''} required><option value="" disabled>Select your club department</option>{!CLUB_DEPARTMENTS.includes(account.department) && account.department && <option value={account.department}>{account.department}</option>}{CLUB_DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label><label>GITHUB USERNAME<input name="githubUsername" defaultValue={account.githubUsername} required={!account.githubVerified && Boolean(account.githubUsername)} pattern="[A-Za-z0-9-]{1,39}" readOnly={account.githubVerified} placeholder="Connect GitHub to fill this automatically"/><small>{account.githubVerified ? 'Read from your verified GitHub account.' : 'Connect GitHub to verify and fill this username.'}</small></label><label>LEETCODE USERNAME<input name="leetcodeUsername" defaultValue={account.leetcodeUsername} required pattern="[A-Za-z0-9_-]{1,40}"/></label><label>YEAR OF STUDY<select name="studyYear" defaultValue={account.studyYear} required><option value="first-year">First year</option><option value="second-year">Second year</option><option value="third-year">Third year</option><option value="fourth-year">Fourth year</option><option value="passed">Passed out</option></select></label>            <div className="account-submission-pref">
              <span className="account-pref-label">DEFAULT SUBMISSION METHOD</span>
              <div className="account-radio-group" role="radiogroup" aria-label="Default submission method">
                <label
                  className={`account-radio-card ${accountSubmissionMethod === 'leetcode' ? 'selected' : ''}`}
                  onClick={() => setAccountSubmissionMethod('leetcode')}
                >
                  <input
                    type="radio"
                    name="defaultSubmissionMethod"
                    value="leetcode"
                    checked={accountSubmissionMethod === 'leetcode'}
                    onChange={() => setAccountSubmissionMethod('leetcode')}
                    className="account-radio-input"
                  />
                  <div className="account-radio-indicator" aria-hidden="true">
                    <span className="account-radio-dot" />
                  </div>
                  <div className="account-radio-icon">
                    <IconifyIcon icon="bxl:leetcode" width={20} height={20}/>
                  </div>
                  <div className="account-radio-text">
                    <strong>LeetCode Direct</strong>
                    <span>Automatically verify your accepted LeetCode submissions for today</span>
                  </div>
                </label>
                <label
                  className={`account-radio-card ${accountSubmissionMethod === 'github' ? 'selected' : ''}`}
                  onClick={() => setAccountSubmissionMethod('github')}
                >
                  <input
                    type="radio"
                    name="defaultSubmissionMethod"
                    value="github"
                    checked={accountSubmissionMethod === 'github'}
                    onChange={() => setAccountSubmissionMethod('github')}
                    className="account-radio-input"
                  />
                  <div className="account-radio-indicator" aria-hidden="true">
                    <span className="account-radio-dot" />
                  </div>
                  <div className="account-radio-icon">
                    <Icon name="github" size={19}/>
                  </div>
                  <div className="account-radio-text">
                    <strong>GitHub Commit</strong>
                    <span>Submit a commit code or full URL from your personal solutions repo</span>
                  </div>
                </label>
              </div>
              <small className="account-pref-hint">This method will automatically appear in Today's Assignment under Club Challenge.</small>
            </div><div className="avatar-picker"><div className="avatar-picker-heading"><MemberAvatar style={avatarDraftStyle} seed={avatarDraftStyle === 'custom' ? avatarDraftCustomUrl : (avatarDraftSeed || account.avatarSeed || account.id)} url={avatarDraftStyle === 'custom' ? avatarDraftCustomUrl : undefined} className="avatar-current" label="Selected avatar preview"/><div><strong>Choose your avatar</strong><span>{avatarDraftStyle === 'custom' ? 'Paste a direct link to any custom image.' : 'Pick a style, then select a face or shuffle the options.'}</span></div>{avatarDraftStyle !== 'custom' && <button type="button" className="button button-quiet" onClick={shuffleAvatarChoices}>Shuffle options</button>}</div><div className="avatar-style-tabs" role="tablist" aria-label="Avatar styles">{AVATAR_STYLES.map((style) => <button type="button" key={style.id} role="tab" aria-selected={avatarDraftStyle === style.id} className={avatarDraftStyle === style.id ? 'selected' : ''} onClick={() => chooseAvatarStyle(style.id)}>{style.name}</button>)}<button type="button" role="tab" aria-selected={avatarDraftStyle === 'custom'} className={avatarDraftStyle === 'custom' ? 'selected' : ''} onClick={() => chooseAvatarStyle('custom')}>Custom URL</button></div>{avatarDraftStyle === 'custom' ? <div className="custom-avatar-box"><label className="custom-avatar-label"><span>CUSTOM IMAGE URL (HTTP / HTTPS)</span><div className="custom-avatar-input-wrapper"><input type="url" className="custom-avatar-input" placeholder="https://example.com/avatar.png" value={avatarDraftCustomUrl} onChange={(e) => { setAvatarDraftCustomUrl(e.target.value); setAvatarDraftSeed(e.target.value.trim() || 'custom-avatar'); }}/>{avatarDraftCustomUrl && <button type="button" className="button button-quiet" onClick={() => { setAvatarDraftCustomUrl(''); setAvatarDraftSeed('custom-avatar'); }}>Clear</button>}</div></label><div className={`custom-url-status ${customUrlStatus.type}`}><Icon name={customUrlStatus.valid ? 'check' : 'lock'} size={14}/><span>{customUrlStatus.message}</span></div><small className="avatar-custom-hint">Supports any public image format (PNG, JPG, SVG, WebP, GIF) from GitHub, Imgur, Gravatar, etc.</small></div> : <><div className="avatar-choice-grid" aria-label="Choose an avatar">{avatarChoices.map((seed, index) => <button type="button" key={seed} className={`avatar-choice ${avatarDraftSeed === seed ? 'selected' : ''}`} aria-label={`Choose avatar ${index + 1}`} aria-pressed={avatarDraftSeed === seed} onClick={() => setAvatarDraftSeed(seed)}><MemberAvatar style={avatarDraftStyle} seed={seed} label=""/></button>)}</div><small className="avatar-license-note">CC BY 4.0 credits: <a href="https://www.dicebear.com/styles/fun-emoji/" target="_blank" rel="noreferrer">Fun Emoji Set by Davis Uche</a> and <a href="https://www.dicebear.com/styles/micah/" target="_blank" rel="noreferrer">Avatar Illustration System by Micah Lanier</a>.</small></>}</div><div className="account-form-actions"><button className="button button-dark" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save account details'} <Icon name="arrow" size={14}/></button>{account.githubVerified ? <button className="button button-danger" type="button" disabled={profileBusy} onClick={disconnectGithub}>Disconnect GitHub</button> : <button className="button button-quiet" type="button" onClick={() => { window.location.href = '/api/auth/github/start'; }}><Icon name="github" size={15}/>Connect GitHub</button>}<button className="button button-quiet" type="button" onClick={logout}><Icon name="logout" size={14}/>Sign out</button></div></form></section><ProgressHeatmap progress={progress}/><div className="progress-summary"><article><span>COMPLETED</span><strong>{solvedCount}<small> / 220</small></strong></article><article><span>CURRICULUM COVERED</span><strong>{Math.round(solvedCount / 220 * 100)}<small>%</small></strong></article><article><span>DAILY PRACTICE</span><strong>{new Set(Object.values(progress).map((value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))).size}<small> sessions</small></strong></article><article><span>PERSONAL STREAK</span><strong>{personalStreak.current}<small> days</small></strong><small className="streak-best">Best: {personalStreak.best} days · checkmarks only</small></article><article><span>IN PROGRESS</span><strong>{bookmarks.length}<small> questions</small></strong></article></div><div className="section-heading compact"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR COMPLETIONS</div><h2>{solvedCount ? 'Recently tracked' : 'A clean slate'}</h2></div><button className="button button-quiet" onClick={() => { navigate('general'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Browse questions <Icon name="arrow" size={14}/></button></div>{solvedCount ? <><QuestionActionsGuide/><div className="question-list">{Object.entries(progress).sort((a, b) => new Date(b[1]) - new Date(a[1])).map(([id, solvedAt]) => byId.get(Number(id)) && ({ question: byId.get(Number(id)), solvedAt })).filter(Boolean).map(({ question, solvedAt }) => <QuestionRow key={question.id} question={question} solved={true} solvedAt={solvedAt} bookmarked={bookmarks.includes(question.id)} onSolve={() => solvePersonal(question.id)} onBookmark={() => toggleBookmark(question.id)}/>)}</div></> : <div className="empty-panel"><span>01</span><h2>Your first question starts the record.</h2><p>Use the personal checkmark in the question library when you finish a problem. Club challenge submissions are tracked separately.</p><button className="button button-dark" onClick={() => navigate('general')}>Browse the library <Icon name="arrow" size={14}/></button></div>}</>}
      <footer className="site-footer"><span>DSAvation</span><span>Technovation – The Networking Club</span></footer>
    </main>}

    {view === 'members' && <main className="content-shell page-content members-page">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ABES TECHNOVATION CLUB</div><h1>Member directory<span>.</span></h1><p>Find club members by Club Department or year{isAdmin ? ', and review member LeetCode progress' : ''}.</p></div><div className="metric-card"><strong>{directoryPagination.total}</strong><span>APPROVED MEMBERS</span></div></div>
      {!account ? <div className="login-prompt"><span className="prompt-icon"><Icon name="lock" size={23}/></span><div><h2>The member directory is for approved accounts.</h2><p>Sign in with your approved ABES account to browse club profiles.</p></div><button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button></div> : <>
        <form className="panel directory-filters" onSubmit={(event) => { event.preventDefault(); loadDirectory(1, directoryQuery, directoryDepartment, directoryYear); }}>
          <label className="member-search"><Icon name="search" size={15}/><input value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="Search name, Club Department, or username" aria-label="Search members"/></label>
          <label className="directory-select"><span>CLUB DEPARTMENT</span><select value={directoryDepartment} onChange={(event) => { setDirectoryDepartment(event.target.value); loadDirectory(1, directoryQuery, event.target.value, directoryYear); }}><option value="">All departments</option>{directoryDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
          <label className="directory-select"><span>YEAR</span><select value={directoryYear} onChange={(event) => { setDirectoryYear(event.target.value); loadDirectory(1, directoryQuery, directoryDepartment, event.target.value); }}><option value="">All years</option><option value="first-year">First year</option><option value="second-year">Second year</option><option value="third-year">Third year</option><option value="fourth-year">Fourth year</option><option value="passed">Passed out</option></select></label>
          <button className="button button-dark" type="submit" disabled={directoryBusy}>{directoryBusy ? 'Searching…' : 'Search'}</button>
          {(directoryQuery || directoryDepartment || directoryYear) && <button className="button button-quiet" type="button" onClick={() => { setDirectoryQuery(''); setDirectoryDepartment(''); setDirectoryYear(''); loadDirectory(1, '', '', ''); }}>Clear filters</button>}
        </form>
        {directoryBusy && !directoryMembers.length ? <div className="panel directory-loading" role="status">Loading approved member profiles…</div> : directoryMembers.length ? <div className="member-directory-grid">{directoryMembers.map((member) => {
          const isSelf = member.id === account.id;
          const canSeeLeetcode = isAdmin || isSelf;
          const lookup = directoryLeetcodeStats[member.id];
          const stats = lookup?.stats;
          const maxActivity = Math.max(1, ...(stats?.byDifficulty || []).map((item) => item.attempted ?? item.solved));
          return <article className="panel member-directory-card" key={member.id}>
            <header className="directory-card-header"><MemberAvatar person={member} className="directory-avatar" label=""/><div><h2>{member.name}</h2><p>{member.department} · {studyYearLabel(member.studyYear)}</p></div><Pill tone={member.role === 'admin' ? 'green' : 'neutral'}>{member.role === 'lead' ? 'Club lead' : member.role}</Pill></header>
            <div className="directory-socials">
              {member.githubUsername ? <a href={`https://github.com/${encodeURIComponent(member.githubUsername)}`} target="_blank" rel="noreferrer"><Icon name="github" size={14}/>@{member.githubUsername}<Icon name="external" size={12}/></a> : <span>GitHub not linked</span>}
              {canSeeLeetcode && (member.leetcodeUsername ? <a href={`https://leetcode.com/${encodeURIComponent(member.leetcodeUsername)}/`} target="_blank" rel="noreferrer">LeetCode @{member.leetcodeUsername}<Icon name="external" size={12}/></a> : <span>LeetCode ID not added</span>)}
            </div>
            {canSeeLeetcode && member.leetcodeUsername && <section className="directory-leetcode" aria-label={`LeetCode statistics for ${member.name}`}><div className="directory-leetcode-heading"><strong>LeetCode progress</strong>{stats && <span>Updated {new Date(stats.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>}</div>{lookup?.available && stats ? <><div className="leetcode-counts"><span><strong>{stats.attemptedCount ?? '—'}</strong> attempted</span><span><strong>{stats.solvedCount}</strong> solved</span></div><div className="leetcode-bars">{stats.byDifficulty.map((item) => <div className="leetcode-bar-row" key={item.difficulty}><span>{item.difficulty}</span><i><b style={{ width: `${Math.max(2, Math.round(((item.attempted ?? item.solved) / maxActivity) * 100))}%` }}/></i><strong>{item.attempted ?? item.solved}</strong></div>)}</div>{lookup.stale && <small className="leetcode-unavailable">{lookup.reason}</small>}</> : <div className="leetcode-empty">{lookup?.reason && <span>{lookup.reason}</span>}<button className="text-button" type="button" disabled={leetcodeStatsBusy === member.id} onClick={() => loadDirectoryLeetcodeStats(member)}>{leetcodeStatsBusy === member.id ? 'Fetching…' : lookup ? 'Try again' : 'Load stats'} <Icon name="arrow" size={13}/></button></div>}</section>}
          </article>;
        })}</div> : <div className="panel directory-empty"><span>⌕</span><h2>No members match these filters.</h2><p>Try another year, department, or search term.</p></div>}
        {directoryPagination.totalPages > 1 && <div className="pagination-controls"><button className="button button-quiet" disabled={directoryBusy || directoryPagination.page <= 1} onClick={() => loadDirectory(directoryPagination.page - 1)}>Previous</button><span>Page {directoryPagination.page} of {directoryPagination.totalPages} · {directoryPagination.total} members</span><button className="button button-quiet" disabled={directoryBusy || directoryPagination.page >= directoryPagination.totalPages} onClick={() => loadDirectory(directoryPagination.page + 1)}>Next</button></div>}
      </>}
      <footer className="site-footer"><span>DSAvation</span><span>Technovation – The Networking Club</span></footer>
    </main>}

    {view === 'dashboard' && isAdmin && <main className="content-shell page-content dashboard-page">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ADMINISTRATION</div><h1>Member dashboard<span>.</span></h1><p>Review access, adjust award points, generate reset links, and inspect the admin activity log.</p></div><div className="metric-card"><strong>{memberCounts.pending}</strong><span>WAITING FOR APPROVAL</span></div></div>
      <div className="approval-notice"><Icon name="lock" size={17}/><p>Email addresses are checked for the <strong>@abes.ac.in</strong> format, but no verification email is sent. Confirm a member’s identity through the club before approving access.</p></div>
      <section className="panel dashboard-members-panel">
        <div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ACCOUNT ACCESS</div><h2>Club accounts <span className="count-badge">{membersPagination.total}</span></h2></div><button className="button button-quiet refresh-members" onClick={() => refreshMembers(membersPagination.page)}>Refresh</button></div>
        <div className="member-dashboard-toolbar"><div className="member-filter-tabs" role="tablist" aria-label="Filter member accounts">{[['pending', `Pending · ${memberCounts.pending}`], ['approved', `Approved · ${memberCounts.approved}`], ['all', `All · ${membersPagination.total}`]].map(([key, label]) => <button key={key} role="tab" aria-selected={memberFilter === key} className={memberFilter === key ? 'selected' : ''} onClick={() => { setMemberFilter(key); refreshMembers(1, key, memberQuery); }}>{label}</button>)}</div><label className="member-search"><Icon name="search" size={15}/><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') refreshMembers(1, memberFilter, event.currentTarget.value); }} placeholder="Search name, email, Club Department"/></label><button className="button button-quiet" onClick={() => refreshMembers(1, memberFilter, memberQuery)}>Search</button></div>
        {displayedMembers.length ? <div className="dashboard-member-list">{displayedMembers.map((member) => <article className="dashboard-member-row" key={member.id}>
          <MemberAvatar person={member} label=""/>
          <div className="dashboard-member-identity"><div className="member-name-line"><strong>{member.name}</strong><Pill tone={member.approvalStatus === 'approved' ? 'green' : 'amber'}>{member.approvalStatus === 'approved' ? 'Approved' : 'Pending'}</Pill></div><span>{member.email}</span><small>Club Department: {member.department} · {studyYearLabel(member.studyYear)} · GitHub @{member.githubUsername || '—'} · LeetCode @{member.leetcodeUsername || '—'}</small><small>Joined {member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'date unavailable'}</small></div>
          <div className="dashboard-member-actions">
            <select aria-label={`Role for ${member.name}`} value={member.role} disabled={memberBusy === member.id || member.id === account.id || member.approvalStatus !== 'approved'} onChange={(event) => updateRole(member, event.target.value)}><option value="member">Member</option><option value="admin">Admin</option></select>
            <button className="button button-quiet" disabled={memberBusy === member.id} onClick={() => generateResetLink(member)}>Generate reset link</button>
            {member.approvalStatus === 'approved' ? <button className="button button-quiet" disabled={memberBusy === member.id || member.id === account.id} onClick={() => setMemberApproval(member, 'pending')}>De-approve</button> : <button className="button button-green" disabled={memberBusy === member.id} onClick={() => setMemberApproval(member, 'approved')}>{memberBusy === member.id ? 'Saving…' : 'Approve account'} <Icon name="check" size={14}/></button>}
            <button className="button button-danger" disabled={memberBusy === member.id || member.id === account.id} onClick={() => deleteMember(member)}>Delete</button>
          </div>
        </article>)}</div> : <div className="dashboard-empty"><span>{memberFilter === 'pending' && !memberQuery ? '✓' : '⌕'}</span><h2>{memberFilter === 'pending' && !memberQuery ? 'No accounts are waiting.' : 'No accounts match this filter.'}</h2><p>{memberFilter === 'pending' && !memberQuery ? 'New signups will appear here for review.' : 'Try another name, email, or status filter.'}</p></div>}
        {membersPagination.totalPages > 1 && <div className="pagination-controls"><button className="button button-quiet" disabled={membersPagination.page <= 1} onClick={() => refreshMembers(membersPagination.page - 1)}>Previous</button><span>Page {membersPagination.page} of {membersPagination.totalPages} · {membersPagination.total} accounts</span><button className="button button-quiet" disabled={membersPagination.page >= membersPagination.totalPages} onClick={() => refreshMembers(membersPagination.page + 1)}>Next</button></div>}
      </section>
      <section className="panel dashboard-activity-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>SCORING CONTROLS</div><h2>Accepted submissions</h2></div></div><p className="leaderboard-note">New verified submissions receive one point automatically. Set a lower value to deduct points; every adjustment is added to the activity log.</p>{scoredSubmissions.length ? <div className="review-list">{scoredSubmissions.map((item) => <article className="review-item score-adjustment-row" key={item.id}><div><strong>{item.member?.name || 'Member'} <span>· {item.assignment?.dateKey} · LC {item.assignment?.questionId}</span></strong><p>{item.solutionPath || item.commitUrl}</p><a href={item.commitUrl} target="_blank" rel="noreferrer">Open verified commit <Icon name="external" size={13}/></a></div><label className="points-control">POINTS<select aria-label={`Points for ${item.member?.name || 'member'}`} value={item.points ?? 1} disabled={memberBusy === item.id} onChange={(event) => adjustPoints(item, event.target.value)}>{Array.from({ length: 11 }, (_, value) => <option value={value} key={value}>{value} point{value === 1 ? '' : 's'}</option>)}</select></label></article>)}</div> : <div className="soft-empty">No verified submissions have been scored yet.</div>}{scoredPagination.totalPages > 1 && <div className="pagination-controls"><button className="button button-quiet" disabled={scoredPagination.page <= 1} onClick={() => refreshScoredSubmissions(scoredPagination.page - 1)}>Previous</button><span>Page {scoredPagination.page} of {scoredPagination.totalPages}</span><button className="button button-quiet" disabled={scoredPagination.page >= scoredPagination.totalPages} onClick={() => refreshScoredSubmissions(scoredPagination.page + 1)}>Next</button></div>}</section>
      <section className="panel dashboard-activity-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>ADMIN AUDIT</div><h2>Admin activity <span className="count-badge">{activityPagination.total}</span></h2></div><button className="button button-quiet" onClick={() => refreshActivity(activityPagination.page)}>Refresh</button></div>{activity.length ? <div className="admin-activity-list">{activity.map((entry) => <article className="admin-activity-row" key={entry.id}><div><strong>{entry.actorName} <small>{entry.actorRole}</small></strong><span>{entry.action.replaceAll('_', ' ')} · {entry.targetLabel || 'account action'}</span>{Object.keys(entry.details || {}).length > 0 && <code>{JSON.stringify(entry.details)}</code>}</div><time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time></article>)}</div> : <div className="soft-empty">Admin actions will appear here as they happen.</div>}{activityPagination.totalPages > 1 && <div className="pagination-controls"><button className="button button-quiet" disabled={activityPagination.page <= 1} onClick={() => refreshActivity(activityPagination.page - 1)}>Previous</button><span>Page {activityPagination.page} of {activityPagination.totalPages}</span><button className="button button-quiet" disabled={activityPagination.page >= activityPagination.totalPages} onClick={() => refreshActivity(activityPagination.page + 1)}>Next</button></div>}</section>
      <footer className="site-footer"><span>DSAvation</span><span>Technovation – The Networking Club</span></footer>
    </main>}

    {view === 'club' && <main className="content-shell page-content">
      <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>SHARED CLUB CHALLENGE</div><h1>Show up. Ship a solution<span>.</span></h1><p>Only reviewed submissions to a published Question of the Day count toward these standings.</p></div><div className="club-date-badge"><IconifyIcon icon="griddy-icons:calendar-date" width={18} height={18}/><strong>{club.dateKey || localDay()}</strong></div></div>
      {account ? <div className="club-grid">
        <div className="club-main-column">
          <section className="panel qotd-panel">
            <div className="card-fluid-mesh" aria-hidden="true">
              <span className="fluid-blob fluid-blob-1" />
              <span className="fluid-blob fluid-blob-2" />
              <span className="fluid-blob fluid-blob-3" />
              <span className="fluid-shimmer-sweep" />
            </div>
            <div className="qotd-panel-content">
              <div className="panel-header">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" />TODAY'S ASSIGNMENT</div>
                  <h2>{assignedQuestion ? assignedQuestion.title : 'No assignment today'}</h2>
                </div>
                <div className="panel-heading-actions">
                  {assignedQuestion && <Pill tone={assignedQuestion.difficulty.toLowerCase()}>{assignedQuestion.difficulty}</Pill>}
                </div>
              </div>
              {assignedQuestion ? (
                <>
                  <div className="assignment-meta">
                    <span>{club.assignment.dateKey}</span>
                    <span>{assignedQuestion.topic}</span>
                    <span>LeetCode #{assignedQuestion.id}</span>
                    <span>{assignedQuestion.pattern}</span>
                  </div>
                  <p className="assignment-prompt">
                    Submit today’s verified solution using {(account?.defaultSubmissionMethod || 'github') === 'github' ? <>your <strong>GitHub commit</strong></> : <>directly via <strong>LeetCode</strong></>}. A verified submission earns 1 point on the club leaderboard.
                  </p>
                  <div className="assignment-counts">
                    <div><strong>{club.submittedCount}</strong><span>SUBMITTED</span></div>
                    <div><strong>{club.acceptedCount}</strong><span>ACCEPTED</span></div>
                    <a href={`https://leetcode.com/problems/${assignedQuestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`} target="_blank" rel="noreferrer">
                      Open on LeetCode <Icon name="external" size={13} />
                    </a>
                  </div>
                  {!account ? (
                    <div className="inline-callout">
                      <Icon name="lock" size={16} />
                      <span>Sign in with an approved ABES account to submit a club solution.</span>
                      <button onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in</button>
                    </div>
                  ) : submissions.some((item) => item.assignment?.dateKey === club.assignment.dateKey && item.status !== 'invalidated') ? (
                    <div className="inline-callout submitted">
                      <Icon name="check" size={16} />
                      <span>Your submission for today is {submissions.find((item) => item.assignment?.dateKey === club.assignment.dateKey && item.status !== 'invalidated')?.status} · {submissions.find((item) => item.assignment?.dateKey === club.assignment.dateKey && item.status !== 'invalidated')?.points ?? 0} point(s).</span>
                    </div>
                  ) : (
                    <div className="submission-box-wrap">
                      {(account?.defaultSubmissionMethod || 'github') === 'github' ? (
                        !account.githubVerified ? (
                          <div className="inline-callout">
                            <Icon name="github" size={15} />
                            <span>Connect the GitHub account you want to use; its verified username will replace the signup value.</span>
                            <button onClick={() => { window.location.href = '/api/auth/github/start'; }}>Link GitHub</button>
                          </div>
                        ) : (
                          <form className="submission-form" onSubmit={submitClubSolution}>
                            <div className="submission-form-heading">
                              <label htmlFor="commit-url">GITHUB COMMIT CODE OR FULL URL</label>
                              <button className="submission-info" type="button" aria-label="How to submit a solution" aria-expanded={submissionHelpOpen} aria-controls="submission-help" onClick={() => setSubmissionHelpOpen((open) => !open)}>
                                <Icon name="info" size={13} />
                              </button>
                            </div>
                            {submissionHelpOpen && (
                              <div className="submission-help" id="submission-help">
                                <strong>Before you submit</strong>
                                <ol>
                                  <li>Create or use a public repository that you own under <code>@{account.githubUsername}</code>.</li>
                                  <li>Create or update <code>{assignedQuestion.id}/solution.txt</code> (or <code>.cpp</code>, <code>.py</code>, <code>.java</code>, <code>.js</code>, <code>.c</code>) directly inside the question folder. The file can contain any language, but must have at least one byte.</li>
                                  <li>Commit and push it during today’s assignment date. The GitHub author must match your linked account; commits made in GitHub's web editor use its web-flow committer and are accepted.</li>
                                  <li>Enter either your commit code/hash (e.g. <code>76c3f95</code>) or your full commit URL (e.g. <code>https://github.com/{account.githubUsername}/YOUR-REPO/commit/FULL_SHA</code>).</li>
                                </ol>
                                <p>Only the first valid submission for today earns a point. Admins can adjust points if needed.</p>
                              </div>
                            )}
                            <div className="submission-input-row">
                              <input id="commit-url" type="text" required value={commitUrl} onChange={(event) => setCommitUrl(event.target.value)} placeholder={`e.g. 76c3f95 or https://github.com/${account.githubUsername}/REPO/commit/FULL_SHA`} />
                              <button className="button button-dark" disabled={submissionBusy}>
                                {submissionBusy ? 'Verifying…' : 'Verify and submit'} <Icon name="arrow" size={13} />
                              </button>
                            </div>
                            <small>Enter a commit hash (e.g. <code>76c3f95</code>) or full commit URL. Required changed file: <code>{assignedQuestion.id}/solution.*</code> (.txt, .cpp, .py, .java, .js, or .c, at least 1 byte). The linked GitHub account must own the repository.</small>
                          </form>
                        )
                      ) : (
                        !account.leetcodeUsername ? (
                          <div className="inline-callout">
                            <Icon name="info" size={15} />
                            <span>Your LeetCode username is not added yet. Add it in your Account profile to submit directly.</span>
                            <button type="button" onClick={() => navigate('progress')}>Go to Account</button>
                          </div>
                        ) : (
                          <div className="leetcode-direct-box">
                            <div className="leetcode-direct-meta">
                              <span className="leetcode-user-tag">
                                <IconifyIcon icon="bxl:leetcode" width={14} height={14} />
                                LeetCode: <strong>@{account.leetcodeUsername}</strong>
                              </span>
                              <span className="leetcode-target-tag">
                                Target: <strong>{assignedQuestion.title}</strong> (LC #{assignedQuestion.id})
                              </span>
                            </div>
                            <p>
                              Solve <strong>{assignedQuestion.title}</strong> on LeetCode under <strong>@{account.leetcodeUsername}</strong> and obtain an <strong>Accepted</strong> status today ({club.assignment.dateKey} IST). Once submitted on LeetCode, click below to verify directly and award your club point.
                            </p>
                            <div className="leetcode-direct-actions">
                              <button
                                type="button"
                                className="leetcode-submit-button"
                                disabled={submissionBusy}
                                onClick={submitLeetCodeSolution}
                              >
                                {submissionBusy ? 'Verifying on LeetCode…' : <>Submit with LeetCode <Icon name="arrow" size={13} /></>}
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="no-assignment-note">
                  <p>A club lead has not assigned a question for this date. Unassigned holidays and breaks are excluded from punctuality calculations.</p>
                </div>
              )}
            </div>
          </section>

          {!isAdmin && (
            <section className="panel history-panel">
              <div className="panel-heading">
                <div><div className="eyebrow"><span className="eyebrow-line"/>ASSIGNMENT LOG</div><h2>Published days</h2></div>
                <span className="micro-count">{historyPagination.total}</span>
              </div>
              {history.length ? (
                <>
                  <div className="history-list">
                    {history.map((item) => {
                      const question = byId.get(Number(item.questionId));
                      return <div className="history-row" key={item.id}><span className="history-date">{item.dateKey.slice(5)}</span><span>{question?.title || `LeetCode #${item.questionId}`}</span></div>;
                    })}
                  </div>
                  <div className="pagination-controls" aria-label="Assignment log pages">
                    <button className="button button-quiet" disabled={historyPagination.page <= 1} onClick={() => loadHistoryPage(historyPagination.page - 1)}>Previous</button>
                    <span>Page {historyPagination.page} of {historyPagination.totalPages}</span>
                    <button className="button button-quiet" disabled={historyPagination.page >= historyPagination.totalPages} onClick={() => loadHistoryPage(historyPagination.page + 1)}>Next</button>
                  </div>
                </>
              ) : <div className="soft-empty">No questions have been assigned yet.</div>}
            </section>
          )}

          {isLeader && <section className="panel leader-panel"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>LEAD TOOLS</div><h2>{editingTodayAssignment ? 'Change today’s question' : 'Publish a Question of the Day'}</h2></div><div className="panel-heading-actions"><Pill tone="green">{account.role}</Pill>{editingTodayAssignment && club.assignment && <button type="button" className="button button-danger delete-today-btn" onClick={deleteTodayAssignment} disabled={assignmentBusy} title="Delete today’s published question"><Icon name="trash" size={13}/> <span>Delete today's question</span></button>}</div></div><form className="publish-form" onSubmit={publishAssignment}><label><span>ASSIGNMENT DATE <i>Asia/Kolkata</i></span><input type="date" value={assignmentDate} min={localDay()} onChange={(event) => setAssignmentDate(event.target.value)} required/></label><label className="wide"><span>QUESTION</span><select value={assignmentQuestion} onChange={(event) => setAssignmentQuestion(event.target.value)} required><option value="">Choose from the 220 question curriculum</option>{questions.map((question) => <option key={question.id} value={question.id}>Day {String(question.day).padStart(3, '0')} · LC {question.id} · {question.title}</option>)}</select></label><button className="button button-green" disabled={assignmentBusy || !assignmentQuestion || (editingTodayAssignment && assignmentDate === localDay() && Number(assignmentQuestion) === Number(club.assignment.questionId)) || (!editingTodayAssignment && history.some((item) => item.dateKey === assignmentDate))}>{assignmentBusy ? 'Saving…' : editingTodayAssignment && assignmentDate === localDay() ? 'Replace today’s question' : 'Publish assignment'} <Icon name="arrow" size={14}/></button></form><p className="helper-copy">{editingTodayAssignment && assignmentDate === localDay() ? 'Changing today’s question invalidates existing submissions, removes their points, and lets members submit the corrected question.' : history.some((item) => item.dateKey === assignmentDate) ? 'A question is already published for this date.' : 'Publish at most one question per date. Leave holidays and breaks unassigned.'}</p></section>}

          {isLeader && (
            <section className="panel moderation-tools-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line"/>MODERATION</div>
                  <h2>Today's Moderation</h2>
                </div>
                <div className="panel-heading-actions">
                  <button
                    type="button"
                    className="button button-green pick-explainer-head-btn"
                    onClick={handlePickRandomExplainer}
                    disabled={!club.assignment || pickExplainerBusy}
                    title={club.assignment?.explainer ? "View today's selected explainer" : "Select an explainer for today's question"}
                  >
                    <Icon name="dice" size={14}/> <span>{club.assignment?.explainer ? 'View Explainer' : 'Pick Explainer'}</span>
                  </button>
                  <button
                    type="button"
                    className="button button-quiet export-csv-btn"
                    onClick={() => setExportModalOpen(true)}
                    disabled={!club.assignment && !todaySubmissionsData.questionId}
                    title="Export today's question activity report as CSV"
                  >
                    <Icon name="download" size={14}/> <span>Export as .CSV</span>
                  </button>
                </div>
              </div>

              {club.assignment?.explainer && (
                <div className="explainer-locked-banner">
                  <div className="explainer-banner-info">
                    <MemberAvatar person={club.assignment.explainer} label=""/>
                    <div>
                      <div className="explainer-banner-badge">
                        <Icon name="dice" size={12}/> TODAY'S SELECTED EXPLAINER
                      </div>
                      <strong>{club.assignment.explainer.name}</strong>
                      <p>{club.assignment.explainer.department} · {studyYearLabel(club.assignment.explainer.studyYear)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-quiet explainer-view-card-btn"
                    onClick={() => {
                      setSelectedExplainer(club.assignment.explainer);
                      setExplainerModalOpen(true);
                    }}
                  >
                    View Share Card
                  </button>
                </div>
              )}

              {pending.length > 0 && (
                <div className="moderation-subsection">
                  <div className="moderation-subheading">
                    <strong>Pending review ({pending.length})</strong>
                  </div>
                  <div className="review-list">
                    {pending.map((item) => (
                      <article className="review-item" key={item.id}>
                        <div>
                          <strong>{item.member?.name || 'Member'} <span>· Club Department: {item.member?.department || '—'}</span></strong>
                          <p>{item.assignment?.dateKey} · LC {item.assignment?.questionId} · {item.assignment?.question}</p>
                          <div className="review-evidence">
                            {item.verifiedPusher ? <Pill tone="green">PUSH VERIFIED</Pill> : <Pill tone="amber">COMMIT LINK ONLY</Pill>}
                            <a href={item.commitUrl} target="_blank" rel="noreferrer">Review commit <Icon name="external" size={13}/></a>
                          </div>
                        </div>
                        <div className="review-actions">
                          <button className="button button-quiet" disabled={memberBusy === item.id} onClick={() => review(item, 'rejected')}>Decline</button>
                          <button className="button button-green" disabled={memberBusy === item.id} onClick={() => review(item, 'accepted')}>Accept <Icon name="check" size={14}/></button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {pendingPagination.totalPages > 1 && (
                    <div className="pagination-controls">
                      <button className="button button-quiet" disabled={pendingPagination.page <= 1} onClick={() => refreshPendingSubmissions(pendingPagination.page - 1)}>Previous</button>
                      <span>Page {pendingPagination.page} of {pendingPagination.totalPages}</span>
                      <button className="button button-quiet" disabled={pendingPagination.page >= pendingPagination.totalPages} onClick={() => refreshPendingSubmissions(pendingPagination.page + 1)}>Next</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

        </div>

        <aside className="club-side-column">
          <section className="panel leaderboard-panel">
            <div className="panel-heading">
              <div><div className="eyebrow"><span className="eyebrow-line"/>CLUB STANDINGS</div><h2><Icon name="trophy" size={18}/> Leaderboard</h2></div>
              <span className="live-tag">LIVE</span>
            </div>

            <div className="leaderboard-scope-toggle">
              <button
                type="button"
                className={`scope-toggle-btn ${leaderboardScope === 'daily' ? 'active' : ''}`}
                onClick={() => setLeaderboardScope('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`scope-toggle-btn ${leaderboardScope === 'overall' ? 'active' : ''}`}
                onClick={() => setLeaderboardScope('overall')}
              >
                Overall
              </button>
            </div>

            {leaderboardScope === 'daily' ? (
              <>
                <p className="leaderboard-note">Ranked by submission time for today’s question. Earliest verified submissions rank highest.</p>
                {club.dailyLeaderboard?.length ? (
                  <div className="leaderboard-list">
                    {club.dailyLeaderboard.map((person, index) => {
                      const rank = index + 1;
                      const submittedTimeStr = person.submittedAt
                        ? new Date(person.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
                        : '';
                      return (
                        <div className="leaderboard-row daily-leaderboard-row" key={`${person.userId || person.name}:${rank}`}>
                          <span className={`rank ${rank <= 3 ? `rank-${rank}` : ''}`}>{String(rank).padStart(2, '0')}</span>
                          <MemberAvatar person={person} label=""/>
                          <div className="leader-person">
                            <strong>{person.name}</strong>
                            <span>{person.department || 'Club Member'}{submittedTimeStr ? ` · ${submittedTimeStr}` : ''}</span>
                          </div>
                          <div className="daily-leader-actions">
                            <strong className="leader-score">{person.points}<small> pt{person.points === 1 ? '' : 's'}</small></strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="soft-empty">
                    {!club.assignment ? 'No Question of the Day published for today.' : 'No accepted solutions submitted for today yet. Be the first to solve!'}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="leaderboard-note">Verified submissions earn one point by default. Admin point adjustments are recorded in the activity log.</p>
                {leaderboard.length ? (
                  <>
                    <div className="leaderboard-list">
                      {leaderboard.map((person, index) => {
                        const rank = (leaderboardPagination.page - 1) * leaderboardPagination.pageSize + index + 1;
                        return (
                          <div className="leaderboard-row" key={`${person.githubUsername || person.name}:${rank}`}>
                            <span className={`rank ${rank <= 3 ? `rank-${rank}` : ''}`}>{String(rank).padStart(2, '0')}</span>
                            <MemberAvatar person={person} label=""/>
                            <div className="leader-person">
                              <strong>{person.name}</strong>
                              <span>{person.department} · {person.punctuality}% punctuality</span>
                            </div>
                            <strong className="leader-score">{person.points}<small> pts</small></strong>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pagination-controls" aria-label="Leaderboard pages">
                      <button className="button button-quiet" disabled={leaderboardPagination.page <= 1} onClick={() => loadLeaderboardPage(leaderboardPagination.page - 1)}>Previous</button>
                      <span>Page {leaderboardPagination.page} of {leaderboardPagination.totalPages} · {leaderboardPagination.total} members</span>
                      <button className="button button-quiet" disabled={leaderboardPagination.page >= leaderboardPagination.totalPages} onClick={() => loadLeaderboardPage(leaderboardPagination.page + 1)}>Next</button>
                    </div>
                  </>
                ) : (
                  <div className="soft-empty">No scored club submissions yet. Be first to get on the board.</div>
                )}
              </>
            )}
          </section>

          {isAdmin && (
            <section className="panel history-panel">
              <div className="panel-heading">
                <div><div className="eyebrow"><span className="eyebrow-line"/>ASSIGNMENT LOG</div><h2>Published days</h2></div>
                <span className="micro-count">{historyPagination.total}</span>
              </div>
              {history.length ? (
                <>
                  <div className="history-list">
                    {history.map((item) => {
                      const question = byId.get(Number(item.questionId));
                      return <div className="history-row" key={item.id}><span className="history-date">{item.dateKey.slice(5)}</span><span>{question?.title || `LeetCode #${item.questionId}`}</span></div>;
                    })}
                  </div>
                  <div className="pagination-controls" aria-label="Assignment log pages">
                    <button className="button button-quiet" disabled={historyPagination.page <= 1} onClick={() => loadHistoryPage(historyPagination.page - 1)}>Previous</button>
                    <span>Page {historyPagination.page} of {historyPagination.totalPages}</span>
                    <button className="button button-quiet" disabled={historyPagination.page >= historyPagination.totalPages} onClick={() => loadHistoryPage(historyPagination.page + 1)}>Next</button>
                  </div>
                </>
              ) : <div className="soft-empty">No questions have been assigned yet.</div>}
            </section>
          )}

          {submissions.length > 0 && <section className="panel my-submissions"><div className="panel-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR CLUB SUBMISSIONS</div><h2>Review history</h2></div></div>{submissions.slice(0, 5).map((item) => <div className="my-submission" key={item.id}><span>{item.assignment?.dateKey} · LC {item.assignment?.questionId}</span><Pill tone={item.status === 'accepted' ? 'green' : item.status === 'rejected' ? 'red' : 'amber'}>{item.status}</Pill></div>)}</section>}
        </aside>
      </div> : <div className="library-locked panel"><span className="prompt-icon"><Icon name="lock" size={23}/></span><div><h2>Sign in to view club questions and activity.</h2><p>Approved club members can view the current assignment, history, and standings.</p></div><button className="button button-dark" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Sign in <Icon name="arrow" size={14}/></button></div>}
      <footer className="site-footer"><span>DSAvation</span><span>Technovation – The Networking Club</span></footer>
    </main>}

    {explainerModalOpen && selectedExplainer && (
      <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExplainerModalOpen(false); }}>
        <section className="auth-modal explainer-modal" role="dialog" aria-modal="true" aria-labelledby="explainer-modal-title">
          <button className="modal-close" onClick={() => setExplainerModalOpen(false)} aria-label="Close">×</button>
          <div className="eyebrow"><span className="eyebrow-line"/>TODAY'S SOLUTION SPOTLIGHT</div>
          <h2 id="explainer-modal-title">Solution Explainer Selected 🎉</h2>
          <p className="auth-lede">
            Randomly selected among members who attempted today's question. Download or copy their share card image to share on WhatsApp or the club group so they can explain their solution!
          </p>

          <div className="explainer-preview-card">
            <div className="explainer-preview-header">
              <span className="explainer-preview-brand">ABES TECHNOVATION CLUB · DSAVATION</span>
              <span className="explainer-preview-tag">SELECTED EXPLAINER</span>
            </div>

            <div className="explainer-preview-question">
              <span>QUESTION OF THE DAY</span>
              <strong>
                LC #{assignedQuestion?.id || selectedExplainer.questionId} · {assignedQuestion?.title || selectedExplainer.questionTitle}
                {assignedQuestion?.difficulty && ` (${assignedQuestion.difficulty})`}
              </strong>
            </div>

            <div className="explainer-preview-body">
              <MemberAvatar person={selectedExplainer} className="explainer-preview-avatar" label="" />
              <div className="explainer-preview-info">
                <h3>{selectedExplainer.name}</h3>
                <div className="explainer-preview-dept">
                  {selectedExplainer.department || 'Club Member'} {selectedExplainer.studyYear && `· ${studyYearLabel(selectedExplainer.studyYear)}`}
                </div>
                <div className="explainer-preview-handles">
                  {selectedExplainer.githubUsername && <span className="gh-tag">GitHub: @{selectedExplainer.githubUsername}</span>}
                </div>
              </div>
            </div>

            <div className="explainer-preview-footer">
              <small>
                ✓ Submitted {new Date(selectedExplainer.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST · Verified Solution Commit
              </small>
            </div>
          </div>

          <div className="explainer-modal-actions">
            <button
              type="button"
              className="button button-green"
              onClick={handleDownloadExplainerImage}
              disabled={imageExporting}
            >
              <Icon name="download" size={14}/> {imageExporting ? 'Generating Image…' : 'Download Share Image (PNG)'}
            </button>
            <button
              type="button"
              className="button button-dark"
              onClick={handleCopyExplainerImage}
              disabled={imageExporting}
            >
              <Icon name="copy" size={14}/> {copiedNotice ? '✓ Copied to Clipboard!' : 'Copy Card Image'}
            </button>
          </div>
        </section>
      </div>
    )}

    {exportModalOpen && typeof document !== 'undefined' && createPortal(
      <div
        className="modal-scrim"
        role="presentation"
        onMouseDown={(event) => { if (event.target === event.currentTarget) setExportModalOpen(false); }}
      >
        <section className="auth-modal export-csv-modal" role="dialog" aria-modal="true" aria-labelledby="export-csv-modal-title">
          <button className="modal-close" onClick={() => setExportModalOpen(false)} aria-label="Close">×</button>
          <div className="eyebrow"><span className="eyebrow-line"/>MODERATION · EXPORT REPORT</div>
          <h2 id="export-csv-modal-title">Export Submissions as .CSV<span>.</span></h2>
          <p className="auth-lede">
            Export today's question activity to a spreadsheet. Choose who to export, filter by year of study or department, and download clean data (LeetCode IDs are removed).
          </p>

          <div className="export-modal-content">
            <div className="export-field-group">
              <label className="export-field-label">SELECT AUDIENCE TO EXPORT</label>
              <div className="export-radio-cards" role="radiogroup" aria-label="Export audience">
                <label className={`export-radio-card ${exportTarget === 'attempted' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="exportTarget"
                    value="attempted"
                    checked={exportTarget === 'attempted'}
                    onChange={(e) => setExportTarget(e.target.value)}
                  />
                  <div className="export-radio-info">
                    <strong>Attempted today's question</strong>
                    <span>Members who submitted a solution ({todaySubmissionsData.submissions?.length || 0})</span>
                  </div>
                </label>

                <label className={`export-radio-card ${exportTarget === 'not_attempted' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="exportTarget"
                    value="not_attempted"
                    checked={exportTarget === 'not_attempted'}
                    onChange={(e) => setExportTarget(e.target.value)}
                  />
                  <div className="export-radio-info">
                    <strong>Not attempted today's question</strong>
                    <span>Approved members who haven't submitted today ({todaySubmissionsData.notAttempted?.length || 0})</span>
                  </div>
                </label>

                <label className={`export-radio-card ${exportTarget === 'all' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="exportTarget"
                    value="all"
                    checked={exportTarget === 'all'}
                    onChange={(e) => setExportTarget(e.target.value)}
                  />
                  <div className="export-radio-info">
                    <strong>All club members</strong>
                    <span>Everyone with their submission status ({(todaySubmissionsData.submissions?.length || 0) + (todaySubmissionsData.notAttempted?.length || 0)})</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="export-filters-grid">
              <label className="export-select-field">
                <span>FILTER BY YEAR OF STUDY</span>
                <select value={exportStudyYear} onChange={(e) => setExportStudyYear(e.target.value)}>
                  <option value="all">All years of study</option>
                  <option value="first-year">First year</option>
                  <option value="second-year">Second year</option>
                  <option value="third-year">Third year</option>
                  <option value="fourth-year">Fourth year</option>
                  <option value="passed">Passed out</option>
                </select>
              </label>

              <label className="export-select-field">
                <span>FILTER BY CLUB DEPARTMENT</span>
                <select value={exportDepartment} onChange={(e) => setExportDepartment(e.target.value)}>
                  <option value="all">All departments</option>
                  {CLUB_DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="export-summary-box">
              <div className="export-summary-main">
                <Icon name="download" size={16}/>
                <div>
                  <strong>{matchingExportCount} member{matchingExportCount === 1 ? '' : 's'} selected</strong>
                  <p>
                    {matchingExportCount === 0
                      ? 'No members match the current filter selection.'
                      : `Will export ${exportTarget === 'not_attempted' ? 'unattempted' : exportTarget === 'attempted' ? 'attempted' : 'all'} members${exportStudyYear !== 'all' ? ` in ${studyYearLabel(exportStudyYear)}` : ''}${exportDepartment !== 'all' ? ` (${exportDepartment})` : ''}. LeetCode IDs are excluded.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="export-modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setExportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-green"
                onClick={executeExportCsv}
                disabled={matchingExportCount === 0}
              >
                <Icon name="download" size={14}/> <span>Download .CSV ({matchingExportCount})</span>
              </button>
            </div>
          </div>
        </section>
      </div>,
      document.body
    )}

    {resetLink && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetLink(null); }}><section className="auth-modal reset-link-modal" role="dialog" aria-modal="true" aria-labelledby="reset-link-title"><button className="modal-close" onClick={() => setResetLink(null)} aria-label="Close">×</button><div className="eyebrow"><span className="eyebrow-line"/>ONE-TIME PASSWORD RESET</div><h2 id="reset-link-title">Reset link for {resetLink.name}<span>.</span></h2><p className="auth-lede">This link expires at {new Date(resetLink.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} India time and works once. Share it directly with the member. The server stores only a hash.</p><label className="reset-link-field">RESET URL<input value={resetLink.url} readOnly onFocus={(event) => event.target.select()}/></label><button className="button button-dark auth-submit" onClick={copyResetLink}>Copy one-time link <Icon name="arrow" size={14}/></button></section></div>}

    {authOpen && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="eyebrow"><span className="eyebrow-line"/>DSAVATION MEMBER ACCESS</div><h2 id="auth-title">{authMode === 'signup' ? 'Create your account' : 'Welcome back'}<span>.</span></h2><p className="auth-lede">{authMode === 'signup' ? 'Use your college email to request access to the private tracker and club challenge. An administrator must approve your account.' : 'Sign in to save private progress and submit to the club challenge.'}</p>
        <form onSubmit={submitAuth} className="auth-form">
          {authMode === 'signup' && <><label>FULL NAME<input name="name" autoComplete="name" required minLength="2" maxLength="80" placeholder="Your name"/></label><label>CLUB DEPARTMENT<select name="department" required defaultValue=""><option value="" disabled>Select your club department</option>{CLUB_DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label><label>YEAR OF STUDY<select name="studyYear" required defaultValue=""><option value="" disabled>Select your current year</option><option value="first-year">First year</option><option value="second-year">Second year</option><option value="third-year">Third year</option><option value="fourth-year">Fourth year</option><option value="passed">Passed out</option></select></label><label>ABES EMAIL<input name="email" type="email" autoComplete="email" required pattern=".+@abes\.ac\.in" title="Use your @abes.ac.in email" placeholder="you@abes.ac.in"/></label><label>GITHUB USERNAME<input name="githubUsername" required pattern="[A-Za-z0-9-]{1,39}" placeholder="your-github-handle"/><small>After signup, connect GitHub to replace this with your verified username.</small></label><label>LEETCODE USERNAME<input name="leetcodeUsername" required pattern="[A-Za-z0-9_-]{1,40}" placeholder="your-leetcode-id"/></label><label>PASSWORD<input name="password" type="password" autoComplete="new-password" minLength="10" maxLength="128" required placeholder="At least 10 characters"/></label></>}
          {authMode === 'login' && <><label>ABES EMAIL<input name="email" type="email" autoComplete="email" required pattern=".+@abes\.ac\.in" placeholder="you@abes.ac.in"/></label><label>PASSWORD<input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label></>}
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="button button-dark auth-submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Request account' : 'Sign in'} <Icon name="arrow" size={14}/></button>
        </form>
        <div className="auth-switch">{authMode === 'signup' ? 'Already a member?' : 'New to DSAvation?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setAuthError(''); }}>{authMode === 'signup' ? 'Sign in' : 'Create account'}</button>{authMode === 'login' && <><span> · </span><button onClick={() => setAuthError('Ask an administrator to generate a one-time password reset link for your account.')}>Forgot password?</button></>}</div>
        <p className="auth-privacy"><Icon name="lock" size={13}/> Personal checkmarks are private and never count toward the club scoreboard.</p>
      </section></div>}
    <div className={`mobile-bottom-nav ${account ? 'has-account' : ''} ${isAdmin ? 'admin-nav' : ''}`}><button className={view === 'general' ? 'active' : ''} onClick={() => navigate('general')}><IconifyIcon icon="bi:journal-bookmark" width={17} height={17}/>General</button><button className={view === 'progress' ? 'active' : ''} onClick={() => { navigate('progress'); if (!account) { setAuthMode('login'); setAuthOpen(true); } }}><Icon name="check" size={17}/>Account</button>{account && <button className={view === 'members' ? 'active' : ''} onClick={() => navigate('members')}><Icon name="users" size={17}/>Members</button>}<button className={view === 'club' ? 'active' : ''} onClick={() => navigate('club')}><Icon name="users" size={17}/>Club</button>{isAdmin && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}><Icon name="users" size={17}/>Admin</button>}</div>
    <Analytics/>
  </div>;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DSAvation UI ErrorBoundary]', error, errorInfo?.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback-container" role="alert">
          <div className="error-fallback-card">
            <div className="error-fallback-icon" aria-hidden="true">⚠️</div>
            <h2>Something went wrong</h2>
            <p>
              An unexpected display issue occurred in this section. Your personal and club progress remains safe in the database.
            </p>
            <div className="error-fallback-actions">
              <button type="button" className="button button-dark" onClick={this.handleReset}>
                Try again
              </button>
              <button type="button" className="button button-quiet" onClick={this.handleReload}>
                Reload page
              </button>
            </div>
            {this.state.error?.message && (
              <details className="error-fallback-details">
                <summary>Technical error details</summary>
                <code>{this.state.error.message}</code>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[DSAvation Unhandled Rejection]:', event.reason);
  });
  window.addEventListener('error', (event) => {
    console.error('[DSAvation Window Error]:', event.error || event.message);
  });
}

createRoot(document.getElementById('app')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
