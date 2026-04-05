"use strict";

const surfaceParams = new URLSearchParams(window.location.search);
const surfaceMode = surfaceParams.get("surface") || "popup";
const isFallbackSurface = surfaceMode === "fallback";

const textEl = document.getElementById("text");
const voiceEl = document.getElementById("voice");
const speedEl = document.getElementById("speed");
const speedValueEl = document.getElementById("speedValue");
const statusCardEl = document.getElementById("statusCard");
const statusLabelEl = document.getElementById("statusLabel");
const statusTextEl = document.getElementById("statusText");
const statusMetaEl = document.getElementById("statusMeta");
const subtitleTextEl = document.getElementById("subtitleText");
const fallbackNoteEl = document.getElementById("fallbackNote");
const fallbackTitleEl = document.getElementById("fallbackTitle");
const fallbackTextEl = document.getElementById("fallbackText");
const fallbackMetaEl = document.getElementById("fallbackMeta");
const speakBtn = document.getElementById("speakBtn");
const stopBtn = document.getElementById("stopBtn");
const selectionBtn = document.getElementById("selectionBtn");
const probeBtn = document.getElementById("probeBtn");
const reportBtn = document.getElementById("reportBtn");
const clearReportBtn = document.getElementById("clearReportBtn");

const {
  STATE_KEY,
  VOICE_OPTIONS,
  isTransientRuntimeFeedback,
  sanitizeState,
  trimDraftText,
} = EdgeVoiceReaderCore;

let latestStatus = null;
let draftSaveTimer = 0;
let pollTimer = 0;
let hasHydratedDraft = false;
let runtimeClearTimer = 0;
let scheduledRuntimeFeedbackKey = "";

function setStatusCard(label, text, meta = "", isError = false) {
  statusLabelEl.textContent = label;
  statusTextEl.textContent = text;
  statusMetaEl.textContent = meta;
  statusCardEl.classList.toggle("error", isError);
}

function renderVoiceOptions() {
  voiceEl.innerHTML = "";
  for (const voice of VOICE_OPTIONS) {
    const option = document.createElement("option");
    option.value = voice.key;
    option.textContent = voice.label;
    voiceEl.appendChild(option);
  }
}

function updateSpeedPill() {
  const rate = Number(speedEl.value || 1);
  speedValueEl.textContent = `${rate.toFixed(2)}x`;
}

async function loadStoredState() {
  const values = await chrome.storage.local.get(STATE_KEY);
  return sanitizeState(values[STATE_KEY]);
}

async function saveStoredState(patch) {
  const current = await loadStoredState();
  const next = sanitizeState({
    ...current,
    ...patch,
  });
  await chrome.storage.local.set({
    [STATE_KEY]: next,
  });
  return next;
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    void saveStoredState({
      draftText: textEl.value,
    });
  }, 150);
}

function hydrateInputs(state, options = {}) {
  voiceEl.value = state.preferredVoiceKey;
  speedEl.value = String(state.speechRate);
  updateSpeedPill();

  if (!hasHydratedDraft || options.overwriteDraft) {
    textEl.value = state.draftText || "";
    hasHydratedDraft = true;
  }
}

function buildAvailabilityMessage(status) {
  if (!status) {
    return {
      label: "Voice Status",
      text: "Checking the saved Edge voice...",
      meta: "",
      isError: false,
    };
  }

  const voice = status.selectedVoice;
  const availability = status.selectedVoiceAvailability;

  if (status.probeInProgress) {
    return {
      label: "Voice Status",
      text: `Checking whether ${voice.label} is callable in Edge...`,
      meta: "This uses a silent compatibility probe in the background.",
      isError: false,
    };
  }

  if (availability.status === "available") {
    return {
      label: "Voice Ready",
      text: `${voice.label} is ready in Edge.`,
      meta: `Saved speed: ${status.state.speechRate.toFixed(2)}x`,
      isError: false,
    };
  }

  if (availability.status === "unavailable") {
    return {
      label: "Voice Blocked",
      text: `${voice.label} is unavailable in this Edge installation.`,
      meta: availability.error || "Retry the voice check or choose the other supported voice.",
      isError: true,
    };
  }

  return {
    label: "Voice Status",
    text: `${voice.label} has not been checked yet.`,
    meta: "Use Retry Voice Check if Edge was opened after the extension loaded.",
    isError: false,
  };
}

function buildRuntimeMessage(status) {
  if (!status) {
    return null;
  }

  if (status.runtime.lastError) {
    return {
      label: "Playback Error",
      text: status.runtime.lastError,
      meta: "The extension will not auto-fallback to a different voice.",
      isError: true,
    };
  }

  if (status.runtime.isSpeaking) {
    return {
      label: "Reading",
      text: `Reading ${status.runtime.sourceLabel || "text"} with ${status.selectedVoice.label}.`,
      meta: `Speed ${status.state.speechRate.toFixed(2)}x`,
      isError: false,
    };
  }

  if (status.runtime.isPaused || status.runtime.lastEvent === "paused") {
    return {
      label: "Paused",
      text: "Playback is paused.",
      meta: `Resume from the page rail or keep using ${status.selectedVoice.label} here.`,
      isError: false,
    };
  }

  if (status.runtime.lastEvent === "end") {
    return {
      label: "Finished",
      text: `${status.selectedVoice.label} finished reading.`,
      meta: "Your saved voice and speed stay active for the next use.",
      isError: false,
    };
  }

  if (status.runtime.lastEvent === "stopped") {
    return {
      label: "Stopped",
      text: "Playback stopped.",
      meta: "",
      isError: false,
    };
  }

  if (status.runtime.lastEvent === "selection-loaded") {
    return {
      label: "Selection Loaded",
      text: "The current page selection is ready in the text box.",
      meta: "Press Speak to read it with your saved voice.",
      isError: false,
    };
  }

  return null;
}

function updateButtonState(status) {
  const hasText = Boolean(trimDraftText(textEl.value));
  const voiceBlocked =
    status &&
    status.selectedVoiceAvailability &&
    status.selectedVoiceAvailability.status === "unavailable";
  speakBtn.disabled = !hasText || Boolean(voiceBlocked) || Boolean(status && status.probeInProgress);
  stopBtn.disabled = !(status && status.runtime && (status.runtime.isSpeaking || status.runtime.isPaused));
}

function renderStatus(status) {
  latestStatus = status;
  const runtimeMessage = buildRuntimeMessage(status);
  const fallbackMessage = buildAvailabilityMessage(status);
  const nextMessage = runtimeMessage || fallbackMessage;
  setStatusCard(nextMessage.label, nextMessage.text, nextMessage.meta, nextMessage.isError);
  updateButtonState(status);
  scheduleRuntimeFeedbackClear(status);
}

async function requestBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.ok !== true) {
    const error = new Error(
      response && response.error ? response.error : "The extension request failed."
    );
    error.status = response && response.status ? response.status : null;
    throw error;
  }
  return response;
}

function extractErrorMessage(rawError) {
  if (!rawError) {
    return "Unexpected popup error.";
  }

  if (typeof rawError === "string") {
    return rawError;
  }

  if (typeof rawError.message === "string" && rawError.message.trim()) {
    return rawError.message.trim();
  }

  return String(rawError);
}

function buildStackHead(rawStack) {
  return typeof rawStack === "string"
    ? rawStack
        .split(/\r?\n/)
        .slice(0, 3)
        .join(" | ")
        .slice(0, 400)
    : "";
}

function reportPopupExtensionError(rawError, extra = {}) {
  if (!chrome.runtime || !chrome.runtime.id) {
    return;
  }

  const runtime = latestStatus && latestStatus.runtime ? latestStatus.runtime : null;
  const entry = {
    surface: isFallbackSurface ? "fallback_popup" : "popup",
    message: extractErrorMessage(rawError),
    stackHead: buildStackHead(extra.stack || rawError?.stack || ""),
    file: typeof extra.file === "string" ? extra.file : "",
    line: Number(extra.line || 0),
    column: Number(extra.column || 0),
    host: "",
    blockId: "",
    attemptId: runtime && runtime.lastAttemptId ? runtime.lastAttemptId : "",
    at: Date.now(),
  };

  Promise.resolve(
    chrome.runtime.sendMessage({
      type: "record_extension_error",
      error: entry,
    })
  ).catch(() => {});
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(helper);
  if (!copied) {
    throw new Error("Clipboard copy is unavailable in this popup.");
  }
}

async function copyDebugReport() {
  const response = await requestBackground({
    type: "get_run_report",
  });
  const report = response.report || {};
  await copyTextToClipboard(JSON.stringify(report, null, 2));
  const summary = report.summary || {};
  const meta = summary.lastFailureCode
    ? "Last failure: " + summary.lastFailureCode + ". Paste the JSON here when you want me to inspect it."
    : "Paste the JSON here when you want me to inspect a run.";
  setStatusCard(
    "Debug Copied",
    "The JSON debug report is in your clipboard.",
    meta,
    false
  );
}

async function clearDebugReport() {
  await requestBackground({
    type: "clear_run_report",
  });
  setStatusCard(
    "Debug Cleared",
    "Stored debug attempts and extension errors were cleared.",
    "Run playback again to capture a fresh trace.",
    false
  );
}

async function clearRuntimeFeedback() {
  await requestBackground({
    type: "clear_runtime_feedback",
  });
}

function getRuntimeFeedbackKey(status) {
  const runtime = status && status.runtime ? status.runtime : null;
  if (!runtime) {
    return "";
  }

  return [
    runtime.updatedAt || 0,
    runtime.lastEvent || "",
    runtime.lastError || "",
    runtime.sourceLabel || "",
    runtime.textLength || 0,
  ].join("|");
}

function cancelRuntimeFeedbackClear() {
  clearTimeout(runtimeClearTimer);
  runtimeClearTimer = 0;
  scheduledRuntimeFeedbackKey = "";
}

function scheduleRuntimeFeedbackClear(status, delayMs = 1600) {
  if (!status || !isTransientRuntimeFeedback(status.runtime)) {
    cancelRuntimeFeedbackClear();
    return;
  }

  const runtimeKey = getRuntimeFeedbackKey(status);
  if (runtimeClearTimer && scheduledRuntimeFeedbackKey === runtimeKey) {
    return;
  }

  cancelRuntimeFeedbackClear();
  scheduledRuntimeFeedbackKey = runtimeKey;
  runtimeClearTimer = window.setTimeout(() => {
    runtimeClearTimer = 0;
    scheduledRuntimeFeedbackKey = "";
    void clearRuntimeFeedback().catch(() => {});
  }, delayMs);
}

function renderHandledError(label, error, meta = "") {
  const message = error && error.message ? error.message : String(error);
  if (error && error.status) {
    latestStatus = error.status;
    updateButtonState(error.status);
    scheduleRuntimeFeedbackClear(error.status);
  }
  setStatusCard(label, message, meta, true);
}

async function refreshStatus() {
  const response = await requestBackground({
    type: "get_status",
  });
  renderStatus(response.status);
}

function buildFallbackSurfaceCopy() {
  const reason = surfaceParams.get("reason") || "unsupported_page";
  const sourceTitle = surfaceParams.get("sourceTitle") || "";
  const sourceUrl = surfaceParams.get("sourceUrl") || "";
  const detail = surfaceParams.get("detail") || "";

  const sourceMeta = sourceTitle || sourceUrl;
  const sourceLine = sourceMeta ? `Source: ${sourceMeta}` : "";

  if (reason === "injection_blocked") {
    return {
      subtitle: "Manual reader fallback for pages where the in-page rail could not open cleanly.",
      title: "Manual Reader Fallback",
      text: "The page rail could not be opened on the current page, so the manual reader is open instead.",
      meta: [sourceLine, detail].filter(Boolean).join(" "),
    };
  }

  return {
    subtitle: "Manual reader fallback for pages that cannot host the in-page rail.",
    title: "Unsupported Page",
    text: "This page cannot host the in-page reader rail. Paste text here to keep using Ava or Andrew.",
    meta: [sourceLine, "Browser-internal pages and some protected surfaces block extension overlays."].filter(Boolean).join(" "),
  };
}

function configureSurface() {
  if (!isFallbackSurface) {
    document.body.dataset.surface = "popup";
    return;
  }

  document.body.dataset.surface = "fallback";
  const copy = buildFallbackSurfaceCopy();
  if (subtitleTextEl) {
    subtitleTextEl.textContent = copy.subtitle;
  }
  if (fallbackTitleEl) {
    fallbackTitleEl.textContent = copy.title;
  }
  if (fallbackTextEl) {
    fallbackTextEl.textContent = copy.text;
  }
  if (fallbackMetaEl) {
    fallbackMetaEl.textContent = copy.meta;
  }
  if (fallbackNoteEl) {
    fallbackNoteEl.hidden = false;
  }
  selectionBtn.disabled = true;
  selectionBtn.textContent = "Selection Unavailable";
  selectionBtn.title = "Selection capture is unavailable from the manual fallback page.";
}

async function initializePopup() {
  configureSurface();
  renderVoiceOptions();
  const storedState = await loadStoredState();
  hydrateInputs(storedState, {
    overwriteDraft: true,
  });
  await clearRuntimeFeedback().catch(() => {});
  await refreshStatus();
  pollTimer = window.setInterval(() => {
    void refreshStatus().catch((error) => {
      renderStatus({
        state: storedState,
        selectedVoice: VOICE_OPTIONS.find((voice) => voice.key === voiceEl.value) || VOICE_OPTIONS[0],
        selectedVoiceAvailability: {
          status: "unknown",
          checkedAt: 0,
          error: "",
        },
        probeInProgress: false,
        runtime: {
          isSpeaking: false,
          isPaused: false,
          lastEvent: "error",
          lastError: error && error.message ? error.message : String(error),
        },
      });
    });
  }, 1000);

  if (isFallbackSurface) {
    textEl.focus();
  }
}

voiceEl.addEventListener("change", async () => {
  const nextState = await saveStoredState({
    preferredVoiceKey: voiceEl.value,
  });
  hydrateInputs(nextState);
  await refreshStatus();
});

speedEl.addEventListener("input", () => {
  updateSpeedPill();
});

speedEl.addEventListener("change", async () => {
  const nextState = await saveStoredState({
    speechRate: speedEl.value,
  });
  hydrateInputs(nextState);
  await refreshStatus();
});

textEl.addEventListener("input", () => {
  scheduleDraftSave();
  updateButtonState(latestStatus);
});

selectionBtn.addEventListener("click", async () => {
  if (isFallbackSurface) {
    setStatusCard(
      "Selection Unavailable",
      "Selection capture is not available from the manual fallback page.",
      "Paste text into the box or return to a supported web page and use the page rail.",
      true
    );
    return;
  }

  try {
    const response = await requestBackground({
      type: "read_selection",
      importOnly: true,
    });
    textEl.value = response.text || "";
    await saveStoredState({
      draftText: textEl.value,
    });
    renderStatus(response.status);
  } catch (error) {
    renderHandledError("Selection Error", error, "");
  }
});

probeBtn.addEventListener("click", async () => {
  try {
    const response = await requestBackground({
      type: "retry_voice_probe",
    });
    renderStatus(response.status);
  } catch (error) {
    renderHandledError("Voice Probe Error", error, "");
  }
});

speakBtn.addEventListener("click", async () => {
  try {
    await saveStoredState({
      draftText: textEl.value,
    });
    const response = await requestBackground({
      type: "speak_text",
      text: textEl.value,
    });
    renderStatus(response.status);
  } catch (error) {
    renderHandledError(
      "Playback Error",
      error,
      "The extension will not auto-fallback to another voice."
    );
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    const response = await requestBackground({
      type: "stop_speaking",
    });
    renderStatus(response.status);
  } catch (error) {
    renderHandledError("Stop Error", error, "");
  }
});

reportBtn.addEventListener("click", async () => {
  try {
    await copyDebugReport();
  } catch (error) {
    renderHandledError("Debug Copy Error", error, "");
  }
});

clearReportBtn.addEventListener("click", async () => {
  try {
    await clearDebugReport();
  } catch (error) {
    renderHandledError("Debug Clear Error", error, "");
  }
});

window.addEventListener("error", (event) => {
  reportPopupExtensionError(event.error || event.message, {
    stack: event.error && event.error.stack ? event.error.stack : "",
    file: event.filename || "",
    line: event.lineno || 0,
    column: event.colno || 0,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  reportPopupExtensionError(event.reason, {
    stack: event.reason && event.reason.stack ? event.reason.stack : "",
  });
});

window.addEventListener("beforeunload", () => {
  clearTimeout(draftSaveTimer);
  clearInterval(pollTimer);
  cancelRuntimeFeedbackClear();
});

void initializePopup().catch((error) => {
  reportPopupExtensionError(error, {
    stack: error && error.stack ? error.stack : "",
  });
  setStatusCard(
    "Startup Error",
    error && error.message ? error.message : String(error),
    "",
    true
  );
});
