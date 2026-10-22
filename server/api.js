import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import curriculum from '../src/data/questions.json' with { type: 'json' };
import { getDatabase } from './db.js';

const TZ = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;
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
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
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
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearCookie(res, req, key) { setCookie(res, req, key, '', 0, { clear: true }); }

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string' && body.length) {
    try { return JSON.parse(body); } catch { throw new HttpError(400, 'Send a valid JSON request.'); }
  }
  return {};
}

async function readBody(req) {
  if (req.body !== undefined) return parseCookies(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  return parseCookies(Buffer.concat(chunks));
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new HttpError(413, 'GitHub webhook payload is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  try {
    if (new URL(origin).host.toLowerCase() !== String(host || '').toLowerCase()) {
      throw new HttpError(403, 'Cross-site request rejected.');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, 'Invalid request origin.');
  }
}

function baseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || (cookieSecure(req) ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  return `${String(protocol).split(',')[0]}://${String(host).split(',')[0]}`;
}

function account(user) {
  if (!user) return null;
  return {
    id: String(user._id), name: user.name, department: user.department,
    email: user.email, githubUsername: user.githubUsername || '',
    githubVerified: Boolean(user.githubVerifiedAt), role: user.role || 'member',
    showPublic: Boolean(user.showPublic), createdAt: user.createdAt,
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
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const githubUsername = String(body.githubUsername || '').trim().replace(/^@/, '');
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter your full name (2–80 characters).');
  if (!/^[a-z0-9.+_-]+@abes\.ac\.in$/i.test(email)) throw new HttpError(400, 'Use your college email ending exactly in @abes.ac.in.');
  if (department.length < 2 || department.length > 80) throw new HttpError(400, 'Choose or enter your department.');
  if (password.length < 10 || password.length > 128) throw new HttpError(400, 'Use a password between 10 and 128 characters.');
  if (!/^[a-z0-9-]{1,39}$/i.test(githubUsername)) throw new HttpError(400, 'Enter a valid GitHub username.');
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
    name, department, email, passwordHash: await bcrypt.hash(password, 12),
    githubUsername: gh.login, githubUserLower, githubId: gh.id,
    githubVerifiedAt: null, showPublic: body.showPublic === true,
    approvalStatus: administrator ? 'approved' : 'pending',
    approvedAt: administrator ? now : null, approvedBy: administrator ? 'ADMIN_EMAILS' : null,
    role: administrator ? 'admin' : 'member', createdAt: now, updatedAt: now,
  };
  user._id = new ObjectId();
  await db.collection('users').insertOne(user);
  if (administrator) {
    await newSession(db, user, req, res);
    json(res, 201, { ok: true, approvalStatus: 'approved', user: account(user) });
  } else {
    json(res, 201, { ok: true, approvalStatus: 'pending', email });
  }
}

async function login(db, req, res, body) {
  await allowRequest(db, req, 'login', 10, 15 * 60 * 1000);
  const email = String(body.email || '').trim().toLowerCase();
  let user = await db.collection('users').findOne({ email });
  const valid = user && await bcrypt.compare(String(body.password || ''), user.passwordHash);
  if (!valid) throw new HttpError(401, 'Email or password is incorrect.');
  if (adminEmails().has(email) && !user.approvalStatus) {
    const now = new Date();
    user = { ...user, role: 'admin', approvalStatus: 'approved', approvedAt: user.approvedAt || now, approvedBy: user.approvedBy || 'ADMIN_EMAILS' };
    await db.collection('users').updateOne({ _id: user._id }, { $set: { role: 'admin', approvalStatus: 'approved', approvedAt: user.approvedAt, approvedBy: user.approvedBy, updatedAt: now } });
  }
  if (!isApproved(user)) throw new HttpError(403, 'Your account is waiting for administrator approval.');
  await newSession(db, user, req, res);
  json(res, 200, { ok: true, user: account(user) });
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
  if (current.githubUserLower && current.githubUserLower !== gh.login.toLowerCase()) {
    throw new HttpError(409, `Sign in to the GitHub account you entered at signup (@${current.githubUsername}).`);
  }
  const other = await db.collection('users').findOne({ githubUserLower: gh.login.toLowerCase(), _id: { $ne: current._id } });
  if (other) throw new HttpError(409, 'That GitHub account is linked to another DSAvation member.');
  await db.collection('users').updateOne({ _id: current._id }, {
    $set: { githubUsername: gh.login, githubUserLower: gh.login.toLowerCase(), githubId: gh.id, githubVerifiedAt: new Date(), updatedAt: new Date() },
  });
  res.statusCode = 302;
  res.setHeader('Location', `${baseUrl(req)}/?github=connected`);
  res.end();
}

async function setProgress(db, user, questionId, solved) {
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
  if (!assignment) return { dateKey: dayKey(), assignment: null, submittedCount: 0, acceptedCount: 0, participants: [] };
  const submissions = await db.collection('submissions').find({ assignmentId: assignment._id }).sort({ submittedAt: 1 }).toArray();
  const userIds = [...new Set(submissions.map((item) => String(item.userId)))].map((id) => new ObjectId(id));
  const profiles = userIds.length ? await db.collection('users').find(approvedUserFilter({ _id: { $in: userIds } }), {
    projection: { name: 1, department: 1, showPublic: 1, githubUsername: 1 },
  }).toArray() : [];
  const profileById = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const activeSubmissions = submissions.filter((item) => profileById.has(String(item.userId)));
  const participants = activeSubmissions.filter((item) => item.status === 'accepted').flatMap((item) => {
    const profile = profileById.get(String(item.userId));
    return profile ? [{
      name: profile.showPublic ? profile.name : `@${profile.githubUsername}`,
      department: profile.showPublic ? profile.department : '',
      githubUsername: profile.githubUsername,
    }] : [];
  });
  return {
    dateKey: dayKey(),
    assignment: { id: String(assignment._id), questionId: assignment.questionId, dateKey: assignment.dateKey, createdByName: assignment.createdByName },
    submittedCount: activeSubmissions.length,
    acceptedCount: activeSubmissions.filter((item) => item.status === 'accepted').length,
    participants,
  };
}

async function makeSubmission(db, req, user, body) {
  if (!user.githubVerifiedAt) throw new HttpError(403, 'Link your verified GitHub account before submitting a club solution.');
  await allowRequest(db, req, `submission-${user._id}`, 5, 60 * 60 * 1000);
  const assignment = await getTodayAssignment(db);
  if (!assignment || String(assignment._id) !== String(body.assignmentId || '')) {
    throw new HttpError(409, 'Submissions are only open for today’s published Question of the Day.');
  }
  const repoName = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName)) throw new HttpError(503, 'Club repository verification is not configured. Set GITHUB_REPOSITORY.');
  const parsed = (() => {
    try { return new URL(String(body.commitUrl || '')); } catch { return null; }
  })();
  if (!parsed || parsed.hostname.toLowerCase() !== 'github.com') throw new HttpError(400, 'Paste a GitHub commit URL from the club repository.');
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 4 || !['commit', 'commits'].includes(parts[2].toLowerCase())) throw new HttpError(400, 'Use the direct GitHub commit page, not a repository or branch link.');
  const [owner, repository, , sha] = parts;
  if (`${owner}/${repository}`.toLowerCase() !== repoName.toLowerCase()) throw new HttpError(400, `Submit from the club repository ${repoName}.`);
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) throw new HttpError(400, 'The commit URL does not contain a valid commit SHA.');
  const commit = await githubJson(`/repos/${owner}/${repository}/commits/${sha}`, process.env.GITHUB_TOKEN);
  const username = String(user.githubUsername).toLowerCase();
  if (String(commit.author?.login || '').toLowerCase() !== username) {
    throw new HttpError(403, 'The commit’s GitHub author does not match your linked account.');
  }
  const commitDate = commit.commit?.committer?.date;
  if (!commitDate || dayKey(new Date(commitDate)) !== dayKey()) {
    throw new HttpError(400, 'The commit date must fall within today in Asia/Kolkata.');
  }
  const expectedPath = `submissions/${dayKey()}/${username}/lc-${assignment.questionId}/`.toLowerCase();
  const hasQuestionFile = (commit.files || []).some((file) => String(file.filename || '').toLowerCase().startsWith(expectedPath));
  if (!hasQuestionFile) throw new HttpError(400, `Include your solution under ${expectedPath} in the club repository.`);
  const alreadySubmitted = await db.collection('submissions').findOne({ assignmentId: assignment._id, userId: user._id });
  if (alreadySubmitted) {
    if (alreadySubmitted.commitSha === commit.sha && alreadySubmitted.status === 'pending') {
      await db.collection('submissions').updateOne({ _id: alreadySubmitted._id }, { $set: { verifiedPusher: true, verificationSource: 'github-webhook', pushReceivedAt: alreadySubmitted.pushReceivedAt || new Date() } });
      return { ...alreadySubmitted, verifiedPusher: true };
    }
    throw new HttpError(409, 'You already submitted for today’s assignment.');
  }
  const submission = {
    assignmentId: assignment._id, userId: user._id, questionId: assignment.questionId,
    repository: `${owner}/${repository}`, commitSha: commit.sha, commitUrl: commit.html_url,
    commitDate: new Date(commitDate), submittedAt: new Date(), status: 'pending',
    authorLogin: commit.author.login, verifiedPusher: false, verificationSource: 'commit-link',
    reviewedAt: null, reviewedBy: null, reviewNote: '',
  };
  await db.collection('submissions').insertOne(submission);
  return { ...submission, id: String(submission._id || '') };
}

async function githubWebhook(db, req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'GitHub push verification is not configured.');
  const raw = await readRawBody(req);
  const signatureHeader = String(req.headers['x-hub-signature-256'] || '');
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  if (!safeEqual(signatureHeader, expected)) throw new HttpError(401, 'GitHub webhook signature is invalid.');
  if (String(req.headers['x-github-event'] || '') === 'ping') return { ok: true, message: 'Webhook connected.' };
  if (String(req.headers['x-github-event'] || '') !== 'push') return { ok: true, ignored: true };
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'GitHub webhook body is not valid JSON.'); }
  const repoName = String(process.env.GITHUB_REPOSITORY || '').toLowerCase();
  if (!repoName || String(payload.repository?.full_name || '').toLowerCase() !== repoName) return { ok: true, ignored: true };
  const today = dayKey();
  const assignment = await db.collection('assignments').findOne({ dateKey: today });
  if (!assignment) return { ok: true, ignored: true, reason: 'No assignment is active today.' };
  const sender = String(payload.sender?.login || '').toLowerCase();
  if (!sender || String(payload.ref || '').toLowerCase() !== `refs/heads/submissions/${sender}`) return { ok: true, ignored: true };
  const user = await db.collection('users').findOne(approvedUserFilter({ githubUserLower: sender, githubVerifiedAt: { $ne: null } }));
  if (!user) return { ok: true, ignored: true };
  const receivedAt = new Date();
  if (dayKey(receivedAt) !== assignment.dateKey) return { ok: true, ignored: true };
  const expectedPath = `submissions/${today}/${sender}/lc-${assignment.questionId}/`.toLowerCase();
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  let recorded = 0;
  for (const commit of commits) {
    const sha = String(commit.id || '');
    const paths = [...(commit.added || []), ...(commit.modified || [])].map((path) => String(path).toLowerCase());
    if (!/^[a-f0-9]{40}$/i.test(sha) || !paths.some((path) => path.startsWith(expectedPath))) continue;
    const verifiedCommit = await githubJson(`/repos/${repoName}/commits/${sha}`, process.env.GITHUB_TOKEN);
    if (String(verifiedCommit.author?.login || '').toLowerCase() !== sender) continue;
    const commitDate = verifiedCommit.commit?.committer?.date;
    if (!commitDate || dayKey(new Date(commitDate)) !== today) continue;
    const verifiedPaths = (verifiedCommit.files || []).map((file) => String(file.filename || '').toLowerCase());
    if (!verifiedPaths.some((path) => path.startsWith(expectedPath))) continue;
    const commitUrl = `${payload.repository.html_url}/commit/${sha}`;
    const existing = await db.collection('submissions').findOne({ assignmentId: assignment._id, userId: user._id });
    if (existing) {
      if (existing.commitSha === sha && existing.status === 'pending') {
        await db.collection('submissions').updateOne({ _id: existing._id }, { $set: { verifiedPusher: true, verificationSource: 'github-webhook', pushReceivedAt: receivedAt } });
        recorded += 1;
      }
      continue;
    }
    await db.collection('submissions').insertOne({
      assignmentId: assignment._id, userId: user._id, questionId: assignment.questionId,
      repository: payload.repository.full_name, commitSha: sha, commitUrl,
      commitDate: new Date(commitDate), submittedAt: receivedAt, pushReceivedAt: receivedAt,
      status: 'pending', authorLogin: verifiedCommit.author.login, verifiedPusher: true,
      verificationSource: 'github-webhook', reviewedAt: null, reviewedBy: null, reviewNote: '',
    });
    recorded += 1;
  }
  return { ok: true, recorded };
}

async function assignmentHistory(db) {
  const assignments = await db.collection('assignments').find({ dateKey: { $lte: dayKey() } }).sort({ dateKey: -1 }).limit(45).toArray();
  return assignments.map((assignment) => ({
    id: String(assignment._id), dateKey: assignment.dateKey, questionId: assignment.questionId,
    createdByName: assignment.createdByName,
  }));
}

async function leaderboard(db) {
  const assignments = await db.collection('assignments').find({ dateKey: { $lte: dayKey() } }).sort({ dateKey: 1 }).toArray();
  const totals = await db.collection('submissions').aggregate([
    { $match: { status: 'accepted' } },
    { $group: { _id: '$userId', accepted: { $sum: 1 }, acceptedAssignments: { $addToSet: '$assignmentId' }, lastAcceptedAt: { $max: '$reviewedAt' } } },
    { $sort: { accepted: -1, lastAcceptedAt: 1 } },
  ]).toArray();
  const profiles = await db.collection('users').find(approvedUserFilter(), {
    projection: { name: 1, department: 1, githubUsername: 1, showPublic: 1, createdAt: 1 },
  }).toArray();
  const totalById = new Map(totals.map((row) => [String(row._id), row]));
  return profiles.map((profile) => {
    const row = totalById.get(String(profile._id)) || { accepted: 0, acceptedAssignments: [] };
    const joinedKey = dayKey(profile.createdAt || new Date());
    const eligible = assignments.filter((assignment) => assignment.dateKey > joinedKey || new Date(assignment.createdAt || 0) >= profile.createdAt);
    const completed = new Set(row.acceptedAssignments.map(String));
    let streak = 0;
    for (const assignment of eligible.slice().reverse()) {
      if (!completed.has(String(assignment._id))) break;
      streak += 1;
    }
    return {
      name: profile.showPublic ? profile.name : `@${profile.githubUsername}`,
      department: profile.showPublic ? profile.department : 'ABES member',
      githubUsername: profile.githubUsername,
      points: row.accepted, completed: row.accepted, scheduled: eligible.length,
      punctuality: eligible.length ? Math.round((row.accepted / eligible.length) * 100) : 0,
      streak,
    };
  }).sort((a, b) => b.points - a.points || b.punctuality - a.punctuality || a.name.localeCompare(b.name));
}

async function createAssignment(db, user, body) {
  requireRole(user, 'lead', 'admin');
  const questionId = Number(body.questionId);
  const dateKey = String(body.dateKey || '');
  if (!questionById.has(questionId)) throw new HttpError(400, 'Choose a question from the 220-question curriculum.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey < dayKey()) throw new HttpError(400, 'Choose today or a future date in Asia/Kolkata.');
  const existing = await db.collection('assignments').findOne({ dateKey });
  if (existing) {
    const activity = await db.collection('submissions').countDocuments({ assignmentId: existing._id });
    if (activity) throw new HttpError(409, 'This assignment already has submissions and cannot be changed.');
    await db.collection('assignments').updateOne({ _id: existing._id }, {
      $set: { questionId, createdBy: user._id, createdByName: user.name, updatedAt: new Date() },
    });
    return { id: String(existing._id), dateKey, questionId, createdByName: user.name };
  }
  const assignment = {
    dateKey, questionId, createdBy: user._id, createdByName: user.name,
    timezone: TZ, createdAt: new Date(),
  };
  const result = await db.collection('assignments').insertOne(assignment);
  return { id: String(result.insertedId), dateKey, questionId, createdByName: user.name };
}

async function listSubmissions(db, req, user, url) {
  const isReview = url.pathname === '/api/admin/submissions';
  if (isReview) requireRole(user, 'lead', 'admin');
  const match = isReview ? { status: url.searchParams.get('status') || 'pending' } : { userId: user._id };
  const items = await db.collection('submissions').find(match).sort({ submittedAt: -1 }).limit(100).toArray();
  const userIds = [...new Set(items.map((item) => String(item.userId)))].map((id) => new ObjectId(id));
  const assignmentIds = [...new Set(items.map((item) => String(item.assignmentId)))].map((id) => new ObjectId(id));
  const profiles = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }, { projection: { name: 1, department: 1, githubUsername: 1 } }).toArray() : [];
  const assignments = assignmentIds.length ? await db.collection('assignments').find({ _id: { $in: assignmentIds } }).toArray() : [];
  const profileById = new Map(profiles.map((item) => [String(item._id), item]));
  const assignmentById = new Map(assignments.map((item) => [String(item._id), item]));
  return items.map((item) => ({
    id: String(item._id), status: item.status, commitUrl: item.commitUrl, submittedAt: item.submittedAt,
    commitDate: item.commitDate, reviewNote: item.reviewNote,
    verifiedPusher: Boolean(item.verifiedPusher), verificationSource: item.verificationSource || 'commit-link',
    member: (() => { const profile = profileById.get(String(item.userId)); return profile ? {
      name: profile.name, department: profile.department, githubUsername: profile.githubUsername,
    } : null; })(),
    assignment: (() => { const assignment = assignmentById.get(String(item.assignmentId)); return assignment ? {
      dateKey: assignment.dateKey, questionId: assignment.questionId,
      question: questionById.get(assignment.questionId)?.title || 'Question',
    } : null; })(),
  }));
}

async function reviewSubmission(db, user, submissionId, body) {
  requireRole(user, 'lead', 'admin');
  if (!ObjectId.isValid(submissionId)) throw new HttpError(404, 'Submission not found.');
  const status = body.status;
  if (!['accepted', 'rejected'].includes(status)) throw new HttpError(400, 'Choose accepted or rejected.');
  const note = String(body.note || '').trim().slice(0, 400);
  const submission = await db.collection('submissions').findOne({ _id: new ObjectId(submissionId), status: 'pending' });
  if (!submission) throw new HttpError(404, 'Pending submission not found.');
  if (status === 'accepted' && process.env.GITHUB_WEBHOOK_SECRET && !submission.verifiedPusher) {
    throw new HttpError(409, 'This club requires a matching GitHub push webhook before a submission can receive points.');
  }
  const result = await db.collection('submissions').updateOne(
    { _id: new ObjectId(submissionId), status: 'pending' },
    { $set: { status, reviewNote: note, reviewedAt: new Date(), reviewedBy: user._id } },
  );
  if (!result.matchedCount) throw new HttpError(404, 'Pending submission not found.');
  return { ok: true };
}

async function listMembers(db) {
  return (await db.collection('users').find({}, {
    projection: { name: 1, department: 1, email: 1, githubUsername: 1, role: 1, showPublic: 1, createdAt: 1, approvalStatus: 1, approvedAt: 1, verifiedAt: 1 },
  }).sort({ name: 1 }).limit(500).toArray()).map((user) => ({
    id: String(user._id), name: user.name, department: user.department,
    email: user.email, githubUsername: user.githubUsername, role: user.role || 'member',
    approvalStatus: approvalStatus(user), showPublic: Boolean(user.showPublic), createdAt: user.createdAt, approvedAt: user.approvedAt || user.verifiedAt || null,
  }));
}

async function updateMember(db, user, memberId, body) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  const update = {};
  if (body.role !== undefined) {
    if (!['member', 'lead', 'admin'].includes(body.role)) throw new HttpError(400, 'Role must be member, lead, or admin.');
    if (String(user._id) === memberId && body.role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin access.');
    if (String(user._id) !== memberId && body.role !== 'admin') {
      const target = await db.collection('users').findOne({ _id: new ObjectId(memberId) }, { projection: { role: 1, approvalStatus: 1, verifiedAt: 1 } });
      if (target?.role === 'admin' && isApproved(target)) {
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
    const member = await db.collection('users').findOne({ _id: new ObjectId(memberId) });
    if (!member) throw new HttpError(404, 'Member not found.');
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
  if (!Object.keys(update).length) throw new HttpError(400, 'No member settings were provided.');
  const unset = body.approvalStatus === 'pending' ? { approvedAt: '', approvedBy: '' } : undefined;
  const operation = { $set: update, ...(unset ? { $unset: unset } : {}) };
  const result = await db.collection('users').updateOne({ _id: new ObjectId(memberId) }, operation);
  if (!result.matchedCount) throw new HttpError(404, 'Member not found.');
  if (body.approvalStatus === 'pending') await db.collection('sessions').deleteMany({ userId: new ObjectId(memberId) });
  return { ok: true, approvalStatus: body.approvalStatus };
}

async function deleteMember(db, user, memberId) {
  requireRole(user, 'admin');
  if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.');
  if (String(user._id) === memberId) throw new HttpError(400, 'You cannot delete your own administrator account.');
  const id = new ObjectId(memberId);
  const member = await db.collection('users').findOne({ _id: id }, { projection: { role: 1, approvalStatus: 1, verifiedAt: 1 } });
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
  return { ok: true };
}

export async function handleApiNode(req, res) {
  const url = normalizedUrl(req.url || '/');
  const method = String(req.method || 'GET').toUpperCase();
  let db;
  try {
    if (url.pathname === '/api/integrations/github/webhook' && method === 'POST') {
      db = await getDatabase();
      return json(res, 200, await githubWebhook(db, req));
    }
    if (url.pathname === '/api/auth/github/callback' && method === 'GET') {
      db = await getDatabase();
      return await githubCallback(db, req, res, url);
    }
    if (url.pathname === '/api/auth/github/start' && method === 'GET') {
      db = await getDatabase();
      return await githubStart(db, req, res);
    }
    if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req);
    db = await getDatabase();

    if (url.pathname === '/api/auth/register' && method === 'POST') return await signup(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/login' && method === 'POST') return await login(db, req, res, await readBody(req));
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      const token = getCookie(req, 'dsavation_session');
      if (token) await db.collection('sessions').deleteOne({ tokenHash: hash(token) });
      clearCookie(res, req, 'dsavation_session');
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/auth/me' && method === 'GET') return json(res, 200, { user: account(await currentUser(req, db)) });
    if (url.pathname === '/api/auth/profile' && method === 'PATCH') {
      const user = await requireUser(req, db);
      const body = await readBody(req);
      if (typeof body.showPublic !== 'boolean') throw new HttpError(400, 'Choose whether your name appears on the public club board.');
      await db.collection('users').updateOne({ _id: user._id }, { $set: { showPublic: body.showPublic, updatedAt: new Date() } });
      return json(res, 200, { ok: true, user: account({ ...user, showPublic: body.showPublic }) });
    }

    if (url.pathname === '/api/club/today' && method === 'GET') return json(res, 200, await getClubToday(db));
    if (url.pathname === '/api/club/assignments' && method === 'GET') return json(res, 200, { assignments: await assignmentHistory(db) });
    if (url.pathname === '/api/club/leaderboard' && method === 'GET') return json(res, 200, { leaderboard: await leaderboard(db) });

    const user = await requireUser(req, db);
    if (url.pathname === '/api/progress' && method === 'GET') {
      const progress = await db.collection('personalProgress').find({ userId: user._id }).sort({ solvedAt: -1 }).toArray();
      return json(res, 200, { progress: progress.map((item) => ({ questionId: item.questionId, solvedAt: item.solvedAt })) });
    }
    const progressMatch = url.pathname.match(/^\/api\/progress\/(\d+)$/);
    if (progressMatch && method === 'PUT') {
      const body = await readBody(req);
      await setProgress(db, user, progressMatch[1], Boolean(body.solved));
      return json(res, 200, { ok: true, questionId: Number(progressMatch[1]), solved: Boolean(body.solved) });
    }
    if (url.pathname === '/api/submissions' && method === 'GET') return json(res, 200, { submissions: await listSubmissions(db, req, user, url) });
    if (url.pathname === '/api/submissions' && method === 'POST') {
      const submission = await makeSubmission(db, req, user, await readBody(req));
      return json(res, 201, { ok: true, submission: { status: submission.status, commitUrl: submission.commitUrl } });
    }
    if (url.pathname === '/api/admin/assignments' && method === 'POST') {
      return json(res, 201, { assignment: await createAssignment(db, user, await readBody(req)) });
    }
    if (url.pathname === '/api/admin/submissions' && method === 'GET') {
      return json(res, 200, { submissions: await listSubmissions(db, req, user, url) });
    }
    const reviewMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-f0-9]{24})$/i);
    if (reviewMatch && method === 'PATCH') {
      return json(res, 200, await reviewSubmission(db, user, reviewMatch[1], await readBody(req)));
    }
    if (url.pathname === '/api/admin/members' && method === 'GET') {
      requireRole(user, 'admin');
      return json(res, 200, { members: await listMembers(db) });
    }
    const memberMatch = url.pathname.match(/^\/api\/admin\/members\/([a-f0-9]{24})$/i);
    if (memberMatch && method === 'PATCH') {
      return json(res, 200, await updateMember(db, user, memberMatch[1], await readBody(req)));
    }
    if (memberMatch && method === 'DELETE') {
      return json(res, 200, await deleteMember(db, user, memberMatch[1]));
    }
    return json(res, 404, { error: 'API route not found.' });
  } catch (error) {
    if (error?.code === 11000) return json(res, 409, { error: 'This record already exists. Refresh and try again.' });
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('DSAvation API error:', error?.message || 'Unknown error');
    return json(res, status, { error: status >= 500 && status !== 503 ? 'The request could not be completed. Try again shortly.' : error.message });
  }
}

export async function handleApiFetch(request) {
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
    setHeader(name, value) { responseHeaders.set(name, value); },
    end(value = '') { this.body = value; },
  };
  await handleApiNode({
    url: `${requestUrl.pathname}${requestUrl.search}`,
    method: request.method, headers, body, rawBody,
  }, res);
  return new Response(res.body, { status: res.statusCode, headers: responseHeaders });
}
