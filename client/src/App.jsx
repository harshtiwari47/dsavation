import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { Icon as IconifyIcon } from "@iconify/react";

import { api } from "./api/client.js";
import { CLUB_DEPARTMENTS, QUESTIONS_PER_PAGE } from "./data/constants.js";
import { AVATAR_STYLES, createAvatarSeeds } from "./utils/avatar.js";
import { downloadExplainerImage, copyExplainerImage } from "./utils/explainerCard.js";
import { initLiquidGlass } from "./utils/liquidGlass.js";
import { localDay, formatDmy, shiftDay, studyYearLabel } from "./utils/dateUtils.js";
import {
  getMessageTemplate,
  saveMessageTemplate,
  resetMessageTemplate,
  renderMessageText,
} from "./utils/messageTemplates.js";
import { normalizeQuestions } from "./utils/normalizeQuestions.js";
import { initialTheme, rememberDarkStyle, storedDarkStyle, rememberLightStyle, storedLightStyle } from "./utils/theme.js";
import { getViewFromPath, getPathFromView } from "./routes/routes.js";

import { AtmosphereBackdrop } from "./components/atmosphere/AtmosphereBackdrop.jsx";
import { Navbar } from "./components/layout/Navbar.jsx";
import { MobileNav } from "./components/layout/MobileNav.jsx";
import { NoticeBanner } from "./components/layout/NoticeBanner.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { ActivityPage } from "./pages/ActivityPage.jsx";
import { MembersPage } from "./pages/MembersPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ClubChallengePage } from "./pages/ClubChallengePage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { AuthModal } from "./components/modals/AuthModal.jsx";
import { ForgotPasswordModal } from "./components/modals/ForgotPasswordModal.jsx";
import { ExplainerModal } from "./components/modals/ExplainerModal.jsx";
import { RepickModal } from "./components/modals/RepickModal.jsx";
import { ExportCsvModal } from "./components/modals/ExportCsvModal.jsx";
import { MessageBroadcastModal } from "./components/modals/MessageBroadcastModal.jsx";

export function App() {
  const [view, setView] = useState(() => getViewFromPath(window.location.pathname));

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || Boolean(window.navigator.standalone);
  });

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredInstallPrompt(null);
      setNotice('DSAvation app installed successfully!');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (isAppInstalled) {
      setNotice('DSAvation is already installed on your device.');
      return;
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsAppInstalled(true);
      }
      setDeferredInstallPrompt(null);
    } else {
      setNotice('To install DSAvation: use "Install app" in your browser address bar/menu, or "Add to Home Screen" on mobile.');
    }
  };

  const [account, setAccount] = useState(null);
  const [theme, setTheme] = useState(initialTheme);
  const [darkStyle, setDarkStyle] = useState(storedDarkStyle);
  const [lightStyle, setLightStyle] = useState(storedLightStyle);
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
  const [clubActivity, setClubActivity] = useState({});
  const [clubLocked, setClubLocked] = useState({});
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
  const [memberCounts, setMemberCounts] = useState({ pending: 0, approved: 0, leetcodePending: 0 });
  const [directoryMembers, setDirectoryMembers] = useState([]);
  const [adminOverlayMember, setAdminOverlayMember] = useState(null);
  const [auraAwardAmount, setAuraAwardAmount] = useState('');
  const [auraAwardBusy, setAuraAwardBusy] = useState(false);
  const [repickModalOpen, setRepickModalOpen] = useState(false);
  const [repickMode, setRepickMode] = useState('custom');
  const [repickCandidates, setRepickCandidates] = useState([]);
  const [repickLoading, setRepickLoading] = useState(false);
  const [repickSearch, setRepickSearch] = useState('');
  const [repickCycle, setRepickCycle] = useState(null);
  const [repickWaivePenalty, setRepickWaivePenalty] = useState(false);
  const [directoryDepartments, setDirectoryDepartments] = useState([]);
  const [directoryPagination, setDirectoryPagination] = useState({ page: 1, pageSize: 60, total: 0, totalPages: 1 });
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryDepartment, setDirectoryDepartment] = useState('');
  const [directoryYear, setDirectoryYear] = useState('');
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [directoryLeetcodeStats, setDirectoryLeetcodeStats] = useState({});
  const [leetcodeStatsBusy, setLeetcodeStatsBusy] = useState('');
  const [showAllLeetcodeStats, setShowAllLeetcodeStats] = useState(false);
  const [loadingAllStats, setLoadingAllStats] = useState(false);
  const [individuallyOpenedStats, setIndividuallyOpenedStats] = useState({});
  const directoryDebounceRef = useRef(null);
  const [membersBusy, setMembersBusy] = useState(false);
  const [scoredBusy, setScoredBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [leaderboardBusy, setLeaderboardBusy] = useState(false);
  const [avatarDraftStyle, setAvatarDraftStyle] = useState('critters');
  const [avatarDraftSeed, setAvatarDraftSeed] = useState('');
  const [avatarDraftCustomUrl, setAvatarDraftCustomUrl] = useState('');
  const [customUrlStatus, setCustomUrlStatus] = useState({ valid: false, type: 'neutral', message: 'Enter a public direct image link (PNG, JPG, WebP, SVG).' });
  const [avatarChoices, setAvatarChoices] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activityPagination, setActivityPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [rateLimitCount, setRateLimitCount] = useState(null);
  const [rateLimitBusy, setRateLimitBusy] = useState(false);
  const [scoredSubmissions, setScoredSubmissions] = useState([]);
  const [scoredPagination, setScoredPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [leaderboardPagination, setLeaderboardPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [currentUserRank, setCurrentUserRank] = useState(null);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, pageSize: 8, total: 0, totalPages: 1 });
  const [questionPage, setQuestionPage] = useState(1);
  const QUESTIONS_PER_PAGE = 20;
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [commitUrl, setCommitUrl] = useState('');
  const [profileName, setProfileName] = useState(() => account?.name || '');
  const [profileDepartment, setProfileDepartment] = useState(() => account?.department || '');
  const [profileStudyYear, setProfileStudyYear] = useState(() => account?.studyYear || '');
  const [profileGithubUsername, setProfileGithubUsername] = useState(() => account?.githubUsername || '');
  const [profileLeetcodeUsername, setProfileLeetcodeUsername] = useState(() => account?.leetcodeUsername || '');
  const [profileCardBgUrl, setProfileCardBgUrl] = useState(() => account?.cardBgUrl || '');
  const [accountSubmissionMethod, setAccountSubmissionMethod] = useState(() => (account?.explicitSubmissionMethod ? account?.defaultSubmissionMethod : 'github') || 'github');
  const [submissionHelpOpen, setSubmissionHelpOpen] = useState(false);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [assignmentDate, setAssignmentDate] = useState(localDay());
  const [assignmentQuestion, setAssignmentQuestion] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [selectedExplainer, setSelectedExplainer] = useState(null);
  const [explainerModalOpen, setExplainerModalOpen] = useState(false);
  const [imageExporting, setImageExporting] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [copiedAnnouncement, setCopiedAnnouncement] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageModalType, setMessageModalType] = useState('daily');
  const [messageModalTab, setMessageModalTab] = useState('preview');
  const [messageDraft, setMessageDraft] = useState('');
  const [templateDraft, setTemplateDraft] = useState('');
  const [messageCopiedNotice, setMessageCopiedNotice] = useState(false);
  const [templateSavedNotice, setTemplateSavedNotice] = useState(false);
  const [memberBusy, setMemberBusy] = useState('');
  const [memberFilter, setMemberFilter] = useState('heatmap');
  const [memberQuery, setMemberQuery] = useState('');
  const [publicPreferenceBusy, setPublicPreferenceBusy] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState('attempted');
  const [exportStudyYear, setExportStudyYear] = useState('second-year');
  const [exportDepartment, setExportDepartment] = useState('all');
  const [refreshingLeaderboard, setRefreshingLeaderboard] = useState(false);
  const [auditCardOpen, setAuditCardOpen] = useState(false);
  const [acceptedSubmissionsOpen, setAcceptedSubmissionsOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showMembersHeatmap, setShowMembersHeatmap] = useState(false);
  const [submissionHeatmapCounts, setSubmissionHeatmapCounts] = useState({});
  const [submissionHeatmapSecondYearCounts, setSubmissionHeatmapSecondYearCounts] = useState({});
  const [heatmapSecondYearOnly, setHeatmapSecondYearOnly] = useState(false);
  const [submissionHeatmapBusy, setSubmissionHeatmapBusy] = useState(false);
  const [heatmapDayModal, setHeatmapDayModal] = useState(null); // { date, count }
  const [heatmapDayData, setHeatmapDayData] = useState(null);  // { date, submissions, count }
  const [heatmapDayBusy, setHeatmapDayBusy] = useState(false);
  const heatmapDatePickerRef = useRef(null);

  useEffect(() => {
    if (!account) return;
    setProfileName(account.name || '');
    setProfileDepartment(account.department || '');
    setProfileStudyYear(account.studyYear || '');
    setProfileGithubUsername(account.githubUsername || '');
    setProfileLeetcodeUsername(account.leetcodeUsername || '');
    setProfileCardBgUrl(account.cardBgUrl || '');
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
    const isApproved = account.role === 'admin' || account.leetcodeApproval === 'approved';
    if (account.explicitSubmissionMethod && account.defaultSubmissionMethod && (account.defaultSubmissionMethod !== 'leetcode' || isApproved)) {
      setAccountSubmissionMethod(account.defaultSubmissionMethod);
    } else {
      setAccountSubmissionMethod('github');
    }
  }, [account?.id, account?.name, account?.department, account?.studyYear, account?.githubUsername, account?.leetcodeUsername, account?.cardBgUrl, account?.defaultSubmissionMethod, account?.explicitSubmissionMethod, account?.leetcodeApproval, account?.role]);

  const isProfileDirty = useMemo(() => {
    if (!account) return false;
    if (profileName.trim() !== (account.name || '').trim()) return true;
    if (profileDepartment !== (account.department || '')) return true;
    if (profileStudyYear !== (account.studyYear || '')) return true;
    if (profileGithubUsername.trim() !== (account.githubUsername || '').trim()) return true;
    if (profileLeetcodeUsername.trim() !== (account.leetcodeUsername || '').trim()) return true;
    if (profileCardBgUrl.trim() !== (account.cardBgUrl || '').trim()) return true;
    if (accountSubmissionMethod !== (account.defaultSubmissionMethod || 'github')) return true;
    if (avatarDraftStyle !== (account.avatarStyle || 'critters')) return true;
    if (avatarDraftStyle === 'custom') {
      const savedCustom = (account.avatarUrl || account.avatarSeed || '').trim();
      if (avatarDraftCustomUrl.trim() !== savedCustom) return true;
    } else {
      const savedSeed = account.avatarSeed || account.id;
      if (avatarDraftSeed !== savedSeed) return true;
    }
    return false;
  }, [account, profileName, profileDepartment, profileStudyYear, profileGithubUsername, profileLeetcodeUsername, profileCardBgUrl, accountSubmissionMethod, avatarDraftStyle, avatarDraftCustomUrl, avatarDraftSeed]);

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

  useEffect(() => {
    setQuestionPage(1);
  }, [query, topic, difficulty, structure, pattern, sort]);

  const totalQuestionPages = Math.max(1, Math.ceil(visibleQuestions.length / QUESTIONS_PER_PAGE));
  const safeQuestionPage = Math.min(questionPage, totalQuestionPages);
  const paginatedQuestions = useMemo(() => {
    const start = (safeQuestionPage - 1) * QUESTIONS_PER_PAGE;
    return visibleQuestions.slice(start, start + QUESTIONS_PER_PAGE);
  }, [visibleQuestions, safeQuestionPage]);
  const solvedCount = Object.keys(progress).length;
  const clubTrackedCount = Object.keys(clubActivity).length;
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
  const isLeetcodeApproved = Boolean(account && (account.role === 'admin' || account.leetcodeApproval === 'approved'));
  const editingTodayAssignment = club.assignment?.dateKey === localDay();
  const assignedQuestion = club.assignment ? byId.get(Number(club.assignment.questionId)) : null;
  const pendingMembers = members.filter((member) => member.approvalStatus !== 'approved' || member.leetcodeApproval === 'pending');
  const approvedMembers = members.filter((member) => member.approvalStatus === 'approved');
  const displayedMembers = (
    memberFilter === 'approved' ? approvedMembers :
      memberFilter === 'all' ? members : pendingMembers
  ).filter((member) => !memberQuery.trim() || `${member.name} ${member.department} ${member.email} ${member.githubUsername || ''} ${member.leetcodeUsername || ''}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));

  async function refreshLeaderboardData() {
    setRefreshingLeaderboard(true);
    try {
      await loadClub();
    } finally {
      setRefreshingLeaderboard(false);
    }
  }

  async function loadClub() {
    try {
      const [today, assigned, board] = await Promise.all([
        api('/club/today'),
        api(`/club/assignments?page=${historyPagination.page}&pageSize=8`),
        api(`/club/leaderboard?page=${leaderboardPagination.page}&pageSize=20`),
      ]);
      setClub(today);
      if (today?.assignment?.explainer) {
        setSelectedExplainer(today.assignment.explainer);
      }
      setHistory(assigned.assignments || []);
      setHistoryPagination(assigned.pagination || { page: 1, pageSize: 8, total: 0, totalPages: 1 });
      setLeaderboard(board.leaderboard || []);
      setLeaderboardPagination(board.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      if (board.userRank !== undefined) setCurrentUserRank(board.userRank);
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
      const rows = personal.progress || [];
      const activityRows = personal.activity || rows.filter((item) => item.isClub);
      setProgress(Object.fromEntries(rows.map((item) => [item.questionId, item.solvedAt])));
      setClubLocked(Object.fromEntries(rows.filter((item) => item.isClub).map((item) => [item.questionId, true])));
      setClubActivity(Object.fromEntries(activityRows.map((item) => [item.questionId, item.clubSubmittedAt || item.solvedAt])));
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
        const queryStatus = memberFilter === 'heatmap' ? 'pending' : memberFilter;
        const query = new URLSearchParams({ page: String(membersPagination.page), pageSize: '20', status: queryStatus });
        if (memberQuery.trim()) query.set('q', memberQuery.trim());
        const [memberResult, scoredResult, activityResult, heatmapResult] = await Promise.all([
          api(`/admin/members?${query}`),
          api('/admin/submissions?status=accepted&page=1&pageSize=10'),
          api('/admin/activity?page=1&pageSize=10'),
          api('/admin/submissions-heatmap'),
        ]);
        setMembers(memberResult.members || []);
        setMembersPagination(memberResult.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
        setMemberCounts(memberResult.counts || { pending: 0, approved: 0, leetcodePending: 0 });
        setScoredSubmissions(scoredResult.submissions || []);
        setScoredPagination(scoredResult.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
        setActivity(activityResult.activity || []);
        setActivityPagination(activityResult.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
        setSubmissionHeatmapCounts(heatmapResult?.counts || {});
        setSubmissionHeatmapSecondYearCounts(heatmapResult?.secondYearCounts || {});
      } catch (error) { setMembers([]); setScoredSubmissions([]); setActivity([]); setNotice(error.message); }
    } else { setMembers([]); setScoredSubmissions([]); setActivity([]); }
  }

  async function refreshMembers(page = 1, status = memberFilter, search = memberQuery) {
    setMembersBusy(true);
    const queryStatus = status === 'heatmap' ? 'pending' : status;
    const params = new URLSearchParams({ page: String(page), pageSize: '20', status: queryStatus });
    if (search.trim()) params.set('q', search.trim());
    try {
      const result = await api(`/admin/members?${params}`);
      if (!(result.members || []).length && page > 1 && page > (result.pagination?.totalPages || 1)) {
        return refreshMembers(result.pagination?.totalPages || 1, status, search);
      }
      setMembers(result.members || []);
      setMembersPagination(result.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
      setMemberCounts(result.counts || { pending: 0, approved: 0, leetcodePending: 0 });
    } catch (error) { setNotice(error.message); }
    finally { setMembersBusy(false); }
  }

  const MIN_HEATMAP_DATE = '2026-11-01';
  const todayDateKey = localDay();
  const isHeatmapPrevDisabled = !heatmapDayModal?.date || heatmapDayModal.date <= MIN_HEATMAP_DATE;
  const isHeatmapNextDisabled = !heatmapDayModal?.date || heatmapDayModal.date >= todayDateKey;

  function navigateHeatmapDay(offset) {
    if (!heatmapDayModal?.date) return;
    const [y, m, d] = heatmapDayModal.date.split('-').map(Number);
    const nextDt = new Date(Date.UTC(y, m - 1, d + offset));
    let nextDateKey = nextDt.toISOString().slice(0, 10);
    if (nextDateKey < MIN_HEATMAP_DATE) nextDateKey = MIN_HEATMAP_DATE;
    if (nextDateKey > todayDateKey) nextDateKey = todayDateKey;
    if (nextDateKey !== heatmapDayModal.date) {
      openHeatmapDay(nextDateKey);
    }
  }

  async function handleDownloadMonthCsv(monthKey, shortMonth, format = 'xlsx') {
    try {
      const yearQuery = heatmapSecondYearOnly ? '&studyYear=second-year' : '';
      const response = await fetch(`/api/admin/month-submissions-csv?month=${encodeURIComponent(monthKey)}&format=${format}${yearQuery}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to download file');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `submissions-${monthKey}${heatmapSecondYearOnly ? '-2nd-year' : ''}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setNotice(`Download error: ${err.message}`);
    }
  }

  async function openHeatmapDay(date, count) {
    const activeCounts = heatmapSecondYearOnly ? submissionHeatmapSecondYearCounts : submissionHeatmapCounts;
    const knownCount = count ?? activeCounts[date] ?? 0;
    setHeatmapDayModal({ date, count: knownCount });
    setHeatmapDayData(null);
    setHeatmapDayBusy(true);
    try {
      const yearQuery = heatmapSecondYearOnly ? '&studyYear=second-year' : '';
      const result = await api(`/admin/submissions-by-date?date=${encodeURIComponent(date)}${yearQuery}`);
      setHeatmapDayData(result);
    } catch (error) {
      setHeatmapDayData({ date, count: 0, submissions: [], error: error.message });
    } finally {
      setHeatmapDayBusy(false);
    }
  }

  function closeHeatmapDayModal() {
    setHeatmapDayModal(null);
    setHeatmapDayData(null);
  }

  async function loadDirectory(page = 1, search = directoryQuery, department = directoryDepartment, year = directoryYear) {
    setDirectoryBusy(true);
    const params = new URLSearchParams({ page: String(page), pageSize: '60' });
    if (search.trim()) params.set('q', search.trim());
    if (department) params.set('department', department);
    if (year) params.set('year', year);
    try {
      const result = await api(`/members?${params}`);
      const sorted = (result.members || []).slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
      setDirectoryMembers(sorted);
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

  async function toggleAllLeetcodeStats() {
    if (showAllLeetcodeStats) {
      setShowAllLeetcodeStats(false);
      setIndividuallyOpenedStats({});
      return;
    }
    setShowAllLeetcodeStats(true);
    const uncurated = directoryMembers.filter((m) => m.leetcodeUsername && !directoryLeetcodeStats[m.id]?.stats);
    if (!uncurated.length) return;
    setLoadingAllStats(true);
    try {
      const chunkSize = 4;
      for (let i = 0; i < uncurated.length; i += chunkSize) {
        const chunk = uncurated.slice(i, i + chunkSize);
        await Promise.allSettled(chunk.map(async (member) => {
          try {
            const res = await api(`/members/${member.id}/leetcode-stats`);
            setDirectoryLeetcodeStats((cur) => ({ ...cur, [member.id]: res }));
          } catch (err) {
            setDirectoryLeetcodeStats((cur) => ({ ...cur, [member.id]: { available: false, reason: err.message } }));
          }
        }));
      }
    } finally {
      setLoadingAllStats(false);
    }
  }

  useEffect(() => {
    if (!showAllLeetcodeStats || !isAdmin || !directoryMembers.length) return;
    const uncurated = directoryMembers.filter((m) => m.leetcodeUsername && !directoryLeetcodeStats[m.id]?.stats && !directoryLeetcodeStats[m.id]?.reason);
    if (!uncurated.length) return;
    let cancelled = false;
    (async () => {
      const chunkSize = 4;
      for (let i = 0; i < uncurated.length; i += chunkSize) {
        if (cancelled) break;
        const chunk = uncurated.slice(i, i + chunkSize);
        await Promise.allSettled(chunk.map(async (member) => {
          try {
            const res = await api(`/members/${member.id}/leetcode-stats`);
            if (!cancelled) setDirectoryLeetcodeStats((cur) => ({ ...cur, [member.id]: res }));
          } catch (err) {
            if (!cancelled) setDirectoryLeetcodeStats((cur) => ({ ...cur, [member.id]: { available: false, reason: err.message } }));
          }
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [directoryMembers, showAllLeetcodeStats, isAdmin]);

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
      if (active) setCustomUrlStatus({ valid: true, type: 'success', message: 'Valid image verified' });
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
    setActivityBusy(true);
    try {
      const result = await api(`/admin/activity?page=${page}&pageSize=10`);
      setActivity(result.activity || []);
      setActivityPagination(result.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
    finally { setActivityBusy(false); }
  }

  async function refreshRateLimits() {
    setRateLimitBusy(true);
    try {
      const result = await api('/admin/rate-limits');
      setRateLimitCount(result.count ?? 0);
    } catch {
      // ignore
    } finally {
      setRateLimitBusy(false);
    }
  }

  async function clearAllRateLimits() {
    setRateLimitBusy(true);
    try {
      const result = await api('/admin/clear-rate-limits', { method: 'POST', body: {} });
      setRateLimitCount(0);
      setNotice(`Cleared ${result.clearedCount ?? 0} rate limit record(s). All members and IPs can now make requests.`);
      await refreshActivity(1);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRateLimitBusy(false);
    }
  }

  async function refreshScoredSubmissions(page = 1) {
    setScoredBusy(true);
    try {
      const result = await api(`/admin/submissions?status=accepted&page=${page}&pageSize=10`);
      setScoredSubmissions(result.submissions || []);
      setScoredPagination(result.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
    finally { setScoredBusy(false); }
  }

  async function refreshPendingSubmissions(page = 1) {
    setPendingBusy(true);
    try {
      const result = await api(`/admin/submissions?status=pending&page=${page}&pageSize=10`);
      setPending(result.submissions || []);
      setPendingPagination(result.pagination || { page, pageSize: 10, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
    finally { setPendingBusy(false); }
  }

  async function loadSubmissionHeatmap() {
    setSubmissionHeatmapBusy(true);
    try {
      const result = await api('/admin/submissions-heatmap');
      setSubmissionHeatmapCounts(result.counts || {});
      setSubmissionHeatmapSecondYearCounts(result.secondYearCounts || {});
    } catch (error) { setNotice(error.message); } finally { setSubmissionHeatmapBusy(false); }
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

  const filteredSubmissions = useMemo(() => {
    let list = todaySubmissionsData.submissions || [];
    if (exportStudyYear !== 'all') {
      list = list.filter((s) => s.studyYear === exportStudyYear);
    }
    return list;
  }, [todaySubmissionsData.submissions, exportStudyYear]);

  const filteredNotAttempted = useMemo(() => {
    let list = todaySubmissionsData.notAttempted || [];
    if (exportStudyYear !== 'all') {
      list = list.filter((s) => s.studyYear === exportStudyYear);
    }
    return list;
  }, [todaySubmissionsData.notAttempted, exportStudyYear]);

  const exportPool = useMemo(() => {
    let pool = [];
    if (exportTarget === 'not_attempted') {
      pool = filteredNotAttempted;
    } else if (exportTarget === 'all') {
      pool = [...filteredSubmissions, ...filteredNotAttempted];
    } else {
      pool = filteredSubmissions;
    }
    if (exportDepartment !== 'all') {
      pool = pool.filter((s) => s.department === exportDepartment);
    }
    return pool;
  }, [exportTarget, exportDepartment, filteredSubmissions, filteredNotAttempted]);

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

  async function openRepickModal() {
    setRepickModalOpen(true);
    setRepickMode('custom');
    setRepickSearch('');
    setRepickWaivePenalty(false);
    setRepickLoading(true);
    try {
      const res = await api('/admin/explainer-candidates');
      setRepickCandidates(res.candidates || []);
      setRepickCycle(res.cycle || null);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setRepickLoading(false);
    }
  }

  async function executeRepick(targetUserId = null) {
    if (pickExplainerBusy) return;
    setPickExplainerBusy(true);
    try {
      const body = { repick: true };
      if (targetUserId) {
        body.userId = targetUserId;
      }
      if (repickWaivePenalty) {
        body.waivePenalty = true;
      }
      const res = await api('/admin/pick-explainer', { method: 'POST', body });
      if (res.explainer) {
        setSelectedExplainer(res.explainer);
        setClub((prev) => ({
          ...prev,
          assignment: prev.assignment ? { ...prev.assignment, explainer: res.explainer } : prev.assignment,
        }));
        setTodaySubmissionsData((prev) => ({ ...prev, explainer: res.explainer }));
        setRepickModalOpen(false);
        setExplainerModalOpen(true);
        setNotice(`Selected ${res.explainer.name} as today's solution explainer! Previous member's turn restored.`);
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setPickExplainerBusy(false);
    }
  }

  async function handleRepickExplainer() {
    await openRepickModal();
  }

  async function handleRemoveExplainer() {
    if (pickExplainerBusy) return;
    if (!window.confirm("Remove today's explainer? This person's turn will be restored so they can be picked again.")) return;
    setPickExplainerBusy(true);
    try {
      await api('/admin/pick-explainer', { method: 'DELETE' });
      setSelectedExplainer(null);
      setExplainerModalOpen(false);
      setClub((prev) => ({
        ...prev,
        assignment: prev.assignment ? { ...prev.assignment, explainer: null } : prev.assignment,
      }));
      setTodaySubmissionsData((prev) => ({ ...prev, explainer: null }));
      setNotice("Explainer removed. Member's turn has been restored.");
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
    setLeaderboardBusy(true);
    try {
      const result = await api(`/club/leaderboard?page=${page}&pageSize=20`);
      setLeaderboard(result.leaderboard || []);
      setLeaderboardPagination(result.pagination || { page, pageSize: 20, total: 0, totalPages: 1 });
      if (result.userRank !== undefined) setCurrentUserRank(result.userRank);
    } catch (error) { setNotice(error.message); }
    finally { setLeaderboardBusy(false); }
  }

  async function loadHistoryPage(page) {
    setHistoryBusy(true);
    try {
      const result = await api(`/club/assignments?page=${page}&pageSize=8`);
      setHistory(result.assignments || []);
      setHistoryPagination(result.pagination || { page, pageSize: 8, total: 0, totalPages: 1 });
    } catch (error) { setNotice(error.message); }
    finally { setHistoryBusy(false); }
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
    if (!authReady || view !== 'dashboard' || isAdmin) return;
    window.history.replaceState({}, '', '/');
    setView('general');
    if (account) setNotice('The member dashboard is available to administrators only.');
  }, [authReady, isAdmin]);

  useEffect(() => {
    const onPopState = () => setView(getViewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (view === 'members' && account) loadDirectory(1);
    if (view === 'dashboard' && account?.role === 'admin') {
      if (Object.keys(submissionHeatmapCounts).length === 0) loadSubmissionHeatmap();
      refreshRateLimits();
    }
  }, [view, account?.id, account?.role]);

  useEffect(() => {
    if (!authReady) return undefined;
    if (!account) {
      setQuestions([]); setTopics([]); setProgress({}); setClubActivity({}); setClubLocked({}); setSubmissions([]); setPending([]); setMembers([]); setDirectoryMembers([]);
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
      const minDisplayTime = 50;
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
    const path = getPathFromView(nextView);
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    if (nextView === 'dashboard' && account?.role === 'admin') {
      refreshMembers(1, memberFilter === 'heatmap' ? 'pending' : memberFilter, memberQuery);
      if (Object.keys(submissionHeatmapCounts).length === 0) loadSubmissionHeatmap();
      refreshRateLimits();
    }
  }

  useEffect(() => { localStorage.setItem('dsavation-bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    delete document.documentElement.dataset.style;
    localStorage.setItem('dsavation-theme', theme);
    if (theme === 'dark' || theme === 'forest') {
      rememberDarkStyle(theme);
      setDarkStyle(theme);
    } else if (theme === 'light' || theme === 'technovation') {
      rememberLightStyle(theme);
      setLightStyle(theme);
    }
  }, [theme]);
  useLayoutEffect(() => {
    localStorage.removeItem('dsavation-font-scale');
    document.documentElement.style.fontSize = '';
  }, []);

  const handleSolve = useCallback((questionId) => {
    solvePersonal(questionId);
  }, [account, progress, clubLocked]);

  async function solvePersonal(questionId) {
    if (clubLocked[questionId]) return;
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
        const result = await api('/auth/register', {
          method: 'POST', body: {
            name: values.name, department: values.department, email: values.email,
            studyYear: values.studyYear, password: values.password, githubUsername: values.githubUsername, leetcodeUsername: values.leetcodeUsername,
            showPublic: true,
          }
        });
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

  async function requestPasswordReset(event) {
    event.preventDefault(); setForgotError(''); setForgotBusy(true); setForgotSuccess(false);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api('/auth/request-password-reset', { method: 'POST', body: { email: values.email } });
      setForgotSuccess(true);
      setForgotEmail('');
    } catch (error) { setForgotError(error.message); }
    finally { setForgotBusy(false); }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* Expired sessions are already signed out. */ }
    setAccount(null); navigate('general'); setNotice('You have signed out.');
  }

  async function submitClubSolution(event) {
    event.preventDefault(); setSubmissionBusy(true); setNotice('');
    try {
      const cleanCommitUrl = String(commitUrl || '').trim();
      console.log('[Submission] Submitting club solution via GitHub:', { assignmentId: club.assignment?.id, commitUrl: cleanCommitUrl });
      const result = await api('/submissions', { method: 'POST', body: { assignmentId: club.assignment?.id, commitUrl: cleanCommitUrl } });
      console.log('[Submission] GitHub submission verified successfully:', result);
      setCommitUrl(''); setSubmissionHelpOpen(false); setNotice(`GitHub verified your solution. ${result.submission?.points ?? 1} point${(result.submission?.points ?? 1) === 1 ? '' : 's'} added to the club leaderboard.`);
      const qId = club.assignment?.questionId || result.submission?.questionId;
      if (qId) {
        const solvedAt = new Date().toISOString();
        setProgress((prev) => ({ ...prev, [qId]: prev[qId] || solvedAt }));
        setClubLocked((prev) => ({ ...prev, [qId]: true }));
        setClubActivity((prev) => ({ ...prev, [qId]: solvedAt }));
      }
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
      console.log('[Submission] LeetCode submission verified successfully:', result);
      setNotice(`LeetCode verified your solution! ${result.submission?.points ?? 1} point${(result.submission?.points ?? 1) === 1 ? '' : 's'} added to the club leaderboard.`);
      const qId = club.assignment?.questionId || result.submission?.questionId;
      if (qId) {
        const solvedAt = new Date().toISOString();
        setProgress((prev) => ({ ...prev, [qId]: prev[qId] || solvedAt }));
        setClubLocked((prev) => ({ ...prev, [qId]: true }));
        setClubActivity((prev) => ({ ...prev, [qId]: solvedAt }));
      }
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

  async function setMemberLeetcodeApproval(member, leetcodeApproval) {
    setMemberBusy(member.id);
    try {
      await api(`/admin/members/${member.id}`, { method: 'PATCH', body: { leetcodeApproval } });
      setMembers((old) => old.map((item) => item.id === member.id ? { ...item, leetcodeApproval } : item));
      setNotice(leetcodeApproval === 'approved' ? `Approved ${member.name} for LeetCode submissions.` : `Updated LeetCode submission access for ${member.name}.`);
      await refreshMembers(membersPagination.page, memberFilter, memberQuery);
      await refreshActivity(activityPagination.page);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function deleteMember(member) {
    const cleanEmail = (member?.email && member.email !== 'undefined') ? member.email.trim() : '';
    const cleanGithub = (member?.githubUsername && member.githubUsername !== 'undefined') ? member.githubUsername.trim() : '';
    const detail = cleanEmail ? ` (${cleanEmail})` : cleanGithub ? ` (@${cleanGithub})` : '';
    if (!window.confirm(`Delete ${member?.name || 'this member'}${detail} and their saved progress and club submissions? This cannot be undone.`)) return;
    setMemberBusy(member.id);
    try {
      await api(`/admin/members/${member.id}`, { method: 'DELETE' });
      setMembers((old) => old.filter((item) => item.id !== member.id));
      setNotice(`${member.name}'s account and personal records were deleted.`);
      await refreshMembers(membersPagination.page); await refreshActivity(activityPagination.page);
    } catch (error) { setNotice(error.message); }
    finally { setMemberBusy(''); }
  }

  async function handleAwardCustomAura(amountToAward) {
    if (!adminOverlayMember || auraAwardBusy) return;
    const amount = Math.round(Number(amountToAward ?? auraAwardAmount));
    if (!amount || Number.isNaN(amount)) {
      setNotice('Please enter a valid non-zero blaze points amount.');
      return;
    }
    setAuraAwardBusy(true);
    try {
      const res = await api(`/admin/members/${adminOverlayMember.id}/blaze`, {
        method: 'POST',
        body: { blaze: amount },
      });
      if (res.ok) {
        const total = res.totalBlaze ?? res.totalAura;
        const custom = res.customBlaze ?? res.customAura;
        setAdminOverlayMember((prev) => prev ? { ...prev, aura: total, blaze: total, customAura: custom, customBlaze: custom } : null);
        setDirectoryMembers((prev) => prev.map((m) => m.id === adminOverlayMember.id ? { ...m, aura: total, blaze: total, customAura: custom, customBlaze: custom } : m));
        setNotice(`Awarded ${amount > 0 ? '+' : ''}${amount} Blaze to ${adminOverlayMember.name}! New Total: ${total} Blaze`);
        setAuraAwardAmount('');
        refreshActivity(activityPagination.page).catch(() => { });
      }
    } catch (err) {
      setNotice(err.message);
    } finally {
      setAuraAwardBusy(false);
    }
  }

  function openMessageModal(type = 'daily') {
    setMessageModalType(type);
    setMessageModalTab('preview');
    setMessageCopiedNotice(false);
    setTemplateSavedNotice(false);

    const tmpl = getMessageTemplate(type);
    setTemplateDraft(tmpl);

    const currentExplainer = club.assignment?.explainer || selectedExplainer || todaySubmissionsData?.explainer;
    const rendered = renderMessageText(tmpl, {
      question: assignedQuestion,
      explainer: currentExplainer,
    });
    setMessageDraft(rendered);
    setMessageModalOpen(true);
  }

  function handleCopyAnnouncement() {
    openMessageModal('daily');
  }

  async function handleCopyMessageFromModal() {
    const textToCopy = messageModalTab === 'preview' ? messageDraft : renderMessageText(templateDraft, {
      question: assignedQuestion,
      explainer: club.assignment?.explainer || selectedExplainer || todaySubmissionsData?.explainer,
    });

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setMessageCopiedNotice(true);
      setNotice('Message copied to clipboard!');
      setTimeout(() => setMessageCopiedNotice(false), 2400);
    } catch {
      setNotice('Could not copy message to clipboard.');
    }
  }

  function handleSaveTemplate() {
    saveMessageTemplate(messageModalType, templateDraft);
    setTemplateSavedNotice(true);
    setNotice('Saved new default message template!');
    setTimeout(() => setTemplateSavedNotice(false), 2400);

    const currentExplainer = club.assignment?.explainer || selectedExplainer || todaySubmissionsData?.explainer;
    const rendered = renderMessageText(templateDraft, {
      question: assignedQuestion,
      explainer: currentExplainer,
    });
    setMessageDraft(rendered);
  }

  function handleResetTemplate() {
    const orig = resetMessageTemplate(messageModalType);
    setTemplateDraft(orig);
    setTemplateSavedNotice(true);
    setNotice('Reset to default message template.');
    setTimeout(() => setTemplateSavedNotice(false), 2400);

    const currentExplainer = club.assignment?.explainer || selectedExplainer || todaySubmissionsData?.explainer;
    const rendered = renderMessageText(orig, {
      question: assignedQuestion,
      explainer: currentExplainer,
    });
    setMessageDraft(rendered);
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
    const trimmedBg = profileCardBgUrl.trim();
    if (trimmedBg && !isValidHttpUrl(trimmedBg)) {
      setNotice('Custom background image URL must start with http:// or https://');
      setProfileBusy(false);
      return;
    }
    try {
      const result = await api('/auth/profile', {
        method: 'PATCH', body: {
          name: (values.name || profileName).trim(),
          department: values.department || profileDepartment,
          studyYear: values.studyYear || profileStudyYear,
          githubUsername: (values.githubUsername || profileGithubUsername).trim(),
          leetcodeUsername: (values.leetcodeUsername || profileLeetcodeUsername).trim(),
          defaultSubmissionMethod: values.defaultSubmissionMethod || accountSubmissionMethod || 'github',
          cardBgUrl: trimmedBg,
          avatarStyle: avatarDraftStyle,
          avatarSeed: avatarDraftStyle === 'custom' ? avatarDraftCustomUrl.trim() : avatarDraftSeed,
          avatarUrl: avatarDraftStyle === 'custom' ? avatarDraftCustomUrl.trim() : '',
        }
      });
      setAccount(result.user);
      if (result.user.defaultSubmissionMethod) {
        setAccountSubmissionMethod(result.user.defaultSubmissionMethod);
      }
      setNotice(result.user.githubVerified ? 'Your account details were saved.' : 'Details saved. Re-link your GitHub account to verify the updated username.');
    } catch (error) { setNotice(error.message); }
    finally { setProfileBusy(false); }
  }

  async function requestLeetcodeApproval(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setProfileBusy(true);
    setNotice('');
    try {
      const result = await api('/auth/profile', { method: 'PATCH', body: { requestLeetcodeApproval: true } });
      setAccount(result.user);
      setNotice('LeetCode submission access requested. An administrator will review your request.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setProfileBusy(false);
    }
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

  const clearFilters = () => { setQuery(''); setTopic('All topics'); setDifficulty('Any level'); setStructure('Any data structure'); setPattern('Any pattern'); };
  const loaderGreetingName = String(account?.name || '').trim().split(/\s+/)[0];


  return (
    <div className="app-frame">
      <AtmosphereBackdrop />
      {appLoading && (
        <aside className="global-loader-hud" role="status" aria-live="polite" aria-label="Loading DSAvation">
          <div className="global-loader-scrim" />
          <div className="global-loading" role="progressbar" aria-label="Loading DSAvation" aria-valuetext="Loading">
            <span />
          </div>
          <img src="/loading-expression.gif" alt="DSAvation Mascot Bot" className="global-loader-bot" />
          <div className="global-loader-copy">
            <strong className="global-loader-title">
              {loaderGreetingName ? `Hey, ${loaderGreetingName}!` : 'Hey there!'}
            </strong>
            <p className="global-loader-msg">Getting your DSAvation space ready...</p>
          </div>
        </aside>
      )}

      <Navbar
        view={view}
        navigate={navigate}
        account={account}
        isAdmin={isAdmin}
        memberCounts={memberCounts}
        theme={theme}
        setTheme={setTheme}
        storedDarkStyle={storedDarkStyle}
        rememberDarkStyle={rememberDarkStyle}
        storedLightStyle={storedLightStyle}
        rememberLightStyle={rememberLightStyle}
        setAuthMode={setAuthMode}
        setAuthOpen={setAuthOpen}
      />

      <NoticeBanner
        notice={notice}
        setNotice={setNotice}
        apiNotice={apiNotice}
      />

      {view === "reset-password" && (
        <ResetPasswordPage
          resetToken={resetToken}
          completePasswordReset={completePasswordReset}
          resetError={resetError}
          resetBusy={resetBusy}
          setView={setView}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
        />
      )}

      {view === "general" && (
        <HomePage
          account={account}
          assignedQuestion={assignedQuestion}
          club={club}
          navigate={navigate}
          solvedCount={solvedCount}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
          visibleQuestions={visibleQuestions}
          query={query}
          setQuery={setQuery}
          topic={topic}
          setTopic={setTopic}
          topics={topics}
          difficulty={difficulty}
          setDifficulty={setDifficulty}
          structure={structure}
          setStructure={setStructure}
          structures={structures}
          pattern={pattern}
          setPattern={setPattern}
          patterns={patterns}
          sort={sort}
          setSort={setSort}
          paginatedQuestions={paginatedQuestions}
          progress={progress}
          clubLocked={clubLocked}
          handleSolve={handleSolve}
          clearFilters={clearFilters}
          totalQuestionPages={totalQuestionPages}
          safeQuestionPage={safeQuestionPage}
          setQuestionPage={setQuestionPage}
        />
      )}

      {view === "progress" && (
        <AccountPage
          account={account}
          navigate={navigate}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
          saveProfile={saveProfile}
          profileName={profileName}
          setProfileName={setProfileName}
          profileDepartment={profileDepartment}
          setProfileDepartment={setProfileDepartment}
          profileStudyYear={profileStudyYear}
          setProfileStudyYear={setProfileStudyYear}
          profileLeetcodeUsername={profileLeetcodeUsername}
          setProfileLeetcodeUsername={setProfileLeetcodeUsername}
          profileGithubUsername={profileGithubUsername}
          setProfileGithubUsername={setProfileGithubUsername}
          profileCardBgUrl={profileCardBgUrl}
          setProfileCardBgUrl={setProfileCardBgUrl}
          profileBusy={profileBusy}
          disconnectGithub={disconnectGithub}
          accountSubmissionMethod={accountSubmissionMethod}
          setAccountSubmissionMethod={setAccountSubmissionMethod}
          isLeetcodeApproved={isLeetcodeApproved}
          setNotice={setNotice}
          requestLeetcodeApproval={requestLeetcodeApproval}
          avatarDraftStyle={avatarDraftStyle}
          avatarDraftSeed={avatarDraftSeed}
          setAvatarDraftSeed={setAvatarDraftSeed}
          avatarDraftCustomUrl={avatarDraftCustomUrl}
          setAvatarDraftCustomUrl={setAvatarDraftCustomUrl}
          shuffleAvatarChoices={shuffleAvatarChoices}
          chooseAvatarStyle={chooseAvatarStyle}
          customUrlStatus={customUrlStatus}
          avatarChoices={avatarChoices}
          darkStyle={darkStyle}
          setDarkStyle={setDarkStyle}
          rememberDarkStyle={rememberDarkStyle}
          lightStyle={lightStyle}
          setLightStyle={setLightStyle}
          rememberLightStyle={rememberLightStyle}
          theme={theme}
          setTheme={setTheme}
          isProfileDirty={isProfileDirty}
          handleInstallApp={handleInstallApp}
          isAppInstalled={isAppInstalled}
          logout={logout}
        />
      )}

      {view === "activity" && (
        <ActivityPage
          account={account}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
          clubActivity={clubActivity}
          clubTrackedCount={clubTrackedCount}
          navigate={navigate}
          byId={byId}
          handleSolve={handleSolve}
        />
      )}

      {view === "members" && (
        <MembersPage
          account={account}
          isAdmin={isAdmin}
          directoryPagination={directoryPagination}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
          directoryDebounceRef={directoryDebounceRef}
          loadDirectory={loadDirectory}
          directoryQuery={directoryQuery}
          setDirectoryQuery={setDirectoryQuery}
          directoryDepartment={directoryDepartment}
          setDirectoryDepartment={setDirectoryDepartment}
          directoryDepartments={directoryDepartments}
          directoryYear={directoryYear}
          setDirectoryYear={setDirectoryYear}
          showAllLeetcodeStats={showAllLeetcodeStats}
          loadingAllStats={loadingAllStats}
          toggleAllLeetcodeStats={toggleAllLeetcodeStats}
          directoryBusy={directoryBusy}
          directoryMembers={directoryMembers}
          setDirectoryMembers={setDirectoryMembers}
          directoryLeetcodeStats={directoryLeetcodeStats}
          individuallyOpenedStats={individuallyOpenedStats}
          setIndividuallyOpenedStats={setIndividuallyOpenedStats}
          leetcodeStatsBusy={leetcodeStatsBusy}
          loadDirectoryLeetcodeStats={loadDirectoryLeetcodeStats}
          adminOverlayMember={adminOverlayMember}
          setAdminOverlayMember={setAdminOverlayMember}
          memberBusy={memberBusy}
          updateRole={updateRole}
          auraAwardBusy={auraAwardBusy}
          handleAwardCustomAura={handleAwardCustomAura}
          auraAwardAmount={auraAwardAmount}
          setAuraAwardAmount={setAuraAwardAmount}
          setMemberApproval={setMemberApproval}
          setMemberLeetcodeApproval={setMemberLeetcodeApproval}
          deleteMember={deleteMember}
        />
      )}

      {view === "dashboard" && isAdmin && (
        <DashboardPage
          isAdmin={isAdmin}
          account={account}
          memberFilter={memberFilter}
          setMemberFilter={setMemberFilter}
          heatmapSecondYearOnly={heatmapSecondYearOnly}
          setHeatmapSecondYearOnly={setHeatmapSecondYearOnly}
          submissionHeatmapBusy={submissionHeatmapBusy}
          membersBusy={membersBusy}
          loadSubmissionHeatmap={loadSubmissionHeatmap}
          refreshMembers={refreshMembers}
          membersPagination={membersPagination}
          submissionHeatmapCounts={submissionHeatmapCounts}
          submissionHeatmapSecondYearCounts={submissionHeatmapSecondYearCounts}
          memberCounts={memberCounts}
          memberQuery={memberQuery}
          setMemberQuery={setMemberQuery}
          displayedMembers={displayedMembers}
          openHeatmapDay={openHeatmapDay}
          handleDownloadMonthCsv={handleDownloadMonthCsv}
          memberBusy={memberBusy}
          setMemberApproval={setMemberApproval}
          deleteMember={deleteMember}
          setMemberLeetcodeApproval={setMemberLeetcodeApproval}
          acceptedSubmissionsOpen={acceptedSubmissionsOpen}
          setAcceptedSubmissionsOpen={setAcceptedSubmissionsOpen}
          scoredBusy={scoredBusy}
          refreshScoredSubmissions={refreshScoredSubmissions}
          scoredPagination={scoredPagination}
          scoredSubmissions={scoredSubmissions}
          adjustPoints={adjustPoints}
          auditCardOpen={auditCardOpen}
          setAuditCardOpen={setAuditCardOpen}
          activityPagination={activityPagination}
          activityBusy={activityBusy}
          refreshActivity={refreshActivity}
          activity={activity}
          rateLimitCount={rateLimitCount}
          rateLimitBusy={rateLimitBusy}
          clearAllRateLimits={clearAllRateLimits}
          heatmapDayModal={heatmapDayModal}
          closeHeatmapDayModal={closeHeatmapDayModal}
          navigateHeatmapDay={navigateHeatmapDay}
          isHeatmapPrevDisabled={isHeatmapPrevDisabled}
          isHeatmapNextDisabled={isHeatmapNextDisabled}
          heatmapDayBusy={heatmapDayBusy}
          heatmapDatePickerRef={heatmapDatePickerRef}
          MIN_HEATMAP_DATE={MIN_HEATMAP_DATE}
          todayDateKey={todayDateKey}
          heatmapDayData={heatmapDayData}
        />
      )}

      {view === "club" && (
        <ClubChallengePage
          account={account}
          club={club}
          assignedQuestion={assignedQuestion}
          isAdmin={isAdmin}
          isLeader={isLeader}
          copiedAnnouncement={copiedAnnouncement}
          handleCopyAnnouncement={handleCopyAnnouncement}
          isLeetcodeApproved={isLeetcodeApproved}
          submissions={submissions}
          submissionHelpOpen={submissionHelpOpen}
          setSubmissionHelpOpen={setSubmissionHelpOpen}
          submitClubSolution={submitClubSolution}
          commitUrl={commitUrl}
          setCommitUrl={setCommitUrl}
          submissionBusy={submissionBusy}
          submitLeetCodeSolution={submitLeetCodeSolution}
          navigate={navigate}
          editingTodayAssignment={editingTodayAssignment}
          deleteTodayAssignment={deleteTodayAssignment}
          assignmentBusy={assignmentBusy}
          publishAssignment={publishAssignment}
          assignmentDate={assignmentDate}
          setAssignmentDate={setAssignmentDate}
          assignmentQuestion={assignmentQuestion}
          setAssignmentQuestion={setAssignmentQuestion}
          questions={questions}
          history={history}
          selectedExplainer={selectedExplainer}
          openMessageModal={openMessageModal}
          handlePickRandomExplainer={handlePickRandomExplainer}
          pickExplainerBusy={pickExplainerBusy}
          openRepickModal={openRepickModal}
          pending={pending}
          memberBusy={memberBusy}
          review={review}
          pendingPagination={pendingPagination}
          pendingBusy={pendingBusy}
          refreshPendingSubmissions={refreshPendingSubmissions}
          historyPagination={historyPagination}
          byId={byId}
          clubLocked={clubLocked}
          clubActivity={clubActivity}
          historyBusy={historyBusy}
          loadHistoryPage={loadHistoryPage}
          setExportStudyYear={setExportStudyYear}
          setExportModalOpen={setExportModalOpen}
          todaySubmissionsData={todaySubmissionsData}
          refreshLeaderboardData={refreshLeaderboardData}
          refreshingLeaderboard={refreshingLeaderboard}
          leaderboardScope={leaderboardScope}
          setLeaderboardScope={setLeaderboardScope}
          currentUserRank={currentUserRank}
          leaderboard={leaderboard}
          leaderboardPagination={leaderboardPagination}
          leaderboardBusy={leaderboardBusy}
          loadLeaderboardPage={loadLeaderboardPage}
          setAuthMode={setAuthMode}
          setAuthOpen={setAuthOpen}
        />
      )}

      <ExplainerModal
        explainerModalOpen={explainerModalOpen}
        selectedExplainer={selectedExplainer}
        setExplainerModalOpen={setExplainerModalOpen}
        club={club}
        assignedQuestion={assignedQuestion}
        handleCopyExplainerImage={handleCopyExplainerImage}
        imageExporting={imageExporting}
        copiedNotice={copiedNotice}
        todaySubmissionsData={todaySubmissionsData}
      />

      <RepickModal
        repickModalOpen={repickModalOpen}
        setRepickModalOpen={setRepickModalOpen}
        repickCycle={repickCycle}
        repickMode={repickMode}
        setRepickMode={setRepickMode}
        executeRepick={executeRepick}
        pickExplainerBusy={pickExplainerBusy}
        repickSearch={repickSearch}
        setRepickSearch={setRepickSearch}
        club={club}
        repickWaivePenalty={repickWaivePenalty}
        setRepickWaivePenalty={setRepickWaivePenalty}
        repickLoading={repickLoading}
        repickCandidates={repickCandidates}
      />

      <ExportCsvModal
        exportModalOpen={exportModalOpen}
        setExportModalOpen={setExportModalOpen}
        exportTarget={exportTarget}
        setExportTarget={setExportTarget}
        filteredSubmissions={filteredSubmissions}
        filteredNotAttempted={filteredNotAttempted}
        exportStudyYear={exportStudyYear}
        setExportStudyYear={setExportStudyYear}
        exportDepartment={exportDepartment}
        setExportDepartment={setExportDepartment}
        matchingExportCount={matchingExportCount}
        executeExportCsv={executeExportCsv}
      />

      <MessageBroadcastModal
        messageModalOpen={messageModalOpen}
        setMessageModalOpen={setMessageModalOpen}
        messageModalType={messageModalType}
        messageModalTab={messageModalTab}
        setMessageModalTab={setMessageModalTab}
        messageDraft={messageDraft}
        handleCopyMessageFromModal={handleCopyMessageFromModal}
        messageCopiedNotice={messageCopiedNotice}
        templateDraft={templateDraft}
        setTemplateDraft={setTemplateDraft}
        handleSaveTemplate={handleSaveTemplate}
        templateSavedNotice={templateSavedNotice}
        handleResetTemplate={handleResetTemplate}
      />

      <ForgotPasswordModal
        forgotOpen={forgotOpen}
        setForgotOpen={setForgotOpen}
        forgotEmail={forgotEmail}
        setForgotEmail={setForgotEmail}
        forgotError={forgotError}
        setForgotError={setForgotError}
        forgotSuccess={forgotSuccess}
        setForgotSuccess={setForgotSuccess}
        requestPasswordReset={requestPasswordReset}
        forgotBusy={forgotBusy}
        setAuthMode={setAuthMode}
        setAuthOpen={setAuthOpen}
      />

      <AuthModal
        authOpen={authOpen}
        setAuthOpen={setAuthOpen}
        authMode={authMode}
        setAuthMode={setAuthMode}
        authError={authError}
        setAuthError={setAuthError}
        authBusy={authBusy}
        submitAuth={submitAuth}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        setForgotOpen={setForgotOpen}
      />

      <MobileNav
        view={view}
        navigate={navigate}
        account={account}
        isAdmin={isAdmin}
      />

      <Analytics />
    </div>
  );
}
