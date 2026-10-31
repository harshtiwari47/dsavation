import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import curriculum from './data/questions.json' with { type: 'json' };
import { getDatabase } from './db.js';

const TZ = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
const AVATAR_STYLES = new Set(['critters', 'fun-emoji', 'clay', 'micah']);
const questionById = new Map(curriculum.questions.map((row) => [Number(row[1]), {
  id: Number(row[1]), title: row[2], topic: row[0], difficulty: row[3],
}]));

function normalizedUrl(rawUrl) {
  const url = new URL(rawUrl || '/', 'http://localhost');
  if (url.pathname !== '/api/handler') return url;
  const routedPath = url.searchParams.get('path') || url.searchParams.get('route');
  if (!routedPath) return url;
  url.searchParams.delete('path');
  url.searchParams.delete('route');
  const query = url.searchParams.toString();
  const path = `/api/${String(routedPath).replace(/^\/+/, '')}`;
  return new URL(`${path}${query ? `?${query}` : ''}`, 'http://localhost');
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(text);
}

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function isOnAssignmentDay(value, dateKey) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && dayKey(date) === dateKey;
}

export function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cookieSecure(req) {
  return process.env.SESSION_COOKIE_SECURE === 'true' ||
    process.env.VERCEL === '1' || req.headers['x-forwarded-proto'] === 'https';
}

function getCookie(req, key) {
  const header = req.headers.cookie || '';
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return value ? decodeURIComponent(value.slice(key.length + 1)) : '';
}

function setCookie(res, req, key, value, maxAge, options = {}) {
  const parts = [`${key}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (cookieSecure(req)) parts.push('Secure');
  if (options.clear) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  const cookieStr = parts.join('; ');
  const existing = res.getHeader ? res.getHeader('Set-Cookie') : undefined;
  if (existing) {
    const merged = Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr];
    res.setHeader('Set-Cookie', merged);
  } else {
    res.setHeader('Set-Cookie', cookieStr);
  }
}

function clearCookie(res, req, key) { setCookie(res, req, key, '', 0, { clear: true }); }

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseJsonBody(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string' && body.length) {
    try { return JSON.parse(body); } catch { throw new HttpError(400, 'Send a valid JSON request.'); }
  }
  return {};
}

async function readBody(req) {
  if (req.body !== undefined) return parseJsonBody(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  return parseJsonBody(Buffer.concat(chunks));
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        throw new HttpError(403, 'Cross-site request rejected.');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(403, 'Invalid request origin.');
    }
    return;
  }
  if (referer) {
    try {
      if (new URL(referer).host.toLowerCase() !== host.toLowerCase()) {
        throw new HttpError(403, 'Cross-site request rejected.');
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(403, 'Invalid request referer.');
    }
  }
}

function baseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || (cookieSecure(req) ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  return `${String(protocol).split(',')[0]}://${String(host).split(',')[0]}`;
}

function formatAvatar(user, fallbackId) {
  const isCustom = user?.avatarStyle === 'custom' || /^https?:\/\//i.test(String(user?.avatarSeed || ''));
  return {
    avatarStyle: isCustom ? 'custom' : (AVATAR_STYLES.has(user?.avatarStyle) ? user.avatarStyle : 'critters'),
    avatarSeed: String(user?.avatarSeed || user?._id || fallbackId || 'dsavation-member'),
    avatarUrl: user?.avatarUrl || (isCustom ? String(user?.avatarSeed) : ''),
  };
}

function account(user) {
  if (!user) return null;
  const avatar = formatAvatar(user);
  const explicit = Boolean(user.explicitSubmissionMethod);
  const leetcodeApproved = user.role === 'admin' || user.leetcodeApproval === 'approved';
  return {
    id: String(user._id), name: user.name, department: user.department, studyYear: user.studyYear || '',
    email: user.email, githubUsername: user.githubUsername || '', leetcodeUsername: user.leetcodeUsername || '',
    avatarStyle: avatar.avatarStyle,
    avatarSeed: avatar.avatarSeed,
    avatarUrl: avatar.avatarUrl,
    githubVerified: Boolean(user.githubVerifiedAt), role: user.role || 'member',
    showPublic: Boolean(user.showPublic), createdAt: user.createdAt,
    explicitSubmissionMethod: explicit,
    leetcodeApproval: user.role === 'admin' ? 'approved' : (user.leetcodeApproval || 'none'),
    defaultSubmissionMethod: leetcodeApproved && user.defaultSubmissionMethod === 'leetcode' ? 'leetcode' : 'github',
  };
}

function isApproved(user) {
  return user?.approvalStatus === 'approved' || (!user?.approvalStatus && user?.verifiedAt != null);
}

function approvedUserFilter(extra = {}) {
  return {
    ...extra,
    $or: [
      { approvalStatus: 'approved' },
      { approvalStatus: { $exists: false }, verifiedAt: { $ne: null } },
    ],
  };
}

function approvalStatus(user) { return isApproved(user) ? 'approved' : 'pending'; }

function adminEmails() {
  return new Set((process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

async function currentUser(req, db) {
  const token = getCookie(req, 'dsavation_session');
  if (!token) return null;
  const session = await db.collection('sessions').findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection('users').findOne({ _id: session.userId });
  return isApproved(user) ? user : null;
}

async function requireUser(req, db) {
  const user = await currentUser(req, db);
  if (!user) throw new HttpError(401, 'Sign in with an approved ABES account to continue.');
  return user;
}

function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do that.');
}

function pageOptions(url, defaultSize = 10, maxSize = 50) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || String(defaultSize), 10) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pageMeta(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function recordAdminActivity(db, user, action, target = {}, details = {}) {
  if (!['admin', 'lead'].includes(user?.role)) return;
  await db.collection('adminActivity').insertOne({
    actorId: user._id, actorName: user.name, actorRole: user.role,
    action, targetId: target.id ? String(target.id) : '', targetLabel: String(target.label || '').slice(0, 160),
    details, createdAt: new Date(),
  });
}

async function newSession(db, user, req, res) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * DAY_MS);
  await db.collection('sessions').insertOne({ tokenHash: hash(token), userId: user._id, expiresAt, createdAt: new Date() });
  setCookie(res, req, 'dsavation_session', token, 30 * 24 * 60 * 60);
}

async function allowRequest(db, req, scope, limit, windowMs) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0]).trim() || 'local';
  const bucket = Math.floor(Date.now() / windowMs);
  const id = `${scope}:${hash(ip)}:${bucket}`;
  const expiresAt = new Date((bucket + 2) * windowMs);
  const collection = db.collection('rateLimits');
  await collection.updateOne({ _id: id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true });
  const row = await collection.findOne({ _id: id }, { projection: { count: 1 } });
  if (row.count > limit) throw new HttpError(429, 'Too many attempts. Please wait and try again.');
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DSAvation-Club-Tracker',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 403 ? 503 : 502;
    throw new HttpError(status, response.status === 404 ? 'GitHub could not find that account or commit.' : 'GitHub could not verify the request. Check repository access and try again.');
  }
  return response.json();
}

async function signup(db, req, res, body) {
  await allowRequest(db, req, 'register', 5, 60 * 60 * 1000);
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const department = String(body.department || '').trim();
  const studyYear = String(body.studyYear || '');
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const githubUsername = String(body.githubUsername || '').trim().replace(/^@/, '');
  const leetcodeUsername = String(body.leetcodeUsername || '').trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your full name (2–80 characters).');
  if (!/^[a-z0-9.+_-]+@abes\.ac\.in$/i.test(email)) throw new HttpError(400, 'Use your college email ending exactly in @abes.ac.in.');
  if (department.length < 2 || department.length > 80) throw new HttpError(400, 'Choose or enter your Club Department.');
  if (!['first-year', 'second-year', 'third-year', 'fourth-year', 'passed'].includes(studyYear)) throw new HttpError(400, 'Choose your current year of study.');
  if (password.length < 10 || password.length > 128) throw new HttpError(400, 'Use a password between 10 and 128 characters.');
  if (!/^[a-z0-9-]{1,39}$/i.test(githubUsername)) throw new HttpError(400, 'Enter a valid GitHub username.');
  if (!/^[a-z0-9_-]{1,40}$/i.test(leetcodeUsername)) throw new HttpError(400, 'Enter a valid LeetCode username.');
  const existing = await db.collection('users').findOne({ email });
  if (existing) {
    if (isApproved(existing)) throw new HttpError(409, 'An account already uses this email. Sign in instead.');
    throw new HttpError(409, 'This account is awaiting administrator approval. Sign in after it has been approved.');
  }
  const gh = await githubJson(`/users/${encodeURIComponent(githubUsername)}`);
  if (gh.login.toLowerCase() !== githubUsername.toLowerCase()) throw new HttpError(400, 'GitHub username does not match a public GitHub account.');
  const githubUserLower = gh.login.toLowerCase();
  const occupied = await db.collection('users').findOne({ githubUserLower, ...(existing ? { _id: { $ne: existing._id } } : {}) });
  if (occupied) throw new HttpError(409, 'That GitHub account is already linked to a DSAvation member.');

  const now = new Date();
  const administrator = adminEmails().has(email);
  const user = {
    name, department, studyYear, email, passwordHash: await bcrypt.hash(password, 12), leetcodeUsername,
    githubUsername: gh.login, githubUserLower, githubId: gh.id,
    githubVerifiedAt: null, showPublic: body.showPublic !== false,
    defaultSubmissionMethod: 'github',
    approvalStatus: administrator ? 'approved' : 'pending',
    approvedAt: administrator ? now : null, approvedBy: administrator ? 'ADMIN_EMAILS' : null,
    role: administrator ? 'admin' : 'member', createdAt: now, updatedAt: now,
  };
  user._id = new ObjectId();
  await db.collection('users').insertOne(user);
  if (administrator) {
    await newSession(db, user, req, res);
    await recordAdminActivity(db, user, 'administrator_account_created', { id: user._id, label: user.email });
    json(res, 201, { ok: true, approvalStatus: 'approved', user: account(user) });
  } else {
    json(res, 201, { ok: true, approvalStatus: 'pending', email });
  }
}

async function login(db, req, res, body) {
  await allowRequest(db, req, 'login', 15, 15 * 60 * 1000);
  const email = String(body.email || '').trim().toLowerCase();
  await allowRequest(db, req, `login-account:${hash(email)}`, 5, 15 * 60 * 1000);
  let user = await db.collection('users').findOne({ email });
  if (!user) throw new HttpError(404, 'No account was found for this email. Check the address or create an account.');
  const valid = await bcrypt.compare(String(body.password || ''), user.passwordHash);
  if (!valid) throw new HttpError(401, 'The password is incorrect. Check it and try again.');
  if (adminEmails().has(email) && !user.approvalStatus) {
    const now = new Date();
    user = { ...user, role: 'admin', approvalStatus: 'approved', approvedAt: user.approvedAt || now, approvedBy: user.approvedBy || 'ADMIN_EMAILS' };
    await db.collection('users').updateOne({ _id: user._id }, { $set: { role: 'admin', approvalStatus: 'approved', approvedAt: user.approvedAt, approvedBy: user.approvedBy, updatedAt: now } });
  }
  if (!isApproved(user)) throw new HttpError(403, 'Your account is not currently approved. New accounts need administrator approval; contact a DSAvation administrator if you believe your access was removed by mistake.');
  await newSession(db, user, req, res);
  await recordAdminActivity(db, user, 'administrator_signed_in', { id: user._id, label: user.email });
  json(res, 200, { ok: true, user: account(user) });
}

async function generatePasswordReset(db, req, user, memberId) {
  requireRole(user, 'admin');
  await allowRequest(db, req, `admin-pw-reset-${user._id}`, 20, 60 * 60 * 1000);
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  const targetId = new ObjectId(memberId);
  const target = await db.collection('users').findOne({ _id: targetId }, { projection: { name: 1, email: 1 } });
  if (!target) throw new HttpError(404, 'Member not found.');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.collection('passwordResets').deleteMany({ userId: targetId });
  await db.collection('passwordResets').insertOne({
    tokenHash: hash(token), userId: targetId, createdBy: user._id,
    createdAt: new Date(), expiresAt,
  });
  await recordAdminActivity(db, user, 'password_reset_link_generated', { id: targetId, label: `${target.name} · ${target.email}` }, { expiresAt });
  return { resetUrl: `${baseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`, expiresAt };
}

async function resetPassword(db, req, res, body) {
  await allowRequest(db, req, 'password-reset', 10, 15 * 60 * 1000);
  const token = String(body.token || '');
  const password = String(body.password || '');
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new HttpError(400, 'This password reset link is invalid or expired. Ask an administrator for a new one.');
  if (password.length < 10 || password.length > 128) throw new HttpError(400, 'Use a password between 10 and 128 characters.');
  const now = new Date();
  const reset = await db.collection('passwordResets').findOne({ tokenHash: hash(token), expiresAt: { $gt: now }, usedAt: { $exists: false } });
  if (!reset) throw new HttpError(400, 'This password reset link is invalid or expired. Ask an administrator for a new one.');
  const consumed = await db.collection('passwordResets').updateOne(
    { _id: reset._id, expiresAt: { $gt: now }, usedAt: { $exists: false } },
    { $set: { usedAt: now } },
  );
  if (!consumed.matchedCount) throw new HttpError(400, 'This password reset link has already been used. Ask an administrator for a new one.');
  const updated = await db.collection('users').updateOne(
    { _id: reset.userId },
    { $set: { passwordHash: await bcrypt.hash(password, 12), updatedAt: now } },
  );
  if (!updated.matchedCount) throw new HttpError(400, 'The account for this reset link no longer exists.');
  await db.collection('sessions').deleteMany({ userId: reset.userId });
  clearCookie(res, req, 'dsavation_session');
  return { ok: true };
}

async function updateProfile(db, req, user, body) {
  await allowRequest(db, req, `profile-${user._id}`, 30, 15 * 60 * 1000);
  const name = String(body.name ?? user.name).trim().replace(/\s+/g, ' ');
  const department = String(body.department ?? user.department).trim();
  const studyYear = String(body.studyYear ?? user.studyYear ?? '');
  const githubUsername = String(body.githubUsername ?? user.githubUsername ?? '').trim().replace(/^@/, '');
  const leetcodeUsername = String(body.leetcodeUsername ?? user.leetcodeUsername ?? '').trim();
  const avatarStyle = String(body.avatarStyle ?? user.avatarStyle ?? 'critters');
  let avatarSeed = String(body.avatarSeed ?? user.avatarSeed ?? user._id);
  let avatarUrl = String(body.avatarUrl ?? user.avatarUrl ?? '').trim();
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your full name (2–80 characters).');
  if (department.length < 2 || department.length > 80) throw new HttpError(400, 'Enter your Club Department (2–80 characters).');
  if (!['first-year', 'second-year', 'third-year', 'fourth-year', 'passed'].includes(studyYear)) throw new HttpError(400, 'Choose your current year of study.');
  if (leetcodeUsername && !/^[a-z0-9_-]{1,40}$/i.test(leetcodeUsername)) throw new HttpError(400, 'Enter a valid LeetCode username.');
  if (!AVATAR_STYLES.has(avatarStyle) && avatarStyle !== 'custom') throw new HttpError(400, 'Choose one of the available DiceBear avatar styles.');
  if (avatarStyle === 'custom') {
    const rawUrl = avatarUrl || avatarSeed;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      if (rawUrl.length > 1000) throw new HttpError(400, 'Custom image URL is too long (maximum 1000 characters).');
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, 'Enter a valid image URL starting with http:// or https://');
    }
    avatarSeed = rawUrl;
    avatarUrl = rawUrl;
  } else {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(avatarSeed)) throw new HttpError(400, 'Choose a valid avatar variant.');
    avatarUrl = '';
  }
  let defaultSubmissionMethod = user.defaultSubmissionMethod || 'github';
  let explicitSubmissionMethod = Boolean(user.explicitSubmissionMethod);
  const leetcodeApproved = user.role === 'admin' || user.leetcodeApproval === 'approved';
  let leetcodeApproval = user.role === 'admin' ? 'approved' : (user.leetcodeApproval || 'none');
  let leetcodeRequestedAt = user.leetcodeRequestedAt || null;

  if (body.requestLeetcodeApproval === true) {
    if (!leetcodeApproved) {
      leetcodeApproval = 'pending';
      leetcodeRequestedAt = new Date();
    }
  }

  if (body.defaultSubmissionMethod !== undefined) {
    if (!['leetcode', 'github'].includes(body.defaultSubmissionMethod)) {
      throw new HttpError(400, 'Choose a valid default submission method (leetcode or github).');
    }
    if (body.defaultSubmissionMethod === 'leetcode' && !leetcodeApproved) {
      leetcodeApproval = 'pending';
      leetcodeRequestedAt = new Date();
      defaultSubmissionMethod = 'github';
    } else {
      defaultSubmissionMethod = body.defaultSubmissionMethod;
    }
    explicitSubmissionMethod = true;
  }
  const update = {
    name, department, studyYear, leetcodeUsername,
    defaultSubmissionMethod, explicitSubmissionMethod,
    leetcodeApproval, leetcodeRequestedAt,
    avatarStyle, avatarSeed, avatarUrl, updatedAt: new Date(),
  };
  const unset = {};
  if (!githubUsername) {
    Object.assign(update, { githubUsername: '' });
    Object.assign(unset, { githubUserLower: '', githubId: '', githubVerifiedAt: '' });
  } else if (!/^[a-z0-9-]{1,39}$/i.test(githubUsername)) {
    throw new HttpError(400, 'Enter a valid GitHub username.');
  } else if (githubUsername.toLowerCase() !== String(user.githubUsername || '').toLowerCase()) {
    const gh = await githubJson(`/users/${encodeURIComponent(githubUsername)}`);
    if (gh.login.toLowerCase() !== githubUsername.toLowerCase()) throw new HttpError(400, 'GitHub username does not match a public GitHub account.');
    const githubUserLower = gh.login.toLowerCase();
    const occupied = await db.collection('users').findOne({ githubUserLower, _id: { $ne: user._id } });
    if (occupied) throw new HttpError(409, 'That GitHub account is already linked to another member.');
    Object.assign(update, { githubUsername: gh.login, githubUserLower, githubId: gh.id, githubVerifiedAt: null });
  }
  if (leetcodeUsername.toLowerCase() !== String(user.leetcodeUsername || '').toLowerCase()) unset.leetcodeStats = '';
  if (typeof body.showPublic === 'boolean') update.showPublic = body.showPublic;
  await db.collection('users').updateOne({ _id: user._id }, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  if (['admin', 'lead'].includes(user.role)) await recordAdminActivity(db, user, 'administrator_profile_updated', { id: user._id, label: user.email }, { fields: Object.keys(update).filter((key) => key !== 'updatedAt') });
  return account({
    ...user, ...update,
    ...(unset.githubVerifiedAt ? { githubVerifiedAt: null, githubUserLower: undefined, githubId: undefined } : {}),
  });
}

async function disconnectGithub(db, user) {
  if (!user.githubVerifiedAt && !user.githubUserLower) throw new HttpError(409, 'There is no verified GitHub account to disconnect.');
  const updatedAt = new Date();
  await db.collection('users').updateOne({ _id: user._id }, {
    $set: { githubUsername: '', updatedAt },
    $unset: { githubUserLower: '', githubId: '', githubVerifiedAt: '' },
  });
  await recordAdminActivity(db, user, 'github_account_disconnected', { id: user._id, label: user.email }, { previousUsername: user.githubUsername || '' });
  return { ok: true, user: account({ ...user, githubUsername: '', githubVerifiedAt: null, githubUserLower: undefined, githubId: undefined, updatedAt }) };
}

async function githubStart(db, req, res) {
  const user = await requireUser(req, db);
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const callback = process.env.GITHUB_OAUTH_CALLBACK_URL || `${baseUrl(req)}/api/auth/github/callback`;
  if (!clientId || !process.env.GITHUB_OAUTH_CLIENT_SECRET) throw new HttpError(503, 'GitHub account linking is not configured yet.');
  const state = randomBytes(32).toString('base64url');
  setCookie(res, req, 'dsavation_github_state', state, 10 * 60);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  res.statusCode = 302;
  res.setHeader('Location', url.toString());
  res.end();
}

async function githubCallback(db, req, res, url) {
  const state = getCookie(req, 'dsavation_github_state');
  clearCookie(res, req, 'dsavation_github_state');
  if (!state || !safeEqual(state, url.searchParams.get('state'))) throw new HttpError(400, 'GitHub account-link state expired. Try linking again.');
  const current = await requireUser(req, db);
  const code = url.searchParams.get('code');
  if (!code) throw new HttpError(400, 'GitHub did not return an authorization code.');
  const callback = process.env.GITHUB_OAUTH_CALLBACK_URL || `${baseUrl(req)}/api/auth/github/callback`;
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_OAUTH_CLIENT_ID, client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: callback }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) throw new HttpError(502, 'GitHub account linking failed. Please try again.');
  const gh = await githubJson('/user', tokenBody.access_token);
  const other = await db.collection('users').findOne({ githubUserLower: gh.login.toLowerCase(), _id: { $ne: current._id } });
  if (other) throw new HttpError(409, 'That GitHub account is linked to another DSAvation member.');
  await db.collection('users').updateOne({ _id: current._id }, {
    $set: { githubUsername: gh.login, githubUserLower: gh.login.toLowerCase(), githubId: gh.id, githubVerifiedAt: new Date(), updatedAt: new Date() },
  });
  await recordAdminActivity(db, current, 'github_account_verified', { id: current._id, label: gh.login });
  res.statusCode = 302;
  res.setHeader('Location', `${baseUrl(req)}/?github=connected`);
  res.end();
}

async function setProgress(db, req, user, questionId, solved) {
  await allowRequest(db, req, `progress-${user._id}`, 180, 60 * 1000);
  const id = Number(questionId);
  if (!questionById.has(id)) throw new HttpError(404, 'Question not found in the DSAvation curriculum.');
  const collection = db.collection('personalProgress');
  if (solved) {
    await collection.updateOne({ userId: user._id, questionId: id }, {
      $setOnInsert: { userId: user._id, questionId: id, solvedAt: new Date() },
      $set: { updatedAt: new Date() },
    }, { upsert: true });
  } else {
    await collection.deleteOne({ userId: user._id, questionId: id });
  }
}

async function getTodayAssignment(db) {
  return db.collection('assignments').findOne({ dateKey: dayKey() });
}

async function getClubToday(db) {
  const assignment = await getTodayAssignment(db);
  if (!assignment) return { dateKey: dayKey(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [], dailyLeaderboard: [] };
  const submissions = await db.collection('submissions').find({ assignmentId: assignment._id }).sort({ submittedAt: 1 }).toArray();
  const userIds = [...new Set(submissions.map((item) => String(item.userId)))].map((id) => new ObjectId(id));
  const profiles = userIds.length ? await db.collection('users').find(approvedUserFilter({ _id: { $in: userIds } }), {
    projection: { name: 1, department: 1, studyYear: 1, showPublic: 1, githubUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray() : [];
  const profileById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const activeSubmissions = submissions.filter((item) => item.status !== 'invalidated' && profileById.has(String(item.userId)));
  const participants = activeSubmissions.filter((item) => item.status === 'accepted').flatMap((item) => {
    const profile = profileById.get(String(item.userId));
    return profile ? [{
      name: profile.name,
      department: profile.department,
      githubUsername: profile.githubUsername,
      ...formatAvatar(profile),
    }] : [];
  });
  const dailyLeaderboard = activeSubmissions.filter((item) => item.status === 'accepted').map((item, index) => {
    const profile = profileById.get(String(item.userId));
    return {
      rank: index + 1,
      id: String(item._id),
      userId: String(item.userId),
      name: profile?.name || item.authorLogin || 'Member',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      githubUsername: profile?.githubUsername || item.authorLogin || '',
      ...formatAvatar(profile, item.userId),
      points: item.points ?? 1,
      submittedAt: item.submittedAt,
      commitUrl: item.commitUrl,
      submissionType: item.submissionMethod || (item.verificationSource === 'leetcode-api' ? 'leetcode' : 'github'),
    };
  });
  return {
    dateKey: dayKey(),
    assignment: {
      id: String(assignment._id),
      questionId: assignment.questionId,
      dateKey: assignment.dateKey,
      createdByName: assignment.createdByName,
      explainer: assignment.explainer || null,
    },
    submittedCount: activeSubmissions.length,
    acceptedCount: activeSubmissions.filter((item) => item.status === 'accepted').length,
    participants,
    dailyLeaderboard,
  };
}

async function makeSubmission(db, req, user, body) {
  const isLeetCode = body.type === 'leetcode' || body.method === 'leetcode' || body.submissionMethod === 'leetcode';

  if (isLeetCode) {
    if (user.role !== 'admin' && user.leetcodeApproval !== 'approved') {
      throw new HttpError(403, 'Submitting directly via LeetCode requires administrator approval. Request approval in your Account settings.');
    }
  }

  if (!isLeetCode && !user.githubVerifiedAt) {
    throw new HttpError(403, 'Link your verified GitHub account before submitting a club solution.');
  }
  if (isLeetCode && !String(user.leetcodeUsername || '').trim()) {
    throw new HttpError(400, 'Add your LeetCode username in your Account settings before submitting directly via LeetCode.');
  }

  const assignment = await getTodayAssignment(db);
  if (!assignment || String(assignment._id) !== String(body.assignmentId || '')) {
    throw new HttpError(409, 'Submissions are only open for today’s published Question of the Day.');
  }
  const existing = await db.collection('submissions').findOne({ assignmentId: assignment._id, userId: user._id });
  if (existing && existing.status !== 'invalidated') throw new HttpError(409, 'You already submitted for today’s assignment.');

  let submission;
  if (isLeetCode) {
    const leetcodeUser = String(user.leetcodeUsername || '').trim();
    await allowRequest(db, req, `submission-leetcode-${user._id}`, 15, 60 * 60 * 1000);

    const query = `query recentSubmissions($username: String!, $limit: Int) {
      recentSubmissionList(username: $username, limit: $limit) {
        title
        titleSlug
        timestamp
        statusDisplay
        lang
      }
    }`;

    let response;
    try {
      response = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Referer: `https://leetcode.com/${encodeURIComponent(leetcodeUser)}/`,
          'User-Agent': 'DSAvation-Club-Directory',
        },
        body: JSON.stringify({ query, variables: { username: leetcodeUser, limit: 20 } }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new HttpError(502, 'Could not connect to LeetCode public API. Please try again in a few moments.');
    }
    if (!response.ok) {
      throw new HttpError(502, 'LeetCode public API returned an error. Please try again.');
    }
    const payload = await response.json().catch(() => ({}));
    const submissionList = payload?.data?.recentSubmissionList;
    if (!Array.isArray(submissionList)) {
      throw new HttpError(502, 'Could not retrieve recent submissions from LeetCode. Verify your LeetCode username and try again.');
    }

    const assignedQuestion = questionById.get(Number(assignment.questionId));
    const targetSlug = slugifyTitle(assignedQuestion?.title || '');
    const targetTitle = String(assignedQuestion?.title || '').trim().toLowerCase();

    const isMatch = (item) => {
      const slug = String(item.titleSlug || '').toLowerCase().trim();
      const title = String(item.title || '').toLowerCase().trim();
      return (
        slug === targetSlug ||
        title === targetTitle ||
        slugifyTitle(title) === targetSlug ||
        slug.replace(/-/g, '') === targetSlug.replace(/-/g, '')
      );
    };

    const acceptedToday = submissionList.filter((item) => {
      if (!isMatch(item)) return false;
      if (item.statusDisplay !== 'Accepted') return false;
      const ts = Number(item.timestamp);
      const date = new Date(ts > 1e11 ? ts : ts * 1000);
      return isOnAssignmentDay(date, assignment.dateKey);
    });

    if (!acceptedToday.length) {
      const anyToday = submissionList.find((item) => {
        if (!isMatch(item)) return false;
        const ts = Number(item.timestamp);
        const date = new Date(ts > 1e11 ? ts : ts * 1000);
        return isOnAssignmentDay(date, assignment.dateKey);
      });
      if (anyToday && anyToday.statusDisplay !== 'Accepted') {
        throw new HttpError(400, `Your recent submission for "${assignedQuestion?.title || 'today’s question'}" on LeetCode has status "${anyToday.statusDisplay}". An "Accepted" submission is required.`);
      }
      const anyAccepted = submissionList.find((item) => isMatch(item) && item.statusDisplay === 'Accepted');
      if (anyAccepted) {
        const pastDateStr = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Number(anyAccepted.timestamp) * 1000));
        throw new HttpError(400, `Found an accepted submission for "${assignedQuestion?.title || 'today’s question'}" on your LeetCode account from ${pastDateStr}, but none today (${assignment.dateKey} IST). Please submit a fresh accepted solution on LeetCode today.`);
      }
      throw new HttpError(400, `No accepted submission found for "${assignedQuestion?.title || 'today’s question'}" on LeetCode account @${leetcodeUser} today (${assignment.dateKey} IST). Solve and submit the problem on LeetCode, then click submit again.`);
    }

    const bestMatch = acceptedToday[0];
    const bestDate = new Date(Number(bestMatch.timestamp) > 1e11 ? Number(bestMatch.timestamp) : Number(bestMatch.timestamp) * 1000);
    const now = new Date();
    submission = {
      assignmentId: assignment._id,
      userId: user._id,
      questionId: assignment.questionId,
      repository: `leetcode/@${leetcodeUser}`,
      commitSha: `lc-${bestMatch.timestamp}`,
      commitUrl: `https://leetcode.com/problems/${bestMatch.titleSlug || targetSlug}/`,
      solutionPath: `LeetCode: @${leetcodeUser} (${bestMatch.lang || 'code'})`,
      solutionSizeBytes: 1,
      commitDate: bestDate,
      submittedAt: now,
      status: 'accepted',
      points: 1,
      authorLogin: leetcodeUser,
      committerLogin: leetcodeUser,
      verifiedPusher: true,
      verificationSource: 'leetcode-api',
      submissionMethod: 'leetcode',
      reviewedAt: now,
      reviewedBy: null,
      reviewNote: `Verified via LeetCode public API (${bestMatch.lang || 'code'})`,
      activeSlot: true,
      leetcodeDetails: {
        title: bestMatch.title,
        titleSlug: bestMatch.titleSlug,
        lang: bestMatch.lang,
        timestamp: bestMatch.timestamp,
      },
    };
  } else {
    if (!user.githubVerifiedAt) throw new HttpError(403, 'Link your verified GitHub account before submitting a club solution.');
    await allowRequest(db, req, `submission-${user._id}`, 5, 60 * 60 * 1000);

    const rawInput = body.commitUrl || body.commitCode || body.commitSha || '';
    const { owner, repository, sha, commitData } = await resolveCommitInput(db, user, rawInput);
    const username = String(user.githubUsername || '').toLowerCase();
    if (owner.toLowerCase() !== username) throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    const commit = commitData || await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(sha)}`, process.env.GITHUB_TOKEN);
    const author = String(commit.author?.login || '').toLowerCase();
    const committer = String(commit.committer?.login || '').toLowerCase();
    if (author !== username || (committer !== username && committer !== 'web-flow')) {
      throw new HttpError(403, 'GitHub could not confirm that the commit author is your linked account.');
    }
    const commitDate = commit.commit?.committer?.date;
    const authorDate = commit.commit?.author?.date;
    if (!isOnAssignmentDay(commitDate, assignment.dateKey) || !isOnAssignmentDay(authorDate, assignment.dateKey)) {
      throw new HttpError(400, 'The file must be created and committed during the assignment day in Asia/Kolkata.');
    }
    const matchingFiles = (commit.files || []).filter((file) => file.status !== 'removed' && isAssignmentSolutionPath(file.filename, assignment.questionId));
    if (!matchingFiles.length) throw new HttpError(400, `This commit must create or change ${assignment.questionId}/solution.txt (or .cpp, .py, .java, .js, .c).`);
    const tree = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(commit.commit.tree.sha)}?recursive=1`, process.env.GITHUB_TOKEN);
    const sizeByPath = new Map((tree.tree || []).filter((item) => item.type === 'blob').map((item) => [item.path, Number(item.size)]));
    const matchingFile = matchingFiles.find((file) => Number.isFinite(sizeByPath.get(file.filename)) && sizeByPath.get(file.filename) > 0);
    const solutionSizeBytes = matchingFile ? sizeByPath.get(matchingFile.filename) : 0;
    const targetFilename = matchingFiles[0]?.filename || `${assignment.questionId}/solution.txt`;
    if (!matchingFile) throw new HttpError(400, `${targetFilename} must contain at least one byte at this commit.`);
    const now = new Date();
    submission = {
      assignmentId: assignment._id, userId: user._id, questionId: assignment.questionId,
      repository: `${owner}/${repository}`, commitSha: commit.sha,
      commitUrl: commit.html_url || `https://github.com/${owner}/${repository}/commit/${commit.sha}`,
      solutionPath: matchingFile.filename, solutionSizeBytes, commitDate: new Date(commitDate), submittedAt: now,
      status: 'accepted', points: 1, authorLogin: commit.author.login, committerLogin: commit.committer.login,
      verifiedPusher: true, verificationSource: 'github-commit-api', submissionMethod: 'github', reviewedAt: now,
      reviewedBy: null, reviewNote: '', activeSlot: true,
    };
    await db.collection('users').updateOne({ _id: user._id }, { $set: { lastRepository: repository } });
  }

  if (existing) {
    const previousAttempt = {
      commitUrl: existing.commitUrl, commitSha: existing.commitSha,
      questionId: existing.questionId, status: existing.status, invalidatedAt: existing.invalidatedAt,
    };
    await db.collection('submissions').updateOne({ _id: existing._id }, {
      $set: submission,
      $push: { supersededAttempts: previousAttempt },
    });
    return { ...submission, _id: existing._id, id: String(existing._id) };
  }
  const result = await db.collection('submissions').insertOne(submission);
  return { ...submission, _id: result.insertedId, id: String(result.insertedId) };
}

export async function resolveCommitInput(db, user, rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new HttpError(400, 'Enter a GitHub commit hash (e.g. 76c3f95) or full commit URL.');
  }

  const username = String(user.githubUsername || '').toLowerCase();

  // 1. Direct full commit URL or loose URL with owner/repo
  let parsed = parsePersonalCommitUrl(input);

  if (!parsed) {
    const repoAtSha = input.match(/^([A-Za-z0-9_.-]+)[@:]([a-f0-9]{7,40})$/i);
    if (repoAtSha) {
      parsed = { owner: username, repository: repoAtSha[1], sha: repoAtSha[2] };
    } else if (input.includes('/')) {
      let normalized = input;
      if (!/^https?:\/\//i.test(normalized)) {
        if (normalized.startsWith('github.com/')) {
          normalized = `https://${normalized}`;
        } else if (normalized.split('/').length === 3 && normalized.includes('/commit/')) {
          normalized = `https://github.com/${username}/${normalized}`;
        } else {
          normalized = `https://github.com/${normalized}`;
        }
      }
      parsed = parsePersonalCommitUrl(normalized);
    }
  }

  if (parsed) {
    if (parsed.owner.toLowerCase() !== username) {
      throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    }
    return { owner: parsed.owner, repository: parsed.repository, sha: parsed.sha };
  }

  // 2. Standalone commit hash / code (7 to 40 hex characters)
  if (/^[a-f0-9]{7,40}$/i.test(input)) {
    const sha = input.toLowerCase();

    // Check candidate repositories first (lastRepository, latest submission)
    const candidates = [];
    if (user.lastRepository) {
      candidates.push(user.lastRepository);
    }

    const lastSub = await db.collection('submissions').findOne(
      { userId: user._id, repository: { $exists: true } },
      { sort: { submittedAt: -1 } }
    );
    if (lastSub?.repository) {
      const repoName = lastSub.repository.includes('/') ? lastSub.repository.split('/')[1] : lastSub.repository;
      if (!candidates.includes(repoName)) {
        candidates.push(repoName);
      }
    }

    for (const repoName of candidates) {
      try {
        const commitCheck = await githubJson(
          `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/commits/${encodeURIComponent(sha)}`,
          process.env.GITHUB_TOKEN
        );
        if (commitCheck && (commitCheck.sha || commitCheck.commit)) {
          return { owner: username, repository: repoName, sha: commitCheck.sha || sha, commitData: commitCheck };
        }
      } catch {
        // Not in this candidate repo, continue
      }
    }

    // If not found in known repositories, search user's recent public repositories (most recently pushed first)
    try {
      const repos = await githubJson(
        `/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=12`,
        process.env.GITHUB_TOKEN
      );
      if (Array.isArray(repos)) {
        for (const r of repos) {
          const repoName = r.name;
          if (candidates.includes(repoName)) continue;
          try {
            const commitCheck = await githubJson(
              `/repos/${encodeURIComponent(username)}/${encodeURIComponent(repoName)}/commits/${encodeURIComponent(sha)}`,
              process.env.GITHUB_TOKEN
            );
            if (commitCheck && (commitCheck.sha || commitCheck.commit)) {
              await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { lastRepository: repoName } }
              );
              return { owner: username, repository: repoName, sha: commitCheck.sha || sha, commitData: commitCheck };
            }
          } catch {
            // Not in this repo
          }
        }
      }
    } catch {
      // Repos listing unavailable
    }

    throw new HttpError(
      404,
      `Commit "${input}" was not found in your recent public GitHub repositories. Please ensure your commit is pushed to your public repository, or enter the full commit URL.`
    );
  }

  throw new HttpError(
    400,
    'Enter a valid GitHub commit hash (e.g. 76c3f95) or full commit URL like https://github.com/YOUR-USERNAME/YOUR-REPO/commit/FULL_SHA.'
  );
}

export function parsePersonalCommitUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || '')); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 4 || !['commit', 'commits'].includes(parts[2].toLowerCase()) || !/^[a-f0-9]{7,40}$/i.test(parts[3])) return null;
  const [owner, repository] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) return null;
  return { owner, repository, sha: parts[3] };
}

export const ALLOWED_SOLUTION_EXTENSIONS = ['txt', 'cpp', 'py', 'java', 'js', 'c'];

export function isAssignmentSolutionPath(filename, questionId) {
  const match = String(filename || '').match(/^(\d+)\/solution\.(txt|cpp|py|java|js|c)$/);
  if (!match) return false;
  return Number(match[1]) === Number(questionId);
}

async function githubWebhook() {
  return { ok: true, ignored: true, reason: 'Members submit commit links from their personal repositories; verification runs when they submit.' };
}

async function assignmentHistory(db, url) {
  const filter = { dateKey: { $lte: dayKey() } };
  const { page, pageSize, skip } = pageOptions(url, 8, 20);
  const [total, assignments] = await Promise.all([
    db.collection('assignments').countDocuments(filter),
    db.collection('assignments').find(filter).sort({ dateKey: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return {
    assignments: assignments.map((assignment) => ({
    id: String(assignment._id), dateKey: assignment.dateKey, questionId: assignment.questionId,
    createdByName: assignment.createdByName,
    })),
    pagination: pageMeta(page, pageSize, total),
  };
}

async function leaderboard(db, url) {
  const assignments = await db.collection('assignments').find({ dateKey: { $lte: dayKey() } }).sort({ dateKey: 1 }).toArray();
  const totals = await db.collection('submissions').aggregate([
    { $match: { status: 'accepted' } },
    { $group: { _id: '$userId', accepted: { $sum: 1 }, points: { $sum: { $ifNull: ['$points', 1] } }, acceptedAssignments: { $addToSet: '$assignmentId' }, lastAcceptedAt: { $max: '$reviewedAt' } } },
    { $sort: { accepted: -1, lastAcceptedAt: 1 } },
  ]).toArray();
  const profiles = await db.collection('users').find(approvedUserFilter(), {
    projection: { name: 1, department: 1, githubUsername: 1, showPublic: 1, createdAt: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray();
  const totalById = new Map(totals.map((row) => [String(row._id), row]));
  const today = dayKey();
  const sortedProfiles = profiles.map((profile) => {
    const row = totalById.get(String(profile._id)) || { accepted: 0, acceptedAssignments: [] };
    const joinedDate = profile.createdAt ? new Date(profile.createdAt) : null;
    const joinedKey = joinedDate && !Number.isNaN(joinedDate.getTime()) ? dayKey(joinedDate) : '';
    const completed = new Set((row.acceptedAssignments || []).map(String));

    // Assignments considered scheduled for this member:
    // 1. Any assignment the member has completed (accepted) is always counted.
    // 2. Concluded assignments from the past (dateKey < today) that occurred on or after the member joined.
    // 3. For today's assignment (dateKey === today), it is counted if completed; if not yet completed,
    //    today is still in progress so it is not overdue.
    const eligible = assignments.filter((assignment) => {
      if (completed.has(String(assignment._id))) return true;
      if (assignment.dateKey < today) {
        return !joinedKey || assignment.dateKey >= joinedKey;
      }
      return false;
    });

    let streak = 0;
    for (const assignment of eligible.slice().reverse()) {
      if (!completed.has(String(assignment._id))) break;
      streak += 1;
    }

    const punctuality = eligible.length > 0
      ? Math.min(100, Math.max(0, Math.round((row.accepted / eligible.length) * 100)))
      : 100;

    return {
      name: profile.showPublic ? profile.name : profile.githubUsername ? `@${profile.githubUsername}` : 'ABES member',
      department: profile.showPublic ? profile.department : 'ABES member',
      githubUsername: profile.githubUsername,
      ...formatAvatar(profile),
      points: row.points ?? row.accepted,
      completed: row.accepted,
      scheduled: eligible.length,
      punctuality,
      streak,
    };
  }).sort((a, b) => b.points - a.points || b.punctuality - a.punctuality || a.name.localeCompare(b.name));
  const { page, pageSize, skip } = pageOptions(url, 12, 50);
  return { leaderboard: sortedProfiles.slice(skip, skip + pageSize), pagination: pageMeta(page, pageSize, sortedProfiles.length) };
}

async function createAssignment(db, user, body) {
  requireRole(user, 'lead', 'admin');
  const questionId = Number(body.questionId);
  const dateKey = String(body.dateKey || '');
  if (!questionById.has(questionId)) throw new HttpError(400, 'Choose a question from the 220-question curriculum.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < dayKey()) throw new HttpError(400, 'Choose today or a future date in Asia/Kolkata.');
  const existing = await db.collection('assignments').findOne({ dateKey });
  if (existing) throw new HttpError(409, 'A question is already published for this date. Only one Question of the Day can be published per date.');
  const assignment = {
    dateKey, questionId, createdBy: user._id, createdByName: user.name,
    timezone: TZ, createdAt: new Date(),
  };
  const result = await db.collection('assignments').insertOne(assignment);
  await recordAdminActivity(db, user, 'assignment_published', { id: result.insertedId, label: `${dateKey} · LC ${questionId}` }, { questionId });
  return { id: String(result.insertedId), dateKey, questionId, createdByName: user.name };
}

async function updateAssignment(db, user, assignmentId, body) {
  requireRole(user, 'lead', 'admin');
  if (!ObjectId.isValid(assignmentId)) throw new HttpError(404, 'Assignment not found.');
  const questionId = Number(body.questionId);
  if (!questionById.has(questionId)) throw new HttpError(400, 'Choose a question from the 220-question curriculum.');
  const id = new ObjectId(assignmentId);
  const assignment = await db.collection('assignments').findOne({ _id: id });
  if (!assignment || assignment.dateKey !== dayKey()) throw new HttpError(404, 'Only today’s published assignment can be changed here.');
  if (assignment.questionId === questionId) throw new HttpError(400, 'Choose a different question before saving.');
  const now = new Date();
  const invalidationNote = `Assignment corrected by ${user.name}; submit the newly selected question to regain today’s point.`;
  const changed = await db.collection('assignments').updateOne({ _id: id, questionId: assignment.questionId }, {
    $set: { questionId, updatedAt: now, updatedBy: user._id, updatedByName: user.name },
  });
  if (!changed.matchedCount) throw new HttpError(409, 'The assignment changed while you were editing it. Refresh and try again.');
  const affected = await db.collection('submissions').updateMany(
    { assignmentId: id, questionId: { $ne: questionId }, status: { $ne: 'invalidated' } },
    { $set: { status: 'invalidated', points: 0, invalidatedAt: now, invalidatedBy: user._id, reviewNote: invalidationNote } },
  );
  await recordAdminActivity(db, user, 'assignment_changed', { id, label: `${assignment.dateKey} · LC ${assignment.questionId} → LC ${questionId}` }, { fromQuestionId: assignment.questionId, toQuestionId: questionId, invalidatedSubmissions: affected.modifiedCount });
  return { id: String(id), dateKey: assignment.dateKey, questionId, invalidatedSubmissions: affected.modifiedCount };
}

async function deleteAssignment(db, user, assignmentId) {
  requireRole(user, 'lead', 'admin');
  if (!ObjectId.isValid(assignmentId)) throw new HttpError(404, 'Assignment not found.');
  const id = new ObjectId(assignmentId);
  const assignment = await db.collection('assignments').findOne({ _id: id });
  if (!assignment) throw new HttpError(404, 'Assignment not found.');
  if (assignment.dateKey < dayKey() && user.role !== 'admin') {
    throw new HttpError(400, 'Only today’s or upcoming assignments can be deleted.');
  }
  await db.collection('assignments').deleteOne({ _id: id });
  const affected = await db.collection('submissions').deleteMany({ assignmentId: id });
  await recordAdminActivity(
    db,
    user,
    'assignment_deleted',
    { id, label: `${assignment.dateKey} · LC ${assignment.questionId}` },
    { questionId: assignment.questionId, dateKey: assignment.dateKey, deletedSubmissions: affected.deletedCount }
  );
  return { ok: true, deleted: true, id: String(id), dateKey: assignment.dateKey, questionId: assignment.questionId };
}

async function listSubmissions(db, req, user, url) {
  const isReview = url.pathname === '/api/admin/submissions';
  if (isReview) requireRole(user, 'lead', 'admin');
  const match = isReview ? { status: url.searchParams.get('status') || 'pending' } : { userId: user._id };
  const { page, pageSize, skip } = pageOptions(url, 10, 30);
  const [total, items] = await Promise.all([
    db.collection('submissions').countDocuments(match),
    db.collection('submissions').find(match).sort({ submittedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const userIds = [...new Set(items.map((item) => String(item.userId)))].map((id) => new ObjectId(id));
  const assignmentIds = [...new Set(items.map((item) => String(item.assignmentId)))].map((id) => new ObjectId(id));
  const profiles = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, department: 1, githubUsername: 1 } }).toArray() : [];
  const assignments = assignmentIds.length ? await db.collection('assignments').find({ _id: { $in: assignmentIds } }).toArray() : [];
  const profileById = new Map(profiles.map((item) => [String(item._id), item]));
  const assignmentById = new Map(assignments.map((item) => [String(item._id), item]));
  return { submissions: items.map((item) => ({
    id: String(item._id), status: item.status, points: item.points ?? (item.status === 'accepted' ? 1 : 0), commitUrl: item.commitUrl, solutionPath: item.solutionPath, submittedAt: item.submittedAt,
    commitDate: item.commitDate, reviewNote: item.reviewNote,
    verifiedPusher: Boolean(item.verifiedPusher), verificationSource: item.verificationSource || 'commit-link',
    submissionMethod: item.submissionMethod || (item.verificationSource === 'leetcode-api' ? 'leetcode' : 'github'),
    member: (() => { const profile = profileById.get(String(item.userId)); return profile ? {
      name: profile.name, department: profile.department, githubUsername: profile.githubUsername,
    } : null; })(),
    assignment: (() => { const assignment = assignmentById.get(String(item.assignmentId)); return assignment ? {
      dateKey: assignment.dateKey, questionId: item.questionId || assignment.questionId,
      question: questionById.get(item.questionId || assignment.questionId)?.title || 'Question',
    } : null; })(),
  })), pagination: pageMeta(page, pageSize, total) };
}

async function getTodaySubmissions(db, req, user, url) {
  requireRole(user, 'lead', 'admin');
  const assignment = await getTodayAssignment(db);
  if (!assignment) {
    if (url.searchParams.get('format') === 'csv') {
      return {
        csv: 'Name,Email,Club Department,Year of Study,GitHub Username,Question ID,Status,Points,Commit URL,Submitted At (IST)\r\n',
        filename: `today-attempts-${dayKey()}.csv`,
      };
    }
    return {
      dateKey: dayKey(),
      assignment: null,
      totalAttempted: 0,
      totalNotAttempted: 0,
      totalApprovedMembers: 0,
      acceptedCount: 0,
      pendingCount: 0,
      submissions: [],
      notAttempted: [],
    };
  }

  const submissions = await db.collection('submissions')
    .find({ assignmentId: assignment._id, status: { $ne: 'invalidated' } })
    .sort({ submittedAt: -1 })
    .toArray();

  const allApproved = await db.collection('users').find(approvedUserFilter(), {
    projection: { name: 1, email: 1, department: 1, studyYear: 1, githubUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray();
  const profileById = new Map(allApproved.map((p) => [String(p._id), p]));
  const attemptedUserIdSet = new Set(submissions.map((item) => String(item.userId)));

  const rows = submissions.map((item) => {
    const profile = profileById.get(String(item.userId));
    return {
      id: String(item._id),
      userId: String(item.userId),
      name: profile?.name || item.authorLogin || 'Member',
      email: profile?.email || '',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      githubUsername: profile?.githubUsername || item.authorLogin || '',
      ...formatAvatar(profile, item.userId),
      commitUrl: item.commitUrl,
      commitSha: item.commitSha,
      solutionPath: item.solutionPath,
      solutionSizeBytes: item.solutionSizeBytes,
      submittedAt: item.submittedAt,
      commitDate: item.commitDate,
      status: item.status,
      points: item.points ?? (item.status === 'accepted' ? 1 : 0),
      verifiedPusher: Boolean(item.verifiedPusher),
      submissionMethod: item.submissionMethod || (item.verificationSource === 'leetcode-api' ? 'leetcode' : 'github'),
      reviewNote: item.reviewNote || '',
      questionId: assignment.questionId,
    };
  });

  const notAttemptedRows = allApproved
    .filter((u) => !attemptedUserIdSet.has(String(u._id)))
    .map((u) => ({
      id: String(u._id),
      userId: String(u._id),
      name: u.name || 'Member',
      email: u.email || '',
      department: u.department || '',
      studyYear: u.studyYear || '',
      githubUsername: u.githubUsername || '',
      ...formatAvatar(u),
      commitUrl: '',
      commitSha: '',
      solutionPath: '',
      solutionSizeBytes: 0,
      submittedAt: null,
      commitDate: null,
      status: 'not_attempted',
      points: 0,
      verifiedPusher: false,
      reviewNote: '',
      questionId: assignment.questionId,
    }));

  if (url.searchParams.get('format') === 'csv') {
    const studyYearNames = { 'first-year': 'First year', 'second-year': 'Second year', 'third-year': 'Third year', 'fourth-year': 'Fourth year', passed: 'Passed out' };
    const escapeCsv = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
    const targetType = url.searchParams.get('type') || 'attempted';
    const filterYear = url.searchParams.get('studyYear');
    const filterDept = url.searchParams.get('department');

    let exportRows = [];
    if (targetType === 'not_attempted') {
      exportRows = notAttemptedRows;
    } else if (targetType === 'all') {
      exportRows = [...rows, ...notAttemptedRows];
    } else {
      exportRows = rows;
    }

    if (filterYear && filterYear !== 'all') {
      exportRows = exportRows.filter((r) => r.studyYear === filterYear);
    }
    if (filterDept && filterDept !== 'all') {
      exportRows = exportRows.filter((r) => r.department === filterDept);
    }

    const header = ['Name', 'Email', 'Club Department', 'Year of Study', 'GitHub Username', 'Question ID', 'Status', 'Points', 'Commit URL', 'Submitted At (IST)'].join(',');
    const bodyRows = exportRows.map((r) => [
      escapeCsv(r.name),
      escapeCsv(r.email),
      escapeCsv(r.department),
      escapeCsv(studyYearNames[r.studyYear] || r.studyYear || '—'),
      escapeCsv(r.githubUsername || '—'),
      r.questionId,
      r.status === 'not_attempted' ? 'Not Attempted' : r.status,
      r.points,
      escapeCsv(r.commitUrl || '—'),
      escapeCsv(r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '—'),
    ].join(','));
    return {
      csv: [header, ...bodyRows].join('\r\n'),
      filename: `today-${targetType}-${filterYear && filterYear !== 'all' ? `${filterYear}-` : ''}${assignment.dateKey}.csv`,
    };
  }

  return {
    dateKey: assignment.dateKey,
    assignmentId: String(assignment._id),
    assignment: {
      id: String(assignment._id),
      questionId: assignment.questionId,
      dateKey: assignment.dateKey,
      createdByName: assignment.createdByName,
      explainer: assignment.explainer || null,
    },
    questionId: assignment.questionId,
    questionTitle: questionById.get(assignment.questionId)?.title || `LeetCode #${assignment.questionId}`,
    totalAttempted: rows.length,
    totalNotAttempted: notAttemptedRows.length,
    totalApprovedMembers: allApproved.length,
    acceptedCount: rows.filter((r) => r.status === 'accepted').length,
    pendingCount: rows.filter((r) => r.status === 'pending').length,
    submissions: rows,
    notAttempted: notAttemptedRows,
    explainer: assignment.explainer || null,
  };
}

async function pickTodayExplainer(db, user) {
  requireRole(user, 'lead', 'admin');
  const assignment = await getTodayAssignment(db);
  if (!assignment) {
    throw new HttpError(400, 'No Question of the Day is published for today.');
  }

  // 1. If already selected for today, return the locked explainer!
  if (assignment.explainer) {
    return { explainer: assignment.explainer, isExisting: true };
  }

  // 2. Query today's submissions (non-invalidated)
  const submissions = await db.collection('submissions')
    .find({ assignmentId: assignment._id, status: { $ne: 'invalidated' } })
    .sort({ submittedAt: 1 })
    .toArray();

  if (!submissions.length) {
    throw new HttpError(400, 'No members have attempted today’s question yet.');
  }

  const userIds = [...new Set(submissions.map((s) => String(s.userId)))].map((id) => new ObjectId(id));
  const profiles = await db.collection('users').find(approvedUserFilter({ _id: { $in: userIds } }), {
    projection: { name: 1, email: 1, department: 1, studyYear: 1, githubUsername: 1, leetcodeUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray();
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));

  const candidates = submissions.map((sub) => {
    const profile = profileById.get(String(sub.userId));
    return {
      userId: String(sub.userId),
      submissionId: String(sub._id),
      name: profile?.name || sub.authorLogin || 'Member',
      email: profile?.email || '',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      githubUsername: profile?.githubUsername || sub.authorLogin || '',
      leetcodeUsername: profile?.leetcodeUsername || '',
      ...formatAvatar(profile, sub.userId),
      submittedAt: sub.submittedAt,
      status: sub.status,
      points: sub.points ?? (sub.status === 'accepted' ? 1 : 0),
      commitUrl: sub.commitUrl,
      questionId: assignment.questionId,
    };
  }).filter((c) => profileById.has(c.userId));

  if (!candidates.length) {
    throw new HttpError(400, 'No eligible members found among today’s submitters.');
  }

  const acceptedCandidates = candidates.filter((c) => c.status === 'accepted');
  const pool = acceptedCandidates.length > 0 ? acceptedCandidates : candidates;

  // Past assignments where an explainer was selected
  const pastAssignments = await db.collection('assignments')
    .find({ explainerUserId: { $exists: true, $ne: null } }, { projection: { explainerUserId: 1 } })
    .toArray();
  const pastExplainerIds = new Set(pastAssignments.map((a) => String(a.explainerUserId)));

  // "dont repeat same person until you cover all second year student"
  const secondYearUnpicked = pool.filter((c) => c.studyYear === 'second-year' && !pastExplainerIds.has(c.userId));

  let chosen;
  if (secondYearUnpicked.length > 0) {
    chosen = secondYearUnpicked[Math.floor(Math.random() * secondYearUnpicked.length)];
  } else {
    // If all second-years among today's submitters were picked in the past, or none submitted:
    const othersUnpicked = pool.filter((c) => !pastExplainerIds.has(c.userId));
    if (othersUnpicked.length > 0) {
      chosen = othersUnpicked[Math.floor(Math.random() * othersUnpicked.length)];
    } else {
      // Everyone has been picked in the past: prioritize second-years if present, otherwise any
      const allSecondYears = pool.filter((c) => c.studyYear === 'second-year');
      const fallbackPool = allSecondYears.length > 0 ? allSecondYears : pool;
      chosen = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
    }
  }

  const explainer = {
    id: chosen.userId,
    userId: chosen.userId,
    name: chosen.name,
    email: chosen.email,
    department: chosen.department,
    studyYear: chosen.studyYear,
    githubUsername: chosen.githubUsername,
    leetcodeUsername: chosen.leetcodeUsername,
    avatarStyle: chosen.avatarStyle,
    avatarSeed: chosen.avatarSeed,
    avatarUrl: chosen.avatarUrl,
    submittedAt: chosen.submittedAt,
    status: chosen.status,
    points: chosen.points,
    commitUrl: chosen.commitUrl,
    questionId: assignment.questionId,
    pickedAt: new Date(),
  };

  await db.collection('assignments').updateOne(
    { _id: assignment._id },
    { $set: { explainerUserId: new ObjectId(chosen.userId), explainer } }
  );

  await recordAdminActivity(db, user, 'explainer_selected', { id: assignment._id, label: assignment.dateKey }, {
    explainerUserId: chosen.userId,
    explainerName: chosen.name,
    studyYear: chosen.studyYear,
  });

  return { explainer, isNew: true };
}

async function reviewSubmission(db, user, submissionId, body) {
  requireRole(user, 'lead', 'admin');
  if (!ObjectId.isValid(submissionId)) throw new HttpError(404, 'Submission not found.');
  const status = body.status;
  if (!['accepted', 'rejected'].includes(status)) throw new HttpError(400, 'Choose accepted or rejected.');
  const note = String(body.note || '').trim().slice(0, 400);
  const submission = await db.collection('submissions').findOne({ _id: new ObjectId(submissionId), status: 'pending' });
  if (!submission) throw new HttpError(404, 'Pending submission not found.');
  const result = await db.collection('submissions').updateOne(
    { _id: new ObjectId(submissionId), status: 'pending' },
    { $set: { status, points: status === 'accepted' ? 1 : 0, reviewNote: note, reviewedAt: new Date(), reviewedBy: user._id } },
  );
  if (!result.matchedCount) throw new HttpError(404, 'Pending submission not found.');
  await recordAdminActivity(db, user, 'submission_reviewed', { id: submission._id, label: submission.commitUrl }, { status, points: status === 'accepted' ? 1 : 0, note });
  return { ok: true };
}

async function adjustSubmissionPoints(db, user, submissionId, body) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(submissionId)) throw new HttpError(404, 'Submission not found.');
  const points = Number(body.points);
  if (!Number.isInteger(points) || points < 0 || points > 10) throw new HttpError(400, 'Points must be a whole number from 0 to 10.');
  const id = new ObjectId(submissionId);
  const submission = await db.collection('submissions').findOne({ _id: id, status: 'accepted' });
  if (!submission) throw new HttpError(404, 'Accepted submission not found.');
  const previousPoints = submission.points ?? 1;
  const note = String(body.note || '').trim().slice(0, 400);
  const result = await db.collection('submissions').updateOne({ _id: id, status: 'accepted' }, {
    $set: { points, pointsAdjustedAt: new Date(), pointsAdjustedBy: user._id, pointsAdjustmentNote: note },
  });
  if (!result.matchedCount) throw new HttpError(409, 'The submission changed while you were adjusting points. Refresh and try again.');
  await recordAdminActivity(db, user, 'submission_points_adjusted', { id, label: submission.commitUrl }, { fromPoints: previousPoints, toPoints: points, note });
  return { ok: true, points };
}

async function listMembers(db, url) {
  const status = url.searchParams.get('status') || 'all';
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const filters = [];
  if (status === 'approved') filters.push(approvedUserFilter());
  if (status === 'pending') filters.push({ $or: [{ approvalStatus: 'pending' }, { approvalStatus: { $exists: false }, verifiedAt: null }] });
  if (status === 'leetcode' || status === 'leetcode-pending') filters.push({ leetcodeApproval: 'pending' });
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filters.push({ $or: [{ name: regex }, { department: regex }, { email: regex }, { githubUsername: regex }, { leetcodeUsername: regex }] });
  }
  const filter = filters.length > 1 ? { $and: filters } : filters[0] || {};
  const { page, pageSize, skip } = pageOptions(url, 20, 50);
  const [total, members, pending, approved, leetcodePending] = await Promise.all([
    db.collection('users').countDocuments(filter),
    db.collection('users').find(filter, {
      projection: { name: 1, department: 1, studyYear: 1, email: 1, githubUsername: 1, leetcodeUsername: 1, role: 1, showPublic: 1, createdAt: 1, approvalStatus: 1, approvedAt: 1, verifiedAt: 1, leetcodeApproval: 1, leetcodeRequestedAt: 1, defaultSubmissionMethod: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
    }).sort({ name: 1 }).skip(skip).limit(pageSize).toArray(),
    db.collection('users').countDocuments({ $or: [{ approvalStatus: 'pending' }, { approvalStatus: { $exists: false }, verifiedAt: null }] }),
    db.collection('users').countDocuments(approvedUserFilter()),
    db.collection('users').countDocuments({ leetcodeApproval: 'pending' }),
  ]);
  return { members: members.map((user) => ({
    id: String(user._id), name: user.name, department: user.department, studyYear: user.studyYear || '',
    email: user.email, githubUsername: user.githubUsername, leetcodeUsername: user.leetcodeUsername || '', role: user.role || 'member',
    ...formatAvatar(user),
    approvalStatus: approvalStatus(user),
    leetcodeApproval: user.role === 'admin' ? 'approved' : (user.leetcodeApproval || 'none'),
    leetcodeRequestedAt: user.leetcodeRequestedAt || null,
    defaultSubmissionMethod: user.defaultSubmissionMethod || 'github',
    showPublic: Boolean(user.showPublic), createdAt: user.createdAt, approvedAt: user.approvedAt || user.verifiedAt || null,
  })), pagination: pageMeta(page, pageSize, total), counts: { pending, approved, leetcodePending } };
}

async function listDirectory(db, url, viewer = null) {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const department = String(url.searchParams.get('department') || '').trim().slice(0, 80);
  const studyYear = String(url.searchParams.get('year') || '');
  const filters = [approvedUserFilter()];
  const isAdmin = viewer?.role === 'admin';

  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const orFields = [{ name: regex }, { department: regex }, { githubUsername: regex }];
    if (isAdmin) orFields.push({ leetcodeUsername: regex });
    filters.push({ $or: orFields });
  }
  if (department) filters.push({ department: new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (studyYear) {
    if (!['first-year', 'second-year', 'third-year', 'fourth-year', 'passed'].includes(studyYear)) throw new HttpError(400, 'Choose a valid year of study.');
    filters.push({ studyYear });
  }
  const filter = filters.length === 1 ? filters[0] : { $and: filters };
  const { page, pageSize, skip } = pageOptions(url, 60, 100);
  const [total, members, departments] = await Promise.all([
    db.collection('users').countDocuments(filter),
    db.collection('users').find(filter, {
      projection: { name: 1, department: 1, studyYear: 1, githubUsername: 1, leetcodeUsername: 1, role: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
    }).sort({ name: 1 }).skip(skip).limit(pageSize).toArray(),
    db.collection('users').find(approvedUserFilter(), { projection: { department: 1 } }).toArray(),
  ]);
  return {
    members: members.map((member) => {
      const isSelf = viewer && String(member._id) === String(viewer._id);
      const canSeeLeetcode = isAdmin || isSelf;
      return {
        id: String(member._id),
        name: member.name,
        department: member.department,
        studyYear: member.studyYear || '',
        githubUsername: member.githubUsername || '',
        leetcodeUsername: canSeeLeetcode ? (member.leetcodeUsername || '') : '',
        role: member.role || 'member',
        ...formatAvatar(member),
      };
    }),
    departments: [...new Set(departments.map((member) => String(member.department || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    pagination: pageMeta(page, pageSize, total),
  };
}

async function getMemberLeetcodeStats(db, req, viewer, memberId) {
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  const isSelf = String(viewer._id) === String(memberId);
  const isAdmin = viewer.role === 'admin';
  if (!isAdmin && !isSelf) {
    throw new HttpError(403, 'Only administrators can view other members’ LeetCode statistics.');
  }
  const target = await db.collection('users').findOne(approvedUserFilter({ _id: new ObjectId(memberId) }), {
    projection: { leetcodeUsername: 1, leetcodeStats: 1 },
  });
  if (!target) throw new HttpError(404, 'Member not found.');
  const username = String(target.leetcodeUsername || '').trim();
  if (!username) return { available: false, reason: 'This member has not added a LeetCode username.' };

  const cached = target.leetcodeStats;
  const cacheIsFresh = cached?.username?.toLowerCase() === username.toLowerCase() &&
    Date.now() - new Date(cached.fetchedAt).getTime() < 6 * 60 * 60 * 1000;
  if (cacheIsFresh) return { available: true, stats: cached, cached: true };

  await allowRequest(db, req, `leetcode-stats-${viewer._id}`, 12, 60 * 60 * 1000);
  const query = `query getUserStats($username: String!) {
    allQuestionsCount { difficulty count }
    matchedUser(username: $username) {
      username
      submitStats: submitStatsGlobal {
        acSubmissionNum { difficulty count submissions }
        totalSubmissionNum { difficulty count submissions }
      }
    }
  }`;
  try {
    const response = await fetch('https://leetcode.com/graphql/', {
      method: 'POST',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        Referer: `https://leetcode.com/${encodeURIComponent(username)}/`,
        'User-Agent': 'DSAvation-Club-Directory',
      },
      body: JSON.stringify({ query, variables: { username } }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('LeetCode public profile request failed.');
    const payload = await response.json();
    const matchedUser = payload?.data?.matchedUser;
    const accepted = matchedUser?.submitStats?.acSubmissionNum;
    const attempted = matchedUser?.submitStats?.totalSubmissionNum;
    if (payload?.errors?.length || !matchedUser || !Array.isArray(accepted)) throw new Error('LeetCode public statistics are unavailable.');
    const byDifficulty = ['Easy', 'Medium', 'Hard'].map((difficulty) => ({
      difficulty,
      solved: Number(accepted.find((item) => item.difficulty === difficulty)?.count || 0),
      attempted: attempted ? Number(attempted.find((item) => item.difficulty === difficulty)?.count || 0) : null,
      available: Boolean(attempted),
    }));
    const stats = {
      username: matchedUser.username || username,
      solvedCount: byDifficulty.reduce((sum, item) => sum + item.solved, 0),
      attemptedCount: attempted ? byDifficulty.reduce((sum, item) => sum + item.attempted, 0) : null,
      byDifficulty,
      fetchedAt: new Date(),
    };
    await db.collection('users').updateOne({ _id: target._id, leetcodeUsername: username }, { $set: { leetcodeStats: stats } });
    return { available: true, stats, cached: false };
  } catch {
    return cached?.username?.toLowerCase() === username.toLowerCase()
      ? { available: true, stats: cached, cached: true, stale: true, reason: 'Showing the last saved public statistics.' }
      : { available: false, reason: 'LeetCode did not return public statistics. The profile link is still available.' };
  }
}

async function updateMember(db, user, memberId, body) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  const member = await db.collection('users').findOne({ _id: new ObjectId(memberId) });
  if (!member) throw new HttpError(404, 'Member not found.');
  const update = {};
  if (body.role !== undefined) {
    if (!['member', 'lead', 'admin'].includes(body.role)) throw new HttpError(400, 'Role must be member, lead, or admin.');
    if (String(user._id) === memberId && body.role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin access.');
    if (String(user._id) !== memberId && body.role !== 'admin') {
      if (member.role === 'admin' && isApproved(member)) {
        const admins = await db.collection('users').countDocuments(approvedUserFilter({ role: 'admin' }));
        if (admins <= 1) throw new HttpError(409, 'Promote another approved administrator before changing this role.');
      }
    }
    update.role = body.role;
  }
  if (body.showPublic !== undefined) update.showPublic = Boolean(body.showPublic);
  if (body.approvalStatus !== undefined) {
    if (!['approved', 'pending'].includes(body.approvalStatus)) throw new HttpError(400, 'Approval status must be approved or pending.');
    if (String(user._id) === memberId && body.approvalStatus !== 'approved') throw new HttpError(400, 'You cannot remove your own account approval.');
    if (member.role === 'admin' && body.approvalStatus !== 'approved') {
      const admins = await db.collection('users').countDocuments(approvedUserFilter({ role: 'admin' }));
      if (admins <= 1) throw new HttpError(409, 'Approve another administrator before de-approving this account.');
    }
    update.approvalStatus = body.approvalStatus;
    update.updatedAt = new Date();
    if (body.approvalStatus === 'approved') {
      update.approvedAt = new Date();
      update.approvedBy = user._id;
    }
  }
  if (body.leetcodeApproval !== undefined) {
    if (!['approved', 'pending', 'none'].includes(body.leetcodeApproval)) {
      throw new HttpError(400, 'LeetCode approval status must be approved, pending, or none.');
    }
    update.leetcodeApproval = body.leetcodeApproval;
    update.updatedAt = new Date();
    if (body.leetcodeApproval === 'approved') {
      update.leetcodeApprovedAt = new Date();
      update.leetcodeApprovedBy = user._id;
    } else {
      if (member.defaultSubmissionMethod === 'leetcode') {
        update.defaultSubmissionMethod = 'github';
      }
    }
  }
  if (!Object.keys(update).length) throw new HttpError(400, 'No member settings were provided.');
  const unset = body.approvalStatus === 'pending' ? { approvedAt: '', approvedBy: '' } : undefined;
  const operation = { $set: update, ...(unset ? { $unset: unset } : {}) };
  const result = await db.collection('users').updateOne({ _id: new ObjectId(memberId) }, operation);
  if (!result.matchedCount) throw new HttpError(404, 'Member not found.');
  if (body.approvalStatus === 'pending') await db.collection('sessions').deleteMany({ userId: new ObjectId(memberId) });
  const changes = Object.fromEntries(Object.keys(update).filter((key) => !['updatedAt', 'approvedAt', 'approvedBy'].includes(key)).map((key) => [key, {
    from: key === 'approvalStatus' ? approvalStatus(member) : (member[key] ?? null),
    to: key === 'approvalStatus' ? body.approvalStatus : update[key],
  }]));
  await recordAdminActivity(db, user, 'member_updated', { id: memberId, label: `${member.name} · ${member.email}` }, { changes });
  return { ok: true, approvalStatus: body.approvalStatus };
}

async function deleteMember(db, user, memberId) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  if (String(user._id) === memberId) throw new HttpError(400, 'You cannot delete your own administrator account.');
  const id = new ObjectId(memberId);
  const member = await db.collection('users').findOne({ _id: id }, { projection: { name: 1, email: 1, role: 1, approvalStatus: 1, verifiedAt: 1 } });
  if (!member) throw new HttpError(404, 'Member not found.');
  if (member.role === 'admin' && isApproved(member)) {
    const admins = await db.collection('users').countDocuments(approvedUserFilter({ role: 'admin' }));
    if (admins <= 1) throw new HttpError(409, 'Promote another approved administrator before deleting this account.');
  }
  await Promise.all([
    db.collection('sessions').deleteMany({ userId: id }),
    db.collection('personalProgress').deleteMany({ userId: id }),
    db.collection('submissions').deleteMany({ userId: id }),
    db.collection('emailVerifications').deleteMany({ userId: id }),
    db.collection('passwordResets').deleteMany({ userId: id }),
    db.collection('assignments').updateMany({ createdBy: id }, { $set: { createdByName: 'Former member' }, $unset: { createdBy: '' } }),
  ]);
  await db.collection('users').deleteOne({ _id: id });
  await recordAdminActivity(db, user, 'member_deleted', { id, label: `${member.name} · ${member.email}` });
  return { ok: true };
}

async function listAdminActivity(db, url) {
  const { page, pageSize, skip } = pageOptions(url, 10, 50);
  const [total, activity] = await Promise.all([
    db.collection('adminActivity').countDocuments({}),
    db.collection('adminActivity').find({}).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return {
    activity: activity.map((item) => ({
      id: String(item._id), actorName: item.actorName, actorRole: item.actorRole,
      action: item.action, targetLabel: item.targetLabel, details: item.details || {}, createdAt: item.createdAt,
    })),
    pagination: pageMeta(page, pageSize, total),
  };
}

export async function handleApiNode(req, res, options = {}) {
  const url = normalizedUrl(req.url || '/');
  const method = String(req.method || 'GET').toUpperCase();
  let db;
  const getDb = () => options.db ? Promise.resolve(options.db) : getDatabase();
  try {
    if (url.pathname === '/api/integrations/github/webhook' && method === 'POST') {
      db = await getDb();
      return json(res, 200, await githubWebhook(db, req));
    }
    if (url.pathname === '/api/auth/github/callback' && method === 'GET') {
      db = await getDb();
      return await githubCallback(db, req, res, url);
    }
    if (url.pathname === '/api/auth/github/start' && method === 'GET') {
      db = await getDb();
      return await githubStart(db, req, res);
    }
    if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req);
    db = await getDb();

    if (url.pathname === '/api/auth/register' && method === 'POST') return await signup(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/login' && method === 'POST') return await login(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/reset-password' && method === 'POST') return json(res, 200, await resetPassword(db, req, res, await readBody(req)));
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const token = getCookie(req, 'dsavation_session');
      if (token) {
        const session = await db.collection('sessions').findOne({ tokenHash: hash(token) });
        if (session) {
          const exiting = await db.collection('users').findOne({ _id: session.userId });
          await recordAdminActivity(db, exiting, 'administrator_signed_out', { id: exiting?._id, label: exiting?.email });
        }
        await db.collection('sessions').deleteOne({ tokenHash: hash(token) });
      }
      clearCookie(res, req, 'dsavation_session');
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/auth/me' && method === 'GET') return json(res, 200, { user: account(await currentUser(req, db)) });
    if (url.pathname === '/api/auth/profile' && method === 'PATCH') {
      const user = await requireUser(req, db);
      return json(res, 200, { ok: true, user: await updateProfile(db, req, user, await readBody(req)) });
    }
    if (url.pathname === '/api/auth/github' && method === 'DELETE') {
      const user = await requireUser(req, db);
      return json(res, 200, await disconnectGithub(db, user));
    }

    if (url.pathname === '/api/club/leaderboard' && method === 'GET') return json(res, 200, await leaderboard(db, url));

    const user = await requireUser(req, db);
    const memberStatsMatch = url.pathname.match(/^\/api\/members\/([a-f0-9]{24})\/leetcode-stats$/i);
    if (memberStatsMatch && method === 'GET') return json(res, 200, await getMemberLeetcodeStats(db, req, user, memberStatsMatch[1]));
    if (url.pathname === '/api/members' && method === 'GET') return json(res, 200, await listDirectory(db, url, user));
    if (url.pathname === '/api/questions' && method === 'GET') {
      return json(res, 200, { questions: curriculum.questions, topics: curriculum.topics });
    }
    if (url.pathname === '/api/club/today' && method === 'GET') return json(res, 200, await getClubToday(db));
    if (url.pathname === '/api/club/assignments' && method === 'GET') return json(res, 200, await assignmentHistory(db, url));
    if (url.pathname === '/api/progress' && method === 'GET') {
      const progress = await db.collection('personalProgress').find({ userId: user._id }).sort({ solvedAt: -1 }).toArray();
      return json(res, 200, { progress: progress.map((item) => ({ questionId: item.questionId, solvedAt: item.solvedAt })) });
    }
    const progressMatch = url.pathname.match(/^\/api\/progress\/(\d+)$/);
    if (progressMatch && method === 'PUT') {
      const body = await readBody(req);
      await setProgress(db, req, user, progressMatch[1], Boolean(body.solved));
      return json(res, 200, { ok: true, questionId: Number(progressMatch[1]), solved: Boolean(body.solved) });
    }
    if (url.pathname === '/api/submissions' && method === 'GET') return json(res, 200, await listSubmissions(db, req, user, url));
    if (url.pathname === '/api/submissions' && method === 'POST') {
      const submission = await makeSubmission(db, req, user, await readBody(req));
      return json(res, 201, { ok: true, submission: { status: submission.status, points: submission.points, questionId: submission.questionId, solutionPath: submission.solutionPath, commitUrl: submission.commitUrl } });
    }
    if (url.pathname === '/api/admin/assignments' && method === 'POST') {
      return json(res, 201, { assignment: await createAssignment(db, user, await readBody(req)) });
    }
    const assignmentMatch = url.pathname.match(/^\/api\/admin\/assignments\/([a-f0-9]{24})$/i);
    if (assignmentMatch && method === 'PATCH') {
      return json(res, 200, { assignment: await updateAssignment(db, user, assignmentMatch[1], await readBody(req)) });
    }
    if (assignmentMatch && method === 'DELETE') {
      return json(res, 200, await deleteAssignment(db, user, assignmentMatch[1]));
    }
    if (url.pathname === '/api/admin/submissions' && method === 'GET') {
      return json(res, 200, await listSubmissions(db, req, user, url));
    }
    if (url.pathname === '/api/admin/today-submissions' && method === 'GET') {
      const result = await getTodaySubmissions(db, req, user, url);
      if (result.csv) {
        return sendText(res, 200, result.csv, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        });
      }
      return json(res, 200, result);
    }
    if (url.pathname === '/api/admin/pick-explainer' && method === 'POST') {
      return json(res, 200, await pickTodayExplainer(db, user));
    }
    const reviewMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-f0-9]{24})$/i);
    if (reviewMatch && method === 'PATCH') {
      const body = await readBody(req);
      if (body.points !== undefined && body.status === undefined) return json(res, 200, await adjustSubmissionPoints(db, user, reviewMatch[1], body));
      return json(res, 200, await reviewSubmission(db, user, reviewMatch[1], body));
    }
    if (url.pathname === '/api/admin/members' && method === 'GET') {
      requireRole(user, 'admin');
      return json(res, 200, await listMembers(db, url));
    }
    const memberMatch = url.pathname.match(/^\/api\/admin\/members\/([a-f0-9]{24})$/i);
    if (memberMatch && method === 'PATCH') {
      return json(res, 200, await updateMember(db, user, memberMatch[1], await readBody(req)));
    }
    if (memberMatch && method === 'DELETE') {
      return json(res, 200, await deleteMember(db, user, memberMatch[1]));
    }
    const resetMatch = url.pathname.match(/^\/api\/admin\/members\/([a-f0-9]{24})\/password-reset$/i);
    if (resetMatch && method === 'POST') {
      const admin = await requireUser(req, db);
      return json(res, 201, await generatePasswordReset(db, req, admin, resetMatch[1]));
    }
    if (url.pathname === '/api/admin/activity' && method === 'GET') {
      const admin = await requireUser(req, db);
      requireRole(admin, 'admin');
      return json(res, 200, await listAdminActivity(db, url));
    }
    return json(res, 404, { error: 'API route not found.' });
  } catch (error) {
    if (error?.code === 11000) {
      return json(res, 409, {
        error: url.pathname === '/api/admin/assignments'
          ? 'A question is already published for this date. Only one Question of the Day can be published per date.'
          : 'This record already exists. Refresh and try again.',
      });
    }
    const status = Number(error?.status) || 500;
    const isServerError = status >= 500 && status !== 503;
    const reqId = String(req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 40)
      || randomBytes(6).toString('hex');

    if (status >= 500) {
      console.error(`[DSAvation Error] [${reqId}] ${method} ${url.pathname} (${status}):`, error?.stack || error?.message || error);
    } else if (status === 401 || status === 403 || status === 429) {
      console.warn(`[DSAvation Security] [${reqId}] ${method} ${url.pathname} (${status}):`, error?.message);
    }

    const publicMessage = isServerError
      ? 'The request could not be completed. Try again shortly.'
      : (error?.message || 'An unexpected error occurred.');

    return json(res, status, { error: publicMessage, reqId }, { 'X-Request-Id': reqId });
  }
}

export async function handleApiFetch(request, options = {}) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const headers = Object.fromEntries(request.headers.entries());
  const requestUrl = new URL(request.url);
  let body;
  if (rawBody.length) {
    const contentType = String(headers['content-type'] || '');
    if (contentType.includes('application/json')) {
      try { body = JSON.parse(rawBody.toString('utf8')); } catch { body = rawBody.toString('utf8'); }
    } else body = rawBody;
  }
  const responseHeaders = new Headers();
  const res = {
    statusCode: 200,
    body: '',
    setHeader(name, value) {
      if (Array.isArray(value)) {
        responseHeaders.delete(name);
        for (const item of value) responseHeaders.append(name, item);
      } else {
        responseHeaders.set(name, value);
      }
    },
    getHeader(name) { return responseHeaders.get(name); },
    end(value = '') { this.body = value; },
  };
  await handleApiNode({
    url: `${requestUrl.pathname}${requestUrl.search}`,
    method: request.method, headers, body, rawBody,
  }, res, options);
  return new Response(res.body, { status: res.statusCode, headers: responseHeaders });
}
