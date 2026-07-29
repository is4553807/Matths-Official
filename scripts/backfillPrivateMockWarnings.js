const path =
  require("node:path");
const dotenv =
  require("dotenv");
const mongoose =
  require("mongoose");

dotenv.config({
  path: path.join(
    __dirname,
    "..",
    "config.env"
  ),
  quiet: true,
});

const {
  PrivateMockIntegrityCase,
  User,
} = require("../models/matthsModel");

async function backfillCase(
  caseId
) {
  const session =
    await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(
      async () => {
        const claimed =
          await PrivateMockIntegrityCase.findOneAndUpdate(
            {
              _id: caseId,
              status:
                "CONFIRMED_CHEATING",
              penaltyAppliedAt: {
                $ne: null,
              },
              warningAppliedAt: null,
            },
            {
              $set: {
                warningAppliedAt:
                  new Date(),
              },
            },
            {
              returnDocument:
                "after",
              session,
            }
          ).lean();
        if (!claimed) return;

        const user =
          await User.findOneAndUpdate(
            {
              _id:
                claimed.userId,
            },
            {
              $inc: {
                warningCount: 1,
              },
            },
            {
              returnDocument:
                "after",
              session,
            }
          )
            .select(
              "name realName warningCount"
            )
            .lean();

        result = {
          caseId:
            String(claimed._id),
          user:
            user?.realName ||
            user?.name ||
            String(
              claimed.userId
            ),
          warningCount:
            Number(
              user?.warningCount
            ) || 0,
        };
      }
    );
  } finally {
    await session.endSession();
  }
  return result;
}

async function main() {
  if (!process.env.DB) {
    throw new Error(
      "config.env의 DB 연결 정보가 필요합니다."
    );
  }
  await mongoose.connect(
    process.env.DB
  );

  const cases =
    await PrivateMockIntegrityCase.find({
      status:
        "CONFIRMED_CHEATING",
      penaltyAppliedAt: {
        $ne: null,
      },
      warningAppliedAt: null,
    })
      .select("_id")
      .lean();
  const updated = [];

  for (const integrityCase of cases) {
    const result =
      await backfillCase(
        integrityCase._id
      );
    if (result) {
      updated.push(result);
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned:
          cases.length,
        updated,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
