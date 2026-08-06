import { getRankTier, normalizeRankTier } from "./rank-motion-tiers.js";

const PRESENTATION_EVENT = "rankUpPresentation";
const PRESENTED_EVENT = "rankUpPresentationShown";
const REJECTED_EVENT = "rankUpPresentationRejected";
const PRESENTED_KEY_PREFIX = "matths.rankUpPresentation.v1.";
const pendingPresentations = [];

let integration = null;

function normalizePresentationId(value) {
  const id = String(value ?? "").trim();
  return id && id.length <= 240 ? id : null;
}

function storageKey(presentationId) {
  return `${PRESENTED_KEY_PREFIX}${encodeURIComponent(presentationId)}`;
}

function hasPresented(presentationId) {
  try {
    return sessionStorage.getItem(storageKey(presentationId)) === "1";
  } catch {
    return false;
  }
}

function markPresented(presentationId) {
  try {
    sessionStorage.setItem(storageKey(presentationId), "1");
  } catch {
    // Storage can be unavailable in strict privacy modes. The server-issued
    // presentationId must remain the authoritative one-time guard.
  }
}

function announce(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function reject(reason, detail) {
  announce(REJECTED_EVENT, { reason, detail });
  return false;
}

function createIntegration() {
  const dialog = document.querySelector("[data-rank-motion-dialog]");
  if (!dialog) return null;

  const player = dialog.querySelector("matths-rank-motion");
  const closeButton = dialog.querySelector("[data-rank-motion-close]");
  if (!player) return null;

  async function present(rawDetail) {
    const detail = rawDetail && typeof rawDetail === "object" ? rawDetail : {};
    const presentationId = normalizePresentationId(detail.presentationId);
    const toTier = normalizeRankTier(detail.toTier);
    const fromTier = normalizeRankTier(detail.fromTier);

    if (!presentationId) return reject("missing-or-invalid-presentation-id", detail);
    if (!toTier) return reject("unknown-to-tier", detail);
    if (hasPresented(presentationId)) return reject("already-presented-in-session", detail);

    const tierDefinition = getRankTier(toTier);
    player.setTier(toTier);
    player.setMuted(true);
    dialog.dataset.toTier = toTier;
    dialog.setAttribute(
      "aria-label",
      `${tierDefinition?.koLabel || "랭크"} 승급 연출`,
    );

    try {
      if (!dialog.open) dialog.showModal();
    } catch {
      return reject("dialog-open-failed", detail);
    }

    // Mark before playback so duplicate API callbacks cannot open the same
    // server-issued presentation twice while the first video is loading.
    markPresented(presentationId);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      player.pause();
      player.currentTime = 0;
      announce(PRESENTED_EVENT, {
        presentationId,
        fromTier,
        toTier,
        startedWithSound: false,
        reducedMotion: true,
      });
      return true;
    }

    const canStartWithSound =
      detail.allowSound === true &&
      (!navigator.userActivation || navigator.userActivation.isActive);

    try {
      await player.replay({ sound: canStartWithSound });
    } catch {
      player.setMuted(true);
      await player.replay().catch(() => {});
    }

    announce(PRESENTED_EVENT, {
      presentationId,
      fromTier,
      toTier,
      startedWithSound: canStartWithSound && !player.muted,
    });
    return true;
  }

  closeButton?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => player.pause());

  return Object.freeze({ dialog, player, present });
}

function handlePresentationEvent(event) {
  if (integration) {
    integration.present(event.detail);
  } else {
    pendingPresentations.push(event.detail);
  }
}

window.addEventListener(PRESENTATION_EVENT, handlePresentationEvent);

function init() {
  integration = createIntegration();
  if (!integration) return;

  while (pendingPresentations.length) {
    integration.present(pendingPresentations.shift());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

export function dispatchRankUpPresentation(detail) {
  window.dispatchEvent(new CustomEvent(PRESENTATION_EVENT, { detail }));
}
