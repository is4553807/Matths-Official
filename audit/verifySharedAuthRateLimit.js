const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  AuthRequestLimitBucket,
} = require("../models/matthsModel");
const {
  bucketDocumentId,
  consumeAuthRequestLimit,
} = require("../services/authRequestLimitService");
const {
  createRateLimit,
} = require("../middleware/requestSecurity");

function clone(value) {
  if (!value) return null;
  return {
    ...value,
    resetAt: new Date(
      value.resetAt
    ),
  };
}

function installMemoryModel() {
  const rows = new Map();

  AuthRequestLimitBucket.findOneAndUpdate =
    (filter, update) => ({
      async lean() {
        const current = rows.get(
          filter._id
        );
        if (!current) return null;

        if (
          filter.resetAt?.$gt &&
          !(
            current.resetAt >
            filter.resetAt.$gt
          )
        ) {
          return null;
        }
        if (
          filter.resetAt?.$lte &&
          !(
            current.resetAt <=
            filter.resetAt.$lte
          )
        ) {
          return null;
        }
        if (
          filter.count?.$lt !==
            undefined &&
          !(
            current.count <
            filter.count.$lt
          )
        ) {
          return null;
        }

        if (update.$inc?.count) {
          current.count +=
            update.$inc.count;
        }
        if (update.$set) {
          Object.assign(
            current,
            update.$set
          );
        }
        rows.set(
          filter._id,
          current
        );
        return clone(current);
      },
    });

  AuthRequestLimitBucket.findById =
    (_id) => ({
      async lean() {
        return clone(
          rows.get(_id)
        );
      },
    });

  AuthRequestLimitBucket.create =
    async (document) => {
      if (rows.has(document._id)) {
        const error = new Error(
          "duplicate key"
        );
        error.code = 11000;
        throw error;
      }
      const created =
        clone(document);
      rows.set(
        document._id,
        created
      );
      return clone(created);
    };

  return rows;
}

function response() {
  return {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
  };
}

async function invoke(
  middleware,
  req,
  res = response()
) {
  let called = false;
  let error = null;
  await middleware(
    req,
    res,
    (nextError) => {
      called = true;
      error = nextError || null;
    }
  );
  assert.equal(called, true);
  return { error, res };
}

async function run() {
  const original = {
    findOneAndUpdate:
      AuthRequestLimitBucket.findOneAndUpdate,
    findById:
      AuthRequestLimitBucket.findById,
    create:
      AuthRequestLimitBucket.create,
  };

  try {
    let rows = installMemoryModel();
    const base = {
      bucketKey:
        "login:203.0.113.1:private@example.com",
      limit: 2,
      windowMs: 60_000,
    };
    const first =
      await consumeAuthRequestLimit({
        ...base,
        now: new Date(
          "2026-08-15T00:00:00.000Z"
        ),
      });
    const second =
      await consumeAuthRequestLimit({
        ...base,
        now: new Date(
          "2026-08-15T00:00:01.000Z"
        ),
      });
    const blocked =
      await consumeAuthRequestLimit({
        ...base,
        now: new Date(
          "2026-08-15T00:00:02.000Z"
        ),
      });
    assert.deepEqual(
      [
        first.count,
        second.count,
        blocked.count,
      ],
      [1, 2, 2]
    );
    assert.equal(first.limited, false);
    assert.equal(second.limited, false);
    assert.equal(blocked.limited, true);

    const afterReset =
      await consumeAuthRequestLimit({
        ...base,
        now: new Date(
          "2026-08-15T00:01:00.001Z"
        ),
      });
    assert.equal(
      afterReset.count,
      1
    );
    assert.equal(
      afterReset.limited,
      false
    );

    const storedId =
      [...rows.keys()][0];
    assert.equal(
      storedId,
      bucketDocumentId(
        base.bucketKey
      )
    );
    assert.doesNotMatch(
      storedId,
      /private@example\.com/
    );

    rows = installMemoryModel();
    const simultaneous =
      await Promise.all(
        Array.from(
          { length: 8 },
          () =>
            consumeAuthRequestLimit({
              bucketKey:
                "registration:shared",
              limit: 2,
              windowMs: 60_000,
              now: new Date(
                "2026-08-15T01:00:00.000Z"
              ),
            })
        )
      );
    assert.equal(
      simultaneous.filter(
        (item) => !item.limited
      ).length,
      2
    );
    assert.equal(
      simultaneous.filter(
        (item) => item.limited
      ).length,
      6
    );

    let middlewareCalls = 0;
    const middleware =
      createRateLimit({
        name: "shared-test",
        limit: 1,
        windowMs: 60_000,
        key: () => "key",
        consumer: async () => {
          middlewareCalls += 1;
          return {
            count: 1,
            limited:
              middlewareCalls > 1,
            resetAt: new Date(
              Date.now() + 60_000
            ),
          };
        },
      });
    const request = {
      body: {},
      ip: "203.0.113.1",
    };
    const allowed =
      await invoke(
        middleware,
        request
      );
    const denied =
      await invoke(
        middleware,
        request
      );
    assert.equal(
      allowed.error,
      null
    );
    assert.equal(
      denied.error.status,
      429
    );
    assert.equal(
      denied.error.code,
      "AUTH_RATE_LIMITED"
    );
    assert.ok(
      Number(
        denied.res.headers[
          "Retry-After"
        ]
      ) >= 1
    );

    assert.ok(
      AuthRequestLimitBucket.schema
        .indexes()
        .some(
          ([fields, options]) =>
            fields.resetAt === 1 &&
            options.expireAfterSeconds ===
              0
        )
    );
    const serverSource =
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "server.js"
        ),
        "utf8"
      );
    assert.match(
      serverSource,
      /await ensureAuthRequestLimitIndexes\(\)/
    );
  } finally {
    AuthRequestLimitBucket.findOneAndUpdate =
      original.findOneAndUpdate;
    AuthRequestLimitBucket.findById =
      original.findById;
    AuthRequestLimitBucket.create =
      original.create;
  }

  console.log(
    "Shared authentication rate limits verified: hashed keys, atomic concurrent caps, expiry reset, 429 headers, and TTL cleanup all pass."
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
