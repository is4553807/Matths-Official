const session = require("express-session");
const { WebSession } = require("../models/sessionModel");

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;

function sessionExpiry(sessionData, ttlSeconds) {
  const cookieExpiry = sessionData?.cookie?.expires
    ? new Date(sessionData.cookie.expires)
    : null;
  if (cookieExpiry && !Number.isNaN(cookieExpiry.getTime())) return cookieExpiry;
  return new Date(Date.now() + ttlSeconds * 1000);
}

class MongoSessionStore extends session.Store {
  constructor({
    ttlSeconds = DEFAULT_TTL_SECONDS,
    operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  } = {}) {
    super();
    this.ttlSeconds = Math.max(300, Number(ttlSeconds) || DEFAULT_TTL_SECONDS);
    this.operationTimeoutMs = Math.max(
      1_000,
      Number(operationTimeoutMs) || DEFAULT_OPERATION_TIMEOUT_MS
    );
  }

  queryTimeout(query) {
    return query.maxTimeMS(this.operationTimeoutMs);
  }

  get(sid, callback) {
    this.queryTimeout(WebSession.findOne({ sid, expiresAt: { $gt: new Date() } }))
      .select("session")
      .lean()
      .then((record) => callback(null, record?.session || null))
      .catch((error) => callback(error));
  }

  set(sid, sessionData, callback = () => {}) {
    this.queryTimeout(WebSession.updateOne(
      { sid },
      {
        $set: {
          session: sessionData,
          expiresAt: sessionExpiry(sessionData, this.ttlSeconds),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    ))
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  touch(sid, sessionData, callback = () => {}) {
    this.queryTimeout(WebSession.updateOne(
      { sid },
      {
        $set: {
          expiresAt: sessionExpiry(sessionData, this.ttlSeconds),
        },
      }
    ))
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  destroy(sid, callback = () => {}) {
    this.queryTimeout(WebSession.deleteOne({ sid }))
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  clear(callback = () => {}) {
    this.queryTimeout(WebSession.deleteMany({}))
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  length(callback) {
    this.queryTimeout(WebSession.countDocuments({ expiresAt: { $gt: new Date() } }))
      .then((count) => callback(null, count))
      .catch((error) => callback(error));
  }
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  DEFAULT_OPERATION_TIMEOUT_MS,
  MongoSessionStore,
  sessionExpiry,
};
