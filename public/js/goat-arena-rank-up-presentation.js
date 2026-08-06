import {
  dispatchRankUpPresentation,
} from "./matths-rank-up-integration.js";

const payloadNode = document.querySelector(
  "[data-rank-up-presentation-payload]"
);

if (payloadNode) {
  let presentation = null;
  try {
    presentation = JSON.parse(payloadNode.textContent || "null");
  } catch {
    presentation = null;
  }

  const presentationId = String(presentation?.id || "").trim();
  let acknowledgement = null;

  function acknowledge() {
    if (!presentationId) return Promise.resolve(false);
    if (!acknowledgement) {
      acknowledgement = fetch(
        `/api/goat-arena/rank-up-presentations/${encodeURIComponent(presentationId)}/ack`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          keepalive: true,
        }
      )
        .then((response) => {
          if (!response.ok) {
            throw new Error(`승급 연출 확인 실패 (${response.status})`);
          }
          return true;
        })
        .catch((error) => {
          acknowledgement = null;
          console.warn(error.message);
          return false;
        });
    }
    return acknowledgement;
  }

  window.addEventListener(
    "rankUpPresentationShown",
    (event) => {
      if (event.detail?.presentationId === presentationId) {
        acknowledge();
      }
    }
  );

  window.addEventListener(
    "rankUpPresentationRejected",
    (event) => {
      const rejectedId = event.detail?.detail?.presentationId;
      if (
        rejectedId === presentationId &&
        event.detail?.reason === "already-presented-in-session"
      ) {
        acknowledge();
      }
    }
  );

  if (presentationId) {
    dispatchRankUpPresentation({
      presentationId,
      fromTier: presentation.fromTier,
      toTier: presentation.toTier,
      allowSound: true,
    });
  }
}
