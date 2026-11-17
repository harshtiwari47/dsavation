import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { autoAssignDailyQuestion, getNextMidnightIST, getNextQuestionForDate, handleApiFetch, isAssignmentSolutionPath, isOnAssignmentDay, parsePersonalCommitUrl, resolveCommitInput } from '../server/api.js';

const hashToken = (value) => createHash('sha256').update(value).digest('hex');

const indiaDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dateAtIndiaNoon = (dateKey) => new Date(`${dateKey}T12:00:00+05:30`);
const commits = new Map();
const commitTrees = new Map();
let originalFetch;
let originalAdminEmails;
let originalSecureCookie;
let oauthGithubUsername = 'canonical-github-user';
let leetcodePayload;
let leetcodeRecentPayload;
let leetcodeFetchCount = 0;

function equalValue(left, right) {
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right);
  return left === right;
}

function matchesValue(value, expected) {
  if (expected instanceof RegExp) return expected.test(String(value ?? ''));
  if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId) && !Array.isArray(expected)) {
    for (const [operator, operand] of Object.entries(expected)) {
      if (operator === '$exists' && (value !== undefined) !== operand) return false;
      if (operator === '$ne' && (operand === null ? value == null : equalValue(value, operand))) return false;
      if (operator === '$gt' && !(new Date(value).getTime() > new Date(operand).getTime())) return false;
      if (operator === '$gte' && !(new Date(value).getTime() >= new Date(operand).getTime())) return false;
      if (operator === '$lte' && !(String(value) <= String(operand))) return false;
      if (operator === '$in' && !operand.some((candidate) => equalValue(value, candidate))) return false;
      if (operator === '$type' && !(typeof value === operand || (operand === 'string' && typeof value === 'string'))) return false;
      if (!['$exists', '$ne', '$gt', '$gte', '$lte', '$in', '$type'].includes(operator)) return false;
    }
    return true;
  }
  return equalValue(value, expected);
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((item) => matches(document, item));
    if (key === '$and') return expected.every((item) => matches(document, item));
    return matchesValue(document[key], expected);
  });
}

function applyUpdate(document, update) {
  if (!Object.keys(update).some((key) => key.startsWith('$'))) {
    for (const key of Object.keys(document)) delete document[key];
    Object.assign(document, update);
    return;
  }
  for (const [key, value] of Object.entries(update.$set || {})) document[key] = value;
  for (const [key, value] of Object.entries(update.$inc || {})) document[key] = (document[key] || 0) + value;
  for (const [key, value] of Object.entries(update.$push || {})) {
    if (!Array.isArray(document[key])) document[key] = [];
    document[key].push(value);
  }
  for (const key of Object.keys(update.$unset || {})) delete document[key];
}

class FakeCursor {
  constructor(documents) { this.documents = documents; this.offset = 0; this.count = Infinity; }
  sort(specification) {
    const keys = Object.entries(specification);
    this.documents.sort((left, right) => {
      for (const [key, direction] of keys) {
        const a = left[key]; const b = right[key];
        const av = a instanceof Date ? a.getTime() : String(a ?? '');
        const bv = b instanceof Date ? b.getTime() : String(b ?? '');
        if (av < bv) return -direction;
        if (av > bv) return direction;
      }
      return 0;
    });
    return this;
  }
  collation() { return this; }
  skip(amount) { this.offset = amount; return this; }
  limit(amount) { this.count = amount; return this; }
  async toArray() { return this.documents.slice(this.offset, this.offset + this.count); }
}

class FakeCollection {
  constructor() { this.documents = []; }
  async findOne(filter = {}) { return this.documents.find((document) => matches(document, filter)) || null; }
  find(filter = {}) { return new FakeCursor(this.documents.filter((document) => matches(document, filter))); }
  async insertOne(document) {
    const inserted = { ...document, _id: document._id || new ObjectId() };
    this.documents.push(inserted);
    return { insertedId: inserted._id };
  }
  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((item) => matches(item, filter));
    if (!document && options.upsert) {
      document = Object.fromEntries(Object.entries(filter).filter(([, value]) => !(value && typeof value === 'object' && Object.keys(value).some((key) => key.startsWith('$')))));
      document._id ??= new ObjectId();
      Object.assign(document, update.$setOnInsert || {});
      this.documents.push(document);
      applyUpdate(document, update);
      return { matchedCount: 0, upsertedId: document._id, modifiedCount: 0 };
    }
    if (!document) return { matchedCount: 0, modifiedCount: 0 };
    applyUpdate(document, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async updateMany(filter, update) {
    const documents = this.documents.filter((item) => matches(item, filter));
    for (const document of documents) applyUpdate(document, update);
    return { matchedCount: documents.length, modifiedCount: documents.length };
  }
  async deleteOne(filter) {
    const index = this.documents.findIndex((item) => matches(item, filter));
    if (index < 0) return { deletedCount: 0 };
    this.documents.splice(index, 1);
    return { deletedCount: 1 };
  }
  async deleteMany(filter) {
    const beforeCount = this.documents.length;
    this.documents = this.documents.filter((item) => !matches(item, filter));
    return { deletedCount: beforeCount - this.documents.length };
  }
  async countDocuments(filter = {}) { return this.documents.filter((item) => matches(item, filter)).length; }
  aggregate(pipeline) {
    const accepted = this.documents.filter((item) => matches(item, pipeline[0]?.$match || {}));
    const groups = new Map();
    for (const item of accepted) {
      const id = String(item.userId);
      const row = groups.get(id) || { _id: item.userId, accepted: 0, points: 0, acceptedAssignments: [], lastAcceptedAt: null };
      row.accepted += 1;
      row.points += item.points ?? 1;
      if (!row.acceptedAssignments.some((assignment) => String(assignment) === String(item.assignmentId))) row.acceptedAssignments.push(item.assignmentId);
      if (!row.lastAcceptedAt || new Date(item.reviewedAt || 0) > new Date(row.lastAcceptedAt)) row.lastAcceptedAt = item.reviewedAt;
      groups.set(id, row);
    }
    return new FakeCursor([...groups.values()]);
  }
}

class FakeDatabase {
  constructor() { this.collections = new Map(); }
  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name);
  }
}

async function call(db, path, { method = 'GET', body, cookie = '' } = {}) {
  const headers = { origin: 'http://localhost', host: 'localhost' };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await handleApiFetch(new Request(`http://localhost/api${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), { db });
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  return {
    response,
    data: isJson ? await response.json() : null,
    text: !isJson ? await response.text() : null,
  };
}

async function seedUser(db, { name, email, username, role = 'member', approved = true, leetcodeUsername = 'leet-id', department = 'Computer Science', studyYear = 'third-year', showPublic = true, leetcodeApproval = 'approved' }) {
  const user = {
    _id: new ObjectId(), name, department, studyYear,
    email, passwordHash: await bcrypt.hash('correct-horse-123', 4),
    githubUsername: username, githubUserLower: username.toLowerCase(), githubId: 100,
    githubVerifiedAt: new Date(), leetcodeUsername, showPublic, role,
    leetcodeApproval,
    approvalStatus: approved ? 'approved' : 'pending', approvedAt: approved ? new Date() : null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  await db.collection('users').insertOne(user);
  let cookie = '';
  if (approved) {
    const login = await call(db, '/auth/login', { method: 'POST', body: { email, password: 'correct-horse-123' } });
    cookie = login.response.headers.get('set-cookie')?.split(';')[0] || '';
  }
  return { user, cookie };
}

async function seedAdmin(db) {
  return seedUser(db, { name: 'Club Admin', email: 'admin@abes.ac.in', username: 'club-admin', role: 'admin' });
}

function commitFixture({ sha, username = 'student-gh', questionId = 217, date = indiaDay() } = {}) {
  const timestamp = dateAtIndiaNoon(date).toISOString();
  commitTrees.set(sha, [{ path: `${questionId}/solution.txt`, type: 'blob', size: 128 }]);
  return {
    sha, html_url: `https://github.com/${username}/dsa-solutions/commit/${sha}`,
    author: { login: username }, committer: { login: username },
    commit: { author: { date: timestamp }, committer: { date: timestamp }, tree: { sha } },
    files: [{ filename: `${questionId}/solution.txt`, status: 'added' }],
  };
}

before(() => {
  originalFetch = globalThis.fetch;
  originalAdminEmails = process.env.ADMIN_EMAILS;
  originalSecureCookie = process.env.SESSION_COOKIE_SECURE;
  process.env.ADMIN_EMAILS = 'admin@abes.ac.in';
  process.env.SESSION_COOKIE_SECURE = 'false';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'leetcode.com' && url.pathname === '/graphql/') {
      leetcodeFetchCount += 1;
      const bodyStr = String(init?.body || '');
      if (bodyStr.includes('recentSubmissionList')) {
        return new Response(JSON.stringify(leetcodeRecentPayload || { data: { recentSubmissionList: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify(leetcodePayload || { data: { matchedUser: null } }), { status: 200 });
    }
    if (url.hostname === 'github.com' && url.pathname === '/login/oauth/access_token') {
      return new Response(JSON.stringify({ access_token: 'test-github-access-token' }), { status: 200 });
    }
    if (url.hostname === 'api.github.com' && url.pathname === '/user') {
      return new Response(JSON.stringify({ id: 4321, login: oauthGithubUsername }), { status: 200 });
    }
    if (url.hostname === 'api.github.com' && url.pathname.startsWith('/users/')) {
      const parts = url.pathname.split('/');
      if (parts[parts.length - 1] === 'repos') {
        return new Response(JSON.stringify([{ name: 'dsa-solutions', full_name: 'student-gh/dsa-solutions' }]), { status: 200 });
      }
      const login = decodeURIComponent(parts.pop());
      return new Response(JSON.stringify({ id: 987, login }), { status: 200 });
    }
    if (url.hostname === 'api.github.com' && url.pathname.includes('/git/trees/')) {
      const treeSha = url.pathname.split('/').pop();
      const tree = commitTrees.get(treeSha);
      return new Response(JSON.stringify({ tree: tree || [], truncated: false }), { status: tree ? 200 : 404 });
    }
    if (url.hostname === 'api.github.com' && url.pathname.endsWith('/commits')) {
      const allCommits = [...commits.values()];
      return new Response(JSON.stringify(allCommits), { status: 200 });
    }
    const sha = url.pathname.split('/').pop();
    const commit = commits.get(sha) || [...commits.entries()].find(([k]) => k.startsWith(sha))?.[1];
    return new Response(JSON.stringify(commit || { message: 'Not Found' }), { status: commit ? 200 : 404 });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdminEmails;
  if (originalSecureCookie === undefined) delete process.env.SESSION_COOKIE_SECURE;
  else process.env.SESSION_COOKIE_SECURE = originalSecureCookie;
});

beforeEach(() => { commits.clear(); commitTrees.clear(); leetcodePayload = null; leetcodeRecentPayload = null; leetcodeFetchCount = 0; });

test('commit links, solution paths, and India assignment dates reject malformed or nested values', () => {
  assert.deepEqual(parsePersonalCommitUrl('https://github.com/alex/dsa/commit/abcdef0123456789'), { owner: 'alex', repository: 'dsa', sha: 'abcdef0123456789' });
  assert.equal(parsePersonalCommitUrl('https://github.com/alex/dsa/blob/main/217/Solution.cpp'), null);
  assert.equal(parsePersonalCommitUrl('http://github.com/alex/dsa/commit/abcdef0'), null);
  assert.equal(isAssignmentSolutionPath('217/solution.txt', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.cpp', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.py', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.java', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.js', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.c', 217), true);
  assert.equal(isAssignmentSolutionPath('217/solution.rs', 217), false);
  assert.equal(isAssignmentSolutionPath('217/Solution.txt', 217), false);
  assert.equal(isAssignmentSolutionPath('217/src/solution.txt', 217), false);
  assert.equal(isAssignmentSolutionPath('218/solution.txt', 217), false);
  assert.equal(isOnAssignmentDay('2026-10-28T18:29:59.000Z', '2026-10-28'), true);
  assert.equal(isOnAssignmentDay('2026-10-28T18:30:00.000Z', '2026-10-28'), false);
  assert.equal(isOnAssignmentDay('not-a-date', '2026-10-28'), false);
});

test('signup stores a password hash and login distinguishes unknown account, wrong password, and pending approval', async () => {
  const db = new FakeDatabase();
  const signup = await call(db, '/auth/register', {
    method: 'POST', body: {
      name: 'New Student', department: 'Computer Science', studyYear: 'second-year',
      email: 'student@abes.ac.in', password: 'correct-horse-123', githubUsername: 'new-student',
      leetcodeUsername: 'new-leet-id',
    }
  });
  assert.equal(signup.response.status, 201);
  assert.equal(signup.data.approvalStatus, 'pending');
  const stored = db.collection('users').documents[0];
  assert.notEqual(stored.passwordHash, 'correct-horse-123');
  assert.equal(await bcrypt.compare('correct-horse-123', stored.passwordHash), true);
  assert.equal(stored.leetcodeUsername, 'new-leet-id');

  const wrong = await call(db, '/auth/login', { method: 'POST', body: { email: 'student@abes.ac.in', password: 'wrong-password' } });
  assert.equal(wrong.response.status, 401);
  assert.match(wrong.data.error, /password is incorrect/i);
  const unknown = await call(db, '/auth/login', { method: 'POST', body: { email: 'missing@abes.ac.in', password: 'wrong-password' } });
  assert.equal(unknown.response.status, 404);
  assert.match(unknown.data.error, /no account/i);
  const pending = await call(db, '/auth/login', { method: 'POST', body: { email: 'student@abes.ac.in', password: 'correct-horse-123' } });
  assert.equal(pending.response.status, 403);
  assert.match(pending.data.error, /not currently approved/i);

  const missingLeet = await call(db, '/auth/register', {
    method: 'POST', body: {
      name: 'Second Student', department: 'Computer Science', studyYear: 'second-year',
      email: 'second@abes.ac.in', password: 'correct-horse-123', githubUsername: 'second-student',
    }
  });
  assert.equal(missingLeet.response.status, 400);
  assert.match(missingLeet.data.error, /leetcode username/i);
});

test('authenticated profile and private-progress APIs validate and persist member fields', async () => {
  const db = new FakeDatabase();
  const { user, cookie } = await seedUser(db, { name: 'A Student', email: 'a@abes.ac.in', username: 'student-gh' });
  const anonymous = await call(db, '/questions');
  assert.equal(anonymous.response.status, 401);
  const library = await call(db, '/questions', { cookie });
  assert.equal(library.response.status, 200);
  assert.equal(library.data.questions.length, 220);

  const update = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      name: 'A Student Updated', department: 'Information Technology', studyYear: 'fourth-year',
      githubUsername: 'student-gh', leetcodeUsername: 'leet-updated', showPublic: true,
      avatarStyle: 'micah', avatarSeed: 'avatar-account-choice-1',
    }
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.data.user.leetcodeUsername, 'leet-updated');
  assert.equal(update.data.user.studyYear, 'fourth-year');
  assert.equal(update.data.user.avatarStyle, 'micah');
  assert.equal(update.data.user.avatarSeed, 'avatar-account-choice-1');
  assert.equal(update.data.user.defaultSubmissionMethod, 'github');

  const updateSubmissionMethod = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      name: 'A Student Updated', department: 'Information Technology', studyYear: 'fourth-year',
      defaultSubmissionMethod: 'leetcode',
    }
  });
  assert.equal(updateSubmissionMethod.response.status, 200);
  assert.equal(updateSubmissionMethod.data.user.defaultSubmissionMethod, 'leetcode');

  const invalidSubmissionMethod = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      name: 'A Student Updated', department: 'Information Technology', studyYear: 'fourth-year',
      defaultSubmissionMethod: 'unknown-service',
    }
  });
  assert.equal(invalidSubmissionMethod.response.status, 400);

  const invalidAvatarStyle = await call(db, '/auth/profile', { method: 'PATCH', cookie, body: { avatarStyle: 'not-a-style' } });
  assert.equal(invalidAvatarStyle.response.status, 400);
  const invalidAvatarSeed = await call(db, '/auth/profile', { method: 'PATCH', cookie, body: { avatarSeed: 'invalid seed !' } });
  assert.equal(invalidAvatarSeed.response.status, 400);

  const customAvatar = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      avatarStyle: 'custom', avatarUrl: 'https://example.com/custom-avatar.png',
    }
  });
  assert.equal(customAvatar.response.status, 200);
  assert.equal(customAvatar.data.user.avatarStyle, 'custom');
  assert.equal(customAvatar.data.user.avatarUrl, 'https://example.com/custom-avatar.png');

  const invalidCustomUrl = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      avatarStyle: 'custom', avatarUrl: 'not-a-valid-url',
    }
  });
  assert.equal(invalidCustomUrl.response.status, 400);
  const newGithub = await call(db, '/auth/profile', {
    method: 'PATCH', cookie, body: {
      name: 'A Student Updated', department: 'Information Technology', studyYear: 'fourth-year',
      githubUsername: 'student-new-gh', leetcodeUsername: 'leet-updated',
    }
  });
  assert.equal(newGithub.response.status, 200);
  assert.equal(newGithub.data.user.githubVerified, false);
  assert.equal(db.collection('users').documents.find((item) => String(item._id) === String(user._id)).githubVerifiedAt, null);

  const solved = await call(db, '/progress/217', { method: 'PUT', cookie, body: { solved: true } });
  assert.equal(solved.response.status, 200);
  const progress = await call(db, '/progress', { cookie });
  assert.deepEqual(progress.data.progress.map((item) => item.questionId), [217]);
  const other = await seedUser(db, { name: 'Another Student', email: 'b@abes.ac.in', username: 'another-gh' });
  const emptyProgress = await call(db, '/progress', { cookie: other.cookie });
  assert.deepEqual(emptyProgress.data.progress, []);
  const invalidQuestion = await call(db, '/progress/999999', { method: 'PUT', cookie, body: { solved: true } });
  assert.equal(invalidQuestion.response.status, 404);
  const me = await call(db, '/auth/me', { cookie });
  assert.equal(me.data.user.leetcodeUsername, 'leet-updated');
  const logout = await call(db, '/auth/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.response.status, 200);
  const signedOut = await call(db, '/auth/me', { cookie });
  assert.equal(signedOut.data.user, null);
  assert.equal(String(user._id).length, 24);
});

test('GitHub OAuth username becomes canonical and members can disconnect the linked account', async () => {
  const db = new FakeDatabase();
  const member = await seedUser(db, { name: 'GitHub Member', email: 'github-member@abes.ac.in', username: 'typed-at-signup' });
  const oldClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const oldClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  process.env.GITHUB_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-client-secret';
  oauthGithubUsername = 'canonical-github-user';
  try {
    const start = await handleApiFetch(new Request('http://localhost/api/auth/github/start', {
      headers: { host: 'localhost', cookie: member.cookie },
    }), { db });
    assert.equal(start.status, 302);
    const stateCookie = start.headers.get('set-cookie');
    const state = stateCookie?.match(/dsavation_github_state=([^;]+)/)?.[1];
    assert.ok(state);
    const callback = await handleApiFetch(new Request(`http://localhost/api/auth/github/callback?code=oauth-code&state=${state}`, {
      headers: { host: 'localhost', cookie: `${member.cookie}; dsavation_github_state=${state}` },
    }), { db });
    assert.equal(callback.status, 302);
    const connected = await call(db, '/auth/me', { cookie: member.cookie });
    assert.equal(connected.data.user.githubUsername, oauthGithubUsername);
    assert.equal(connected.data.user.githubVerified, true);
    const stored = db.collection('users').documents.find((item) => String(item._id) === String(member.user._id));
    assert.equal(stored.githubUserLower, oauthGithubUsername);

    const disconnected = await call(db, '/auth/github', { method: 'DELETE', cookie: member.cookie });
    assert.equal(disconnected.response.status, 200);
    assert.equal(disconnected.data.user.githubUsername, '');
    assert.equal(disconnected.data.user.githubVerified, false);
    assert.equal(stored.githubUserLower, undefined);
    const blockedSubmission = await call(db, '/submissions', { method: 'POST', cookie: member.cookie, body: {} });
    assert.equal(blockedSubmission.response.status, 403);
    assert.match(blockedSubmission.data.error, /link your verified github/i);
  } finally {
    if (oldClientId === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
    else process.env.GITHUB_OAUTH_CLIENT_ID = oldClientId;
    if (oldClientSecret === undefined) delete process.env.GITHUB_OAUTH_CLIENT_SECRET;
    else process.env.GITHUB_OAUTH_CLIENT_SECRET = oldClientSecret;
  }
});

test('member directory requires an approved login, filters profiles, paginates, and excludes email and private progress', async () => {
  const db = new FakeDatabase();
  const viewer = await seedUser(db, { name: 'Directory Viewer', email: 'viewer@abes.ac.in', username: 'directory-viewer', department: 'Electronics', studyYear: 'fourth-year' });
  for (let index = 1; index <= 3; index += 1) {
    await seedUser(db, { name: `Directory Student ${index}`, email: `directory${index}@abes.ac.in`, username: `directory-student-${index}`, department: 'Computer Science', studyYear: 'second-year' });
  }
  const pending = await seedUser(db, { name: 'Pending Directory Student', email: 'pending-directory@abes.ac.in', username: 'pending-directory', department: 'Computer Science', studyYear: 'second-year' });
  await db.collection('users').updateOne({ _id: pending.user._id }, { $set: { approvalStatus: 'pending' } });
  const anonymous = await call(db, '/members');
  assert.equal(anonymous.response.status, 401);

  const firstPage = await call(db, '/members?department=Computer%20Science&year=second-year&page=1&pageSize=2', { cookie: viewer.cookie });
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.data.pagination.total, 3);
  assert.equal(firstPage.data.pagination.totalPages, 2);
  assert.equal(firstPage.data.members.length, 2);
  assert.equal(firstPage.data.departments.includes('Electronics'), true);
  for (const member of firstPage.data.members) {
    assert.equal(member.department, 'Computer Science');
    assert.equal(member.studyYear, 'second-year');
    assert.equal(Object.hasOwn(member, 'email'), false);
    assert.equal(Object.hasOwn(member, 'progress'), false);
    // General user cannot see other members' LeetCode usernames:
    assert.equal(member.leetcodeUsername, '');
  }
  // But an admin can see members' LeetCode usernames:
  const adminViewer = await seedAdmin(db);
  const adminDirectory = await call(db, '/members?department=Computer%20Science&year=second-year&page=1&pageSize=2', { cookie: adminViewer.cookie });
  assert.equal(adminDirectory.response.status, 200);
  assert.equal(adminDirectory.data.members[0].leetcodeUsername, 'leet-id');
  assert.equal(typeof adminDirectory.data.members[0].email, 'string');
  assert.ok(adminDirectory.data.members[0].email.length > 0);

  const lastPage = await call(db, '/members?department=Computer%20Science&year=second-year&page=2&pageSize=2', { cookie: viewer.cookie });
  assert.equal(lastPage.data.members.length, 1);
  const escapedSearch = await call(db, '/members?q=Directory%20Student%201', { cookie: viewer.cookie });
  assert.equal(escapedSearch.data.pagination.total, 1);
  assert.equal(escapedSearch.data.members[0].name, 'Directory Student 1');
  const invalidYear = await call(db, '/members?year=graduate', { cookie: viewer.cookie });
  assert.equal(invalidYear.response.status, 400);
});

test('LeetCode profile statistics are restricted to admins, fetched on demand and cached for subsequent member views', async () => {
  const db = new FakeDatabase();
  const regularViewer = await seedUser(db, { name: 'Regular Viewer', email: 'regular-viewer@abes.ac.in', username: 'regular-viewer' });
  const adminViewer = await seedAdmin(db);
  const member = await seedUser(db, { name: 'Stats Member', email: 'stats-member@abes.ac.in', username: 'stats-member', leetcodeUsername: 'stats-member-lc' });
  leetcodePayload = {
    data: {
      matchedUser: {
        username: 'stats-member-lc', submitStats: {
          acSubmissionNum: [{ difficulty: 'All', count: 24 }, { difficulty: 'Easy', count: 10 }, { difficulty: 'Medium', count: 11 }, { difficulty: 'Hard', count: 3 }],
          totalSubmissionNum: [{ difficulty: 'All', count: 37 }, { difficulty: 'Easy', count: 14 }, { difficulty: 'Medium', count: 17 }, { difficulty: 'Hard', count: 6 }],
        }
      }
    }
  };
  const path = `/members/${member.user._id}/leetcode-stats`;

  // Regular member cannot view other member's LeetCode stats
  const denied = await call(db, path, { cookie: regularViewer.cookie });
  assert.equal(denied.response.status, 403);
  assert.match(denied.data.error, /administrators can view other members’ LeetCode statistics/i);

  // Admin can view member's LeetCode stats
  const first = await call(db, path, { cookie: adminViewer.cookie });
  assert.equal(first.response.status, 200);
  assert.equal(first.data.available, true);
  assert.equal(first.data.stats.solvedCount, 24);
  assert.equal(first.data.stats.attemptedCount, 37);
  assert.equal(first.data.stats.byDifficulty.find((item) => item.difficulty === 'Medium').solved, 11);
  assert.equal(first.data.cached, false);
  assert.equal(leetcodeFetchCount, 1);

  const cached = await call(db, path, { cookie: adminViewer.cookie });
  assert.equal(cached.data.available, true);
  assert.equal(cached.data.cached, true);
  assert.equal(leetcodeFetchCount, 1);
});

test('personal-repo commits score automatically, admin adjustments and assignment correction are audited', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Daily Solver', email: 'solver@abes.ac.in', username: 'student-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  assert.equal(assigned.response.status, 201);
  const assignmentId = assigned.data.assignment.id;
  const secondAssignment = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 242 } });
  assert.equal(secondAssignment.response.status, 409);
  const sha = 'a'.repeat(40);
  commits.set(sha, commitFixture({ sha, questionId: 217 }));
  const submission = await call(db, '/submissions', {
    method: 'POST', cookie: student.cookie, body: {
      assignmentId, commitUrl: `https://github.com/student-gh/dsa-solutions/commit/${sha}`,
    }
  });
  assert.equal(submission.response.status, 201);
  assert.equal(submission.data.submission.status, 'accepted');
  assert.equal(submission.data.submission.points, 1);
  const completedProgress = await call(db, '/progress', { cookie: student.cookie });
  const completedQuestion = completedProgress.data.progress.find((item) => item.questionId === 217);
  assert.equal(completedQuestion.isClub, true);
  assert.equal(completedProgress.data.activity.some((item) => item.questionId === 217), true);
  const unmarkCompleted = await call(db, '/progress/217', {
    method: 'PUT', cookie: student.cookie, body: { solved: false },
  });
  assert.equal(unmarkCompleted.response.status, 403);
  const duplicate = await call(db, '/submissions', {
    method: 'POST', cookie: student.cookie, body: {
      assignmentId, commitUrl: `https://github.com/student-gh/dsa-solutions/commit/${sha}`,
    }
  });
  assert.equal(duplicate.response.status, 409);

  const board = await call(db, '/club/leaderboard?page=1&pageSize=1');
  assert.equal(board.data.pagination.total, 2);
  assert.equal(board.data.leaderboard[0].githubUsername, 'student-gh');
  assert.equal(board.data.leaderboard[0].points, 1);
  assert.equal(board.data.leaderboard[0].punctuality, 100);
  const scored = await call(db, '/admin/submissions?status=accepted&page=1&pageSize=10', { cookie: admin.cookie });
  assert.equal(scored.data.pagination.total, 1);
  const scoredId = scored.data.submissions[0].id;
  const deniedAdjust = await call(db, `/admin/submissions/${scoredId}`, { method: 'PATCH', cookie: student.cookie, body: { points: 0 } });
  assert.equal(deniedAdjust.response.status, 403);
  const adjust = await call(db, `/admin/submissions/${scoredId}`, { method: 'PATCH', cookie: admin.cookie, body: { points: 0, note: 'Late review adjustment' } });
  assert.equal(adjust.response.status, 200);
  assert.equal(adjust.data.points, 0);

  const changed = await call(db, `/admin/assignments/${assignmentId}`, { method: 'PATCH', cookie: admin.cookie, body: { questionId: 242 } });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.data.assignment.invalidatedSubmissions, 1);
  const emptyToday = await call(db, '/club/today', { cookie: student.cookie });
  assert.equal(emptyToday.data.submittedCount, 0);
  assert.equal(emptyToday.data.acceptedCount, 0);
  const memberHistory = await call(db, '/submissions', { cookie: student.cookie });
  assert.equal(memberHistory.data.submissions[0].status, 'invalidated');
  assert.equal(memberHistory.data.submissions[0].assignment.questionId, 217);

  const nextSha = 'b'.repeat(40);
  commits.set(nextSha, commitFixture({ sha: nextSha, questionId: 242 }));
  const resubmit = await call(db, '/submissions', {
    method: 'POST', cookie: student.cookie, body: {
      assignmentId, commitUrl: `https://github.com/student-gh/dsa-solutions/commit/${nextSha}`,
    }
  });
  assert.equal(resubmit.response.status, 201);
  assert.equal(resubmit.data.submission.points, 1);
  assert.equal(db.collection('submissions').documents.length, 1);
  assert.equal(db.collection('submissions').documents[0].supersededAttempts.length, 1);
  const correctedToday = await call(db, '/club/today', { cookie: student.cookie });
  assert.equal(correctedToday.data.submittedCount, 1);
  assert.equal(correctedToday.data.acceptedCount, 1);

  const activity = await call(db, '/admin/activity?page=1&pageSize=50', { cookie: admin.cookie });
  const actions = activity.data.activity.map((entry) => entry.action);
  assert.ok(actions.includes('assignment_published'));
  assert.ok(actions.includes('submission_points_adjusted'));
  assert.ok(actions.includes('assignment_changed'));
  const logPage = await call(db, '/club/assignments?page=1&pageSize=1', { cookie: student.cookie });
  assert.equal(logPage.data.pagination.total, 1);
  assert.equal(logPage.data.assignments[0].questionId, 242);
});

test('commit verification rejects mismatches and accepts a linked author with GitHub web-flow committer', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Daily Solver', email: 'solver@abes.ac.in', username: 'student-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  const assignmentId = assigned.data.assignment.id;
  const submit = async (url, submittedAssignmentId = assignmentId) => {
    await db.collection('rateLimits').deleteMany({});
    return call(db, '/submissions', { method: 'POST', cookie: student.cookie, body: { assignmentId: submittedAssignmentId, commitUrl: url } });
  };
  const hash = (char) => char.repeat(40);

  const ownerSha = hash('c'); commits.set(ownerSha, commitFixture({ sha: ownerSha }));
  assert.equal((await submit(`https://github.com/someone-else/repo/commit/${ownerSha}`)).response.status, 403);
  const authorSha = hash('d'); commits.set(authorSha, { ...commitFixture({ sha: authorSha }), author: { login: 'other-user' } });
  assert.equal((await submit(`https://github.com/student-gh/repo/commit/${authorSha}`)).response.status, 403);
  const dateSha = hash('e'); commits.set(dateSha, commitFixture({ sha: dateSha, date: '2020-01-01' }));
  assert.equal((await submit(`https://github.com/student-gh/repo/commit/${dateSha}`)).response.status, 400);
  const pathSha = hash('f'); commits.set(pathSha, { ...commitFixture({ sha: pathSha }), files: [{ filename: '217/src/solution.txt', status: 'added' }] });
  assert.equal((await submit(`https://github.com/student-gh/repo/commit/${pathSha}`)).response.status, 400);
  const wrongNameSha = hash('5'); commits.set(wrongNameSha, { ...commitFixture({ sha: wrongNameSha }), files: [{ filename: '217/Solution.java', status: 'added' }] });
  assert.equal((await submit(`https://github.com/student-gh/repo/commit/${wrongNameSha}`)).response.status, 400);
  const removedSha = hash('1'); commits.set(removedSha, { ...commitFixture({ sha: removedSha }), files: [{ filename: '217/solution.txt', status: 'removed' }] });
  assert.equal((await submit(`https://github.com/student-gh/repo/commit/${removedSha}`)).response.status, 400);
  const staleAssignment = await submit(`https://github.com/student-gh/repo/commit/${hash('2')}`, new ObjectId().toString());
  assert.equal(staleAssignment.response.status, 409);
  const emptySha = hash('4');
  commits.set(emptySha, commitFixture({ sha: emptySha }));
  commitTrees.set(emptySha, [{ path: '217/solution.txt', type: 'blob', size: 0 }]);
  const emptyFile = await submit(`https://github.com/student-gh/repo/commit/${emptySha}`);
  assert.equal(emptyFile.response.status, 400);
  assert.match(emptyFile.data.error, /solution\.txt must contain at least one byte/i);
  const webFlowSha = hash('3');
  const webFlowCommit = commitFixture({ sha: webFlowSha });
  webFlowCommit.committer = { login: 'web-flow' };
  commits.set(webFlowSha, webFlowCommit);
  const webFlowSubmission = await submit(`https://github.com/student-gh/repo/commit/${webFlowSha}`);
  assert.equal(webFlowSubmission.response.status, 201);
  assert.equal(webFlowSubmission.data.submission.status, 'accepted');
  assert.equal(webFlowSubmission.data.submission.points, 1);
});

test('same-day renamed or edited solution.txt is accepted when it is non-empty', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Daily Solver', email: 'solver@abes.ac.in', username: 'student-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  const sha = '8'.repeat(40);
  const renamedCommit = commitFixture({ sha });
  renamedCommit.files = [{ filename: '217/solution.txt', previous_filename: 'solutions/solution.txt', status: 'renamed', additions: 0, deletions: 0, changes: 0 }];
  commitTrees.set(sha, [{ path: '217/solution.txt', type: 'blob', size: 84 }]);
  commits.set(sha, renamedCommit);
  const submission = await call(db, '/submissions', {
    method: 'POST', cookie: student.cookie, body: {
      assignmentId: assigned.data.assignment.id, commitUrl: `https://github.com/student-gh/dsa-solutions/commit/${sha}`,
    }
  });
  assert.equal(submission.response.status, 201);
  assert.equal(submission.data.submission.points, 1);
  assert.equal(db.collection('submissions').documents[0].solutionPath, '217/solution.txt');
  assert.equal(db.collection('submissions').documents[0].solutionSizeBytes, 84);

  const anotherStudent = await seedUser(db, { name: 'Another Solver', email: 'another@abes.ac.in', username: 'another-gh' });
  const modifiedSha = '9'.repeat(40);
  const modifiedCommit = commitFixture({ sha: modifiedSha, username: 'another-gh' });
  modifiedCommit.files = [{ filename: '217/solution.txt', status: 'modified' }];
  commitTrees.set(modifiedSha, [{ path: '217/solution.txt', type: 'blob', size: 102 }]);
  commits.set(modifiedSha, modifiedCommit);
  const editedSubmission = await call(db, '/submissions', {
    method: 'POST', cookie: anotherStudent.cookie, body: {
      assignmentId: assigned.data.assignment.id, commitUrl: `https://github.com/another-gh/dsa-solutions/commit/${modifiedSha}`,
    }
  });
  assert.equal(editedSubmission.response.status, 201);
  assert.equal(editedSubmission.data.submission.points, 1);
});

test('submitting solutions via short commit code or full URL automatically discovers repository and awards points', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Commit Code Solver', email: 'code@abes.ac.in', username: 'student-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  const assignmentId = assigned.data.assignment.id;

  const fullSha = '76c3f955e0a1de4701dbca40d5f4dab870b0d5ea';
  const shortSha = '76c3f95';
  commits.set(fullSha, commitFixture({ sha: fullSha, questionId: 217, username: 'student-gh' }));

  // 1. Submit using just short commit code '76c3f95'
  const subShort = await call(db, '/submissions', {
    method: 'POST',
    cookie: student.cookie,
    body: { assignmentId, commitUrl: shortSha }
  });
  assert.equal(subShort.response.status, 201);
  assert.equal(subShort.data.submission.status, 'accepted');
  assert.equal(subShort.data.submission.points, 1);
  assert.equal(subShort.data.submission.commitUrl, `https://github.com/student-gh/dsa-solutions/commit/${fullSha}`);

  const storedSubmission = await db.collection('submissions').findOne({ userId: student.user._id });
  assert.equal(storedSubmission.commitSha, fullSha);
  assert.equal(storedSubmission.repository, 'student-gh/dsa-solutions');

  // Check that user's lastRepository is remembered
  const updatedUser = await db.collection('users').findOne({ _id: student.user._id });
  assert.equal(updatedUser.lastRepository, 'dsa-solutions');

  // 2. Unit test resolveCommitInput directly with invalid formats and non-existent commits
  await assert.rejects(
    () => resolveCommitInput(db, student.user, ''),
    /Enter a GitHub commit hash/
  );
  await assert.rejects(
    () => resolveCommitInput(db, student.user, 'invalid#hash!'),
    /Enter a valid GitHub commit hash/
  );
  await assert.rejects(
    () => resolveCommitInput(db, student.user, 'fffffff'),
    /was not found in your recent public GitHub repositories/
  );
  await assert.rejects(
    () => resolveCommitInput(db, student.user, 'https://github.com/otheruser/dsa/commit/76c3f955e0a1de4701dbca40d5f4dab870b0d5ea'),
    /Use a repository owned by your linked GitHub account/
  );

  // 3. Shorthand formats: repo/commit/sha or repo@sha
  const resolvedRepoSha = await resolveCommitInput(db, student.user, 'dsa-solutions@76c3f95');
  assert.equal(resolvedRepoSha.repository, 'dsa-solutions');
  assert.equal(resolvedRepoSha.sha, '76c3f95');
});

test('admin password-reset endpoint is removed in favor of email workflow', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const member = await seedUser(db, { name: 'Reset Member', email: 'reset@abes.ac.in', username: 'reset-gh' });
  const generated = await call(db, `/admin/members/${member.user._id}/password-reset`, { method: 'POST', cookie: admin.cookie, body: {} });
  assert.equal(generated.response.status, 404);
});

test('public password reset workflow: email validation, token hashing, expiration, reuse, and login verification', async () => {
  const db = new FakeDatabase();
  const member = await seedUser(db, { name: 'Forgot Member', email: 'forgot@abes.ac.in', username: 'forgot-gh' });
  const pendingMember = await seedUser(db, { name: 'Pending Guy', email: 'pending@abes.ac.in', username: 'pending-gh', approved: false });

  // 1. Email validation on /auth/request-password-reset
  const emptyEmail = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: '' } });
  assert.equal(emptyEmail.response.status, 400);
  assert.equal(emptyEmail.data.error, 'Enter a valid email address.');

  const malformedEmail = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'not-an-email' } });
  assert.equal(malformedEmail.response.status, 400);

  const spacesEmail = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'user @example.com' } });
  assert.equal(spacesEmail.response.status, 400);

  const longEmail = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: `${'a'.repeat(250)}@test.com` } });
  assert.equal(longEmail.response.status, 400);

  // 2. Non-existent email returns 200 ok (no enumeration), but creates no reset token
  const nonExistent = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'nobody@abes.ac.in' } });
  assert.equal(nonExistent.response.status, 200);
  assert.equal(nonExistent.data.ok, true);
  assert.equal(db.collection('passwordResets').documents.length, 0);

  // 3. Pending (unapproved) account returns 200 ok, but creates no reset token
  const pendingAttempt = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'pending@abes.ac.in' } });
  assert.equal(pendingAttempt.response.status, 200);
  assert.equal(pendingAttempt.data.ok, true);
  assert.equal(db.collection('passwordResets').documents.length, 0);

  // 4. Approved member requesting reset creates a secure token hash
  const approvedReq = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'forgot@abes.ac.in' } });
  assert.equal(approvedReq.response.status, 200);
  assert.equal(approvedReq.data.ok, true);
  assert.equal(db.collection('passwordResets').documents.length, 1);
  const firstReset = db.collection('passwordResets').documents[0];
  assert.equal(String(firstReset.userId), String(member.user._id));
  assert.ok(firstReset.tokenHash);

  // 5. Requesting again invalidates/replaces previous reset token
  const secondReq = await call(db, '/auth/request-password-reset', { method: 'POST', body: { email: 'forgot@abes.ac.in' } });
  assert.equal(secondReq.response.status, 200);
  assert.equal(db.collection('passwordResets').documents.length, 1);
  const secondReset = db.collection('passwordResets').documents[0];
  assert.notEqual(String(secondReset._id), String(firstReset._id));

  // 6. Token validation on /auth/reset-password
  const invalidFormatToken = await call(db, '/auth/reset-password', { method: 'POST', body: { token: 'invalid!token@chars', password: 'new-valid-pass-123' } });
  assert.equal(invalidFormatToken.response.status, 400);

  const shortToken = await call(db, '/auth/reset-password', { method: 'POST', body: { token: 'abc', password: 'new-valid-pass-123' } });
  assert.equal(shortToken.response.status, 400);

  // 7. Password validation on /auth/reset-password
  const rawToken = 'sample_valid_base64url_token_1234567890_abcdef';
  await db.collection('passwordResets').deleteMany({ userId: member.user._id });
  await db.collection('passwordResets').insertOne({
    tokenHash: hashToken(rawToken),
    userId: member.user._id,
    createdBy: member.user._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  const shortPass = await call(db, '/auth/reset-password', { method: 'POST', body: { token: rawToken, password: 'short' } });
  assert.equal(shortPass.response.status, 400);
  assert.equal(shortPass.data.error, 'Use a password between 10 and 128 characters.');

  const longPass = await call(db, '/auth/reset-password', { method: 'POST', body: { token: rawToken, password: 'x'.repeat(129) } });
  assert.equal(longPass.response.status, 400);

  // 8. Successful password reset
  const resetSuccess = await call(db, '/auth/reset-password', { method: 'POST', body: { token: rawToken, password: 'fresh-strong-password-100' } });
  assert.equal(resetSuccess.response.status, 200);
  assert.equal(resetSuccess.data.ok, true);

  // 9. Old password rejected, new password accepted
  const oldLogin = await call(db, '/auth/login', { method: 'POST', body: { email: 'forgot@abes.ac.in', password: 'correct-horse-123' } });
  assert.equal(oldLogin.response.status, 401);

  const newLogin = await call(db, '/auth/login', { method: 'POST', body: { email: 'forgot@abes.ac.in', password: 'fresh-strong-password-100' } });
  assert.equal(newLogin.response.status, 200);

  // 10. Reusing consumed token rejected
  const reuseAttempt = await call(db, '/auth/reset-password', { method: 'POST', body: { token: rawToken, password: 'another-new-password-200' } });
  assert.equal(reuseAttempt.response.status, 400);
  assert.equal(reuseAttempt.data.error, 'This password reset link has already been used. Ask an administrator for a new one.');

  // 11. Expired token rejected
  const expiredRawToken = 'sample_expired_base64url_token_9876543210_fedcba';
  await db.collection('passwordResets').insertOne({
    tokenHash: hashToken(expiredRawToken),
    userId: member.user._id,
    createdBy: member.user._id,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 30 * 60 * 1000),
  });
  const expiredAttempt = await call(db, '/auth/reset-password', { method: 'POST', body: { token: expiredRawToken, password: 'another-new-password-300' } });
  assert.equal(expiredAttempt.response.status, 400);
  assert.equal(expiredAttempt.data.error, 'This password reset link is invalid or expired. Ask an administrator for a new one.');

  // 12. Email validation on login
  const invalidLoginEmail = await call(db, '/auth/login', { method: 'POST', body: { email: 'invalid-email-syntax', password: 'some-password-123' } });
  assert.equal(invalidLoginEmail.response.status, 400);
  assert.equal(invalidLoginEmail.data.error, 'Enter a valid email address.');
});

test('admin routes enforce roles and paginate the member roster and audit history', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const member = await seedUser(db, { name: 'Regular Member', email: 'regular@abes.ac.in', username: 'regular-gh' });
  for (let index = 0; index < 24; index += 1) {
    await db.collection('users').insertOne({ _id: new ObjectId(), name: `Roster ${String(index).padStart(2, '0')}`, department: 'Computer Science', email: `roster${index}@abes.ac.in`, githubUsername: `roster-${index}`, leetcodeUsername: `leetcode-${index}`, role: 'member', approvalStatus: index % 2 ? 'approved' : 'pending', verifiedAt: index % 2 ? new Date() : null, createdAt: new Date() });
  }
  await db.collection('adminActivity').insertOne({ actorName: 'Admin', actorRole: 'admin', action: 'test_entry', targetLabel: 'Test', createdAt: new Date() });
  const page = await call(db, '/admin/members?page=2&pageSize=10&status=all', { cookie: admin.cookie });
  assert.equal(page.response.status, 200);
  assert.equal(page.data.members.length, 10);
  assert.equal(page.data.pagination.page, 2);
  assert.equal(page.data.pagination.total, 26);
  const approvedPage = await call(db, '/admin/members?page=2&pageSize=5&status=approved', { cookie: admin.cookie });
  assert.equal(approvedPage.response.status, 200);
  assert.equal(approvedPage.data.members.length, 5);
  assert.equal(approvedPage.data.pagination.total, 14);
  assert.equal(approvedPage.data.pagination.totalPages, 3);
  const search = await call(db, '/admin/members?status=approved&q=roster-21&page=1&pageSize=10', { cookie: admin.cookie });
  assert.equal(search.data.members.length, 1);
  const activityPage = await call(db, '/admin/activity?page=1&pageSize=1', { cookie: admin.cookie });
  assert.equal(activityPage.data.activity.length, 1);
  assert.equal(activityPage.data.pagination.pageSize, 1);
  const denied = await call(db, '/admin/activity', { cookie: member.cookie });
  assert.equal(denied.response.status, 403);
  const blazeDenied = await call(db, `/admin/members/${member.user._id}/blaze`, { method: 'POST', cookie: member.cookie, body: { blaze: 10 } });
  assert.equal(blazeDenied.response.status, 403);
});

test('admins can review legacy pending submissions and pagination includes their full count', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const first = await seedUser(db, { name: 'First Solver', email: 'first@abes.ac.in', username: 'first-gh' });
  const second = await seedUser(db, { name: 'Second Solver', email: 'second@abes.ac.in', username: 'second-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  const assignmentId = new ObjectId(assigned.data.assignment.id);
  const firstSubmissionId = new ObjectId();
  const secondSubmissionId = new ObjectId();
  for (const [id, member] of [[firstSubmissionId, first], [secondSubmissionId, second]]) {
    await db.collection('submissions').insertOne({
      _id: id, assignmentId, userId: member.user._id, questionId: 217,
      commitUrl: `https://github.com/${member.user.githubUsername}/repo/commit/${'7'.repeat(40)}`,
      submittedAt: new Date(), status: 'pending', verifiedPusher: true,
    });
  }
  const page = await call(db, '/admin/submissions?status=pending&page=1&pageSize=1', { cookie: admin.cookie });
  assert.equal(page.response.status, 200);
  assert.equal(page.data.submissions.length, 1);
  assert.equal(page.data.pagination.total, 2);
  const accepted = await call(db, `/admin/submissions/${firstSubmissionId}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'accepted', note: 'Verified' } });
  assert.equal(accepted.response.status, 200);
  assert.equal(db.collection('submissions').documents.find((item) => String(item._id) === String(firstSubmissionId)).points, 1);
  const acceptedProgress = db.collection('personalProgress').documents.find((item) => String(item.userId) === String(first.user._id) && item.questionId === 217);
  assert.equal(acceptedProgress.isClub, true);
  assert.equal(String(acceptedProgress.assignmentId), String(assignmentId));
  const rejected = await call(db, `/admin/submissions/${secondSubmissionId}`, { method: 'PATCH', cookie: admin.cookie, body: { status: 'rejected', note: 'Invalid solution' } });
  assert.equal(rejected.response.status, 200);
  assert.ok(db.collection('adminActivity').documents.filter((item) => item.action === 'submission_reviewed').length >= 2);
});

test('admin account approval, role changes, and deletion revoke access and leave audit records', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const member = await seedUser(db, { name: 'Managed Member', email: 'managed@abes.ac.in', username: 'managed-gh' });
  await db.collection('personalProgress').insertOne({ userId: member.user._id, questionId: 217, solvedAt: new Date() });

  const selfDemote = await call(db, `/admin/members/${admin.user._id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'member' } });
  assert.equal(selfDemote.response.status, 400);
  const promoteLead = await call(db, `/admin/members/${member.user._id}`, { method: 'PATCH', cookie: admin.cookie, body: { role: 'lead' } });
  assert.equal(promoteLead.response.status, 200);
  assert.equal(db.collection('users').documents.find((item) => String(item._id) === String(member.user._id)).role, 'lead');

  const revoke = await call(db, `/admin/members/${member.user._id}`, { method: 'PATCH', cookie: admin.cookie, body: { approvalStatus: 'pending' } });
  assert.equal(revoke.response.status, 200);
  assert.equal(db.collection('sessions').documents.some((item) => String(item.userId) === String(member.user._id)), false);
  assert.equal((await call(db, '/auth/me', { cookie: member.cookie })).data.user, null);
  await call(db, `/admin/members/${member.user._id}`, { method: 'PATCH', cookie: admin.cookie, body: { approvalStatus: 'approved' } });
  const removed = await call(db, `/admin/members/${member.user._id}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(removed.response.status, 200);
  assert.equal(db.collection('users').documents.some((item) => String(item._id) === String(member.user._id)), false);
  assert.equal(db.collection('personalProgress').documents.some((item) => String(item.userId) === String(member.user._id)), false);
  assert.ok(db.collection('adminActivity').documents.some((item) => item.action === 'member_deleted'));
});

test('security headers, correlation reqId, and account-level brute-force rate limiting are enforced', async () => {
  const db = new FakeDatabase();
  const res = await call(db, '/club/leaderboard');
  assert.equal(res.response.status, 200);
  assert.equal(res.response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.response.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(res.response.headers.get('permissions-policy'), /geolocation=\(\)/);

  // Security errors return correlation reqId and X-Request-Id
  const unauth = await call(db, '/questions');
  assert.equal(unauth.response.status, 401);
  assert.ok(unauth.data.reqId);
  assert.equal(unauth.response.headers.get('x-request-id'), unauth.data.reqId);

  // Account-level rate limit protects individual emails from brute force
  // seedUser makes 1 login. Next 4 wrong logins return 401, 5th wrong login exceeds limit and returns 429.
  await seedUser(db, { name: 'Target User', email: 'target@abes.ac.in', username: 'target-gh' });
  for (let i = 0; i < 4; i++) {
    const attempt = await call(db, '/auth/login', { method: 'POST', body: { email: 'target@abes.ac.in', password: 'wrong' } });
    assert.equal(attempt.response.status, 401);
  }
  const blocked = await call(db, '/auth/login', { method: 'POST', body: { email: 'target@abes.ac.in', password: 'wrong' } });
  assert.equal(blocked.response.status, 429);
  assert.match(blocked.data.error, /too many attempts/i);
});

test('leads and admins can inspect today question attempts and export as CSV', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Attempt Student', email: 'attempt@abes.ac.in', username: 'attempt-student', department: 'Technical', studyYear: 'second-year' });
  const otherMember = await seedUser(db, { name: 'Regular Member', email: 'regular@abes.ac.in', username: 'regular-member' });

  // Regular members are forbidden
  const denied = await call(db, '/admin/today-submissions', { cookie: otherMember.cookie });
  assert.equal(denied.response.status, 403);

  // Empty state before assignment
  const emptyRes = await call(db, '/admin/today-submissions', { cookie: admin.cookie });
  assert.equal(emptyRes.response.status, 200);
  assert.equal(emptyRes.data.totalAttempted, 0);

  // Create assignment for today
  const indiaToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const assignmentRes = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaToday, questionId: 217 } });
  const assignmentId = assignmentRes.data.assignment.id;

  // Insert submission
  await db.collection('submissions').insertOne({
    assignmentId: new ObjectId(assignmentId),
    userId: student.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/attempt-student/repo/commit/1234567890abcdef',
    solutionPath: '217/solution.txt',
    submittedAt: new Date(),
  });

  // Query today submissions (JSON)
  const todayRes = await call(db, '/admin/today-submissions', { cookie: admin.cookie });
  assert.equal(todayRes.response.status, 200);
  assert.equal(todayRes.data.totalAttempted, 1);
  assert.equal(todayRes.data.acceptedCount, 1);
  assert.equal(todayRes.data.submissions[0].name, 'Attempt Student');
  assert.equal(todayRes.data.submissions[0].department, 'Technical');
  assert.ok(todayRes.data.totalNotAttempted >= 1);
  assert.ok(todayRes.data.notAttempted.some((m) => m.name === 'Regular Member'));

  // Query as CSV (attempted - default)
  const csvRes = await call(db, '/admin/today-submissions?format=csv', { cookie: admin.cookie });
  assert.equal(csvRes.response.status, 200);
  assert.match(csvRes.response.headers.get('content-type'), /text\/csv/);
  assert.match(csvRes.text, /Attempt Student/);
  assert.match(csvRes.text, /Technical/);
  assert.doesNotMatch(csvRes.text, /LeetCode Username/);

  // Query as CSV (not attempted)
  const csvNotAttempted = await call(db, '/admin/today-submissions?format=csv&type=not_attempted', { cookie: admin.cookie });
  assert.equal(csvNotAttempted.response.status, 200);
  assert.match(csvNotAttempted.text, /Regular Member/);
  assert.doesNotMatch(csvNotAttempted.text, /Attempt Student/);
  assert.doesNotMatch(csvNotAttempted.text, /LeetCode Username/);
});

test('leads and admins can delete today question and associated submissions', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Delete Tester', email: 'del-test@abes.ac.in', username: 'del-test' });
  const indiaToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // 1. Admin publishes assignment
  const assignmentRes = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaToday, questionId: 217 } });
  assert.equal(assignmentRes.response.status, 201);
  const assignmentId = assignmentRes.data.assignment.id;

  // 2. Member submits
  await db.collection('submissions').insertOne({
    assignmentId: new ObjectId(assignmentId),
    userId: student.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/del-test/repo/commit/1234567890abcdef',
    solutionPath: '217/solution.txt',
    submittedAt: new Date(),
  });

  // Verify club today returns the assignment
  const clubToday = await call(db, '/club/today', { cookie: student.cookie });
  assert.equal(clubToday.data.assignment.questionId, 217);

  // 3. Regular member cannot delete assignment
  const memberDelete = await call(db, `/admin/assignments/${assignmentId}`, { method: 'DELETE', cookie: student.cookie });
  assert.equal(memberDelete.response.status, 403);

  // 4. Admin deletes assignment
  const adminDelete = await call(db, `/admin/assignments/${assignmentId}`, { method: 'DELETE', cookie: admin.cookie });
  assert.equal(adminDelete.response.status, 200);
  assert.equal(adminDelete.data.deleted, true);

  // 5. Club today now returns null assignment
  const clubTodayAfter = await call(db, '/club/today', { cookie: student.cookie });
  assert.equal(clubTodayAfter.data.assignment, null);

  // 6. Submissions for deleted assignment are cleaned up
  const remainingSubs = await db.collection('submissions').find({ assignmentId: new ObjectId(assignmentId) }).toArray();
  assert.equal(remainingSubs.length, 0);

  // 7. Activity logged
  const activity = await call(db, '/admin/activity', { cookie: admin.cookie });
  assert.equal(activity.data.activity.some((item) => item.action === 'assignment_deleted'), true);
});

test('punctuality is 100% when one question is assigned, and accurately reflects concluded past assignments', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const today = indiaDay();

  // Admin publishes Question of the Day first
  const assigned = await call(db, '/admin/assignments', {
    method: 'POST',
    cookie: admin.cookie,
    body: { dateKey: today, questionId: 217 }
  });
  const assignmentId = assigned.data.assignment.id;

  // Student 1 registers AFTER the assignment was published on the same day
  const student1 = await seedUser(db, {
    name: 'Solver One',
    email: 'solver1@abes.ac.in',
    username: 'solver-one',
    department: 'Technical',
  });
  // Student 2 registers but hasn't submitted yet
  const student2 = await seedUser(db, {
    name: 'Solver Two',
    email: 'solver2@abes.ac.in',
    username: 'solver-two',
    department: 'Technical',
  });

  // Student 1 submits and is accepted
  const fullSha = '76c3f955e0a1de4701dbca40d5f4dab870b0d5ea';
  commits.set(fullSha, commitFixture({ sha: fullSha, questionId: 217, username: 'solver-one' }));
  const sub = await call(db, '/submissions', {
    method: 'POST',
    cookie: student1.cookie,
    body: { assignmentId, commitUrl: `https://github.com/solver-one/dsa-solutions/commit/${fullSha}` }
  });
  assert.equal(sub.response.status, 201);

  // Leaderboard check:
  // With 1 question assigned so far, Solver One (1 pt) MUST have 100% punctuality (not 0%)
  // Solver Two (0 pts, no accepted submissions) has 0% punctuality
  const board = await call(db, '/club/leaderboard?page=1&pageSize=10');
  const s1Row = board.data.leaderboard.find((p) => p.githubUsername === 'solver-one');
  const s2Row = board.data.leaderboard.find((p) => p.githubUsername === 'solver-two');

  assert.ok(s1Row);
  assert.equal(s1Row.points, 1);
  assert.equal(s1Row.completed, 1);
  assert.equal(s1Row.punctuality, 100);
  assert.equal(s1Row.streak, 1);

  assert.ok(s2Row);
  assert.equal(s2Row.points, 0);
  assert.equal(s2Row.punctuality, 0);

  // Past assignment check:
  // If an assignment was yesterday (2026-10-29) and was missed by Solver Two:
  const yesterday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 86400000));

  await db.collection('assignments').insertOne({
    _id: new ObjectId(),
    dateKey: yesterday,
    questionId: 1,
    createdAt: new Date(Date.now() - 86400000),
  });

  // Set Solver Two's join date to 2 days ago so they were a member during yesterday's assignment
  await db.collection('users').updateOne(
    { _id: student2.user._id },
    { $set: { createdAt: new Date(Date.now() - 2 * 86400000) } }
  );

  const updatedBoard = await call(db, '/club/leaderboard?page=1&pageSize=10');
  const s2Updated = updatedBoard.data.leaderboard.find((p) => p.githubUsername === 'solver-two');
  // Solver Two missed yesterday's concluded question (0 out of 1 past scheduled questions)
  assert.equal(s2Updated.punctuality, 0);
});

test('explainer selection prioritizes second-year students, locks for today, and avoids repeating', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const memberNonAdmin = await seedUser(db, { name: 'Normal Guy', email: 'norm@abes.ac.in', username: 'norm-user' });

  // 1. Regular member cannot call pick-explainer
  const denied = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: memberNonAdmin.cookie });
  assert.equal(denied.response.status, 403);

  // 2. Publish assignment for today
  const indiaToday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const assignRes = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaToday, questionId: 217 } });
  const assignmentId = assignRes.data.assignment.id;

  // Create 3 submitters:
  // - Third year student
  // - Second year student A
  // - Second year student B
  const thirdYearStudent = await seedUser(db, { name: 'Senior Guy', email: 'senior@abes.ac.in', username: 'senior-dev', studyYear: 'third-year' });
  const secondYearA = await seedUser(db, { name: 'Sophomore Alice', email: 'alice@abes.ac.in', username: 'alice-2nd', studyYear: 'second-year' });
  const secondYearB = await seedUser(db, { name: 'Sophomore Bob', email: 'bob@abes.ac.in', username: 'bob-2nd', studyYear: 'second-year' });

  // Submissions for today
  await db.collection('submissions').insertOne({
    assignmentId: new ObjectId(assignmentId),
    userId: thirdYearStudent.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/senior-dev/repo/commit/1111111',
    submittedAt: new Date(Date.now() - 3000),
  });
  await db.collection('submissions').insertOne({
    assignmentId: new ObjectId(assignmentId),
    userId: secondYearA.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/alice-2nd/repo/commit/2222222',
    submittedAt: new Date(Date.now() - 2000),
  });

  // Pick explainer today: must pick secondYearA over thirdYearStudent!
  const pick1 = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie });
  assert.equal(pick1.response.status, 200);
  assert.equal(pick1.data.isNew, true);
  assert.equal(pick1.data.explainer.name, 'Sophomore Alice');
  assert.equal(pick1.data.explainer.studyYear, 'second-year');

  // Calling again for today: must return the exact same explainer (locked)!
  const pickRepeat = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie });
  assert.equal(pickRepeat.response.status, 200);
  assert.equal(pickRepeat.data.isExisting, true);
  assert.equal(pickRepeat.data.explainer.name, 'Sophomore Alice');

  // Verify getClubToday returns this explainer and dailyLeaderboard
  const clubToday = await call(db, '/club/today', { cookie: admin.cookie });
  assert.equal(clubToday.data.assignment.explainer.name, 'Sophomore Alice');
  assert.equal(clubToday.data.dailyLeaderboard.length, 2);
  assert.equal(clubToday.data.dailyLeaderboard[0].rank, 1);

  // Now add secondYearB submission
  await db.collection('submissions').insertOne({
    assignmentId: new ObjectId(assignmentId),
    userId: secondYearB.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/bob-2nd/repo/commit/3333333',
    submittedAt: new Date(Date.now() - 1000),
  });

  // Re-pick explainer: should exclude Alice and select Bob!
  // And Alice's turn is restored so that her turn comes again
  const repick = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie, body: { repick: true } });
  assert.equal(repick.response.status, 200);
  assert.equal(repick.data.isRepick, true);
  assert.equal(repick.data.explainer.name, 'Sophomore Bob');

  // Alice (the previous explainer who was replaced) must automatically suffer -50 aura points
  const aliceAfterRepick = await db.collection('users').findOne({ _id: secondYearA.user._id });
  assert.equal(aliceAfterRepick.customAura, -50);

  // Check assignment in DB: explainerUserId is now Bob, Alice was replaced
  const assignmentInDb = await db.collection('assignments').findOne({ _id: new ObjectId(assignmentId) });
  assert.equal(String(assignmentInDb.explainerUserId), String(secondYearB.user._id));

  // If we move this assignment to yesterday, Bob is in past assignments while Alice is NOT in past assignments!
  assignmentInDb.dateKey = '2026-10-31';

  // Create new today assignment
  const newAssign = await db.collection('assignments').insertOne({
    dateKey: indiaToday,
    questionId: 242,
    createdByName: 'Admin',
    createdBy: admin.user._id,
    createdAt: new Date(),
  });
  const newAssignmentId = newAssign.insertedId;

  // Both Alice and Bob submit for today
  await db.collection('submissions').insertOne({
    assignmentId: newAssignmentId,
    userId: secondYearA.user._id,
    questionId: 242,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/alice-2nd/repo/commit/4444444',
    submittedAt: new Date(),
  });
  await db.collection('submissions').insertOne({
    assignmentId: newAssignmentId,
    userId: secondYearB.user._id,
    questionId: 242,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/bob-2nd/repo/commit/5555555',
    submittedAt: new Date(),
  });

  // When picking explainer for the new assignment:
  // Alice MUST be picked because Bob already had his turn recorded in the previous assignment,
  // whereas Alice's turn was restored when Bob was re-picked!
  const pickNewDay = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie });
  assert.equal(pickNewDay.response.status, 200);
  assert.equal(pickNewDay.data.explainer.name, 'Sophomore Alice');

  // Test clearing/removing explainer via DELETE
  const clearRes = await call(db, '/admin/pick-explainer', { method: 'DELETE', cookie: admin.cookie });
  assert.equal(clearRes.response.status, 200);
  assert.equal(clearRes.data.cleared, true);

  const clubAfterClear = await call(db, '/club/today', { cookie: admin.cookie });
  assert.equal(clubAfterClear.data.assignment.explainer, null);

  // Test GET /api/admin/explainer-candidates
  const candDenied = await call(db, '/admin/explainer-candidates', { cookie: memberNonAdmin.cookie });
  assert.equal(candDenied.response.status, 403);

  const candRes = await call(db, '/admin/explainer-candidates', { cookie: admin.cookie });
  assert.equal(candRes.response.status, 200);
  assert.ok(candRes.data.candidates.length >= 2);
  const aliceCand = candRes.data.candidates.find((c) => c.name === 'Sophomore Alice');
  const bobCand = candRes.data.candidates.find((c) => c.name === 'Sophomore Bob');
  assert.ok(aliceCand);
  assert.ok(bobCand);
  // Bob had his turn completed in past assignment ('2026-10-31')
  assert.equal(bobCand.turnCompleted, true);
  // Alice was restored, so turn is not marked completed
  assert.equal(aliceCand.turnCompleted, false);

  // Custom re-pick: admin manually selects Alice
  const customPick = await call(db, '/admin/pick-explainer', {
    method: 'POST',
    cookie: admin.cookie,
    body: { repick: true, userId: aliceCand.id },
  });
  assert.equal(customPick.response.status, 200);
  assert.equal(customPick.data.explainer.name, 'Sophomore Alice');
});

test('Randomized Round Robin: safe past-explainer persistence, 3-tier priority, cycle reset, volunteer shield, and boundary protection', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const indiaToday = indiaDay();

  // Create 4 second-year members
  const s1 = await seedUser(db, { email: 's1@abes.ac.in', name: 'Student One', username: 's1-gh', studyYear: 'second-year', role: 'member', approved: true });
  const s2 = await seedUser(db, { email: 's2@abes.ac.in', name: 'Student Two', username: 's2-gh', studyYear: 'second-year', role: 'member', approved: true });
  const s3 = await seedUser(db, { email: 's3@abes.ac.in', name: 'Student Three', username: 's3-gh', studyYear: 'second-year', role: 'member', approved: true });
  const s4 = await seedUser(db, { email: 's4@abes.ac.in', name: 'Student Four', username: 's4-gh', studyYear: 'second-year', role: 'member', approved: true });

  // Simulate past assignments: s1 was ALREADY selected as an explainer previously!
  await db.collection('assignments').insertOne({
    dateKey: '2026-10-30',
    questionId: 1,
    explainerUserId: s1.user._id,
    explainer: { userId: String(s1.user._id), name: 'Student One' },
    createdAt: new Date('2026-10-30T10:00:00Z'),
  });

  // Create today’s assignment
  const todayAssign = await db.collection('assignments').insertOne({
    dateKey: indiaToday,
    questionId: 217,
    createdByName: 'Admin',
    createdBy: admin.user._id,
    createdAt: new Date(),
  });
  const todayAssignmentId = todayAssign.insertedId;

  // s2 submitted today with accepted status. s3 and s4 did not submit.
  await db.collection('submissions').insertOne({
    assignmentId: todayAssignmentId,
    userId: s2.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    commitUrl: 'https://github.com/s2/repo/commit/111',
    submittedAt: new Date(),
  });

  // Initial pick today:
  // Safe migration must pick up s1 from past assignments into primaryCompletedIds.
  // s2 is an accepted submitter among unpicked (s2, s3, s4) -> s2 MUST be selected!
  const pickRes1 = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie });
  assert.equal(pickRes1.response.status, 200);
  assert.equal(pickRes1.data.explainer.name, 'Student Two');
  assert.equal(pickRes1.data.cycle.cycleNumber, 1);
  assert.equal(pickRes1.data.cycle.completedCount, 2); // s1 and s2
  assert.equal(pickRes1.data.cycle.remainingCount, 2); // s3 and s4

  // Verify explainer-candidates reflects completed state
  const candsRes = await call(db, '/admin/explainer-candidates', { cookie: admin.cookie });
  assert.equal(candsRes.response.status, 200);
  const candMap = new Map(candsRes.data.candidates.map((c) => [c.name, c]));
  assert.equal(candMap.get('Student One').turnCompleted, true);
  assert.equal(candMap.get('Student Two').turnCompleted, true);
  assert.equal(candMap.get('Student Three').turnCompleted, false);
  assert.equal(candMap.get('Student Four').turnCompleted, false);

  // Test Re-pick: s2 declines. Re-pick must choose between s3 or s4, and s2 loses 50 Blaze
  const repickRes = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie, body: { repick: true } });
  assert.equal(repickRes.response.status, 200);
  assert.ok(['Student Three', 'Student Four'].includes(repickRes.data.explainer.name));
  const chosenReplacementName = repickRes.data.explainer.name;

  // Check s2 penalized -50 and s2 turn restored
  const s2User = await db.collection('users').findOne({ _id: s2.user._id });
  assert.equal(s2User.customAura, -50);
  const cycleAfterRepick = await db.collection('explainerCycle').findOne({ _id: 'current' });
  assert.ok(!cycleAfterRepick.primaryCompletedIds.includes(String(s2.user._id)));

  // Test Volunteer Shield on Custom Re-pick:
  // Admin custom-re-picks s1 (who already completed turn in past assignment)
  const customVolRes = await call(db, '/admin/pick-explainer', {
    method: 'POST',
    cookie: admin.cookie,
    body: { repick: true, userId: String(s1.user._id) },
  });
  assert.equal(customVolRes.response.status, 200);
  assert.equal(customVolRes.data.explainer.name, 'Student One');

  // Now s1 (the volunteer) has an emergency and is replaced by s3 (or s4)
  const unpickedCandidate = chosenReplacementName === 'Student Three' ? s4 : s3;
  const replaceVolRes = await call(db, '/admin/pick-explainer', {
    method: 'POST',
    cookie: admin.cookie,
    body: { repick: true, userId: String(unpickedCandidate.user._id) },
  });
  assert.equal(replaceVolRes.response.status, 200);

  // Verify s1 (volunteer) did NOT get penalized 50 Blaze!
  const s1User = await db.collection('users').findOne({ _id: s1.user._id });
  assert.equal(s1User.customAura ?? 0, 0); // Still 0!
  // And s1 is still in primaryCompletedIds!
  const cycleWithVol = await db.collection('explainerCycle').findOne({ _id: 'current' });
  assert.ok(cycleWithVol.primaryCompletedIds.includes(String(s1.user._id)));

  // Now complete turns across consecutive days to test Cycle Reset
  // So far in cycle: s1 (from 2026-10-30 past assignment) and unpickedCandidate (from today's assignment)
  // Let unpickedCandidate be locked on today's assignment.
  // Now create day 3 assignment for s2, and day 4 assignment for the other remaining student.
  const currentCompleted = [String(s1.user._id), String(unpickedCandidate.user._id)];
  const remainingStudents = [s2, s3, s4].filter((s) => !currentCompleted.includes(String(s.user._id)));

  let dayCounter = 1;
  for (const remainingStudent of remainingStudents) {
    // Archive previous today assignment to past
    await db.collection('assignments').updateOne({ dateKey: indiaToday }, { $set: { dateKey: `2026-11-0${dayCounter++}` } });
    // Create new today assignment
    await db.collection('assignments').insertOne({
      dateKey: indiaToday,
      questionId: 200 + dayCounter,
      createdByName: 'Admin',
      createdBy: admin.user._id,
      createdAt: new Date(),
    });
    // Pick this remaining student for today
    await call(db, '/admin/pick-explainer', {
      method: 'POST',
      cookie: admin.cookie,
      body: { userId: String(remainingStudent.user._id) },
    });
  }

  // Now all 4 students (s1, s2, s3, s4) have completed their turns in Cycle 1
  const fullCycle = await db.collection('explainerCycle').findOne({ _id: 'current' });
  assert.equal(fullCycle.primaryCompletedIds.length, 4);
  const lastPersonInCycle1 = fullCycle.lastExplainerId;

  // Archive today's assignment to past and create new today assignment for Cycle 2
  await db.collection('assignments').updateOne({ dateKey: indiaToday }, { $set: { dateKey: `2026-11-0${dayCounter++}` } });
  await db.collection('assignments').insertOne({
    dateKey: indiaToday,
    questionId: 300,
    createdByName: 'Admin',
    createdBy: admin.user._id,
    createdAt: new Date(),
  });

  // Next random pick must automatically trigger cycle reset to Cycle 2!
  // And boundary protection must avoid lastPersonInCycle1 as the first pick
  const newCyclePick = await call(db, '/admin/pick-explainer', { method: 'POST', cookie: admin.cookie });
  assert.equal(newCyclePick.response.status, 200);
  assert.equal(newCyclePick.data.cycle.cycleNumber, 2);
  assert.equal(newCyclePick.data.cycle.completedCount, 1);
  assert.notEqual(String(newCyclePick.data.explainer.userId), String(lastPersonInCycle1));
});

test('submitting solutions directly via LeetCode verifies titleSlug, statusDisplay, and India date', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const todayKey = indiaDay();

  // Create today's assignment (LC 217: Contains Duplicate)
  const assignRes = await call(db, '/admin/assignments', {
    method: 'POST',
    cookie: admin.cookie,
    body: { dateKey: todayKey, questionId: 217 },
  });
  assert.equal(assignRes.response.status, 201);
  const assignmentId = assignRes.data.assignment.id;

  // Member with no leetcodeUsername
  const memberNoLc = await seedUser(db, { name: 'No LC Member', email: 'nolc@abes.ac.in', username: 'nolc-gh', leetcodeUsername: '' });
  const failNoLc = await call(db, '/submissions', {
    method: 'POST',
    cookie: memberNoLc.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(failNoLc.response.status, 400);
  assert.match(failNoLc.data.error, /add your leetcode username/i);

  // Member with leetcodeUsername
  const member = await seedUser(db, { name: 'LC Member', email: 'lcmember@abes.ac.in', username: 'lcmember-gh', leetcodeUsername: 'lcmember_lc' });

  // 1. When LeetCode returns no submissions
  leetcodeRecentPayload = { data: { recentSubmissionList: [] } };
  const failEmpty = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(failEmpty.response.status, 400);
  assert.match(failEmpty.data.error, /no accepted submission found/i);

  // 2. When LeetCode returns Wrong Answer today
  const noonEpochSec = Math.floor(dateAtIndiaNoon(todayKey).getTime() / 1000);
  leetcodeRecentPayload = {
    data: {
      recentSubmissionList: [
        {
          title: 'Contains Duplicate',
          titleSlug: 'contains-duplicate',
          timestamp: String(noonEpochSec),
          statusDisplay: 'Wrong Answer',
          lang: 'python3',
        },
      ],
    },
  };
  const failWrong = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(failWrong.response.status, 400);
  assert.match(failWrong.data.error, /wrong answer/i);

  // 3. When LeetCode returns Accepted submission from yesterday
  const yesterdayEpochSec = noonEpochSec - 24 * 60 * 60;
  leetcodeRecentPayload = {
    data: {
      recentSubmissionList: [
        {
          title: 'Contains Duplicate',
          titleSlug: 'contains-duplicate',
          timestamp: String(yesterdayEpochSec),
          statusDisplay: 'Accepted',
          lang: 'cpp',
        },
      ],
    },
  };
  const failOld = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(failOld.response.status, 400);
  assert.match(failOld.data.error, /from .+, but none today/i);

  // 4. When LeetCode returns Accepted submission for today
  leetcodeRecentPayload = {
    data: {
      recentSubmissionList: [
        {
          title: 'Contains Duplicate',
          titleSlug: 'contains-duplicate',
          timestamp: String(noonEpochSec),
          statusDisplay: 'Accepted',
          lang: 'cpp',
        },
      ],
    },
  };
  const success = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(success.response.status, 201);
  assert.equal(success.data.submission.status, 'accepted');
  assert.equal(success.data.submission.points, 1);
  assert.match(success.data.submission.solutionPath, /LeetCode: @lcmember_lc \(cpp\)/);

  // 5. Subsequent submission should reject duplicate
  const duplicate = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(duplicate.response.status, 409);
  assert.match(duplicate.data.error, /already submitted/i);

  // 6. Check club today leaderboard includes this member
  const clubToday = await call(db, '/club/today', { cookie: member.cookie });
  assert.equal(clubToday.data.acceptedCount, 1);
  assert.equal(clubToday.data.dailyLeaderboard.length, 1);
  assert.equal(clubToday.data.dailyLeaderboard[0].name, 'LC Member');
  assert.equal(clubToday.data.dailyLeaderboard[0].submissionType, 'leetcode');
});

test('LeetCode submission requires admin approval: member request, admin approval, rejection, and revocation flow', async () => {
  const db = new FakeDatabase();
  const admin = await seedUser(db, { name: 'Admin LC', email: 'adminlc@abes.ac.in', username: 'admin-lc', role: 'admin' });
  const member = await seedUser(db, {
    name: 'Member LC',
    email: 'memberlc@abes.ac.in',
    username: 'member-lc',
    role: 'member',
    leetcodeApproval: 'none',
    leetcodeUsername: 'memberlc_user',
  });

  const todayKey = indiaDay();
  const { insertedId: assignmentId } = await db.collection('assignments').insertOne({
    dateKey: todayKey,
    questionId: 217,
    topic: 'Arrays',
    active: true,
    publishedAt: dateAtIndiaNoon(todayKey),
  });

  // 1. Unapproved member submitting via LeetCode is blocked with 403
  const blocked = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(blocked.response.status, 403);
  assert.match(blocked.data.error, /requires administrator approval/i);

  // 2. Member requests LeetCode approval via /auth/profile
  const reqProfile = await call(db, '/auth/profile', {
    method: 'PATCH',
    cookie: member.cookie,
    body: { requestLeetcodeApproval: true },
  });
  assert.equal(reqProfile.response.status, 200);
  assert.equal(reqProfile.data.user.leetcodeApproval, 'pending');

  // 3. Admin lists members with status=leetcode
  const lcList = await call(db, '/admin/members?status=leetcode', { cookie: admin.cookie });
  assert.equal(lcList.response.status, 200);
  assert.equal(lcList.data.counts.leetcodePending, 1);
  assert.equal(lcList.data.members.some((m) => m.id === String(member.user._id)), true);

  // 3b. LeetCode pending request also appears under status=pending tab
  const pendingTabList = await call(db, '/admin/members?status=pending', { cookie: admin.cookie });
  assert.equal(pendingTabList.response.status, 200);
  assert.equal(pendingTabList.data.members.some((m) => m.id === String(member.user._id)), true);
  assert.equal(pendingTabList.data.counts.pending >= 1, true);

  // 4. Admin approves LeetCode access for member
  const approveRes = await call(db, `/admin/members/${member.user._id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { leetcodeApproval: 'approved' },
  });
  assert.equal(approveRes.response.status, 200);

  // 5. Member's account reflects approved status and can submit
  const noonEpochSec = Math.floor(dateAtIndiaNoon(todayKey).getTime() / 1000);
  leetcodeRecentPayload = {
    data: {
      recentSubmissionList: [
        {
          title: 'Contains Duplicate',
          titleSlug: 'contains-duplicate',
          timestamp: String(noonEpochSec),
          statusDisplay: 'Accepted',
          lang: 'python3',
        },
      ],
    },
  };
  const submitRes = await call(db, '/submissions', {
    method: 'POST',
    cookie: member.cookie,
    body: { assignmentId, type: 'leetcode' },
  });
  assert.equal(submitRes.response.status, 201);
  assert.equal(submitRes.data.submission.status, 'accepted');

  // 6. Admin revoking LeetCode access resets approval
  const revokeRes = await call(db, `/admin/members/${member.user._id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { leetcodeApproval: 'none' },
  });
  assert.equal(revokeRes.response.status, 200);
  const updatedMemberDoc = await db.collection('users').findOne({ _id: member.user._id });
  assert.equal(updatedMemberDoc.leetcodeApproval, 'none');
});

test('leaderboard reads accepted submissions once for point and aura calculations', async () => {
  const db = new FakeDatabase();
  const submissionsCollection = db.collection('submissions');
  const originalFind = submissionsCollection.find.bind(submissionsCollection);
  let acceptedReads = 0;
  submissionsCollection.find = (filter = {}, options) => {
    if (filter.status === 'accepted') acceptedReads += 1;
    return originalFind(filter, options);
  };

  const result = await call(db, '/club/leaderboard?page=1&pageSize=10');

  assert.equal(result.response.status, 200);
  assert.equal(acceptedReads, 1);
});

test('leaderboard ranks by points then earlier score timestamp, with punctuality = attempted assigned / total assigned', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const today = indiaDay();
  const yesterday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 86400000));

  // 2 questions assigned in total
  const a1 = await db.collection('assignments').insertOne({
    _id: new ObjectId(),
    dateKey: yesterday,
    questionId: 1,
    createdAt: new Date(Date.now() - 86400000),
  });
  const a2 = await db.collection('assignments').insertOne({
    _id: new ObjectId(),
    dateKey: today,
    questionId: 217,
    createdAt: new Date(),
  });

  // User A (early solver) and User B (late solver) both solve a1 (1 pt each)
  const userA = await seedUser(db, { name: 'Alice Early', email: 'alice@abes.ac.in', username: 'alice-gh' });
  const userB = await seedUser(db, { name: 'Bob Late', email: 'bob@abes.ac.in', username: 'bob-gh' });
  const userC = await seedUser(db, { name: 'Charlie Zero', email: 'charlie@abes.ac.in', username: 'charlie-gh' });

  const earlyTime = new Date('2026-11-01T10:00:00Z');
  const lateTime = new Date('2026-11-01T14:00:00Z');

  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId: a1.insertedId,
    userId: userA.user._id,
    questionId: 1,
    status: 'accepted',
    points: 1,
    submittedAt: earlyTime,
    reviewedAt: earlyTime,
  });

  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId: a1.insertedId,
    userId: userB.user._id,
    questionId: 1,
    status: 'accepted',
    points: 1,
    submittedAt: lateTime,
    reviewedAt: lateTime,
  });

  const board = await call(db, '/club/leaderboard?page=1&pageSize=10');
  const lb = board.data.leaderboard;

  // Alice Early reached 1 point first, so Alice is ranked #1 and Bob is ranked #2
  assert.equal(lb[0].githubUsername, 'alice-gh');
  assert.equal(lb[1].githubUsername, 'bob-gh');

  // Both solved 1 of 2 total assigned questions -> 50% punctuality
  assert.equal(lb[0].punctuality, 50);
  assert.equal(lb[1].punctuality, 50);

  // Charlie attempted 0 of 2 total assigned questions -> 0% punctuality
  const charlieRow = lb.find((p) => p.githubUsername === 'charlie-gh');
  assert.equal(charlieRow.punctuality, 0);
  assert.equal(charlieRow.points, 0);
});
test('aura points system: difficulty-based base points, runner order calculation, directory and leaderboard reporting', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const today = indiaDay();

  // Question 217 is Easy -> base 150, 5 deducted per rank
  const assignResult = await call(db, '/admin/assignments', {
    method: 'POST',
    cookie: admin.cookie,
    body: { dateKey: today, questionId: 217 },
  });
  assert.equal(assignResult.response.status, 201);
  const aId = assignResult.data.assignment.id;

  const runner1 = await seedUser(db, { name: 'Runner One', email: 'r1@abes.ac.in', username: 'runner1' });
  const runner2 = await seedUser(db, { name: 'Runner Two', email: 'r2@abes.ac.in', username: 'runner2' });
  const runner3 = await seedUser(db, { name: 'Runner Three', email: 'r3@abes.ac.in', username: 'runner3' });

  const t1 = new Date('2026-11-02T10:00:00.000Z');
  const t2 = new Date('2026-11-02T10:15:00.000Z');
  const t3 = new Date('2026-11-02T10:30:00.000Z');

  // Insert accepted submissions with legacy/stale aura in DB (e.g. 300, 281, etc.)
  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId: new ObjectId(aId),
    userId: runner1.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    aura: 999, // Stale legacy aura value
    submittedAt: t1,
  });

  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId: new ObjectId(aId),
    userId: runner2.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    aura: 281, // Stale legacy aura value
    submittedAt: t2,
  });

  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId: new ObjectId(aId),
    userId: runner3.user._id,
    questionId: 217,
    status: 'accepted',
    points: 1,
    aura: 280, // Stale legacy aura value
    submittedAt: t3,
  });

  // 1. Verify getClubToday dailyLeaderboard has aura: 150, 145, 140
  const todayClub = await call(db, '/club/today', { cookie: admin.cookie });
  assert.equal(todayClub.data.dailyLeaderboard.length, 3);
  assert.equal(todayClub.data.dailyLeaderboard[0].aura, 150);
  assert.equal(todayClub.data.dailyLeaderboard[1].aura, 145);
  assert.equal(todayClub.data.dailyLeaderboard[2].aura, 140);

  // 2. Verify listDirectory returns aura on members
  const dir = await call(db, '/members', { cookie: admin.cookie });
  const m1 = dir.data.members.find((m) => m.githubUsername === 'runner1');
  const m2 = dir.data.members.find((m) => m.githubUsername === 'runner2');
  const m3 = dir.data.members.find((m) => m.githubUsername === 'runner3');
  assert.equal(m1.aura, 150);
  assert.equal(m2.aura, 145);
  assert.equal(m3.aura, 140);

  // 3. Verify leaderboard prioritizes normal points, but sorts by aura when points tie
  const board = await call(db, '/club/leaderboard', { cookie: admin.cookie });
  assert.equal(board.data.leaderboard[0].githubUsername, 'runner1');
  assert.equal(board.data.leaderboard[0].aura, 150);
  assert.equal(board.data.leaderboard[1].githubUsername, 'runner2');
  assert.equal(board.data.leaderboard[1].aura, 145);
  assert.equal(board.data.leaderboard[2].githubUsername, 'runner3');
  assert.equal(board.data.leaderboard[2].aura, 140);
});

test('leaderboard prioritizes normal points over aura, and uses aura as tiebreaker when points are equal', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);

  const uHighPoints = await seedUser(db, { name: 'High Points', email: 'hp@abes.ac.in', username: 'high-pts' });
  const uHighAura = await seedUser(db, { name: 'High Aura', email: 'ha@abes.ac.in', username: 'high-aura' });
  const uLowAura = await seedUser(db, { name: 'Low Aura', email: 'la@abes.ac.in', username: 'low-aura' });

  const a1 = await db.collection('assignments').insertOne({ _id: new ObjectId(), dateKey: '2026-11-01', questionId: 1 });
  const a2 = await db.collection('assignments').insertOne({ _id: new ObjectId(), dateKey: '2026-11-02', questionId: 2 });

  // uHighPoints has 2 points (solved both), aura = 100 + 100 = 200
  await db.collection('submissions').insertOne({ _id: new ObjectId(), assignmentId: a1.insertedId, userId: uHighPoints.user._id, status: 'accepted', points: 1, submittedAt: new Date('2026-11-01T12:00:00Z') });
  await db.collection('submissions').insertOne({ _id: new ObjectId(), assignmentId: a2.insertedId, userId: uHighPoints.user._id, status: 'accepted', points: 1, submittedAt: new Date('2026-11-02T12:00:00Z') });

  // uHighAura has 1 point, was 1st runner on a Hard question (Base 250) -> aura 250
  const aHard = await db.collection('assignments').insertOne({ _id: new ObjectId(), dateKey: '2026-11-03', questionId: 4 }); // Median of Two Sorted Arrays is Hard
  await db.collection('submissions').insertOne({ _id: new ObjectId(), assignmentId: aHard.insertedId, userId: uHighAura.user._id, status: 'accepted', points: 1, submittedAt: new Date('2026-11-03T10:00:00Z') });

  // uLowAura has 1 point, was 2nd runner on a Hard question -> aura 245
  await db.collection('submissions').insertOne({ _id: new ObjectId(), assignmentId: aHard.insertedId, userId: uLowAura.user._id, status: 'accepted', points: 1, submittedAt: new Date('2026-11-03T11:00:00Z') });

  const board = await call(db, '/club/leaderboard');
  const lb = board.data.leaderboard;

  // 1. High Points is #1 because 2 points > 1 point, even though High Aura has 250 aura
  assert.equal(lb[0].githubUsername, 'high-pts');
  assert.equal(lb[0].points, 2);

  // 2. High Aura is #2 because both have 1 point, but High Aura (250) > Low Aura (245)
  assert.equal(lb[1].githubUsername, 'high-aura');
  assert.equal(lb[1].points, 1);
  assert.equal(lb[1].aura, 250);

  // 3. Low Aura is #3
  assert.equal(lb[2].githubUsername, 'low-aura');
  assert.equal(lb[2].points, 1);
  assert.equal(lb[2].aura, 245);

  // 4. Verify userRank is returned when caller has session cookie
  const resHighPts = await call(db, '/club/leaderboard', { cookie: uHighPoints.cookie });
  assert.equal(resHighPts.data.userRank, 1);
  const resHighAura = await call(db, '/club/leaderboard', { cookie: uHighAura.cookie });
  assert.equal(resHighAura.data.userRank, 2);
  const resLowAura = await call(db, '/club/leaderboard', { cookie: uLowAura.cookie });
  assert.equal(resLowAura.data.userRank, 3);
  const resAnonymous = await call(db, '/club/leaderboard');
  assert.equal(resAnonymous.data.userRank, null);
});

test('admins can award custom aura points to a member, updating directory, audit logs, and leaderboard', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const member = await seedUser(db, { name: 'Aura Member', email: 'aura@abes.ac.in', username: 'aura-gh' });
  const other = await seedUser(db, { name: 'Other Guy', email: 'other@abes.ac.in', username: 'other-gh' });

  // 1. Non-admin cannot award aura
  const denied = await call(db, `/admin/members/${member.user._id}/aura`, {
    method: 'POST',
    cookie: other.cookie,
    body: { aura: 50 },
  });
  assert.equal(denied.response.status, 403);

  // 2. Invalid aura amount rejected
  const badAmount = await call(db, `/admin/members/${member.user._id}/aura`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { aura: 0 },
  });
  assert.equal(badAmount.response.status, 400);

  // 3. Admin awards 50 custom aura points
  const award1 = await call(db, `/admin/members/${member.user._id}/aura`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { aura: 50, note: 'Solution explainer spotlight bonus' },
  });
  assert.equal(award1.response.status, 200);
  assert.equal(award1.data.ok, true);
  assert.equal(award1.data.customAura, 50);
  assert.equal(award1.data.totalAura, 50);

  // Verify member directory returns customAura and updated aura
  const dir = await call(db, '/members', { cookie: admin.cookie });
  const memberInDir = dir.data.members.find((m) => m.id === String(member.user._id));
  assert.equal(memberInDir.customAura, 50);
  assert.equal(memberInDir.aura, 50);

  // Verify audit activity logged
  const activity = await call(db, '/admin/activity', { cookie: admin.cookie });
  const auraLog = activity.data.activity.find((a) => a.action === 'member_blaze_awarded' || a.action === 'member_aura_awarded');
  assert.ok(auraLog);
  assert.equal(auraLog.details.amount, 50);

  // 4. Admin awards another 25 aura
  const award2 = await call(db, `/admin/members/${member.user._id}/aura`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { aura: 25 },
  });
  assert.equal(award2.data.customAura, 75);
  assert.equal(award2.data.totalAura, 75);

  // 5. Admin sets custom aura to 100 via mode: 'set'
  const setAura = await call(db, `/admin/members/${member.user._id}/aura`, {
    method: 'POST',
    cookie: admin.cookie,
    body: { aura: 100, mode: 'set' },
  });
  assert.equal(setAura.data.customAura, 100);
  assert.equal(setAura.data.totalAura, 100);

  // 6. Verify overall leaderboard reflects custom aura
  const lbRes = await call(db, '/club/leaderboard');
  const lbMember = lbRes.data.leaderboard.find((m) => m.githubUsername === 'aura-gh');
  assert.ok(lbMember);
  assert.equal(lbMember.aura, 100);
});

test('submissions heatmap provides full and second-year counts, and enforces admin role', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const regular = await seedUser(db, { name: 'Regular Guy', email: 'regular@abes.ac.in', username: 'regular-gh' });
  const secondYearUser = await seedUser(db, { name: 'Sophomore Sam', email: 'sam@abes.ac.in', username: 'sam-gh', studyYear: 'second-year' });
  const thirdYearUser = await seedUser(db, { name: 'Junior Jay', email: 'jay@abes.ac.in', username: 'jay-gh', studyYear: 'third-year' });

  // 1. Regular user is forbidden
  const forbidden = await call(db, '/admin/submissions-heatmap', { cookie: regular.cookie });
  assert.equal(forbidden.response.status, 403);

  // 2. Insert submissions for both users
  const today = '2026-11-04';
  const aRes = await db.collection('assignments').insertOne({
    dateKey: today,
    questionId: 1,
    createdByName: 'Admin',
  });
  const assignmentId = aRes.insertedId;

  await db.collection('submissions').insertOne({
    assignmentId,
    userId: secondYearUser.user._id,
    questionId: 1,
    status: 'accepted',
    points: 1,
    submittedAt: new Date('2026-11-04T10:00:00.000Z'),
  });

  await db.collection('submissions').insertOne({
    assignmentId,
    userId: thirdYearUser.user._id,
    questionId: 1,
    status: 'accepted',
    points: 1,
    submittedAt: new Date('2026-11-04T11:00:00.000Z'),
  });

  // 3. Admin fetches heatmap
  const heatmapRes = await call(db, '/admin/submissions-heatmap', { cookie: admin.cookie });
  assert.equal(heatmapRes.response.status, 200);
  assert.equal(heatmapRes.data.counts['2026-11-04'], 2);
  assert.equal(heatmapRes.data.secondYearCounts['2026-11-04'], 1);

  // 4. Admin filters by second-year query
  const filtered = await call(db, '/admin/submissions-heatmap?studyYear=second-year', { cookie: admin.cookie });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.data.counts['2026-11-04'], 1);

  // 5. Admin fetches submissions by date
  const byDateRes = await call(db, '/admin/submissions-by-date?date=2026-11-04', { cookie: admin.cookie });
  assert.equal(byDateRes.response.status, 200);
  assert.equal(byDateRes.data.count, 2);
  assert.equal(byDateRes.data.submissions.length, 2);

  // 6. Admin filters submissions by date for second-year
  const byDateSecondYear = await call(db, '/admin/submissions-by-date?date=2026-11-04&studyYear=second-year', { cookie: admin.cookie });
  assert.equal(byDateSecondYear.response.status, 200);
  assert.equal(byDateSecondYear.data.count, 1);
  assert.equal(byDateSecondYear.data.submissions[0].name, 'Sophomore Sam');

  // 7. Regular user is forbidden
  const forbiddenByDate = await call(db, '/admin/submissions-by-date?date=2026-11-04', { cookie: regular.cookie });
  assert.equal(forbiddenByDate.response.status, 403);

  // 8. Month CSV export
  const monthCsvRes = await call(db, '/admin/month-submissions-csv?month=2026-11&format=csv', { cookie: admin.cookie });
  assert.equal(monthCsvRes.response.status, 200);
  assert.ok(monthCsvRes.response.headers.get('content-type').includes('text/csv'));
  assert.ok(monthCsvRes.text.includes('Name,Department,nov1,nov2'));
  assert.ok(monthCsvRes.text.includes('Submissions'));
  assert.ok(monthCsvRes.text.includes('✔'));
  assert.ok(monthCsvRes.text.includes('✘'));

  // 8b. Month XLSX export
  const monthXlsxRes = await call(db, '/admin/month-submissions-csv?month=2026-11&format=xlsx', { cookie: admin.cookie });
  assert.equal(monthXlsxRes.response.status, 200);
  assert.ok(monthXlsxRes.response.headers.get('content-type').includes('spreadsheetml'));

  // 9. Regular user cannot download month CSV
  const forbiddenCsv = await call(db, '/admin/month-submissions-csv?month=2026-11', { cookie: regular.cookie });
  assert.equal(forbiddenCsv.response.status, 403);

  // 10. Invalid month format rejected
  const invalidMonth = await call(db, '/admin/month-submissions-csv?month=bad-format', { cookie: admin.cookie });
  assert.equal(invalidMonth.response.status, 400);
});

test('admin view all stats rate limit allows more than 12 stats fetches without hitting rate limit', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  leetcodePayload = {
    data: {
      matchedUser: {
        username: 'test-lc', submitStats: {
          acSubmissionNum: [{ difficulty: 'All', count: 10 }, { difficulty: 'Easy', count: 10 }, { difficulty: 'Medium', count: 0 }, { difficulty: 'Hard', count: 0 }],
          totalSubmissionNum: [{ difficulty: 'All', count: 15 }, { difficulty: 'Easy', count: 15 }, { difficulty: 'Medium', count: 0 }, { difficulty: 'Hard', count: 0 }],
        }
      }
    }
  };

  // Insert 15 approved members with leetcode usernames directly
  for (let i = 1; i <= 15; i++) {
    const memberId = new ObjectId();
    await db.collection('users').insertOne({
      _id: memberId,
      name: `Member ${i}`,
      email: `member${i}@abes.ac.in`,
      department: 'Computer Science',
      studyYear: 'second-year',
      githubUsername: `gh-user-${i}`,
      githubUserLower: `gh-user-${i}`.toLowerCase(),
      leetcodeUsername: `lc-user-${i}`,
      role: 'member',
      approvalStatus: 'approved',
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const res = await call(db, `/members/${memberId}/leetcode-stats`, { cookie: admin.cookie });
    assert.equal(res.response.status, 200, `Request ${i} should succeed for admin`);
    assert.equal(res.data.available, true);
  }
});

test('submitting solutions via GitHub blob link, repo link, or PR commit link resolves commit and accepts solution', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Flexible Solver', email: 'flex@abes.ac.in', username: 'student-gh' });
  const assigned = await call(db, '/admin/assignments', { method: 'POST', cookie: admin.cookie, body: { dateKey: indiaDay(), questionId: 217 } });
  const assignmentId = assigned.data.assignment.id;

  const sha = 'e'.repeat(40);
  commits.set(sha, commitFixture({ sha, questionId: 217, username: 'student-gh' }));

  // 1. Submit via blob / file URL: https://github.com/student-gh/dsa-solutions/blob/main/217/solution.txt
  const blobSub = await call(db, '/submissions', {
    method: 'POST',
    cookie: student.cookie,
    body: { assignmentId, commitUrl: 'https://github.com/student-gh/dsa-solutions/blob/main/217/solution.txt' }
  });
  assert.equal(blobSub.response.status, 201);
  assert.equal(blobSub.data.submission.status, 'accepted');
  assert.equal(blobSub.data.submission.solutionPath, '217/solution.txt');

  // 2. Submit via PR commit URL: https://github.com/student-gh/dsa-solutions/pull/1/commits/sha
  const student2 = await seedUser(db, { name: 'PR Solver', email: 'pr@abes.ac.in', username: 'student-gh' });
  const prSha = 'f'.repeat(40);
  commits.set(prSha, commitFixture({ sha: prSha, questionId: 217, username: 'student-gh' }));
  const prSub = await call(db, '/submissions', {
    method: 'POST',
    cookie: student2.cookie,
    body: { assignmentId, commitUrl: `https://github.com/student-gh/dsa-solutions/pull/1/commits/${prSha}` }
  });
  assert.equal(prSub.response.status, 201);
  assert.equal(prSub.data.submission.status, 'accepted');
});

test('admins can view active rate limit count and clear rate limits in one click', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Rate Limited User', email: 'limited@abes.ac.in', username: 'student-gh' });

  // Add some dummy rate limit records
  await db.collection('rateLimits').insertOne({ _id: 'submission-1:ip:1', count: 10 });
  await db.collection('rateLimits').insertOne({ _id: 'register:ip:1', count: 6 });

  // 1. Non-admin gets 403
  const forbiddenView = await call(db, '/admin/rate-limits', { cookie: student.cookie });
  assert.equal(forbiddenView.response.status, 403);
  const forbiddenClear = await call(db, '/admin/clear-rate-limits', { method: 'POST', cookie: student.cookie, body: {} });
  assert.equal(forbiddenClear.response.status, 403);

  // 2. Admin views count
  const countRes = await call(db, '/admin/rate-limits', { cookie: admin.cookie });
  assert.equal(countRes.response.status, 200);
  assert.ok(countRes.data.count >= 2);

  // 3. Admin clears rate limits
  const clearRes = await call(db, '/admin/clear-rate-limits', { method: 'POST', cookie: admin.cookie, body: {} });
  assert.equal(clearRes.response.status, 200);
  assert.equal(clearRes.data.ok, true);
  assert.ok(clearRes.data.clearedCount >= 2);

  // 4. Verify rateLimits collection is empty
  const afterCount = await call(db, '/admin/rate-limits', { cookie: admin.cookie });
  assert.equal(afterCount.data.count, 0);

  // 5. Verify audit log entry
  const activity = await call(db, '/admin/activity', { cookie: admin.cookie });
  assert.equal(activity.data.activity[0].action, 'rate_limits_cleared');
});

test('automatic daily assignment picks sequential curriculum questions, preserves admin edits and deletions', async () => {
  const db = new FakeDatabase();
  const admin = await seedAdmin(db);
  const student = await seedUser(db, { name: 'Auto Solver', email: 'auto@abes.ac.in', username: 'student-gh' });

  // 1. First automated assignment on a clean DB picks Day 1 (LC 217)
  const day1Q = await getNextQuestionForDate(db, '2026-11-01');
  assert.equal(day1Q.questionId, 217);

  const auto1 = await autoAssignDailyQuestion(db, '2026-11-01');
  assert.ok(auto1);
  assert.equal(auto1.questionId, 217);
  assert.equal(auto1.autoAssigned, true);
  assert.equal(auto1.createdByName, 'Automated Daily Challenge');

  // 2. Next day automated assignment picks Day 2 (LC 242)
  const day2Q = await getNextQuestionForDate(db, '2026-11-02');
  assert.equal(day2Q.questionId, 242);

  const auto2 = await autoAssignDailyQuestion(db, '2026-11-02');
  assert.equal(auto2.questionId, 242);

  // 3. Next day automated assignment picks Day 3 (LC 1)
  const day3Q = await getNextQuestionForDate(db, '2026-11-03');
  assert.equal(day3Q.questionId, 1);

  // 4. Admin edits/replaces today's automated assignment (must remain editable)
  const today = indiaDay();
  const todayAuto = await autoAssignDailyQuestion(db, today);
  assert.ok(todayAuto);

  // Admin changes today's question to LC 49
  const editRes = await call(db, `/admin/assignments/${todayAuto._id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { questionId: 49 },
  });
  assert.equal(editRes.response.status, 200);
  assert.equal(editRes.data.assignment.questionId, 49);

  // Verify DB reflects admin edit
  const updatedDoc = await db.collection('assignments').findOne({ _id: todayAuto._id });
  assert.equal(updatedDoc.questionId, 49);

  // 5. When auto-assign runs again for today, it does NOT overwrite existing assignment
  const secondRun = await autoAssignDailyQuestion(db, today);
  assert.equal(secondRun.questionId, 49);

  // 6. Admin deletes today's assignment (must remain deletable)
  const deleteRes = await call(db, `/admin/assignments/${todayAuto._id}`, {
    method: 'DELETE',
    cookie: admin.cookie,
  });
  assert.equal(deleteRes.response.status, 200);
  assert.equal(deleteRes.data.deleted, true);

  // Verify deletion is respected: autoAssign will NOT resurrect a deleted assignment
  const deletedCheck = await autoAssignDailyQuestion(db, today);
  assert.equal(deletedCheck, null);

  // 7. Cron endpoint /api/cron/daily-assignment works and returns success
  const cronRes = await call(db, '/cron/daily-assignment?dateKey=2026-11-10');
  assert.equal(cronRes.response.status, 200);
  assert.equal(cronRes.data.ok, true);
  assert.equal(cronRes.data.dateKey, '2026-11-10');
  assert.ok(cronRes.data.assignment);

  // 8. getNextMidnightIST calculates valid time offset
  const midnightInfo = getNextMidnightIST();
  assert.ok(midnightInfo.ms > 0);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(midnightInfo.nextDateKey));
});

test('question activity uses club submissions and those completions cannot be unchecked', async () => {
  const db = new FakeDatabase();
  const member = await seedUser(db, { name: 'Progress Member', email: 'progress@abes.ac.in', username: 'progress-gh' });
  const personal = await call(db, '/progress/242', { method: 'PUT', cookie: member.cookie, body: { solved: true } });
  assert.equal(personal.response.status, 200);

  const assignmentId = new ObjectId();
  const submittedAt = new Date('2026-11-02T08:30:00.000Z');
  await db.collection('submissions').insertOne({
    _id: new ObjectId(),
    assignmentId,
    userId: member.user._id,
    questionId: 217,
    status: 'accepted',
    submittedAt,
    points: 1,
  });

  const progress = await call(db, '/progress', { cookie: member.cookie });
  assert.equal(progress.response.status, 200);
  const personalRow = progress.data.progress.find((item) => item.questionId === 242);
  const clubRow = progress.data.progress.find((item) => item.questionId === 217);
  assert.equal(personalRow.isClub, false);
  assert.equal(clubRow.isClub, true);
  assert.deepEqual(progress.data.activity.map((item) => item.questionId), [217]);
  assert.equal(progress.data.activity.every((item) => item.isClub), true);

  const stored = db.collection('personalProgress').documents.find((item) => item.questionId === 217);
  assert.equal(stored.isClub, true);
  assert.equal(String(stored.assignmentId), String(assignmentId));

  const uncheckClub = await call(db, '/progress/217', { method: 'PUT', cookie: member.cookie, body: { solved: false } });
  assert.equal(uncheckClub.response.status, 403);
  assert.equal(db.collection('personalProgress').documents.some((item) => item.questionId === 217 && item.isClub), true);

  const uncheckPersonal = await call(db, '/progress/242', { method: 'PUT', cookie: member.cookie, body: { solved: false } });
  assert.equal(uncheckPersonal.response.status, 200);
  const after = await call(db, '/progress', { cookie: member.cookie });
  assert.deepEqual(after.data.progress.map((item) => item.questionId), [217]);
  assert.deepEqual(after.data.activity.map((item) => item.questionId), [217]);
});
