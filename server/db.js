import { MongoClient } from 'mongodb';

const cache = globalThis;

export async function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const error = new Error('Database is not configured. Set MONGODB_URI in your local environment and in Vercel.');
    error.status = 503;
    throw error;
  }

  if (!cache.__dsavationMongoPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 10_000,
      serverSelectionTimeoutMS: 8_000,
    });
    cache.__dsavationMongoPromise = client.connect();
  }

  const client = await cache.__dsavationMongoPromise;
  const db = client.db(process.env.MONGODB_DB || 'dsavation');
  if (!cache.__dsavationIndexesPromise) {
    cache.__dsavationIndexesPromise = Promise.all([
      db.collection('users').createIndex({ email: 1 }, { unique: true }),
      db.collection('users').createIndex({ githubUserLower: 1 }, {
        unique: true,
        partialFilterExpression: { githubUserLower: { $type: 'string' } },
      }),
      db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('passwordResets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection('passwordResets').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('personalProgress').createIndex({ userId: 1, questionId: 1 }, { unique: true }),
      db.collection('assignments').createIndex({ dateKey: 1 }, { unique: true }),
      db.collection('submissions').createIndex({ assignmentId: 1, userId: 1 }, { unique: true }),
      db.collection('submissions').createIndex({ commitSha: 1 }, {
        unique: true,
        partialFilterExpression: { commitSha: { $type: 'string' } },
      }),
      db.collection('adminActivity').createIndex({ createdAt: -1, _id: -1 }),
      db.collection('rateLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }
  await cache.__dsavationIndexesPromise;
  return db;
}
