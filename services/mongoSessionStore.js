const session = require("express-session");
const { WebSession } = require("../models/sessionModel");

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function sessionExpiry(sessionData, ttlSeconds) {
  const cookieExpiry = sessionData?.cookie?.expires
    ? new Date(sessionData.cookie.expires)
    : null;
  if (cookieExpiry && !Number.isNaN(cookieExpiry.getTime())) return cookieExpiry;
  return new Date(Date.now() + ttlSeconds * 1000);
}

class MongoSessionStore extends session.Store {
  constructor({ ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
    super();
    this.ttlSeconds = Math.max(300, Number(ttlSeconds) || DEFAULT_TTL_SECONDS);
  }

  get(sid, callback) {
    WebSession.findOne({ sid, expiresAt: { $gt: new Date() } })
      .lean()
      .then((record) => callback(null, record?.session || null))
      .catch((error) => callback(error));
  }

  set(sid, sessionData, callback = () => {}) {
    WebSession.findOneAndUpdate(
      { sid },
      {
        $set: {
          session: sessionData,
          expiresAt: sessionExpiry(sessionData, this.ttlSeconds),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  touch(sid, sessionData, callback = () => {}) {
    WebSession.updateOne(
      { sid },
      {
        $set: {
          session: sessionData,
          expiresAt: sessionExpiry(sessionData, this.ttlSeconds),
        },
      }
    )
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  destroy(sid, callback = () => {}) {
    WebSession.deleteOne({ sid })
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  clear(callback = () => {}) {
    WebSession.deleteMany({})
      .then(() => callback(null))
      .catch((error) => callback(error));
  }

  length(callback) {
    WebSession.countDocuments({ expiresAt: { $gt: new Date() } })
      .then((count) => callback(null, count))
      .catch((error) => callback(error));
  }
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  MongoSessionStore,
  sessionExpiry,
};
