import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import curriculum from './data/questions.json' with { type: 'json' };
import { getDatabase } from './db.js';
import { sendPasswordResetEmail, verifyEmailConfig } from './email.js';

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

function sendBuffer(res, status, buffer, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(buffer);
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
  if (req.rawBody !== undefined) return parseJsonBody(req.rawBody);
  if (!req || typeof req[Symbol.asyncIterator] !== 'function') return {};
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
    cardBgUrl: user.cardBgUrl || '',
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
  if (!user) throw new HttpError(401, 'Sign in with an approved account to continue.');
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
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DSAvation-Club-Tracker',
  };
  if (cleanToken) {
    headers.Authorization = cleanToken.startsWith('Bearer ') || cleanToken.startsWith('token ') ? cleanToken : `Bearer ${cleanToken}`;
  }
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, { headers });
  } catch (err) {
    console.error(`[GitHub API Network Error] GET ${path}:`, err?.message || err);
    throw new HttpError(503, 'Could not connect to GitHub API. Please check your network connection and try again.');
  }
  if (response.status === 401 && cleanToken) {
    console.warn(`[GitHub API Auth Warning] GET ${path}: 401 Unauthorized with provided token. Retrying unauthenticated.`);
    try {
      delete headers.Authorization;
      const retryResponse = await fetch(`https://api.github.com${path}`, { headers });
      if (retryResponse.ok) return retryResponse.json();
    } catch { }
  }
  if (!response.ok) {
    let errorDetail = '';
    try {
      const errPayload = await response.json();
      errorDetail = errPayload?.message ? ` - ${errPayload.message}` : '';
    } catch { }
    console.warn(`[GitHub API Error] GET ${path} -> HTTP ${response.status} (${response.statusText})${errorDetail}`);
    const status = response.status === 404 ? 404 : (response.status === 403 || response.status === 429) ? 429 : 502;
    const msg = response.status === 404
      ? 'GitHub could not find that account or commit.'
      : (response.status === 403 || response.status === 429)
        ? 'GitHub API rate limit reached. Please wait a few moments or provide a direct commit URL.'
        : 'GitHub could not verify the request. Check repository access and try again.';
    throw new HttpError(status, msg);
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
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
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

async function requestPasswordReset(db, req, res, body) {
  const email = String(body.email || '').toLowerCase().trim();
  if (!email || email.length > 254 || !/^[a-z0-9.+_-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  await allowRequest(db, req, 'request-pw-reset', 20, 60 * 60 * 1000);
  await allowRequest(db, req, `request-pw-reset:${hash(email)}`, 5, 60 * 60 * 1000);
  const user = await db.collection('users').findOne({ email }, { projection: { _id: 1, name: 1, email: 1, approvalStatus: 1 } });
  if (!user || user.approvalStatus !== 'approved') {
    return { ok: true, emailSent: false };
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.collection('passwordResets').deleteMany({ userId: user._id });
  await db.collection('passwordResets').insertOne({
    tokenHash: hash(token),
    userId: user._id,
    createdBy: user._id,
    createdAt: new Date(),
    expiresAt,
  });
  const resetUrl = `${baseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
  let emailSent = false;
  let emailError = null;
  try {
    await sendPasswordResetEmail(user.email, user.name, resetUrl, expiresAt);
    emailSent = true;
  } catch (error) {
    emailError = error.message;
    if (process.env.NODE_ENV !== 'test' && !error.message.includes('SMTP configuration is incomplete')) {
      console.warn(`[API] Could not email password reset to ${user.email}:`, error.message);
    }
  }
  return { ok: true, emailSent, emailError };
}

async function resetPassword(db, req, res, body) {
  await allowRequest(db, req, 'password-reset', 10, 15 * 60 * 1000);
  const token = String(body.token || '').trim();
  const password = String(body.password || '');
  if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    throw new HttpError(400, 'This password reset link is invalid or expired. Ask an administrator for a new one.');
  }
  if (password.length < 10 || password.length > 128) {
    throw new HttpError(400, 'Use a password between 10 and 128 characters.');
  }
  const now = new Date();
  const reset = await db.collection('passwordResets').findOne({
    tokenHash: hash(token),
    expiresAt: { $gt: now },
    usedAt: { $exists: false },
  });
  if (!reset) {
    const previous = await db.collection('passwordResets').findOne({ tokenHash: hash(token) });
    if (previous?.usedAt) {
      throw new HttpError(400, 'This password reset link has already been used. Ask an administrator for a new one.');
    }
    throw new HttpError(400, 'This password reset link is invalid or expired. Ask an administrator for a new one.');
  }
  const consumed = await db.collection('passwordResets').updateOne(
    { _id: reset._id, expiresAt: { $gt: now }, usedAt: { $exists: false } },
    { $set: { usedAt: now } },
  );
  if (!consumed.matchedCount) {
    throw new HttpError(400, 'This password reset link has already been used. Ask an administrator for a new one.');
  }
  const updated = await db.collection('users').updateOne(
    { _id: reset.userId },
    { $set: { passwordHash: await bcrypt.hash(password, 12), updatedAt: now } },
  );
  if (!updated.matchedCount) {
    throw new HttpError(400, 'The account for this reset link no longer exists.');
  }
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
  let cardBgUrl = user.cardBgUrl || '';
  if (body.cardBgUrl !== undefined) {
    const rawBg = String(body.cardBgUrl || '').trim();
    if (rawBg && !/^https?:\/\//i.test(rawBg)) {
      throw new HttpError(400, 'Custom background image URL must start with http:// or https://');
    }
    cardBgUrl = rawBg;
  }
  const update = {
    name, department, studyYear, leetcodeUsername,
    defaultSubmissionMethod, explicitSubmissionMethod,
    leetcodeApproval, leetcodeRequestedAt,
    cardBgUrl,
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

// Earliest accepted Club Challenge submission per question. Activity stats use this map
// so personal-only checkmarks never appear in Question Activity.
async function clubCompletionsByQuestion(db, userId) {
  const submissions = await db.collection('submissions')
    .find({ userId, status: 'accepted' })
    .sort({ submittedAt: 1 })
    .toArray();
  const byQuestion = new Map();
  for (const sub of submissions) {
    const questionId = Number(sub.questionId);
    if (!questionById.has(questionId)) continue;
    const rawAt = sub.submittedAt || sub.reviewedAt || sub.commitDate;
    if (!rawAt) continue;
    const submittedAt = new Date(rawAt);
    const prev = byQuestion.get(questionId);
    if (!prev || submittedAt < prev.submittedAt) {
      byQuestion.set(questionId, { submittedAt, assignmentId: sub.assignmentId || null });
    }
  }
  return byQuestion;
}

// isClub marks a question completed through a Club Challenge. setProgress will not clear it.
async function markClubProgress(db, userId, questionId, assignmentId, submittedAt = new Date()) {
  const id = Number(questionId);
  if (!questionById.has(id)) return;
  await db.collection('personalProgress').updateOne(
    { userId, questionId: id },
    {
      $setOnInsert: { userId, questionId: id, solvedAt: submittedAt },
      $set: {
        updatedAt: new Date(),
        isClub: true,
        assignmentId: assignmentId || null,
        clubSubmittedAt: submittedAt,
      },
    },
    { upsert: true },
  );
}

async function progressPayload(db, user) {
  const clubByQuestion = await clubCompletionsByQuestion(db, user._id);
  for (const [questionId, club] of clubByQuestion) {
    await markClubProgress(db, user._id, questionId, club.assignmentId, club.submittedAt);
  }
  const stored = await db.collection('personalProgress').find({ userId: user._id }).sort({ solvedAt: -1 }).toArray();
  const progress = stored.map((item) => {
    const questionId = Number(item.questionId);
    const club = clubByQuestion.get(questionId);
    const isClub = Boolean(item.isClub || club);
    return {
      questionId,
      solvedAt: item.solvedAt,
      isClub,
      clubSubmittedAt: isClub ? (club?.submittedAt || item.clubSubmittedAt || item.solvedAt) : null,
    };
  });
  const activity = [...clubByQuestion.entries()]
    .map(([questionId, club]) => ({
      questionId,
      solvedAt: club.submittedAt,
      clubSubmittedAt: club.submittedAt,
      isClub: true,
    }))
    .sort((left, right) => new Date(right.clubSubmittedAt) - new Date(left.clubSubmittedAt));
  return { progress, activity };
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
    return;
  }
  const existing = await collection.findOne({ userId: user._id, questionId: id });
  // Club Challenge completions stay checked. Members cannot clear them from personal progress.
  if (existing?.isClub || existing?.assignmentId) {
    throw new HttpError(403, 'Club Challenge submissions cannot be unchecked');
  }
  const club = await clubCompletionsByQuestion(db, user._id);
  if (club.has(id)) throw new HttpError(403, 'Club Challenge submissions cannot be unchecked');
  await collection.deleteOne({ userId: user._id, questionId: id });
}

export function getAuraBase(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  if (d === 'hard') return 250;
  if (d === 'medium') return 200;
  return 150;
}

export async function computeAuraByUser(db, userIds = null, acceptedSubmissions = null) {
  const assignments = await db.collection('assignments').find({}).toArray();
  const assignmentMap = new Map(assignments.map((a) => [String(a._id), a]));

  const submissions = acceptedSubmissions || await db.collection('submissions')
    .find({ status: 'accepted' })
    .sort({ assignmentId: 1, submittedAt: 1, _id: 1 })
    .toArray();

  const auraByUser = new Map();
  let currentAssignmentId = null;
  let currentRankIndex = 0;
  let currentBase = 150;

  for (const sub of submissions) {
    const aId = String(sub.assignmentId);
    if (aId !== currentAssignmentId) {
      currentAssignmentId = aId;
      currentRankIndex = 0;
      const assignment = assignmentMap.get(aId);
      const question = assignment ? questionById.get(Number(assignment.questionId)) : null;
      currentBase = getAuraBase(question?.difficulty);
    }

    const calculatedAura = Math.max(0, currentBase - currentRankIndex * 5);
    const aura = calculatedAura;
    if (sub.aura !== calculatedAura) {
      db.collection('submissions').updateOne({ _id: sub._id }, { $set: { aura: calculatedAura } }).catch(() => { });
    }
    currentRankIndex++;

    const uId = String(sub.userId);
    auraByUser.set(uId, (auraByUser.get(uId) || 0) + aura);
  }

  // Include custom / bonus aura from users collection
  const idArray = userIds && userIds.length
    ? userIds.map((id) => (id instanceof ObjectId ? id : new ObjectId(String(id))))
    : null;
  const userFilter = idArray
    ? { _id: { $in: idArray }, customAura: { $exists: true, $ne: 0 } }
    : { customAura: { $exists: true, $ne: 0 } };
  const customUsers = await db.collection('users').find(userFilter, { projection: { customAura: 1 } }).toArray();
  for (const u of customUsers) {
    const uId = String(u._id);
    const bonus = Number(u.customAura || 0);
    auraByUser.set(uId, (auraByUser.get(uId) || 0) + bonus);
  }

  return auraByUser;
}

async function getTodayAssignment(db) {
  return db.collection('assignments').findOne({ dateKey: dayKey() });
}

async function getClubToday(db) {
  let assignment = await getTodayAssignment(db);
  if (!assignment && process.env.NODE_ENV !== 'test') {
    assignment = await autoAssignDailyQuestion(db, dayKey());
  }
  if (!assignment) return { dateKey: dayKey(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [], dailyLeaderboard: [] };
  const submissions = await db.collection('submissions').find({ assignmentId: assignment._id }).sort({ submittedAt: 1 }).toArray();
  const userIds = [...new Set(submissions.map((item) => String(item.userId)))].map((id) => new ObjectId(id));
  const profiles = userIds.length ? await db.collection('users').find(approvedUserFilter({ _id: { $in: userIds } }), {
    projection: { name: 1, role: 1, department: 1, studyYear: 1, showPublic: 1, githubUsername: 1, leetcodeUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
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
  const assignedQuestion = assignment ? questionById.get(Number(assignment.questionId)) : null;
  const baseAura = getAuraBase(assignedQuestion?.difficulty);
  const dailyLeaderboard = activeSubmissions.filter((item) => item.status === 'accepted').map((item, index) => {
    const profile = profileById.get(String(item.userId));
    const itemAura = Math.max(0, baseAura - index * 5);
    if (item.aura !== itemAura) {
      db.collection('submissions').updateOne({ _id: item._id }, { $set: { aura: itemAura } }).catch(() => { });
    }
    return {
      rank: index + 1,
      id: String(item._id),
      userId: String(item.userId),
      name: profile?.name || item.authorLogin || 'Member',
      role: profile?.role || 'member',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      githubUsername: profile?.githubUsername || item.authorLogin || '',
      leetcodeUsername: profile?.leetcodeUsername || (item.submissionMethod === 'leetcode' ? item.authorLogin : '') || '',
      ...formatAvatar(profile, item.userId),
      points: item.points ?? 1,
      aura: itemAura,
      blaze: itemAura,
      submittedAt: item.submittedAt,
      commitUrl: item.commitUrl,
      submissionType: item.submissionMethod || (item.verificationSource === 'leetcode-api' ? 'leetcode' : 'github'),
    };
  });
  const explainerSub = assignment.explainer
    ? activeSubmissions.find(
      (s) =>
        String(s.userId) === String(assignment.explainerUserId || assignment.explainer.userId || assignment.explainer.id) &&
        s.status === 'accepted'
    )
    : null;
  const resolvedExplainer = assignment.explainer
    ? {
      ...assignment.explainer,
      submittedAt: explainerSub ? explainerSub.submittedAt : (assignment.explainer.hasSubmitted ? assignment.explainer.submittedAt : null),
      hasSubmitted: Boolean(explainerSub || (assignment.explainer.hasSubmitted && assignment.explainer.submittedAt)),
      status: explainerSub ? 'accepted' : (assignment.explainer.hasSubmitted ? assignment.explainer.status : null),
    }
    : null;

  return {
    dateKey: dayKey(),
    assignment: {
      id: String(assignment._id),
      questionId: assignment.questionId,
      dateKey: assignment.dateKey,
      createdByName: assignment.createdByName,
      explainer: resolvedExplainer,
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
  console.log(`[Submission Attempt] Member: "${user.name}" (@${user.githubUsername || 'no-gh'}), Method: ${isLeetCode ? 'leetcode' : 'github'}, Assignment: ${assignment ? `${assignment.dateKey} (LC #${assignment.questionId})` : 'none'}`);
  if (!assignment || (body.assignmentId && String(assignment._id) !== String(body.assignmentId))) {
    throw new HttpError(409, 'Submissions are only open for today’s published Question of the Day.');
  }
  const existing = await db.collection('submissions').findOne({
    $or: [{ assignmentId: assignment._id }, { assignmentId: String(assignment._id) }],
    userId: user._id,
  });
  const assignedQuestionForAura = questionById.get(Number(assignment.questionId));
  const baseAura = getAuraBase(assignedQuestionForAura?.difficulty);
  const existingAcceptedCount = await db.collection('submissions').countDocuments({
    $or: [{ assignmentId: assignment._id }, { assignmentId: String(assignment._id) }],
    status: 'accepted',
    ...(existing ? { _id: { $ne: existing._id } } : {}),
  });
  const submissionAura = Math.max(0, baseAura - existingAcceptedCount * 5);
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

    console.log(`[LeetCode Query] Checking recent submissions for @${leetcodeUser}, question LC #${assignment.questionId}`);
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
    } catch (err) {
      console.error(`[LeetCode Network Error] @${leetcodeUser}:`, err?.message || err);
      throw new HttpError(502, 'Could not connect to LeetCode public API. Please try again in a few moments.');
    }
    if (!response.ok) {
      console.warn(`[LeetCode API Error] HTTP ${response.status} for @${leetcodeUser}`);
      throw new HttpError(502, 'LeetCode public API returned an error. Please try again.');
    }
    const payload = await response.json().catch(() => ({}));
    const submissionList = payload?.data?.recentSubmissionList;
    if (!Array.isArray(submissionList)) {
      console.warn(`[LeetCode API Warning] No recentSubmissionList in response for @${leetcodeUser}`);
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

    console.log(`[LeetCode Submissions Result] Total fetched: ${submissionList.length}, target slug: "${targetSlug}", accepted today: ${acceptedToday.length}`);

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
      aura: submissionAura,
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
    console.log(`[GitHub Submission] Input: "${rawInput}" from user @${user.githubUsername}`);
    const { owner, repository, sha, commitData } = await resolveCommitInput(db, user, rawInput);
    console.log(`[GitHub Commit Resolved] ${owner}/${repository} @ sha ${sha}`);
    const username = String(user.githubUsername || '').toLowerCase();
    if (owner.toLowerCase() !== username) throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    const commit = commitData || await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(sha)}`, process.env.GITHUB_TOKEN);
    const author = String(commit.author?.login || '').toLowerCase();
    const committer = String(commit.committer?.login || '').toLowerCase();
    if (author !== username || (committer !== username && committer !== 'web-flow')) {
      throw new HttpError(403, 'GitHub could not confirm that the commit author is your linked account.');
    }
    const commitDate = commit.commit?.committer?.date || commit.commit?.author?.date;
    const authorDate = commit.commit?.author?.date || commitDate;
    if (!isOnAssignmentDay(commitDate, assignment.dateKey) && !isOnAssignmentDay(authorDate, assignment.dateKey)) {
      throw new HttpError(400, 'The file must be created and committed during the assignment day.');
    }
    const matchingFiles = (commit.files || []).filter((file) => file.status !== 'removed' && isAssignmentSolutionPath(file.filename, assignment.questionId));
    if (!matchingFiles.length) throw new HttpError(400, `This commit must create or change ${assignment.questionId}/solution.txt (or .cpp, .py, .java, .js, .c).`);
    let sizeByPath = new Map();
    try {
      if (commit.commit?.tree?.sha) {
        const tree = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(commit.commit.tree.sha)}?recursive=1`, process.env.GITHUB_TOKEN);
        sizeByPath = new Map((tree.tree || []).filter((item) => item.type === 'blob').map((item) => [item.path, Number(item.size)]));
      }
    } catch {
      // Tree call might fail if repo is too large or rate limit; fall back to commit.files info
    }
    const matchingFile = matchingFiles.find((file) => {
      const size = sizeByPath.get(file.filename);
      if (Number.isFinite(size) && size > 0) return true;
      return Number(file.changes) > 0 || Number(file.additions) > 0;
    });
    const solutionSizeBytes = matchingFile ? (sizeByPath.get(matchingFile.filename) || matchingFile.changes || 1) : 0;
    const targetFilename = matchingFiles[0]?.filename || `${assignment.questionId}/solution.txt`;
    if (!matchingFile) throw new HttpError(400, `${targetFilename} must contain at least one byte at this commit.`);
    console.log(`[GitHub Commit Validated] Author: ${author} (${commitDate}), Committer: ${committer}, Solution: ${matchingFile.filename} (${solutionSizeBytes} bytes)`);
    const now = new Date();
    submission = {
      assignmentId: assignment._id, userId: user._id, questionId: assignment.questionId,
      repository: `${owner}/${repository}`, commitSha: commit.sha,
      commitUrl: commit.html_url || `https://github.com/${owner}/${repository}/commit/${commit.sha}`,
      solutionPath: matchingFile.filename, solutionSizeBytes, commitDate: new Date(commitDate), submittedAt: now,
      status: 'accepted', points: 1, aura: submissionAura,
      authorLogin: commit.author?.login || commit.commit?.author?.name || username,
      committerLogin: commit.committer?.login || commit.commit?.committer?.name || committer || username,
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
    console.log(`[Submission Updated] ${user.name} (@${user.githubUsername || user.leetcodeUsername}) updated submission for LC #${submission.questionId}! Points: ${submission.points}, Blaze: ${submission.aura}`);
    if (submission.status === 'accepted' && submission.questionId) {
      try { await markClubProgress(db, user._id, submission.questionId, assignment._id, submission.submittedAt || new Date()); } catch { /* progress lock is retried on the next progress read */ }
    }
    return { ...submission, _id: existing._id, id: String(existing._id) };
  }
  const result = await db.collection('submissions').insertOne(submission);
  console.log(`[Submission Created] ${user.name} (@${user.githubUsername || user.leetcodeUsername}) successfully submitted LC #${submission.questionId}! Points: ${submission.points}, Blaze: ${submission.aura}`);
  if (submission.status === 'accepted' && submission.questionId) {
    try { await markClubProgress(db, user._id, submission.questionId, assignment._id, submission.submittedAt || new Date()); } catch { /* progress lock is retried on the next progress read */ }
  }
  return { ...submission, _id: result.insertedId, id: String(result.insertedId) };
}

export async function resolveCommitInput(db, user, rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new HttpError(400, 'Enter a GitHub commit hash (e.g. 76c3f95) or full commit URL.');
  }

  const username = String(user.githubUsername || '').toLowerCase();
  const cleanInput = input.replace(/[?#].*$/, '').trim();

  // 1. Direct full commit URL or loose URL with owner/repo
  let parsed = parsePersonalCommitUrl(cleanInput);

  if (!parsed) {
    const repoAtSha = cleanInput.match(/^([A-Za-z0-9_.-]+)[@:]([a-f0-9]{7,40})$/i);
    if (repoAtSha) {
      parsed = { owner: username, repository: repoAtSha[1], sha: repoAtSha[2] };
    } else if (cleanInput.includes('/')) {
      let normalized = cleanInput;
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

  // 1b. Pull request commit URL: https://github.com/owner/repo/pull/1/commits/sha
  const prCommit = cleanInput.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/\d+\/commits\/([a-f0-9]{7,40})/i);
  if (prCommit) {
    if (prCommit[1].toLowerCase() !== username) throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    return { owner: prCommit[1], repository: prCommit[2], sha: prCommit[3] };
  }

  // 1c. Blob/file URL: https://github.com/owner/repo/blob/main/49/solution.cpp
  const blobMatch = cleanInput.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/blob\/([^/]+)\/(.+)/i);
  if (blobMatch) {
    const owner = blobMatch[1];
    const repository = blobMatch[2];
    const ref = blobMatch[3];
    const filePath = blobMatch[4];
    if (owner.toLowerCase() !== username) throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    if (/^[a-f0-9]{7,40}$/i.test(ref)) {
      return { owner, repository, sha: ref };
    }
    try {
      const commitList = await githubJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?path=${encodeURIComponent(filePath)}&per_page=1`,
        process.env.GITHUB_TOKEN
      );
      if (Array.isArray(commitList) && commitList[0]?.sha) {
        return { owner, repository, sha: commitList[0].sha, commitData: commitList[0] };
      }
    } catch { }
    try {
      const branchCommit = await githubJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}`,
        process.env.GITHUB_TOKEN
      );
      if (branchCommit && branchCommit.sha) {
        return { owner, repository, sha: branchCommit.sha, commitData: branchCommit };
      }
    } catch { }
  }

  // 1d. Repo or Tree URL: https://github.com/owner/repo or https://github.com/owner/repo/tree/main
  const repoMatch = cleanInput.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^/]+))?\/?$/i);
  if (repoMatch) {
    const owner = repoMatch[1];
    const repository = repoMatch[2];
    const branch = repoMatch[3];
    if (owner.toLowerCase() !== username) throw new HttpError(403, 'Use a repository owned by your linked GitHub account.');
    try {
      const commitList = await githubJson(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits${branch ? `?sha=${encodeURIComponent(branch)}&` : '?'}per_page=1`,
        process.env.GITHUB_TOKEN
      );
      if (Array.isArray(commitList) && commitList[0]?.sha) {
        return { owner, repository, sha: commitList[0].sha, commitData: commitList[0] };
      }
    } catch { }
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

// Begin pagination optimisation – replace in‑memory profile fetch with DB‑side slice
async function leaderboard(db, url, viewer = null) {
  // 1️⃣ Load all assignments (needed for streak & punctuality calculations)
  const assignments = await db.collection('assignments').find({ dateKey: { $lte: dayKey() } }).sort({ dateKey: 1 }).toArray();
  const assignedIdSet = new Set(assignments.map(a => String(a._id)));
  const totalAssigned = assignments.length;

  // Share one accepted-submission read between leaderboard totals and Aura.
  const acceptedSubmissions = await db.collection('submissions').find(
    { status: 'accepted' },
    { projection: { userId: 1, assignmentId: 1, points: 1, reviewedAt: 1, submittedAt: 1, _id: 1, aura: 1 } },
  ).sort({ assignmentId: 1, submittedAt: 1, _id: 1 }).toArray();
  const totalById = new Map();
  for (const submission of acceptedSubmissions) {
    const userId = String(submission.userId);
    const row = totalById.get(userId) || {
      _id: submission.userId,
      accepted: 0,
      points: 0,
      acceptedAssignments: new Set(),
      lastAcceptedAt: null,
    };
    row.accepted += 1;
    row.points += submission.points ?? 1;
    row.acceptedAssignments.add(submission.assignmentId);
    const acceptedAt = submission.reviewedAt || submission.submittedAt || null;
    if (acceptedAt && (!row.lastAcceptedAt || new Date(acceptedAt) > new Date(row.lastAcceptedAt))) {
      row.lastAcceptedAt = acceptedAt;
    }
    totalById.set(userId, row);
  }

  // 3️⃣ Build a map of which assignments each user attempted (excluding invalidated submissions)
  const attempts = await db.collection('submissions').find(
    { status: { $ne: 'invalidated' } },
    { projection: { userId: 1, assignmentId: 1 } }
  ).toArray();
  const userAttemptsMap = new Map();
  for (const item of attempts) {
    const uid = String(item.userId);
    if (!userAttemptsMap.has(uid)) userAttemptsMap.set(uid, new Set());
    if (assignedIdSet.has(String(item.assignmentId))) {
      userAttemptsMap.get(uid).add(String(item.assignmentId));
    }
  }

  // 4️⃣ Compute aura once (expensive operation) – keep as a Promise
  const auraByUser = await computeAuraByUser(db, null, acceptedSubmissions);

  // 5️⃣ Assemble ranking entries for every approved member (including those with no submissions)
  // Fetch all approved user profiles first
  const profiles = await db.collection('users').find(approvedUserFilter(), {
    projection: { name: 1, department: 1, githubUsername: 1, showPublic: 1, createdAt: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray();
  const ranking = [];
  for (const profile of profiles) {
    const userId = String(profile._id);
    const row = totalById.get(userId) || { accepted: 0, points: 0, acceptedAssignments: [], lastAcceptedAt: null };
    const completed = new Set([...(row.acceptedAssignments || [])].map(String));
    const attempted = userAttemptsMap.get(userId);
    const attemptedCount = attempted ? attempted.size : completed.size;
    const punctuality = totalAssigned === 0 ? 100 : Math.min(100, Math.round((attemptedCount / totalAssigned) * 100));

    // Streak calculation – same as original implementation
    let streak = 0;
    const rev = assignments.slice().reverse();
    const startIdx = (rev.length && rev[0].dateKey === dayKey() && !completed.has(String(rev[0]._id))) ? 1 : 0;
    for (let i = startIdx; i < rev.length; i++) {
      if (!completed.has(String(rev[i]._id))) break;
      streak++;
    }

    ranking.push({
      userId,
      points: row.points ?? row.accepted,
      blaze: auraByUser.get(userId) || 0,
      aura: auraByUser.get(userId) || 0,
      completed: row.accepted,
      scheduled: totalAssigned,
      punctuality,
      streak,
      lastAcceptedAt: row.lastAcceptedAt || null,
    });
  }

  // 6️⃣ Apply the same sort order as before
  ranking.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.aura !== a.aura) return b.aura - a.aura;
    if (a.points > 0 && b.points > 0) {
      const tA = a.lastAcceptedAt ? new Date(a.lastAcceptedAt).getTime() : Infinity;
      const tB = b.lastAcceptedAt ? new Date(b.lastAcceptedAt).getTime() : Infinity;
      if (tA !== tB) return tA - tB;
    }
    if (b.punctuality !== a.punctuality) return b.punctuality - a.punctuality;
    return 0; // name tie‑break will be added after profile join
  });

  // 7️⃣ Pagination – slice the sorted ranking array
  const { page, pageSize, skip } = pageOptions(url, 20, 50);
  const pageSlice = ranking.slice(skip, skip + pageSize);
  const pageUserIds = pageSlice.map(r => r.userId);

  // 8️⃣ Use the profiles already fetched above to build the map
  const profileMap = new Map(profiles.map(p => [String(p._id), p]));

  // 9️⃣ Merge profile data into the full sorted ranking and apply final alphabetical tie‑break
  const fullSorted = ranking.map(entry => {
    const prof = profileMap.get(entry.userId) || {};
    const name = prof.showPublic ? prof.name : prof.githubUsername ? `@${prof.githubUsername}` : 'Club member';
    const department = prof.showPublic ? prof.department : 'Club member';
    return {
      userId: entry.userId,
      name,
      department,
      githubUsername: prof.githubUsername,
      ...formatAvatar(prof),
      points: entry.points,
      blaze: entry.blaze,
      aura: entry.aura,
      completed: entry.completed,
      scheduled: entry.scheduled,
      punctuality: entry.punctuality,
      streak: entry.streak,
      lastAcceptedAt: entry.lastAcceptedAt,
    };
  });

  // 10️⃣ Pagination – slice the final leaderboard for the response
  const leaderboard = fullSorted.slice(skip, skip + pageSize);

  // 11️⃣ Compute the viewer's overall rank (based on the full sorted ranking, not just the page)
  let userRank = null;
  if (viewer) {
    const vid = String(viewer._id);
    const idx = ranking.findIndex(r => r.userId === vid);
    if (idx !== -1) userRank = idx + 1;
  }

  return { leaderboard, pagination: pageMeta(page, pageSize, ranking.length), userRank };
}
// End pagination optimisation

async function createAssignment(db, user, body) {
  requireRole(user, 'lead', 'admin');
  const questionId = Number(body.questionId);
  const dateKey = String(body.dateKey || '');
  if (!questionById.has(questionId)) throw new HttpError(400, 'Choose a question from the 220-question curriculum.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < dayKey()) throw new HttpError(400, 'Choose today or a future date.');
  const existing = await db.collection('assignments').findOne({ dateKey });
  if (existing) throw new HttpError(409, 'A question is already published for this date. Only one Question of the Day can be published per date.');
  const assignment = {
    dateKey, questionId, createdBy: user._id, createdByName: user.name,
    timezone: TZ, createdAt: new Date(),
  };
  const result = await db.collection('assignments').insertOne(assignment);
  await db.collection('assignment_suppressions').deleteOne({ dateKey });
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
  if (assignment.explainerUserId) {
    const prevId = String(assignment.explainerUserId);
    const wasCredit = assignment.explainerCycleCreditGranted !== undefined ? Boolean(assignment.explainerCycleCreditGranted) : true;
    if (wasCredit) {
      const cycleDoc = await db.collection('explainerCycle').findOne({ _id: 'current' });
      if (cycleDoc && Array.isArray(cycleDoc.primaryCompletedIds)) {
        const updatedIds = cycleDoc.primaryCompletedIds.filter((cid) => String(cid) !== prevId);
        await db.collection('explainerCycle').updateOne(
          { _id: 'current' },
          { $set: { primaryCompletedIds: updatedIds, updatedAt: new Date() } }
        );
      }
    }
  }
  await db.collection('assignments').deleteOne({ _id: id });
  await db.collection('assignment_suppressions').updateOne(
    { dateKey: assignment.dateKey },
    { $set: { dateKey: assignment.dateKey, deletedAt: new Date(), deletedBy: user._id } },
    { upsert: true }
  );
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

export async function getNextQuestionForDate(db, targetDateKey = dayKey()) {
  const allAssignments = await db.collection('assignments').find({}).toArray();
  const pastAssignments = allAssignments
    .filter((a) => a.dateKey && a.dateKey < targetDateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const lastPast = pastAssignments.length ? pastAssignments[pastAssignments.length - 1] : null;
  let lastIndex = -1;
  if (lastPast) {
    lastIndex = curriculum.questions.findIndex((q) => Number(q[1]) === Number(lastPast.questionId));
  }

  const candidateStartIndex = lastIndex >= 0
    ? (lastIndex + 1) % curriculum.questions.length
    : 0;

  const assignedQuestionIds = new Set(allAssignments.map((a) => Number(a.questionId)));

  let chosenRow = null;
  for (let i = 0; i < curriculum.questions.length; i++) {
    const candidate = curriculum.questions[(candidateStartIndex + i) % curriculum.questions.length];
    if (!assignedQuestionIds.has(Number(candidate[1]))) {
      chosenRow = candidate;
      break;
    }
  }

  if (!chosenRow) {
    chosenRow = curriculum.questions[candidateStartIndex];
  }

  return {
    questionId: Number(chosenRow[1]),
    title: chosenRow[2],
    topic: chosenRow[0],
    difficulty: chosenRow[3],
  };
}

export async function autoAssignDailyQuestion(db, targetDateKey = dayKey(), options = {}) {
  const dateKey = targetDateKey || dayKey();
  const existing = await db.collection('assignments').findOne({ dateKey });
  if (existing) return existing;

  if (!options.force) {
    const suppressed = await db.collection('assignment_suppressions').findOne({ dateKey });
    if (suppressed) return null;
  }

  const nextQuestion = await getNextQuestionForDate(db, dateKey);
  if (!nextQuestion) return null;

  const user = options.user;
  const assignment = {
    dateKey,
    questionId: nextQuestion.questionId,
    createdBy: user?._id || null,
    createdByName: user?.name || 'Automated Daily Challenge',
    timezone: TZ,
    createdAt: new Date(),
    autoAssigned: !user,
  };

  try {
    const result = await db.collection('assignments').insertOne(assignment);
    assignment._id = result.insertedId || assignment._id;
    if (options.force) {
      await db.collection('assignment_suppressions').deleteOne({ dateKey });
    }
    if (user && ['admin', 'lead'].includes(user.role)) {
      await recordAdminActivity(db, user, 'assignment_published', { id: assignment._id, label: `${dateKey} · LC ${assignment.questionId} (Auto)` }, { questionId: assignment.questionId, autoAssigned: true });
    }
    return assignment;
  } catch (err) {
    if (err.code === 11000 || String(err.message).includes('duplicate') || String(err.message).includes('E11000')) {
      return db.collection('assignments').findOne({ dateKey });
    }
    throw err;
  }
}

let midnightTimer = null;

export function getNextMidnightIST(now = new Date()) {
  const todayDateKey = dayKey(now);
  const [y, m, d] = todayDateKey.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = nextDate.getUTCFullYear();
  const nm = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(nextDate.getUTCDate()).padStart(2, '0');
  const nextDateKey = `${ny}-${nm}-${nd}`;
  const nextMidnight = new Date(`${nextDateKey}T00:00:00+05:30`);
  return { nextDateKey, nextMidnight, ms: Math.max(1000, nextMidnight.getTime() - now.getTime()) };
}

export function scheduleNextMidnightAssignment(db) {
  if (midnightTimer) clearTimeout(midnightTimer);
  const { nextDateKey, ms } = getNextMidnightIST();

  midnightTimer = setTimeout(async () => {
    try {
      await autoAssignDailyQuestion(db, nextDateKey);
      console.log(`[DSAvation Scheduler] Successfully auto-assigned daily question for ${nextDateKey}`);
    } catch (err) {
      console.error('[DSAvation Scheduler] Failed to auto-assign midnight question:', err);
    } finally {
      scheduleNextMidnightAssignment(db);
    }
  }, ms);

  midnightTimer.unref?.();
  return { nextDateKey, ms };
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
  const profiles = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, department: 1, githubUsername: 1, leetcodeUsername: 1 } }).toArray() : [];
  const assignments = assignmentIds.length ? await db.collection('assignments').find({ _id: { $in: assignmentIds } }).toArray() : [];
  const profileById = new Map(profiles.map((item) => [String(item._id), item]));
  const assignmentById = new Map(assignments.map((item) => [String(item._id), item]));
  return {
    submissions: items.map((item) => ({
      id: String(item._id), status: item.status, points: item.points ?? (item.status === 'accepted' ? 1 : 0), commitUrl: item.commitUrl, solutionPath: item.solutionPath, submittedAt: item.submittedAt,
      commitDate: item.commitDate, reviewNote: item.reviewNote,
      verifiedPusher: Boolean(item.verifiedPusher), verificationSource: item.verificationSource || 'commit-link',
      submissionMethod: item.submissionMethod || (item.verificationSource === 'leetcode-api' ? 'leetcode' : 'github'),
      member: (() => {
        const profile = profileById.get(String(item.userId)); return profile ? {
          name: profile.name, department: profile.department, githubUsername: profile.githubUsername, leetcodeUsername: profile.leetcodeUsername || '',
        } : null;
      })(),
      assignment: (() => {
        const assignment = assignmentById.get(String(item.assignmentId)); return assignment ? {
          dateKey: assignment.dateKey, questionId: item.questionId || assignment.questionId,
          question: questionById.get(item.questionId || assignment.questionId)?.title || 'Question',
        } : null;
      })(),
    })), pagination: pageMeta(page, pageSize, total)
  };
}

async function getSubmissionsHeatmap(db, user, url = null) {
  requireRole(user, 'lead', 'admin');
  const studyYearParam = url?.searchParams?.get('studyYear');

  // Pull second-year member IDs to segment submissions by year of study
  const secondYearUsers = await db.collection('users')
    .find({ studyYear: 'second-year' }, { projection: { _id: 1 } })
    .toArray();
  const secondYearIdSet = new Set(secondYearUsers.map((u) => String(u._id)));

  // Pull submittedAt and userId for accepted submissions (lightweight)
  const items = await db.collection('submissions')
    .find({ status: 'accepted' }, { projection: { submittedAt: 1, userId: 1 } })
    .toArray();
  const IST = 'Asia/Kolkata';
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
  const counts = {};
  const secondYearCounts = {};
  for (const item of items) {
    if (!item.submittedAt) continue;
    const dateKey = fmt.format(new Date(item.submittedAt));
    counts[dateKey] = (counts[dateKey] || 0) + 1;
    if (secondYearIdSet.has(String(item.userId))) {
      secondYearCounts[dateKey] = (secondYearCounts[dateKey] || 0) + 1;
    }
  }
  if (studyYearParam === 'second-year') {
    return { counts: secondYearCounts, allCounts: counts, secondYearCounts };
  }
  return { counts, secondYearCounts };
}

async function getSubmissionsByDate(db, user, url) {
  requireRole(user, 'lead', 'admin');
  const dateKey = url?.searchParams?.get('date') || '';
  const studyYearParam = url?.searchParams?.get('studyYear') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpError(400, 'A valid date query parameter (YYYY-MM-DD) is required.');
  }
  const IST = 'Asia/Kolkata';
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

  // 1. Fetch approved users (optionally filtered by studyYear)
  const userFilter = approvedUserFilter(studyYearParam === 'second-year' ? { studyYear: 'second-year' } : {});
  const allApproved = await db.collection('users').find(userFilter, {
    projection: { name: 1, email: 1, department: 1, studyYear: 1, githubUsername: 1, leetcodeUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  }).toArray();
  const profileById = new Map(allApproved.map((p) => [String(p._id), p]));

  // 2. Find accepted submissions submitted on this IST date
  const items = await db.collection('submissions')
    .find({ status: 'accepted' }, { projection: { submittedAt: 1, userId: 1, questionId: 1, assignmentId: 1, commitUrl: 1, submissionMethod: 1, solutionPath: 1, verificationSource: 1 } })
    .toArray();

  const matchingItems = items.filter((item) => item.submittedAt && fmt.format(new Date(item.submittedAt)) === dateKey);

  // Assignment info for questionId
  const assignmentIds = [...new Set(matchingItems.map((item) => String(item.assignmentId)).filter(Boolean))];
  let assignmentById = new Map();
  if (assignmentIds.length) {
    const { ObjectId } = await import('mongodb');
    const assignments = await db.collection('assignments').find(
      { _id: { $in: assignmentIds.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } },
      { projection: { dateKey: 1, questionId: 1 } },
    ).toArray();
    assignmentById = new Map(assignments.map((a) => [String(a._id), a]));
  }

  // Filter matching items to those belonging to approved users in the current filter
  const validMatchingItems = matchingItems.filter((item) => profileById.has(String(item.userId)));
  const submittedUserIdSet = new Set(validMatchingItems.map((item) => String(item.userId)));

  let submissions = validMatchingItems.map((item) => {
    const profile = profileById.get(String(item.userId));
    const assignment = assignmentById.get(String(item.assignmentId));
    const isLeetCode = item.submissionMethod === 'leetcode' || item.verificationSource === 'leetcode-api' || String(item.solutionPath || '').startsWith('LeetCode:') || String(item.commitUrl || '').includes('leetcode.com');
    const leetcodeUser = profile?.leetcodeUsername || (item.solutionPath?.match(/@([a-zA-Z0-9_-]+)/)?.[1]) || '';
    const profileUrl = leetcodeUser ? `https://leetcode.com/u/${encodeURIComponent(leetcodeUser)}/` : (item.commitUrl || 'https://leetcode.com');

    return {
      userId: String(item.userId),
      name: profile?.name || 'Member',
      email: profile?.email || '',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      avatarStyle: profile?.avatarStyle || 'critters',
      avatarSeed: profile?.avatarSeed || String(item.userId),
      avatarUrl: profile?.avatarUrl || null,
      leetcodeUsername: leetcodeUser || null,
      submittedAt: item.submittedAt,
      questionId: item.questionId || assignment?.questionId || null,
      submissionMethod: item.submissionMethod || (isLeetCode ? 'leetcode' : 'github'),
      isLeetCode,
      profileUrl: isLeetCode ? profileUrl : null,
      commitUrl: item.commitUrl || null,
    };
  });

  // Accounts that did NOT submit
  let notSubmitted = allApproved
    .filter((u) => !submittedUserIdSet.has(String(u._id)))
    .map((u) => ({
      userId: String(u._id),
      name: u.name || 'Member',
      email: u.email || '',
      department: u.department || '',
      studyYear: u.studyYear || '',
      avatarStyle: u.avatarStyle || 'critters',
      avatarSeed: u.avatarSeed || String(u._id),
      avatarUrl: u.avatarUrl || null,
      githubUsername: u.githubUsername || null,
      leetcodeUsername: u.leetcodeUsername || null,
    }));

  submissions.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  notSubmitted.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  return {
    date: dateKey,
    count: submissions.length,
    notSubmittedCount: notSubmitted.length,
    totalApprovedCount: allApproved.length,
    submissions,
    notSubmitted,
  };
}


async function getMonthSubmissionsExport(db, user, url) {
  requireRole(user, 'lead', 'admin');
  const monthKey = url?.searchParams?.get('month') || '';
  const studyYearParam = url?.searchParams?.get('studyYear') || '';
  const format = url?.searchParams?.get('format') || 'xlsx';
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new HttpError(400, 'A valid month query parameter (YYYY-MM) is required.');
  }

  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const numDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mDate = new Date(Date.UTC(year, month - 1, 1));
  const shortMonth = mDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();

  // 1. Fetch approved users (optionally filtered by studyYear)
  const userFilter = approvedUserFilter(studyYearParam === 'second-year' ? { studyYear: 'second-year' } : {});
  const users = await db.collection('users').find(userFilter, {
    projection: { name: 1, department: 1, studyYear: 1 }
  }).toArray();

  // 2. Fetch accepted submissions
  const items = await db.collection('submissions')
    .find({ status: 'accepted' }, { projection: { submittedAt: 1, userId: 1 } })
    .toArray();

  const IST = 'Asia/Kolkata';
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

  const userSubmissionDays = new Map();
  for (const item of items) {
    if (!item.submittedAt) continue;
    const dateStr = fmt.format(new Date(item.submittedAt));
    if (dateStr.startsWith(monthKey)) {
      const dayNum = parseInt(dateStr.slice(8, 10), 10);
      const uid = String(item.userId);
      if (!userSubmissionDays.has(uid)) {
        userSubmissionDays.set(uid, new Set());
      }
      userSubmissionDays.get(uid).add(dayNum);
    }
  }

  // Calculate total solved per user & sort descending by solutions, then by name
  for (const u of users) {
    const subDays = userSubmissionDays.get(String(u._id)) || new Set();
    u.subDays = subDays;
    u.totalSolved = subDays.size;
  }
  users.sort((a, b) => (b.totalSolved - a.totalSolved) || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const todayStr = fmt.format(new Date());
  const currentMonthKey = todayStr.slice(0, 7);
  const currentDayNum = parseInt(todayStr.slice(8, 10), 10);

  let maxDay = numDays;
  if (monthKey === currentMonthKey) {
    maxDay = Math.min(numDays, currentDayNum);
  } else if (monthKey > currentMonthKey) {
    maxDay = 0;
  }

  const dayCols = [];
  for (let day = 1; day <= maxDay; day++) {
    dayCols.push(`${shortMonth}${day}`);
  }

  // If XLSX format requested (or default), generate rich styled Excel spreadsheet
  if (format === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DSAvation';
    const worksheet = workbook.addWorksheet(`${mDate.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${year}`);

    const columns = [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Department', key: 'department', width: 16 },
      ...dayCols.map((col) => ({ header: col, key: col, width: 7 })),
      { header: 'Submissions', key: 'submissions', width: 14 },
    ];
    worksheet.columns = columns;

    const headerRow = worksheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
      const isSubCol = colNumber === columns.length;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isSubCol ? 'FFFEF08A' : 'FFF1F5F9' },
      };
      cell.font = {
        name: 'Segoe UI',
        bold: true,
        color: { argb: isSubCol ? 'FF713F12' : 'FF1E293B' },
        size: 10,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber <= 2 ? 'left' : 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    users.forEach((u) => {
      const rowData = {
        name: u.name,
        department: u.department,
        submissions: u.totalSolved,
      };
      for (let day = 1; day <= maxDay; day++) {
        const colKey = `${shortMonth}${day}`;
        rowData[colKey] = u.subDays.has(day) ? '✔' : '✘';
      }
      const row = worksheet.addRow(rowData);
      row.height = 20;

      row.eachCell((cell, colNumber) => {
        cell.alignment = {
          vertical: 'middle',
          horizontal: colNumber <= 2 ? 'left' : 'center',
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (colNumber > 2 && colNumber < columns.length) {
          const val = cell.value;
          if (val === '✔') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Light green
            cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF065F46' }, size: 10 };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light red
            cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF991B1B' }, size: 10 };
          }
        } else if (colNumber === columns.length) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } }; // Light yellow
          cell.font = { name: 'Segoe UI', bold: true, color: { argb: 'FF713F12' }, size: 10.5 };
        } else {
          cell.font = { name: 'Segoe UI', size: 10 };
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      buffer,
      filename: `submissions-${monthKey}${studyYearParam === 'second-year' ? '-second-year' : ''}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // CSV Fallback
  const escapeCsv = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
  const header = ['Name', 'Department', ...dayCols, 'Submissions'].join(',');

  const rows = users.map((u) => {
    const dayCells = [];
    for (let day = 1; day <= maxDay; day++) {
      dayCells.push(u.subDays.has(day) ? '✔' : '✘');
    }
    return [escapeCsv(u.name), escapeCsv(u.department), ...dayCells, u.totalSolved].join(',');
  });

  const csvContent = '\uFEFF' + [header, ...rows].join('\r\n');
  return {
    csv: csvContent,
    filename: `submissions-${monthKey}${studyYearParam === 'second-year' ? '-second-year' : ''}.csv`,
    contentType: 'text/csv; charset=utf-8',
  };
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
      role: profile?.role || 'member',
      email: profile?.email || '',
      department: profile?.department || '',
      studyYear: profile?.studyYear || '',
      githubUsername: profile?.githubUsername || item.authorLogin || '',
      leetcodeUsername: profile?.leetcodeUsername || (item.submissionMethod === 'leetcode' ? item.authorLogin : '') || '',
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

  const explainerSub = assignment.explainer
    ? rows.find(
      (r) =>
        String(r.userId) === String(assignment.explainerUserId || assignment.explainer.userId || assignment.explainer.id) &&
        r.status === 'accepted'
    )
    : null;
  const resolvedExplainer = assignment.explainer
    ? {
      ...assignment.explainer,
      submittedAt: explainerSub ? explainerSub.submittedAt : (assignment.explainer.hasSubmitted ? assignment.explainer.submittedAt : null),
      hasSubmitted: Boolean(explainerSub || (assignment.explainer.hasSubmitted && assignment.explainer.submittedAt)),
      status: explainerSub ? 'accepted' : (assignment.explainer.hasSubmitted ? assignment.explainer.status : null),
    }
    : null;

  return {
    dateKey: assignment.dateKey,
    assignmentId: String(assignment._id),
    assignment: {
      id: String(assignment._id),
      questionId: assignment.questionId,
      dateKey: assignment.dateKey,
      createdByName: assignment.createdByName,
      explainer: resolvedExplainer,
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
    explainer: resolvedExplainer,
  };
}

async function getOrCreateExplainerCycle(db, currentAssignmentId = null) {
  let cycle = await db.collection('explainerCycle').findOne({ _id: 'current' });

  const cohort = await db.collection('users').find(
    approvedUserFilter({ studyYear: 'second-year' }),
    { projection: { _id: 1, name: 1, email: 1, department: 1, studyYear: 1, githubUsername: 1, leetcodeUsername: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 } }
  ).sort({ name: 1 }).toArray();

  const cohortIdSet = new Set(cohort.map((u) => String(u._id)));

  if (!cycle) {
    // Safe initialization from past assignments for previously selected explainers:
    const pastAssignments = await db.collection('assignments').find(
      { ...(currentAssignmentId ? { _id: { $ne: currentAssignmentId } } : {}), explainerUserId: { $exists: true, $ne: null } },
      { projection: { explainerUserId: 1 } }
    ).toArray();

    const pastExplainerIds = [];
    const seen = new Set();
    for (const pa of pastAssignments) {
      const uId = String(pa.explainerUserId);
      if (cohortIdSet.has(uId) && !seen.has(uId)) {
        seen.add(uId);
        pastExplainerIds.push(uId);
      }
    }

    // Also include today’s assignment explainer if already selected and in cohort
    if (currentAssignmentId) {
      const todayAssignment = await db.collection('assignments').findOne(
        { _id: currentAssignmentId },
        { projection: { explainerUserId: 1 } }
      );
      if (todayAssignment?.explainerUserId) {
        const todayId = String(todayAssignment.explainerUserId);
        if (cohortIdSet.has(todayId) && !seen.has(todayId)) {
          seen.add(todayId);
          pastExplainerIds.push(todayId);
        }
      }
    }

    cycle = {
      _id: 'current',
      cycleNumber: 1,
      primaryCompletedIds: pastExplainerIds,
      lastExplainerId: pastExplainerIds.length > 0 ? pastExplainerIds[pastExplainerIds.length - 1] : null,
      updatedAt: new Date(),
    };
    await db.collection('explainerCycle').insertOne(cycle);
  } else {
    if (!Array.isArray(cycle.primaryCompletedIds)) {
      cycle.primaryCompletedIds = [];
    } else {
      cycle.primaryCompletedIds = cycle.primaryCompletedIds.map(String);
    }
  }

  return { cycle, cohort, cohortIdSet };
}

function selectFromUnpickedWithPriority(pool, submissions = []) {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const subMap = new Map();
  for (const s of submissions) {
    if (s.userId && s.status !== 'invalidated') {
      subMap.set(String(s.userId), s);
    }
  }

  // Priority 1: Accepted submissions
  const tier1 = pool.filter((u) => subMap.get(String(u._id))?.status === 'accepted');
  if (tier1.length > 0) {
    return tier1[Math.floor(Math.random() * tier1.length)];
  }

  // Priority 2: Other valid submissions (pending, rejected, etc.)
  const tier2 = pool.filter((u) => subMap.has(String(u._id)));
  if (tier2.length > 0) {
    return tier2[Math.floor(Math.random() * tier2.length)];
  }

  // Priority 3: Non-submitters (Nobody is safe)
  return pool[Math.floor(Math.random() * pool.length)];
}

async function pickTodayExplainer(db, user, body = {}) {
  requireRole(user, 'lead', 'admin');
  const assignment = await getTodayAssignment(db);
  if (!assignment) {
    throw new HttpError(400, 'No Question of the Day is published for today.');
  }

  const previousExplainerId = assignment.explainerUserId
    ? String(assignment.explainerUserId)
    : (assignment.explainer?.userId || assignment.explainer?.id || null);

  const isRepick = Boolean(previousExplainerId && (body?.repick || body?.reselect || body?.force || body?.userId));

  // 1. If already selected for today and not re-picking, return the locked explainer!
  if (assignment.explainer && !isRepick) {
    return { explainer: assignment.explainer, isExisting: true };
  }

  // 2. Load or initialize cycle state safely!
  const { cycle, cohort, cohortIdSet } = await getOrCreateExplainerCycle(db, assignment._id);

  if (cohort.length === 0) {
    throw new HttpError(400, 'No approved second-year members found in the club.');
  }

  let completedSet = new Set(cycle.primaryCompletedIds.map(String));

  // 3. Check cycle completion: if all currently eligible 2nd-year members have completed their turn, start new cycle!
  const allCompleted = cohort.every((u) => completedSet.has(String(u._id)));
  if (allCompleted) {
    cycle.cycleNumber = (cycle.cycleNumber || 1) + 1;
    cycle.primaryCompletedIds = [];
    cycle.updatedAt = new Date();
    completedSet.clear();
    await db.collection('explainerCycle').updateOne(
      { _id: 'current' },
      { $set: { cycleNumber: cycle.cycleNumber, primaryCompletedIds: [], updatedAt: cycle.updatedAt } }
    );
  }

  // Query today's non-invalidated submissions
  const submissions = await db.collection('submissions')
    .find({ assignmentId: assignment._id, status: { $ne: 'invalidated' } })
    .sort({ submittedAt: 1 })
    .toArray();

  let chosenMember = null;
  let creditToGrant = true;

  if (isRepick) {
    if (!previousExplainerId) {
      throw new HttpError(400, 'No explainer is currently assigned to re-pick.');
    }

    const prevCreditGranted = assignment.explainerCycleCreditGranted !== undefined
      ? Boolean(assignment.explainerCycleCreditGranted)
      : completedSet.has(previousExplainerId);

    if (body?.userId) {
      // Custom Re-pick
      const targetUserId = String(body.userId);
      if (targetUserId === previousExplainerId) {
        throw new HttpError(400, 'The selected member is already assigned as today’s explainer.');
      }
      const targetUser = await db.collection('users').findOne({ _id: new ObjectId(targetUserId) });
      if (!targetUser) throw new HttpError(404, 'Member not found.');

      // Restore previous explainer's rotation credit if it was newly granted by this assignment
      if (prevCreditGranted) {
        cycle.primaryCompletedIds = cycle.primaryCompletedIds.filter((id) => id !== previousExplainerId);
        completedSet.delete(previousExplainerId);

        if (!body.waivePenalty) {
          await db.collection('users').updateOne(
            { _id: new ObjectId(previousExplainerId) },
            { $inc: { customAura: -50 }, $set: { updatedAt: new Date() } }
          );
          await recordAdminActivity(db, user, 'member_blaze_penalized', { id: previousExplainerId, label: 'Re-pick Explainer Replacement' }, {
            amount: -50,
            reason: 'Replaced during Today’s Explainer re-pick',
          });
        }
      }

      chosenMember = targetUser;
      const isTargetSecondYear = targetUser.studyYear === 'second-year' && targetUser.approvalStatus === 'approved';
      const isTargetAlreadyCompleted = completedSet.has(targetUserId);

      if (isTargetSecondYear && !isTargetAlreadyCompleted) {
        creditToGrant = true;
        cycle.primaryCompletedIds.push(targetUserId);
        cycle.lastExplainerId = targetUserId;
      } else {
        creditToGrant = false;
      }
    } else {
      // Random Re-pick: unpicked candidates excluding previousExplainerId
      const unpickedCohort = cohort.filter((u) => {
        const uId = String(u._id);
        return uId !== previousExplainerId && !completedSet.has(uId);
      });

      if (unpickedCohort.length === 0) {
        throw new HttpError(400, 'No unselected member is available for random re-pick. Use Custom Re-pick.');
      }

      // Valid replacement found -> Now restore previous explainer's credit and apply penalty
      if (prevCreditGranted) {
        cycle.primaryCompletedIds = cycle.primaryCompletedIds.filter((id) => id !== previousExplainerId);
        completedSet.delete(previousExplainerId);

        if (!body.waivePenalty) {
          await db.collection('users').updateOne(
            { _id: new ObjectId(previousExplainerId) },
            { $inc: { customAura: -50 }, $set: { updatedAt: new Date() } }
          );
          await recordAdminActivity(db, user, 'member_blaze_penalized', { id: previousExplainerId, label: 'Re-pick Explainer Replacement' }, {
            amount: -50,
            reason: 'Replaced during Today’s Explainer re-pick',
          });
        }
      }

      chosenMember = selectFromUnpickedWithPriority(unpickedCohort, submissions);
      const chosenId = String(chosenMember._id);
      creditToGrant = true;
      cycle.primaryCompletedIds.push(chosenId);
      cycle.lastExplainerId = chosenId;
    }
  } else {
    // Initial Pick:
    if (body?.userId) {
      // Custom Initial Pick
      const targetUserId = String(body.userId);
      const targetUser = await db.collection('users').findOne({ _id: new ObjectId(targetUserId) });
      if (!targetUser) throw new HttpError(404, 'Member not found.');

      chosenMember = targetUser;
      const isTargetSecondYear = targetUser.studyYear === 'second-year' && targetUser.approvalStatus === 'approved';
      const isTargetAlreadyCompleted = completedSet.has(targetUserId);

      if (isTargetSecondYear && !isTargetAlreadyCompleted) {
        creditToGrant = true;
        cycle.primaryCompletedIds.push(targetUserId);
        cycle.lastExplainerId = targetUserId;
      } else {
        creditToGrant = false;
      }
    } else {
      // Random Initial Pick:
      const unpickedCohort = cohort.filter((u) => !completedSet.has(String(u._id)));
      if (unpickedCohort.length === 0) {
        throw new HttpError(400, 'All second-year members have completed their turn in this cycle.');
      }

      // Boundary protection: avoid previous cycle's last explainer on first draw of new cycle
      let poolForPick = unpickedCohort;
      if (cycle.primaryCompletedIds.length === 0 && cycle.lastExplainerId && unpickedCohort.length > 1) {
        const withoutLast = unpickedCohort.filter((u) => String(u._id) !== String(cycle.lastExplainerId));
        if (withoutLast.length > 0) {
          poolForPick = withoutLast;
        }
      }

      chosenMember = selectFromUnpickedWithPriority(poolForPick, submissions);
      const chosenId = String(chosenMember._id);
      creditToGrant = true;
      cycle.primaryCompletedIds.push(chosenId);
      cycle.lastExplainerId = chosenId;
    }
  }

  // Save updated cycle state
  cycle.updatedAt = new Date();
  await db.collection('explainerCycle').updateOne(
    { _id: 'current' },
    {
      $set: {
        cycleNumber: cycle.cycleNumber,
        primaryCompletedIds: cycle.primaryCompletedIds,
        lastExplainerId: cycle.lastExplainerId,
        updatedAt: cycle.updatedAt,
      }
    },
    { upsert: true }
  );

  const memberSubmission = submissions.find((s) => String(s.userId) === String(chosenMember._id) && s.status === 'accepted');
  const explainer = {
    id: String(chosenMember._id),
    userId: String(chosenMember._id),
    name: chosenMember.name,
    email: chosenMember.email || '',
    department: chosenMember.department || '',
    studyYear: chosenMember.studyYear || '',
    githubUsername: chosenMember.githubUsername || '',
    leetcodeUsername: chosenMember.leetcodeUsername || '',
    avatarStyle: chosenMember.avatarStyle || 'critters',
    avatarSeed: chosenMember.avatarSeed || chosenMember._id,
    avatarUrl: chosenMember.avatarUrl || null,
    submittedAt: memberSubmission?.submittedAt || null,
    status: memberSubmission?.status || null,
    hasSubmitted: Boolean(memberSubmission && memberSubmission.submittedAt),
    points: memberSubmission?.points ?? (memberSubmission?.status === 'accepted' ? 1 : 0),
    commitUrl: memberSubmission?.commitUrl || '',
    questionId: assignment.questionId,
    pickedAt: new Date(),
  };

  const repickCount = (assignment.repickCount || 0) + (isRepick ? 1 : 0);
  await db.collection('assignments').updateOne(
    { _id: assignment._id },
    {
      $set: {
        explainerUserId: new ObjectId(chosenMember._id),
        explainer,
        cycleNumber: cycle.cycleNumber,
        explainerCycleCreditGranted: creditToGrant,
        isRepicked: isRepick ? true : Boolean(assignment.isRepicked),
        repickCount,
      }
    }
  );

  await recordAdminActivity(db, user, isRepick ? 'explainer_repicked' : 'explainer_selected', { id: assignment._id, label: assignment.dateKey }, {
    explainerUserId: String(chosenMember._id),
    explainerName: chosenMember.name,
    studyYear: chosenMember.studyYear,
    isCustom: Boolean(body?.userId),
    creditGranted: creditToGrant,
    cycleNumber: cycle.cycleNumber,
    completedInCycle: cycle.primaryCompletedIds.length,
    totalCohort: cohort.length,
    ...(previousExplainerId ? { previousExplainerUserId: previousExplainerId } : {}),
  });

  return {
    explainer,
    isNew: true,
    isRepick,
    cycle: {
      cycleNumber: cycle.cycleNumber,
      completedCount: cycle.primaryCompletedIds.length,
      totalCohort: cohort.length,
      remainingCount: Math.max(0, cohort.length - cycle.primaryCompletedIds.length),
    }
  };
}

async function clearTodayExplainer(db, user) {
  requireRole(user, 'lead', 'admin');
  const assignment = await getTodayAssignment(db);
  if (!assignment) {
    throw new HttpError(400, 'No Question of the Day is published for today.');
  }

  const previousExplainer = assignment.explainer || null;
  const previousExplainerId = assignment.explainerUserId
    ? String(assignment.explainerUserId)
    : (previousExplainer?.userId || previousExplainer?.id || null);

  if (previousExplainerId) {
    const { cycle } = await getOrCreateExplainerCycle(db, assignment._id);
    const wasCreditGranted = assignment.explainerCycleCreditGranted !== undefined
      ? Boolean(assignment.explainerCycleCreditGranted)
      : true;

    if (wasCreditGranted) {
      cycle.primaryCompletedIds = cycle.primaryCompletedIds.filter((id) => id !== previousExplainerId);
      cycle.updatedAt = new Date();
      await db.collection('explainerCycle').updateOne(
        { _id: 'current' },
        { $set: { primaryCompletedIds: cycle.primaryCompletedIds, updatedAt: cycle.updatedAt } }
      );
    }

    await recordAdminActivity(db, user, 'explainer_cleared', { id: assignment._id, label: assignment.dateKey }, {
      previousExplainerUserId: previousExplainerId,
      previousExplainerName: previousExplainer?.name || '',
      wasCreditGranted,
    });
  }

  await db.collection('assignments').updateOne(
    { _id: assignment._id },
    { $unset: { explainer: '', explainerUserId: '', explainerCycleCreditGranted: '' }, $set: { isRepicked: false } }
  );

  return { ok: true, cleared: true };
}

async function getSecondYearExplainerCandidates(db, user) {
  requireRole(user, 'lead', 'admin');
  const assignment = await getTodayAssignment(db);

  const { cycle, cohort } = await getOrCreateExplainerCycle(db, assignment?._id);
  const completedSet = new Set(cycle.primaryCompletedIds.map(String));

  let todaySubmitterSet = new Set();
  if (assignment) {
    const todaySubs = await db.collection('submissions').find(
      { assignmentId: assignment._id, status: { $ne: 'invalidated' } },
      { projection: { userId: 1, status: 1 } }
    ).toArray();
    todaySubmitterSet = new Set(todaySubs.map((s) => String(s.userId)));
  }

  const currentExplainerId = assignment?.explainerUserId ? String(assignment.explainerUserId) : null;

  return {
    cycle: {
      cycleNumber: cycle.cycleNumber,
      completedCount: cycle.primaryCompletedIds.length,
      totalCohort: cohort.length,
      remainingCount: Math.max(0, cohort.length - cycle.primaryCompletedIds.length),
    },
    candidates: cohort.map((member) => {
      const mId = String(member._id);
      const isCompleted = completedSet.has(mId);
      const submittedToday = todaySubmitterSet.has(mId);
      const isCurrentExplainer = currentExplainerId === mId;
      return {
        id: mId,
        userId: mId,
        name: member.name,
        email: member.email || '',
        department: member.department || '',
        studyYear: member.studyYear || '',
        githubUsername: member.githubUsername || '',
        leetcodeUsername: member.leetcodeUsername || '',
        ...formatAvatar(member, member._id),
        turnCompleted: isCompleted,
        submittedToday,
        isCurrentExplainer,
      };
    }),
  };
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
  if (status === 'accepted' && submission.questionId) {
    try { await markClubProgress(db, submission.userId, submission.questionId, submission.assignmentId, new Date()); } catch { /* progress lock is retried on the next progress read */ }
  }
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
  const pendingFilter = {
    $or: [
      { approvalStatus: 'pending' },
      { approvalStatus: { $exists: false }, verifiedAt: null },
      { leetcodeApproval: 'pending' },
    ],
  };
  const filters = [];
  if (status === 'approved') filters.push(approvedUserFilter());
  if (status === 'pending') filters.push(pendingFilter);
  if (status === 'leetcode' || status === 'leetcode-pending') filters.push({ leetcodeApproval: 'pending' });
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filters.push({ $or: [{ name: regex }, { department: regex }, { email: regex }, { githubUsername: regex }, { leetcodeUsername: regex }] });
  }
  const filter = filters.length > 1 ? { $and: filters } : filters[0] || {};
  const { page, pageSize, skip } = pageOptions(url, 20, 50);
  const cursor = db.collection('users').find(filter, {
    projection: { name: 1, department: 1, studyYear: 1, email: 1, githubUsername: 1, leetcodeUsername: 1, role: 1, showPublic: 1, createdAt: 1, approvalStatus: 1, approvedAt: 1, verifiedAt: 1, leetcodeApproval: 1, leetcodeRequestedAt: 1, defaultSubmissionMethod: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1 },
  });
  if (typeof cursor.collation === 'function') {
    cursor.collation({ locale: 'en', strength: 2 });
  }
  const [total, members, pending, approved, leetcodePending] = await Promise.all([
    db.collection('users').countDocuments(filter),
    cursor.sort({ name: 1 }).skip(skip).limit(pageSize).toArray(),
    db.collection('users').countDocuments(pendingFilter),
    db.collection('users').countDocuments(approvedUserFilter()),
    db.collection('users').countDocuments({ leetcodeApproval: 'pending' }),
  ]);
  return {
    members: members.map((user) => ({
      id: String(user._id), name: user.name, department: user.department, studyYear: user.studyYear || '',
      email: user.email, githubUsername: user.githubUsername, leetcodeUsername: user.leetcodeUsername || '', role: user.role || 'member',
      ...formatAvatar(user),
      approvalStatus: approvalStatus(user),
      leetcodeApproval: user.role === 'admin' ? 'approved' : (user.leetcodeApproval || 'none'),
      leetcodeRequestedAt: user.leetcodeRequestedAt || null,
      defaultSubmissionMethod: user.defaultSubmissionMethod || 'github',
      showPublic: Boolean(user.showPublic), createdAt: user.createdAt, approvedAt: user.approvedAt || user.verifiedAt || null,
    })), pagination: pageMeta(page, pageSize, total), counts: { pending, approved, leetcodePending }
  };
}

async function listDirectory(db, url, viewer = null) {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const department = String(url.searchParams.get('department') || '').trim().slice(0, 80);
  const studyYear = String(url.searchParams.get('year') || '');
  const filters = [approvedUserFilter()];
  const isAdmin = ['admin', 'lead'].includes(viewer?.role);

  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const orFields = [{ name: regex }, { department: regex }, { githubUsername: regex }];
    if (isAdmin) orFields.push({ leetcodeUsername: regex }, { email: regex });
    filters.push({ $or: orFields });
  }
  if (department) filters.push({ department: new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (studyYear) {
    if (!['first-year', 'second-year', 'third-year', 'fourth-year', 'passed'].includes(studyYear)) throw new HttpError(400, 'Choose a valid year of study.');
    filters.push({ studyYear });
  }
  const filter = filters.length === 1 ? filters[0] : { $and: filters };
  const { page, pageSize, skip } = pageOptions(url, 60, 100);
  const projection = {
    name: 1, department: 1, studyYear: 1, githubUsername: 1, leetcodeUsername: 1,
    role: 1, avatarStyle: 1, avatarSeed: 1, avatarUrl: 1, cardBgUrl: 1, customAura: 1,
  };
  if (isAdmin) {
    projection.email = 1;
  }
  const cursor = db.collection('users').find(filter, { projection });
  if (typeof cursor.collation === 'function') {
    cursor.collation({ locale: 'en', strength: 2 });
  }
  const [total, members, departments] = await Promise.all([
    db.collection('users').countDocuments(filter),
    cursor.sort({ name: 1 }).skip(skip).limit(pageSize).toArray(),
    db.collection('users').find(approvedUserFilter(), { projection: { department: 1 } }).toArray(),
  ]);
  const memberIds = members.map((m) => m._id);
  const [totals, auraByUser] = await Promise.all([
    memberIds.length
      ? db.collection('submissions').aggregate([
        { $match: { userId: { $in: memberIds }, status: 'accepted' } },
        { $group: { _id: '$userId', points: { $sum: { $ifNull: ['$points', 1] } } } },
      ]).toArray()
      : [],
    computeAuraByUser(db, memberIds),
  ]);
  const pointsByUser = new Map(totals.map((t) => [String(t._id), Number(t.points || 0)]));

  return {
    members: members.map((member) => {
      const isSelf = viewer && String(member._id) === String(viewer._id);
      const canSeeLeetcode = isAdmin || isSelf;
      return {
        id: String(member._id),
        name: member.name,
        department: member.department,
        studyYear: member.studyYear || '',
        points: pointsByUser.get(String(member._id)) || 0,
        blaze: auraByUser.get(String(member._id)) || 0,
        aura: auraByUser.get(String(member._id)) || 0,
        customBlaze: Number(member.customAura || 0),
        customAura: Number(member.customAura || 0),
        githubUsername: member.githubUsername || '',
        leetcodeUsername: canSeeLeetcode ? (member.leetcodeUsername || '') : '',
        ...(isAdmin ? { email: member.email || '' } : {}),
        role: member.role || 'member',
        cardBgUrl: member.cardBgUrl || '',
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

  if (viewer.role !== 'admin') {
    await allowRequest(db, req, `leetcode-stats-${viewer._id}`, 12, 60 * 60 * 1000);
  } else {
    await allowRequest(db, req, `leetcode-stats-${viewer._id}`, 500, 60 * 60 * 1000);
  }
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
  if (body.customAura !== undefined) {
    update.customAura = Math.round(Number(body.customAura) || 0);
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

async function awardMemberBlaze(db, user, memberId, body) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  const rawAmount = body.blaze !== undefined ? body.blaze : body.aura;
  const amount = Math.round(Number(rawAmount));
  if (!amount || Number.isNaN(amount)) {
    throw new HttpError(400, 'Enter a valid non-zero blaze points amount.');
  }

  const member = await db.collection('users').findOne({ _id: new ObjectId(memberId) });
  if (!member) throw new HttpError(404, 'Member not found.');

  const isSet = body.mode === 'set';
  const prevCustomAura = Number(member.customAura || 0);
  const newCustomAura = isSet ? amount : prevCustomAura + amount;

  await db.collection('users').updateOne(
    { _id: member._id },
    { $set: { customAura: newCustomAura, updatedAt: new Date() } }
  );

  await recordAdminActivity(db, user, 'member_blaze_awarded', { id: memberId, label: `${member.name} · ${member.email}` }, {
    amount,
    mode: isSet ? 'set' : 'add',
    previousCustomBlaze: prevCustomAura,
    newCustomBlaze: newCustomAura,
    previousCustomAura: prevCustomAura,
    newCustomAura,
    note: String(body.note || '').trim().slice(0, 300),
  });

  const auraMap = await computeAuraByUser(db, [member._id]);
  const totalAura = auraMap.get(String(memberId)) || 0;

  return {
    ok: true,
    memberId: String(memberId),
    customBlaze: newCustomAura,
    totalBlaze: totalAura,
    customAura: newCustomAura,
    totalAura,
  };
}
const awardMemberAura = awardMemberBlaze;

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

let schedulerInitialized = false;

export async function handleApiNode(req, res, options = {}) {
  const url = normalizedUrl(req.url || '/');
  const method = String(req.method || 'GET').toUpperCase();
  let db;
  const getDb = () => options.db ? Promise.resolve(options.db) : getDatabase();
  try {
    if (url.pathname === '/api/cron/daily-assignment' && (method === 'GET' || method === 'POST')) {
      db = await getDb();
      const authHeader = req.headers?.authorization;
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers?.['x-vercel-cron'] !== '1') {
        throw new HttpError(401, 'Unauthorized cron trigger.');
      }
      const targetDate = url.searchParams.get('dateKey') || dayKey();
      const assignment = await autoAssignDailyQuestion(db, targetDate);
      return json(res, 200, { ok: true, dateKey: targetDate, assignment });
    }
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
    if (url.pathname === '/api/proxy-image' && method === 'GET') {
      const target = url.searchParams.get('url');
      if (!target || !/^https?:\/\//i.test(target)) {
        throw new HttpError(400, 'A valid http or https URL is required.');
      }
      try {
        const response = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DSAvation/1.0',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
          throw new HttpError(response.status, 'Failed to fetch image');
        }
        const contentType = response.headers.get('content-type') || 'image/png';
        const arrayBuffer = await response.arrayBuffer();
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(Buffer.from(arrayBuffer));
        return;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, 'Image host could not be reached.');
      }
    }
    if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req);
    db = await getDb();
    if (!schedulerInitialized && process.env.NODE_ENV !== 'test' && !process.env.DISABLE_SCHEDULER) {
      schedulerInitialized = true;
      scheduleNextMidnightAssignment(db);
    }
    if (url.pathname === '/api/auth/register' && method === 'POST') return await signup(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/login' && method === 'POST') return await login(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/request-password-reset' && method === 'POST') return json(res, 200, await requestPasswordReset(db, req, res, await readBody(req)));
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

    if (url.pathname === '/api/club/leaderboard' && method === 'GET') {
      const viewer = await currentUser(req, db);
      return json(res, 200, await leaderboard(db, url, viewer));
    }

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
      // progress keeps personal checkmarks. activity is accepted Club Challenge submissions only.
      return json(res, 200, await progressPayload(db, user));
    }
    const progressMatch = url.pathname.match(/^\/api\/progress\/(\d+)$/);
    if (progressMatch && method === 'PUT') {
      const body = await readBody(req);
      const solved = Boolean(body.solved);
      await setProgress(db, req, user, progressMatch[1], solved);
      return json(res, 200, { ok: true, questionId: Number(progressMatch[1]), solved });
    }
    if (url.pathname === '/api/submissions' && method === 'GET') return json(res, 200, await listSubmissions(db, req, user, url));
    if (url.pathname === '/api/submissions' && method === 'POST') {
      const submission = await makeSubmission(db, req, user, await readBody(req));
      return json(res, 201, { ok: true, submission: { status: submission.status, points: submission.points, aura: submission.aura, questionId: submission.questionId, solutionPath: submission.solutionPath, commitUrl: submission.commitUrl } });
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
    if (url.pathname === '/api/admin/auto-assign' && method === 'POST') {
      requireRole(user, 'lead', 'admin');
      const body = await readBody(req);
      const targetDate = body?.dateKey || dayKey();
      const assignment = await autoAssignDailyQuestion(db, targetDate, { force: true, user });
      return json(res, 200, { ok: true, assignment });
    }
    if (url.pathname === '/api/admin/submissions' && method === 'GET') {
      return json(res, 200, await listSubmissions(db, req, user, url));
    }
    if (url.pathname === '/api/admin/submissions-heatmap' && method === 'GET') {
      return json(res, 200, await getSubmissionsHeatmap(db, user, url));
    }
    if (url.pathname === '/api/admin/submissions-by-date' && method === 'GET') {
      return json(res, 200, await getSubmissionsByDate(db, user, url));
    }
    if ((url.pathname === '/api/admin/month-submissions-csv' || url.pathname === '/api/admin/month-submissions-export') && method === 'GET') {
      const result = await getMonthSubmissionsExport(db, user, url);
      if (result.buffer) {
        return sendBuffer(res, 200, result.buffer, {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        });
      }
      return sendText(res, 200, result.csv, {
        'Content-Type': result.contentType || 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      });
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
      const body = await readBody(req);
      return json(res, 200, await pickTodayExplainer(db, user, body));
    }
    if (url.pathname === '/api/admin/pick-explainer' && method === 'DELETE') {
      return json(res, 200, await clearTodayExplainer(db, user));
    }
    if (url.pathname === '/api/admin/explainer-candidates' && method === 'GET') {
      return json(res, 200, await getSecondYearExplainerCandidates(db, user));
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
    const blazeMatch = url.pathname.match(/^\/api\/admin\/members\/([a-f0-9]{24})\/(blaze|aura)$/i);
    if (blazeMatch && method === 'POST') {
      return json(res, 200, await awardMemberBlaze(db, user, blazeMatch[1], await readBody(req)));
    }
    if (url.pathname === '/api/admin/activity' && method === 'GET') {
      const admin = await requireUser(req, db);
      requireRole(admin, 'admin');
      return json(res, 200, await listAdminActivity(db, url));
    }
    if (url.pathname === '/api/admin/rate-limits' && method === 'GET') {
      const admin = await requireUser(req, db);
      requireRole(admin, 'admin');
      const count = await db.collection('rateLimits').countDocuments();
      return json(res, 200, { count });
    }
    if (url.pathname === '/api/admin/clear-rate-limits' && method === 'POST') {
      const admin = await requireUser(req, db);
      requireRole(admin, 'admin');
      const count = await db.collection('rateLimits').countDocuments();
      const result = await db.collection('rateLimits').deleteMany({});
      const clearedCount = result.deletedCount ?? count;
      await recordAdminActivity(db, admin, 'rate_limits_cleared', { label: 'All active rate limits' }, { clearedCount });
      console.log(`[Admin Action] Administrator ${admin.email} cleared ${clearedCount} rate limit records.`);
      return json(res, 200, { ok: true, clearedCount });
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
    const isServerError = !(error instanceof HttpError) && status >= 500;
    const reqId = String(req.headers['x-client-request-id'] || req.headers['x-request-id'] || '').slice(0, 40)
      || randomBytes(6).toString('hex');

    if (status >= 500) {
      console.error(`[DSAvation Error] [${reqId}] ${method} ${url.pathname} (${status}):`, error?.stack || error?.message || error);
    } else {
      console.warn(`[DSAvation Security] [${reqId}] ${method} ${url.pathname} (${status}):`, error?.message || error);
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
