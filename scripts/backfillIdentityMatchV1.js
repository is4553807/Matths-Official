const path = require("node:path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({
  path: path.join(
    __dirname,
    "..",
    "config.env"
  ),
  quiet: true,
});

const {
  User,
} = require("../models/matthsModel");
const {
  alertPotentialDuplicateIdentity,
  buildIdentityMatchHash,
} = require("../services/identityRiskService");

const IDENTITY_VERSION =
  "name-birthdate-school-v1";

async function buildPlan() {
  const users = await User.find({})
    .select(
      "+birthDate +identityMatchHash +identityMatchVersion realName school accountStatus"
    )
    .lean();
  const operations = [];
  const eligible = [];
  let excludedWithoutSchool = 0;
  let excludedWithoutIdentity = 0;

  for (const user of users) {
    const schoolCode = String(
      user.school?.code || ""
    ).trim();
    if (!schoolCode) {
      excludedWithoutSchool += 1;
      if (
        user.identityMatchHash ||
        user.identityMatchVersion
      ) {
        operations.push({
          updateOne: {
            filter: { _id: user._id },
            update: {
              $unset: {
                identityMatchHash: 1,
                identityMatchVersion: 1,
              },
            },
          },
        });
      }
      continue;
    }
    if (!user.realName || !user.birthDate) {
      excludedWithoutIdentity += 1;
      if (
        user.identityMatchHash ||
        user.identityMatchVersion
      ) {
        operations.push({
          updateOne: {
            filter: { _id: user._id },
            update: {
              $unset: {
                identityMatchHash: 1,
                identityMatchVersion: 1,
              },
            },
          },
        });
      }
      continue;
    }

    const identityMatchHash =
      buildIdentityMatchHash({
        realName: user.realName,
        birthDate: user.birthDate,
        schoolCode,
      });
    eligible.push({
      _id: user._id,
      schoolCode,
      identityMatchHash,
      accountStatus:
        user.accountStatus,
    });
    if (
      user.identityMatchHash !==
        identityMatchHash ||
      user.identityMatchVersion !==
        IDENTITY_VERSION
    ) {
      operations.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              identityMatchHash,
              identityMatchVersion:
                IDENTITY_VERSION,
            },
          },
        },
      });
    }
  }

  const duplicateGroups = new Map();
  for (const identity of eligible) {
    if (
      identity.accountStatus ===
      "withdrawn"
    ) {
      continue;
    }
    const key = `${identity.schoolCode}:${identity.identityMatchHash}`;
    const group =
      duplicateGroups.get(key) || [];
    group.push(identity);
    duplicateGroups.set(key, group);
  }

  return {
    scanned: users.length,
    operations,
    excludedWithoutSchool,
    excludedWithoutIdentity,
    duplicateGroups: [
      ...duplicateGroups.values(),
    ].filter(
      (group) => group.length > 1
    ),
  };
}

async function main() {
  if (!process.env.DB) {
    throw new Error(
      "config.env의 DB 연결 정보가 필요합니다."
    );
  }
  const apply =
    process.argv.includes("--apply");
  await mongoose.connect(
    process.env.DB
  );
  const plan = await buildPlan();

  if (apply && plan.operations.length) {
    await User.bulkWrite(
      plan.operations,
      { ordered: false }
    );
  }
  if (apply) {
    for (const group of
      plan.duplicateGroups) {
      const representative =
        await User.findById(
          group[0]._id
        )
          .select(
            "+identityMatchHash +identityMatchVersion school"
          );
      await alertPotentialDuplicateIdentity(
        representative
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply
          ? "apply"
          : "dry-run",
        scanned: plan.scanned,
        pendingUpdates:
          plan.operations.length,
        excludedWithoutSchool:
          plan.excludedWithoutSchool,
        excludedWithoutIdentity:
          plan.excludedWithoutIdentity,
        duplicateGroups:
          plan.duplicateGroups.map(
            (group) =>
              group.map((entry) =>
                String(entry._id)
              )
          ),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log(
      "변경하려면 npm run identity-match:backfill -- --apply 를 실행하세요."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (
      mongoose.connection.readyState
    ) {
      await mongoose.disconnect();
    }
  });
