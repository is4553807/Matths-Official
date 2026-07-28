const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const COACH_MESSAGE_PATH = path.join(
  __dirname,
  "..",
  "content_folder",
  "coach-messages.yaml"
);
const MODES = [
  "mild",
  "spicy",
  "silent",
];
const SITUATIONS = [
  "correct",
  "incorrect",
  "unanswered",
];

let cachedContent = null;
let cachedModifiedAt = 0;
let communityMessages = {};

function normalizeMessages(messages) {
  return Array.isArray(messages)
    ? messages
        .map((message) =>
          String(message || "").trim()
        )
        .filter(Boolean)
    : [];
}

function validateContent(content) {
  for (const mode of MODES) {
    const modeContent =
      content?.modes?.[mode];

    if (!modeContent) {
      throw new Error(
        `코치 문구에 ${mode} 모드가 없습니다.`
      );
    }

    for (const situation of
      SITUATIONS) {
      const messages =
        normalizeMessages(
          modeContent.messages?.[
            situation
          ]
        );

      if (!messages.length) {
        throw new Error(
          `코치 문구의 ${mode}/${situation} 목록이 비어 있습니다.`
        );
      }
    }
  }

  return content;
}

function loadCoachMessages() {
  const modifiedAt =
    fs.statSync(
      COACH_MESSAGE_PATH
    ).mtimeMs;

  if (
    cachedContent &&
    cachedModifiedAt ===
      modifiedAt
  ) {
    return cachedContent;
  }

  cachedContent = validateContent(
    yaml.load(
      fs.readFileSync(
        COACH_MESSAGE_PATH,
        "utf8"
      )
    )
  );
  cachedModifiedAt = modifiedAt;

  return cachedContent;
}

function normalizeMode(mode) {
  return MODES.includes(mode)
    ? mode
    : "spicy";
}

function normalizeSituation(
  situation
) {
  return SITUATIONS.includes(
    situation
  )
    ? situation
    : "unanswered";
}

function stableIndex(seed, length) {
  const text = String(
    seed || Date.now()
  );
  let hash = 0;

  for (const character of text) {
    hash =
      (hash * 31 +
        character.codePointAt(0)) >>>
      0;
  }

  return hash % length;
}

function getCoachView({
  mode,
  situation,
  seed,
} = {}) {
  const normalizedMode =
    normalizeMode(mode);
  const normalizedSituation =
    normalizeSituation(
      situation
    );
  const modeContent =
    loadCoachMessages().modes[
      normalizedMode
    ];
  const messages = [
    ...normalizeMessages(
      modeContent.messages[
        normalizedSituation
      ]
    ),
    ...normalizeMessages(
      communityMessages[
        normalizedMode
      ]?.[
        normalizedSituation
      ]
    ),
  ];

  return {
    mode: normalizedMode,
    label: modeContent.label,
    title: modeContent.title,
    situation:
      normalizedSituation,
    message:
      messages[
        stableIndex(
          seed,
          messages.length
        )
      ],
  };
}

function setCommunityCoachMessages(
  records = []
) {
  communityMessages = {};

  for (const mode of MODES) {
    communityMessages[mode] = {};

    for (const situation of
      SITUATIONS) {
      communityMessages[mode][
        situation
      ] = [];
    }
  }

  for (const record of records) {
    if (
      !MODES.includes(record?.mode) ||
      !SITUATIONS.includes(
        record?.situation
      )
    ) {
      continue;
    }

    const message = String(
      record.message || ""
    ).trim();

    if (message) {
      communityMessages[
        record.mode
      ][record.situation].push(
        message
      );
    }
  }
}

module.exports = {
  COACH_MESSAGE_PATH,
  MODES,
  SITUATIONS,
  getCoachView,
  loadCoachMessages,
  setCommunityCoachMessages,
};
