"use strict";

importScripts("reader_core.js", "debug_report_core.js", "extractors.js", "page_reader_core.js", "speech_prep_core.js");

const {
  REPORT_KEY,
  STATE_KEY,
  VOICE_OPTIONS,
  describeSelectionCaptureError,
  describeVoiceUnavailable,
  getVoiceByKey,
  isTransientRuntimeFeedback,
  sanitizeState,
  trimDraftText,
} = EdgeVoiceReaderCore;
const { normalizeSentenceStartIndex, segmentTextIntoSentences } = EdgeVoiceReaderPageCore;
const {
  buildChunkPlan,
  buildSpeechChunks,
  normalizeLangHint,
} = EdgeVoiceReaderSpeechPrepCore;
const {
  REPORT_SCHEMA_VERSION,
  START_RETRY_DELAY_MS,
  analyzeTextProfile,
  buildDefaultRunReport,
  pickRunReportCounter,
  resolveStartTimeoutMs,
  sanitizeExtensionErrorEntry,
  sanitizeRunReport,
  sanitizeRunReportAttempt,
  sanitizeRunReportEvent,
} = EdgeVoiceReaderDebugCore;

const MANUAL_READER_PAGE = "popup.html";
const RUN_REPORT_PAGE = "report.html";
const PAGE_READER_SCRIPT_FILES = [
  "reader_core.js",
  "page_reader_core.js",
  "page_reader_content.js",
];
const PAGE_READER_STYLE_FILES = ["page_reader_page.css"];

let cachedState = null;
let probePromise = null;
let activeRequestId = 0;
let activePageReaderSession = null;
let runtimeState = {
  isSpeaking: false,
  isPaused: false,
  lastEvent: "idle",
  lastError: "",
  lastFailureCode: "",
  lastAttemptId: "",
  sourceLabel: "",
  textLength: 0,
  updatedAt: 0,
};
let reportWritePromise = Promise.resolve();

function sanitizeListKind(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  return value === "ordered" || value === "unordered" ? value : "none";
}

function sanitizeChunkPlan(rawChunkPlan) {
  return Array.isArray(rawChunkPlan)
    ? rawChunkPlan.map((chunk, index) => ({
        index: Number.isFinite(Number(chunk?.index))
          ? Math.max(0, Math.trunc(Number(chunk.index)))
          : index,
        langHint: normalizeLangHint(chunk?.langHint),
        textLength: Math.max(0, Math.trunc(Number(chunk?.textLength || 0))),
        reason: String(chunk?.reason || "base").slice(0, 80),
      }))
    : [];
}

function sliceLangSegmentsForRange(rawSegments, start, end) {
  const safeStart = Math.max(0, Math.trunc(Number(start || 0)));
  const safeEnd = Math.max(safeStart, Math.trunc(Number(end || 0)));
  if (!Array.isArray(rawSegments) || !rawSegments.length || safeEnd <= safeStart) {
    return [];
  }

  return rawSegments
    .map((segment) => ({
      start: Math.max(safeStart, Math.trunc(Number(segment?.start || 0))),
      end: Math.min(safeEnd, Math.trunc(Number(segment?.end || 0))),
      langHint: normalizeLangHint(segment?.langHint),
    }))
    .filter((segment) => segment.langHint && segment.end > segment.start)
    .map((segment) => ({
      start: segment.start - safeStart,
      end: segment.end - safeStart,
      langHint: segment.langHint,
    }));
}

function buildSpeechChunkSet(text, options = {}) {
  const chunks = buildSpeechChunks(text, {
    documentLang: options.documentLang,
    langHint: options.langHint,
    langSegments: options.langSegments || options.langRanges,
    spokenPrefix: options.spokenPrefix,
    sentenceStart: options.sentenceStart,
  });
  const chunkPlan = sanitizeChunkPlan(buildChunkPlan(chunks));
  return {
    chunks,
    chunkPlan,
  };
}

function createDebugId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function buildStackHead(rawStack) {
  return String(rawStack || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ")
    .slice(0, 400);
}

async function getStoredRunReport() {
  const values = await chrome.storage.local.get(REPORT_KEY);
  const report = sanitizeRunReport(values[REPORT_KEY]);
  if (!values[REPORT_KEY]) {
    await chrome.storage.local.set({
      [REPORT_KEY]: report,
    });
  }
  return report;
}

function queueRunReportMutation(mutator) {
  reportWritePromise = reportWritePromise
    .then(async () => {
      const current = await getStoredRunReport();
      const next = sanitizeRunReport(await mutator(current));
      await chrome.storage.local.set({
        [REPORT_KEY]: next,
      });
      return next;
    })
    .catch(async () => {
      const fallback = buildDefaultRunReport();
      await chrome.storage.local.set({
        [REPORT_KEY]: fallback,
      });
      return fallback;
    });
  return reportWritePromise;
}

function buildRunReportVoiceMeta(state) {
  const effectiveState = state || cachedState || sanitizeState();
  const selectedVoice = getVoiceByKey(effectiveState.preferredVoiceKey);
  return {
    selectedVoiceKey: selectedVoice.key,
    selectedVoiceLabel: selectedVoice.label,
    selectedVoiceName: selectedVoice.voiceName,
    speechRate: effectiveState.speechRate,
  };
}

function buildManualRunReportMeta(sourceLabel = runtimeState.sourceLabel, textLength = runtimeState.textLength, extra = {}) {
  const meta = {
    surface: "manual",
    sourceLabel: String(sourceLabel || "manual text"),
    textLength: Number.isFinite(Number(textLength))
      ? Math.max(0, Math.trunc(Number(textLength)))
      : 0,
    ...extra,
  };

  return {
    ...meta,
    langHint: normalizeLangHint(extra.langHint || ""),
    documentLang: normalizeLangHint(extra.documentLang || ""),
    listKind: sanitizeListKind(extra.listKind),
    listDepth: Number.isFinite(Number(extra.listDepth))
      ? Math.max(0, Math.trunc(Number(extra.listDepth)))
      : 0,
    listMarkerText: String(extra.listMarkerText || "").trim().slice(0, 40),
    chunkCount: Number.isFinite(Number(extra.chunkCount))
      ? Math.max(0, Math.trunc(Number(extra.chunkCount)))
      : 0,
    chunkPlan: sanitizeChunkPlan(extra.chunkPlan),
  };
}

function buildPageReaderRunReportMeta(session, extra = {}) {
  const meta = {
    surface: "page_reader",
    tabId: Number(session?.tabId || 0),
    blockId: String(session?.blockId || ""),
    host: String(session?.host || ""),
    sourceLabel: String(session?.sourceLabel || "page block"),
    textLength: Number.isFinite(Number(session?.textLength))
      ? Math.max(0, Math.trunc(Number(session.textLength)))
      : 0,
    ...buildPageReaderSentenceMeta(session),
    ...extra,
  };

  return {
    ...meta,
    langHint: normalizeLangHint(extra.langHint || session?.langHint || ""),
    documentLang: normalizeLangHint(extra.documentLang || session?.documentLang || ""),
    listKind: sanitizeListKind(extra.listKind || session?.listKind),
    listDepth: Number.isFinite(Number(extra.listDepth ?? session?.listDepth))
      ? Math.max(0, Math.trunc(Number(extra.listDepth ?? session?.listDepth)))
      : 0,
    listMarkerText: String(extra.listMarkerText || session?.listMarkerText || "").trim().slice(0, 40),
    chunkCount: Number.isFinite(Number(extra.chunkCount ?? session?.chunkCount))
      ? Math.max(0, Math.trunc(Number(extra.chunkCount ?? session?.chunkCount)))
      : 0,
    chunkPlan: sanitizeChunkPlan(extra.chunkPlan ?? session?.chunkPlan),
  };
}

function buildActiveRunReportMeta(extra = {}) {
  return activePageReaderSession
    ? buildPageReaderRunReportMeta(activePageReaderSession, extra)
    : buildManualRunReportMeta(runtimeState.sourceLabel, runtimeState.textLength, extra);
}

async function appendRunReportEvent(type, meta = {}) {
  const state = await getStoredState();
  return queueRunReportMutation((current) => {
    const now = Date.now();
    const next = sanitizeRunReport(current);
    const counterKey = pickRunReportCounter(type);
    const event = sanitizeRunReportEvent({
      id: createDebugId("event"),
      at: now,
      type,
      ...buildRunReportVoiceMeta(state),
      ...meta,
    });
    next.lastUpdatedAt = now;
    next.events.unshift(event);
    if (counterKey) {
      next.counters[counterKey] += 1;
    }
    return next;
  });
}

async function appendRunReportAttempt(rawAttempt) {
  const attempt = sanitizeRunReportAttempt(rawAttempt);
  return queueRunReportMutation((current) => {
    const next = sanitizeRunReport(current);
    next.lastUpdatedAt = Math.max(next.lastUpdatedAt, Number(attempt.lastEventAt || attempt.endAt || attempt.startAt || attempt.speakInvokedAt || attempt.requestedAt || 0));
    next.attempts.unshift(attempt);
    return next;
  });
}

async function appendExtensionError(rawEntry = {}) {
  const entry = sanitizeExtensionErrorEntry({
    ...rawEntry,
    at: Number(rawEntry.at || Date.now()),
  });

  await queueRunReportMutation((current) => {
    const next = sanitizeRunReport(current);
    next.lastUpdatedAt = Math.max(next.lastUpdatedAt, Number(entry.at || 0));
    next.extensionErrors.unshift(entry);
    return next;
  });

  await appendRunReportEvent("extension_error", {
    surface: entry.surface,
    host: entry.host,
    blockId: entry.blockId,
    attemptId: entry.attemptId,
    message: entry.message,
    error: entry.message,
    note: entry.file ? `${entry.file}:${entry.line || 0}:${entry.column || 0}` : "",
  });

  return entry;
}

async function clearRunReport() {
  const next = buildDefaultRunReport();
  await chrome.storage.local.set({
    [REPORT_KEY]: next,
  });
  return next;
}

function buildDebugSummary(report, state) {
  const selectedVoice = getVoiceByKey(state.preferredVoiceKey);
  const latestAttempt = Array.isArray(report.attempts) ? report.attempts[0] || null : null;
  const latestFailure = Array.isArray(report.attempts)
    ? report.attempts.find((attempt) => attempt.failureCode) || null
    : null;
  const latestExtensionError = Array.isArray(report.extensionErrors)
    ? report.extensionErrors[0] || null
    : null;

  return {
    playback: runtimeState.lastError
      ? "error"
      : runtimeState.isPaused
        ? "paused"
        : runtimeState.isSpeaking
          ? "reading"
          : runtimeState.lastEvent || "idle",
    selectedVoiceKey: selectedVoice.key,
    selectedVoiceLabel: selectedVoice.label,
    selectedVoiceName: selectedVoice.voiceName,
    speechRate: state.speechRate,
    lastAttemptId: latestAttempt ? latestAttempt.attemptId : "",
    lastFailureCode: latestFailure ? latestFailure.failureCode : "",
    lastFailureMessage: latestFailure ? latestFailure.message : "",
    lastExtensionErrorMessage: latestExtensionError ? latestExtensionError.message : "",
  };
}

async function buildRunReportSnapshot() {
  const state = await getStoredState();
  const report = await getStoredRunReport();
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: Date.now(),
    lastUpdatedAt: report.lastUpdatedAt,
    summary: buildDebugSummary(report, state),
    status: buildStatus(state),
    counters: report.counters,
    attempts: report.attempts,
    events: report.events,
    extensionErrors: report.extensionErrors,
  };
}

async function openRunReport() {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(RUN_REPORT_PAGE),
  });
}

function reportBackgroundExtensionError(rawError = {}) {
  void appendExtensionError({
    surface: "background",
    message: String(rawError.message || "Unexpected background error."),
    stackHead: buildStackHead(rawError.stackHead || rawError.stack || ""),
    file: String(rawError.file || ""),
    line: Number(rawError.line || 0),
    column: Number(rawError.column || 0),
    host: String(rawError.host || ""),
    blockId: String(rawError.blockId || ""),
    attemptId: String(rawError.attemptId || runtimeState.lastAttemptId || ""),
    at: Number(rawError.at || Date.now()),
  });
}

self.addEventListener("error", (event) => {
  reportBackgroundExtensionError({
    message: event.message || (event.error && event.error.message) || "Uncaught background error.",
    stack: event.error && event.error.stack ? event.error.stack : "",
    file: event.filename || "",
    line: event.lineno || 0,
    column: event.colno || 0,
  });
});

self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportBackgroundExtensionError({
    message:
      reason && reason.message
        ? reason.message
        : typeof reason === "string" && reason
          ? reason
          : "Unhandled background rejection.",
    stack: reason && reason.stack ? reason.stack : "",
  });
});

function setRuntimeState(patch) {
  runtimeState = {
    ...runtimeState,
    ...patch,
    updatedAt: Date.now(),
  };
  void updateActionPresentation();
}

function clearRuntimeState(lastEvent = "idle") {
  setRuntimeState({
    isSpeaking: false,
    isPaused: false,
    lastEvent,
    lastError: "",
    lastFailureCode: "",
    lastAttemptId: "",
    sourceLabel: "",
    textLength: 0,
  });
}

function clearTransientRuntimeFeedback() {
  if (!isTransientRuntimeFeedback(runtimeState)) {
    return false;
  }

  clearRuntimeState("idle");
  return true;
}

async function updateActionPresentation() {
  if (runtimeState.isPaused) {
    await chrome.action.setBadgeText({ text: "Ⅱ" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    await chrome.action.setTitle({ title: "Edge Voice Reader is paused" });
    return;
  }

  if (runtimeState.isSpeaking) {
    await chrome.action.setBadgeText({ text: "▶" });
    await chrome.action.setBadgeBackgroundColor({ color: "#0f6cbd" });
    await chrome.action.setTitle({ title: "Edge Voice Reader is speaking" });
    return;
  }

  if (runtimeState.lastError) {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
    await chrome.action.setTitle({ title: runtimeState.lastError });
    return;
  }

  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Edge Voice Reader" });
}

async function getStoredState() {
  if (cachedState) {
    return cachedState;
  }
  const values = await chrome.storage.local.get(STATE_KEY);
  cachedState = sanitizeState(values[STATE_KEY]);
  await chrome.storage.local.set({
    [STATE_KEY]: cachedState,
  });
  return cachedState;
}

async function writeStoredState(nextState) {
  cachedState = sanitizeState(nextState);
  await chrome.storage.local.set({
    [STATE_KEY]: cachedState,
  });
  return cachedState;
}

async function patchStoredState(patch) {
  const current = await getStoredState();
  return writeStoredState({
    ...current,
    ...patch,
  });
}

function buildStatus(state) {
  const resolvedState = state || cachedState || sanitizeState();
  const selectedVoice = getVoiceByKey(resolvedState.preferredVoiceKey);
  const selectedVoiceAvailability =
    resolvedState.voiceAvailability[selectedVoice.key] || {
      status: "unknown",
      checkedAt: 0,
      error: "",
    };

  return {
    state: resolvedState,
    selectedVoice,
    selectedVoiceAvailability,
    probeInProgress: Boolean(probePromise),
    runtime: { ...runtimeState },
    canSpeak: selectedVoiceAvailability.status === "available" && !probePromise,
  };
}

function captureRuntimeError(message, extra = {}) {
  setRuntimeState({
    isSpeaking: false,
    isPaused: false,
    lastEvent: "error",
    lastError: String(message || "Unknown error"),
    lastFailureCode: String(extra.failureCode || ""),
    lastAttemptId: String(extra.attemptId || ""),
    sourceLabel: "",
    textLength: 0,
  });
}

function isSupportedPageReaderUrl(tabUrl) {
  return /^https?:\/\//i.test(String(tabUrl || "").trim());
}

function buildManualReaderUrl(tab, reason, detail = "") {
  const url = new URL(chrome.runtime.getURL(MANUAL_READER_PAGE));
  url.searchParams.set("surface", "fallback");
  if (reason) {
    url.searchParams.set("reason", String(reason));
  }
  if (detail) {
    url.searchParams.set("detail", String(detail).slice(0, 300));
  }
  if (tab && typeof tab.title === "string" && tab.title) {
    url.searchParams.set("sourceTitle", tab.title.slice(0, 160));
  }
  if (tab && typeof tab.url === "string" && tab.url) {
    url.searchParams.set("sourceUrl", tab.url);
  }
  return url.toString();
}

async function openManualReaderFallback(tab, reason, detail = "") {
  const createOptions = {
    url: buildManualReaderUrl(tab, reason, detail),
  };
  if (typeof tab?.index === "number") {
    createOptions.index = tab.index + 1;
  }
  await chrome.tabs.create(createOptions);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

async function extractSelectionFromActiveTab() {
  const activeTab = await getActiveTab();
  if (!activeTab || !activeTab.id) {
    throw new Error("No active tab is available right now.");
  }

  let injected;
  try {
    injected = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: pageReadSelection,
    });
  } catch (error) {
    const message = error && error.message ? error.message : error;
    throw new Error(describeSelectionCaptureError(activeTab.url, message));
  }

  const extracted = injected && injected[0] ? injected[0].result : null;
  if (!extracted || !extracted.ok || !extracted.text) {
    throw new Error(
      extracted && extracted.error
        ? extracted.error
        : "No selected text was found on the active page."
    );
  }

  return extracted;
}

function probeVoice(voice) {
  return new Promise((resolve) => {
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      try {
        chrome.tts.stop();
      } catch (_error) {
        // The probe already has its answer.
      }
      resolve({
        status: result.status,
        checkedAt: Date.now(),
        error: result.error || "",
      });
    }

    const timeoutId = setTimeout(() => {
      finish({
        status: "unavailable",
        error: "Edge did not start the voice probe in time.",
      });
    }, 1800);

    try {
      chrome.tts.stop();
      chrome.tts.speak(
        "Voice probe",
        {
          voiceName: voice.voiceName,
          volume: 0,
          rate: 1,
          enqueue: false,
          requiredEventTypes: ["start", "error"],
          onEvent(event) {
            if (event.type === "start") {
              finish({ status: "available" });
              return;
            }
            if (event.type === "error") {
              finish({
                status: "unavailable",
                error: event.errorMessage || "Edge reported a voice error.",
              });
            }
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            finish({
              status: "unavailable",
              error:
                chrome.runtime.lastError.message ||
                "Edge rejected the probe request.",
            });
          }
        }
      );
    } catch (error) {
      finish({
        status: "unavailable",
        error: error && error.message ? error.message : String(error),
      });
    }
  });
}

async function runVoiceProbe(force = false) {
  const state = await getStoredState();
  const needsProbe =
    force ||
    VOICE_OPTIONS.some(
      (voice) => state.voiceAvailability[voice.key].status === "unknown"
    );

  if (!needsProbe || runtimeState.isSpeaking) {
    return buildStatus(state);
  }

  if (probePromise) {
    return probePromise;
  }

  void appendRunReportEvent("voice_probe_started", {
    surface: force ? "forced" : "auto",
  });

  probePromise = (async () => {
    const results = {};
    for (const voice of VOICE_OPTIONS) {
      results[voice.key] = await probeVoice(voice);
    }
    const current = await getStoredState();
    const nextState = await writeStoredState({
      ...current,
      voiceAvailability: results,
    });
    const summary = VOICE_OPTIONS.map(
      (voice) => `${voice.label}: ${results[voice.key].status}`
    ).join(" | ");
    void appendRunReportEvent("voice_probe_completed", {
      surface: force ? "forced" : "auto",
      note: summary,
    });
    return buildStatus(nextState);
  })().finally(() => {
    probePromise = null;
    void updateActionPresentation();
  });

  return probePromise;
}

async function ensureSelectedVoiceReady() {
  let state = await getStoredState();
  if (state.voiceAvailability[state.preferredVoiceKey].status === "unknown") {
    const probeStatus = await runVoiceProbe(false);
    state = probeStatus.state;
  }

  const selectedVoice = getVoiceByKey(state.preferredVoiceKey);
  const availability = state.voiceAvailability[selectedVoice.key];

  if (availability.status !== "available") {
    throw new Error(describeVoiceUnavailable(selectedVoice, availability));
  }

  return {
    state,
    selectedVoice,
  };
}

function buildPageReaderSentences(text) {
  const normalized = trimDraftText(text);
  if (!normalized) {
    return [];
  }

  const sentences = segmentTextIntoSentences(normalized);
  if (sentences.length) {
    return sentences;
  }

  return [
    {
      index: 0,
      start: 0,
      end: normalized.length,
      text: normalized,
    },
  ];
}

function buildPageReaderSentenceMeta(session) {
  const sentences = Array.isArray(session?.sentences) ? session.sentences : [];
  const sentence =
    sentences[Math.max(0, Math.min(sentences.length - 1, Number(session?.sentenceIndex || 0)))] ||
    null;

  return {
    sentenceIndex: sentence ? Number(sentence.index || 0) : -1,
    sentenceCount: sentences.length,
    sentenceStart: sentence ? Number(sentence.start || 0) : 0,
    sentenceEnd: sentence ? Number(sentence.end || 0) : 0,
    sentenceText: sentence ? String(sentence.text || "") : "",
  };
}

function normalizeTransitionSource(rawValue) {
  return String(rawValue || "").trim().toLowerCase() === "auto_advance"
    ? "auto_advance"
    : "";
}

function buildPageReaderSession(rawSession, sourceLabel, text) {
  if (!rawSession || typeof rawSession !== "object") {
    return null;
  }

  const tabId = Number(rawSession.tabId || 0);
  const blockId = String(rawSession.blockId || "").trim();
  if (!tabId || !blockId) {
    return null;
  }

  const sentences = buildPageReaderSentences(text).map((sentence) => ({
    ...sentence,
    langRanges: sliceLangSegmentsForRange(
      rawSession.langRanges || rawSession.langSegments,
      sentence.start,
      sentence.end
    ),
  }));
  const startSentenceIndex = normalizeSentenceStartIndex(
    rawSession.startSentenceIndex,
    sentences.length
  );

  return {
    mode: "page_reader",
    tabId,
    blockId,
    host: String(rawSession.host || "").trim(),
    sourceLabel: String(rawSession.sourceLabel || sourceLabel || "page block"),
    textLength: text.length,
    langHint: normalizeLangHint(rawSession.langHint),
    documentLang: normalizeLangHint(rawSession.documentLang),
    listKind: sanitizeListKind(rawSession.listKind),
    listDepth: Number.isFinite(Number(rawSession.listDepth))
      ? Math.max(0, Math.trunc(Number(rawSession.listDepth)))
      : 0,
    listMarkerText: String(rawSession.listMarkerText || "").trim().slice(0, 40),
    spokenPrefix: String(rawSession.spokenPrefix || "").trim().slice(0, 40),
    langRanges: Array.isArray(rawSession.langRanges || rawSession.langSegments)
      ? (rawSession.langRanges || rawSession.langSegments)
          .map((segment) => ({
            start: Math.max(0, Math.trunc(Number(segment?.start || 0))),
            end: Math.max(0, Math.trunc(Number(segment?.end || 0))),
            langHint: normalizeLangHint(segment?.langHint),
          }))
          .filter((segment) => segment.langHint && segment.end > segment.start)
      : [],
    chunkCount: 0,
    chunkPlan: [],
    requestId: 0,
    requestedAt: Date.now(),
    lastSentenceEndAt: 0,
    sentenceIndex: startSentenceIndex,
    initialSentenceIndex: startSentenceIndex,
    transitionSource: normalizeTransitionSource(rawSession.transitionSource),
    sentences,
  };
}

function isSamePageReaderSession(left, right) {
  return Boolean(
    left &&
      right &&
      left.mode === "page_reader" &&
      right.mode === "page_reader" &&
      left.tabId === right.tabId &&
      left.blockId === right.blockId
  );
}

async function sendPageReaderEvent(session, event, extra = {}) {
  if (!session || session.mode !== "page_reader" || !session.tabId) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(session.tabId, {
      type: "page_reader_event",
      event,
      blockId: session.blockId,
      ...extra,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function interruptPriorPageReader(nextSession = null) {
  if (!activePageReaderSession) {
    return;
  }

  if (isSamePageReaderSession(activePageReaderSession, nextSession)) {
    return;
  }

  const previous = activePageReaderSession;
  activePageReaderSession = null;
  await sendPageReaderEvent(previous, "interrupted", {
    ...buildPageReaderSentenceMeta(previous),
  });
}

function buildPlaybackAttempt(input = {}) {
  const textProfile = input.textProfile && typeof input.textProfile === "object"
    ? input.textProfile
    : {};
  return {
    attemptId: createDebugId("attempt"),
    requestId: Number(input.requestId || 0),
    surface: String(input.surface || "manual"),
    sourceLabel: String(input.sourceLabel || ""),
    host: String(input.host || ""),
    tabId: Number(input.tabId || 0),
    blockId: String(input.blockId || ""),
    selectedVoiceKey: String(input.selectedVoiceKey || ""),
    selectedVoiceLabel: String(input.selectedVoiceLabel || ""),
    selectedVoiceName: String(input.selectedVoiceName || ""),
    speechRate: Number(input.speechRate || 0),
    textLength: Number(input.textLength || 0),
    sentenceCount: Number(input.sentenceCount || 0),
    sentenceIndex: Number.isFinite(Number(input.sentenceIndex)) ? Number(input.sentenceIndex) : -1,
    sentenceLength: Number(input.sentenceLength || 0),
    sentenceStart: Number(input.sentenceStart || 0),
    sentenceEnd: Number(input.sentenceEnd || 0),
    langHint: normalizeLangHint(input.langHint),
    documentLang: normalizeLangHint(input.documentLang),
    listKind: sanitizeListKind(input.listKind),
    listDepth: Number.isFinite(Number(input.listDepth))
      ? Math.max(0, Math.trunc(Number(input.listDepth)))
      : 0,
    listMarkerText: String(input.listMarkerText || "").trim().slice(0, 40),
    chunkCount: Number.isFinite(Number(input.chunkCount))
      ? Math.max(0, Math.trunc(Number(input.chunkCount)))
      : 0,
    chunkPlan: sanitizeChunkPlan(input.chunkPlan),
    primaryScript: String(textProfile.primaryScript || "unknown"),
    isRtl: textProfile.isRtl === true,
    containsArabic: textProfile.containsArabic === true,
    containsLatin: textProfile.containsLatin === true,
    newlineCount: Number(textProfile.newlineCount || 0),
    requestedAt: Number(input.requestedAt || Date.now()),
    speakInvokedAt: Number(input.speakInvokedAt || Date.now()),
    startAt: 0,
    endAt: 0,
    lastEventAt: 0,
    startLatencyMs: 0,
    gapFromPreviousSentenceEndMs: Number(input.gapFromPreviousSentenceEndMs || 0),
    configuredStartTimeoutMs: Number(input.configuredStartTimeoutMs || 0),
    retryCount: Number(input.retryCount || 0),
    status: "starting",
    failureCode: "",
    message: "",
    settledByEvent: "",
    runtimeLastError: "",
    ttsEvents: [],
  };
}

function recordAttemptTtsEvent(attempt, event, at = Date.now()) {
  if (!attempt || attempt.__finalized) {
    return;
  }

  attempt.lastEventAt = at;
  attempt.ttsEvents.push({
    type: String(event?.type || "unknown"),
    at,
    offsetMs: Math.max(0, at - Number(attempt.speakInvokedAt || at)),
    charIndex: Number.isFinite(Number(event?.charIndex)) ? Math.trunc(Number(event.charIndex)) : -1,
    length: Number.isFinite(Number(event?.length)) ? Math.max(0, Math.trunc(Number(event.length))) : 0,
    errorMessage: typeof event?.errorMessage === "string" ? event.errorMessage.trim() : "",
  });
}

function finalizePlaybackAttempt(attempt, patch = {}) {
  const endAt = Number(
    patch.endAt || attempt.endAt || attempt.lastEventAt || Date.now()
  );
  const startAt = Number(patch.startAt || attempt.startAt || 0);
  const speakInvokedAt = Number(attempt.speakInvokedAt || attempt.requestedAt || 0);
  attempt.__finalized = true;
  return {
    ...attempt,
    ...patch,
    startAt,
    endAt,
    lastEventAt: Number(patch.lastEventAt || attempt.lastEventAt || endAt),
    startLatencyMs:
      startAt && speakInvokedAt ? Math.max(0, startAt - speakInvokedAt) : 0,
  };
}

function buildAttemptEventMeta(attempt) {
  return {
    attemptId: attempt.attemptId,
    requestId: attempt.requestId,
    sentenceLength: attempt.sentenceLength,
    sentenceIndex: attempt.sentenceIndex,
    sentenceCount: attempt.sentenceCount,
    sentenceStart: attempt.sentenceStart,
    sentenceEnd: attempt.sentenceEnd,
    langHint: attempt.langHint,
    documentLang: attempt.documentLang,
    listKind: attempt.listKind,
    listDepth: attempt.listDepth,
    listMarkerText: attempt.listMarkerText,
    chunkCount: attempt.chunkCount,
    chunkPlan: sanitizeChunkPlan(attempt.chunkPlan),
    primaryScript: attempt.primaryScript,
    isRtl: attempt.isRtl,
    containsArabic: attempt.containsArabic,
    containsLatin: attempt.containsLatin,
    newlineCount: attempt.newlineCount,
    configuredStartTimeoutMs: attempt.configuredStartTimeoutMs,
    retryCount: attempt.retryCount,
    startLatencyMs: attempt.startLatencyMs,
    gapFromPreviousSentenceEndMs: attempt.gapFromPreviousSentenceEndMs,
    failureCode: attempt.failureCode,
    message: attempt.message,
    settledByEvent: attempt.settledByEvent,
    runtimeLastError: attempt.runtimeLastError,
    selectedVoiceName: attempt.selectedVoiceName,
  };
}

function buildChunkEventMeta(attempt, chunk, chunkIndex, configuredStartTimeoutMs, extra = {}) {
  return {
    ...buildAttemptEventMeta({
      ...attempt,
      langHint: normalizeLangHint(chunk?.langHint || attempt?.langHint || ""),
      configuredStartTimeoutMs: Number.isFinite(Number(configuredStartTimeoutMs))
        ? Math.max(0, Math.trunc(Number(configuredStartTimeoutMs)))
        : Number(attempt?.configuredStartTimeoutMs || 0),
      retryCount: Number.isFinite(Number(extra.retryCount))
        ? Math.max(Number(attempt?.retryCount || 0), Math.trunc(Number(extra.retryCount)))
        : Number(attempt?.retryCount || 0),
    }),
    note:
      extra.note ||
      `Chunk ${Math.max(1, Number(chunkIndex || 0) + 1)} of ${Math.max(1, Number(attempt?.chunkCount || 1))} (${String(chunk?.reason || "base")})`,
    ...extra,
  };
}

function runChunkedTtsAttempt(config = {}) {
  const attempt = config.attempt;
  const chunks = Array.isArray(config.chunks) ? config.chunks : [];
  if (!attempt || !chunks.length || typeof config.isCurrentRequest !== "function") {
    return;
  }

  let playbackSettled = false;
  let hasStarted = false;
  let activeInvocationId = 0;
  let suppressedStopInvocationId = 0;

  function isCurrentRequest() {
    return config.isCurrentRequest() === true;
  }

  function markPlaybackSettled() {
    if (playbackSettled) {
      return false;
    }
    playbackSettled = true;
    return true;
  }

  async function closeAttempt(patch) {
    if (attempt.__finalized) {
      return null;
    }
    const finalAttempt = finalizePlaybackAttempt(attempt, patch);
    await appendRunReportAttempt(finalAttempt);
    return finalAttempt;
  }

  function speakChunkAt(chunkIndex, retryCount = 0) {
    if (!isCurrentRequest() || attempt.__finalized || playbackSettled) {
      return;
    }

    const chunk = chunks[chunkIndex];
    if (!chunk) {
      void (async () => {
        const finalAttempt = await closeAttempt({
          status: "finished",
          failureCode: "",
          message: "",
          settledByEvent: "end",
          runtimeLastError: "",
        });
        if (!markPlaybackSettled()) {
          return;
        }
        config.onComplete?.(finalAttempt || attempt);
      })();
      return;
    }

    attempt.retryCount = Math.max(Number(attempt.retryCount || 0), retryCount);
    const configuredStartTimeoutMs = resolveStartTimeoutMs({
      textLength: Number(config.contextTextLength || attempt.textLength || 0),
      sentenceLength: String(chunk.text || "").length,
      textProfile: chunk.profile,
      listKind: config.listKind || attempt.listKind,
      transitionSource: config.transitionSource || "",
    });
    attempt.configuredStartTimeoutMs = Math.max(
      Number(attempt.configuredStartTimeoutMs || 0),
      configuredStartTimeoutMs
    );
    const invocationId = activeInvocationId + 1;
    activeInvocationId = invocationId;

    function isStaleInvocation() {
      return invocationId !== activeInvocationId;
    }

    const timeoutId = setTimeout(() => {
      if (
        !isCurrentRequest() ||
        attempt.__finalized ||
        playbackSettled ||
        isStaleInvocation()
      ) {
        return;
      }

      void (async () => {
        const willRetry = retryCount < 1;
        const message = willRetry
          ? `${attempt.selectedVoiceLabel} did not start chunk ${chunkIndex + 1} of ${chunks.length} within ${configuredStartTimeoutMs} ms. Retrying once.`
          : `${attempt.selectedVoiceLabel} did not start chunk ${chunkIndex + 1} of ${chunks.length} within ${configuredStartTimeoutMs} ms.`;
        config.onChunkEvent?.(
          willRetry ? "chunk_retry" : "chunk_timeout",
          buildChunkEventMeta(attempt, chunk, chunkIndex, configuredStartTimeoutMs, {
            retryCount: willRetry ? retryCount + 1 : retryCount,
            message,
            error: willRetry ? "" : message,
          })
        );
        if (willRetry) {
          suppressedStopInvocationId = invocationId;
        }
        chrome.tts.stop();
        if (willRetry) {
          await wait(START_RETRY_DELAY_MS);
          if (suppressedStopInvocationId === invocationId) {
            suppressedStopInvocationId = 0;
          }
          if (
            isCurrentRequest() &&
            !playbackSettled &&
            !attempt.__finalized &&
            !isStaleInvocation()
          ) {
            speakChunkAt(chunkIndex, retryCount + 1);
          }
          return;
        }

        const finalAttempt = await closeAttempt({
          status: "error",
          failureCode: "start_timeout",
          message,
          settledByEvent: "timeout",
          runtimeLastError: "",
        });
        if (!markPlaybackSettled()) {
          return;
        }
        config.onFailure?.(finalAttempt || attempt, message, "start_timeout", {
          chunk,
          chunkIndex,
          configuredStartTimeoutMs,
        });
      })();
    }, configuredStartTimeoutMs);

    chrome.tts.speak(
      chunk.text,
      {
        voiceName: config.selectedVoiceName,
        rate: config.speechRate,
        lang: chunk.langHint || undefined,
        enqueue: false,
        requiredEventTypes: [
          "start",
          "end",
          "error",
          "interrupted",
          "cancelled",
          "pause",
          "resume",
        ],
        onEvent(event) {
          if (
            !isCurrentRequest() ||
            attempt.__finalized ||
            playbackSettled ||
            isStaleInvocation()
          ) {
            return;
          }

          recordAttemptTtsEvent(attempt, event);

          if (event.type === "start") {
            clearTimeout(timeoutId);
            if (!attempt.startAt) {
              attempt.startAt = attempt.lastEventAt;
              attempt.startLatencyMs = Math.max(
                0,
                attempt.startAt - attempt.speakInvokedAt
              );
            }
            config.onChunkStart?.(
              chunk,
              chunkIndex,
              configuredStartTimeoutMs,
              retryCount,
              hasStarted
            );
            if (!hasStarted) {
              hasStarted = true;
              config.onFirstChunkStart?.(
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
                retryCount
              );
            }
            return;
          }

          if (!isCurrentRequest()) {
            return;
          }

          if (event.type === "end") {
            clearTimeout(timeoutId);
            speakChunkAt(chunkIndex + 1, 0);
            return;
          }

          if (event.type === "pause") {
            clearTimeout(timeoutId);
            config.onPause?.(chunk, chunkIndex, configuredStartTimeoutMs, retryCount);
            return;
          }

          if (event.type === "resume") {
            clearTimeout(timeoutId);
            config.onResume?.(chunk, chunkIndex, configuredStartTimeoutMs, retryCount);
            return;
          }

          if (event.type === "error") {
            clearTimeout(timeoutId);
            void (async () => {
              const message = event.errorMessage || `Edge could not play ${attempt.selectedVoiceLabel}.`;
              const finalAttempt = await closeAttempt({
                status: "error",
                failureCode: "tts_event_error",
                message,
                settledByEvent: "error",
                runtimeLastError: "",
              });
              if (!markPlaybackSettled()) {
                return;
              }
              config.onFailure?.(finalAttempt || attempt, message, "tts_event_error", {
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
              });
            })();
            return;
          }

          if (event.type === "interrupted" || event.type === "cancelled") {
            clearTimeout(timeoutId);
            if (!attempt.startAt && suppressedStopInvocationId === invocationId) {
              suppressedStopInvocationId = 0;
              return;
            }
            void (async () => {
              const beforeStart = !attempt.startAt;
              const failureCode = beforeStart
                ? event.type === "cancelled"
                  ? "cancelled_before_start"
                  : "interrupted_before_start"
                : "";
              const message = beforeStart
                ? event.type === "cancelled"
                  ? "Playback was cancelled before Edge finished starting."
                  : "Playback was interrupted before Edge finished starting."
                : event.type === "cancelled"
                  ? "Playback was cancelled."
                  : "Playback was interrupted.";
              const finalAttempt = await closeAttempt({
                status: beforeStart ? "error" : event.type,
                failureCode,
                message,
                settledByEvent: event.type,
                runtimeLastError: "",
              });
              if (!markPlaybackSettled()) {
                return;
              }
              if (beforeStart) {
                config.onFailure?.(finalAttempt || attempt, message, failureCode, {
                  chunk,
                  chunkIndex,
                  configuredStartTimeoutMs,
                });
                return;
              }
              config.onInterrupted?.(finalAttempt || attempt, event.type, message, {
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
              });
            })();
          }
        },
      },
      () => {
        if (
          chrome.runtime.lastError &&
          isCurrentRequest() &&
          !attempt.__finalized &&
          !playbackSettled &&
          !isStaleInvocation()
        ) {
          clearTimeout(timeoutId);
          void (async () => {
            const runtimeLastError = chrome.runtime.lastError.message || `Edge rejected ${attempt.selectedVoiceLabel}.`;
            const finalAttempt = await closeAttempt({
              status: "error",
              failureCode: "runtime_callback_error",
              message: runtimeLastError,
              settledByEvent: "callback",
              runtimeLastError,
            });
            if (!markPlaybackSettled()) {
              return;
            }
            config.onFailure?.(finalAttempt || attempt, runtimeLastError, "runtime_callback_error", {
              chunk,
              chunkIndex,
              configuredStartTimeoutMs,
            });
          })();
        }
      }
    );
  }

  speakChunkAt(0, 0);
}

async function speakPageReaderBlock(rawText, sourceLabel, rawSession = {}) {
  const text = trimDraftText(rawText);
  if (!text) {
    throw new Error("There is no text to read yet.");
  }

  const { state, selectedVoice } = await ensureSelectedVoiceReady();
  activeRequestId += 1;
  const requestId = activeRequestId;
  const pageReaderSession = buildPageReaderSession(rawSession, sourceLabel, text);

  if (!pageReaderSession || !pageReaderSession.sentences.length) {
    throw new Error("The page reader could not prepare this block for playback.");
  }

  pageReaderSession.requestId = requestId;

  await interruptPriorPageReader(pageReaderSession);
  activePageReaderSession = pageReaderSession;

  setRuntimeState({
    isSpeaking: false,
    isPaused: false,
    lastEvent: "starting",
    lastError: "",
    lastFailureCode: "",
    lastAttemptId: "",
    sourceLabel: sourceLabel || "page paragraph",
    textLength: text.length,
  });

  void appendRunReportEvent(
    "page_reader_requested",
    buildPageReaderRunReportMeta(pageReaderSession, {
      requestId,
      sourceLabel: sourceLabel || "page paragraph",
    })
  );

  chrome.tts.stop();

  return new Promise((resolve, reject) => {
    let settled = false;

    function isCurrentSession() {
      return Boolean(
        requestId === activeRequestId &&
          activePageReaderSession &&
          activePageReaderSession.requestId === requestId
      );
    }

    function clearOwnedPageReaderSession() {
      if (
        activePageReaderSession &&
        activePageReaderSession.requestId === requestId
      ) {
        activePageReaderSession = null;
      }
    }

    function settleStartSuccess() {
      if (settled) {
        return;
      }
      settled = true;
      resolve(buildStatus(state));
    }

    function settleStartError(message) {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(message));
    }

    function emitFailure(finalAttempt, message, failureCode) {
      if (!isCurrentSession()) {
        if (!settled) {
          settleStartError(message);
        }
        return;
      }

      clearOwnedPageReaderSession();
      captureRuntimeError(message, {
        failureCode,
        attemptId: finalAttempt ? finalAttempt.attemptId : "",
      });
      void appendRunReportEvent(
        "page_reader_error",
        buildPageReaderRunReportMeta(pageReaderSession, {
          ...buildAttemptEventMeta(finalAttempt || {}),
          requestId,
          error: message,
          message,
          failureCode,
        })
      );
      void sendPageReaderEvent(pageReaderSession, "error", {
        error: message,
        ...buildPageReaderSentenceMeta(pageReaderSession),
      });
      if (!settled) {
        settleStartError(message);
      }
    }

    function speakSentenceAt(sentenceIndex) {
      if (!isCurrentSession()) {
        return;
      }

      const sentence = pageReaderSession.sentences[sentenceIndex];
      if (!sentence) {
        clearOwnedPageReaderSession();
        clearRuntimeState("end");
        void sendPageReaderEvent(pageReaderSession, "end", {
          ...buildPageReaderSentenceMeta(pageReaderSession),
        });
        if (!settled) {
          settleStartSuccess();
        }
        return;
      }

      pageReaderSession.sentenceIndex = sentenceIndex;
      const sentenceText = String(sentence.text || "");
      const textProfile = analyzeTextProfile(sentenceText);
      const transitionSource =
        sentenceIndex === Number(pageReaderSession.initialSentenceIndex || 0)
          ? pageReaderSession.transitionSource
          : "";
      const { chunks, chunkPlan } = buildSpeechChunkSet(sentenceText, {
        documentLang: pageReaderSession.documentLang || pageReaderSession.langHint,
        langHint: pageReaderSession.langHint,
        langSegments: sentence.langRanges,
        spokenPrefix: sentenceIndex === 0 ? pageReaderSession.spokenPrefix : "",
        sentenceStart: sentence.start,
      });
      const speakInvokedAt = Date.now();
      const attempt = buildPlaybackAttempt({
        requestId,
        surface: "page_reader",
        sourceLabel: sourceLabel || "page paragraph",
        host: pageReaderSession.host,
        tabId: pageReaderSession.tabId,
        blockId: pageReaderSession.blockId,
        selectedVoiceKey: selectedVoice.key,
        selectedVoiceLabel: selectedVoice.label,
        selectedVoiceName: selectedVoice.voiceName,
        speechRate: state.speechRate,
        textLength: text.length,
        sentenceCount: pageReaderSession.sentences.length,
        sentenceIndex: sentence.index,
        sentenceLength: sentenceText.length,
        sentenceStart: sentence.start,
        sentenceEnd: sentence.end,
        langHint: chunks[0]?.langHint || pageReaderSession.langHint,
        documentLang: pageReaderSession.documentLang,
        listKind: pageReaderSession.listKind,
        listDepth: pageReaderSession.listDepth,
        listMarkerText: pageReaderSession.listMarkerText,
        chunkCount: chunks.length,
        chunkPlan,
        textProfile,
        requestedAt: pageReaderSession.requestedAt,
        speakInvokedAt,
        gapFromPreviousSentenceEndMs: pageReaderSession.lastSentenceEndAt
          ? Math.max(0, speakInvokedAt - pageReaderSession.lastSentenceEndAt)
          : 0,
      });
      pageReaderSession.chunkCount = chunks.length;
      pageReaderSession.chunkPlan = chunkPlan;

      runChunkedTtsAttempt({
        attempt,
        chunks,
        contextTextLength: sentenceText.length,
        listKind: pageReaderSession.listKind,
        transitionSource,
        isCurrentRequest: isCurrentSession,
        selectedVoiceName: selectedVoice.voiceName,
        speechRate: state.speechRate,
        onChunkEvent(eventType, eventMeta) {
          void appendRunReportEvent(
            `page_reader_${eventType}`,
            buildPageReaderRunReportMeta(pageReaderSession, {
              ...eventMeta,
              requestId,
            })
          );
        },
        onChunkStart(chunk, chunkIndex, configuredStartTimeoutMs, retryCount, hadStarted) {
          if (hadStarted) {
            void appendRunReportEvent(
              "page_reader_chunk_started",
              buildPageReaderRunReportMeta(pageReaderSession, {
                ...buildChunkEventMeta(
                  attempt,
                  chunk,
                  chunkIndex,
                  configuredStartTimeoutMs,
                  { retryCount }
                ),
                requestId,
              })
            );
          }
        },
        onFirstChunkStart(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
          setRuntimeState({
            isSpeaking: true,
            isPaused: false,
            lastEvent: sentenceIndex === 0 ? "start" : "sentence",
            lastError: "",
            lastFailureCode: "",
            lastAttemptId: attempt.attemptId,
            sourceLabel: sourceLabel || "page paragraph",
            textLength: text.length,
          });
          void appendRunReportEvent(
            sentenceIndex === 0 ? "page_reader_started" : "page_reader_sentence",
            buildPageReaderRunReportMeta(pageReaderSession, {
              ...buildChunkEventMeta(
                attempt,
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
                { retryCount }
              ),
              requestId,
            })
          );
          void sendPageReaderEvent(
            pageReaderSession,
            sentenceIndex === 0 ? "start" : "sentence",
            {
              ...buildPageReaderSentenceMeta(pageReaderSession),
            }
          );
          settleStartSuccess();
        },
        onPause(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
          setRuntimeState({
            isSpeaking: false,
            isPaused: true,
            lastEvent: "paused",
            lastError: "",
            lastFailureCode: "",
            lastAttemptId: attempt.attemptId,
            sourceLabel: sourceLabel || "page paragraph",
            textLength: text.length,
          });
          void appendRunReportEvent(
            "paused",
            buildPageReaderRunReportMeta(pageReaderSession, {
              ...buildChunkEventMeta(
                attempt,
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
                { retryCount }
              ),
              requestId,
            })
          );
          void sendPageReaderEvent(pageReaderSession, "paused", {
            ...buildPageReaderSentenceMeta(pageReaderSession),
          });
        },
        onResume(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
          setRuntimeState({
            isSpeaking: true,
            isPaused: false,
            lastEvent: "resumed",
            lastError: "",
            lastFailureCode: "",
            lastAttemptId: attempt.attemptId,
            sourceLabel: sourceLabel || "page paragraph",
            textLength: text.length,
          });
          void appendRunReportEvent(
            "resumed",
            buildPageReaderRunReportMeta(pageReaderSession, {
              ...buildChunkEventMeta(
                attempt,
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
                { retryCount }
              ),
              requestId,
            })
          );
          void sendPageReaderEvent(pageReaderSession, "resumed", {
            ...buildPageReaderSentenceMeta(pageReaderSession),
          });
        },
        onFailure(finalAttempt, message, failureCode) {
          emitFailure(finalAttempt, message, failureCode);
        },
        onInterrupted(finalAttempt, eventType, message) {
          clearOwnedPageReaderSession();
          void appendRunReportEvent(
            eventType === "cancelled"
              ? "page_reader_cancelled"
              : "page_reader_interrupted",
            buildPageReaderRunReportMeta(pageReaderSession, {
              ...buildAttemptEventMeta(finalAttempt),
              requestId,
              message,
            })
          );
          void sendPageReaderEvent(pageReaderSession, eventType, {
            ...buildPageReaderSentenceMeta(pageReaderSession),
          });
          clearRuntimeState(eventType);
        },
        onComplete(finalAttempt) {
          pageReaderSession.lastSentenceEndAt = Date.now();
          if (sentenceIndex >= pageReaderSession.sentences.length - 1) {
            clearOwnedPageReaderSession();
            clearRuntimeState("end");
            void appendRunReportEvent(
              "page_reader_finished",
              buildPageReaderRunReportMeta(pageReaderSession, {
                ...buildAttemptEventMeta(finalAttempt || attempt),
                requestId,
              })
            );
            void sendPageReaderEvent(pageReaderSession, "end", {
              ...buildPageReaderSentenceMeta(pageReaderSession),
            });
            if (!settled) {
              settleStartSuccess();
            }
            return;
          }

          speakSentenceAt(sentenceIndex + 1);
        },
      });
    }

    speakSentenceAt(Math.max(0, pageReaderSession.sentenceIndex));
  });
}

async function ensurePageReaderInjected(tabId) {
  await chrome.scripting
    .insertCSS({
      target: { tabId },
      files: PAGE_READER_STYLE_FILES,
    })
    .catch(() => {});

  await chrome.scripting.executeScript({
    target: { tabId },
    files: PAGE_READER_SCRIPT_FILES,
  });
}

async function openOrFocusPageReader(tab) {
  clearTransientRuntimeFeedback();

  if (!tab || !tab.id || !isSupportedPageReaderUrl(tab.url)) {
    await openManualReaderFallback(tab, "unsupported_page");
    return {
      ok: false,
      fallback: true,
      reason: "unsupported_page",
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "page_reader_toggle_rail",
    });
    if (response && response.ok) {
      return {
        ok: true,
        blockCount: Number(response.blockCount || 0),
      };
    }
  } catch (_error) {
    // Try a one-shot reinjection below.
  }

  try {
    await ensurePageReaderInjected(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "page_reader_toggle_rail",
    });
    if (response && response.ok) {
      return {
        ok: true,
        blockCount: Number(response.blockCount || 0),
      };
    }
    throw new Error("The page reader did not respond after injection.");
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    await openManualReaderFallback(tab, "injection_blocked", detail);
    return {
      ok: false,
      fallback: true,
      reason: "injection_failed",
      error: detail,
    };
  }
}

async function speakText(rawText, sourceLabel, options = {}) {
  const text = trimDraftText(rawText);
  if (!text) {
    throw new Error("There is no text to read yet.");
  }

  const { state, selectedVoice } = await ensureSelectedVoiceReady();
  activeRequestId += 1;
  const requestId = activeRequestId;
  const normalizedSourceLabel = sourceLabel || "popup text";
  const pageReaderSession = buildPageReaderSession(
    options.pageReaderSession,
    normalizedSourceLabel,
    text
  );
  const sentenceCount = Math.max(1, segmentTextIntoSentences(text).length);
  const textProfile = analyzeTextProfile(text);
  const requestedAt = Date.now();
  const documentLang = normalizeLangHint(
    options.documentLang || pageReaderSession?.documentLang || ""
  );
  const langHint = normalizeLangHint(
    options.langHint || pageReaderSession?.langHint || documentLang
  );
  const { chunks, chunkPlan } = buildSpeechChunkSet(text, {
    documentLang: documentLang || langHint,
    langHint,
    langSegments: options.langSegments || options.langRanges,
    spokenPrefix: options.spokenPrefix || pageReaderSession?.spokenPrefix || "",
    sentenceStart: 0,
  });

  if (pageReaderSession) {
    pageReaderSession.requestId = requestId;
    pageReaderSession.chunkCount = chunks.length;
    pageReaderSession.chunkPlan = chunkPlan;
  }

  await interruptPriorPageReader(pageReaderSession);
  activePageReaderSession = pageReaderSession;

  setRuntimeState({
    isSpeaking: false,
    isPaused: false,
    lastEvent: "starting",
    lastError: "",
    lastFailureCode: "",
    lastAttemptId: "",
    sourceLabel: normalizedSourceLabel,
    textLength: text.length,
  });

  void appendRunReportEvent(
    "manual_read_requested",
    buildManualRunReportMeta(normalizedSourceLabel, text.length, {
      requestId,
      sentenceCount,
      sentenceIndex: 0,
      sentenceLength: text.length,
      sentenceStart: 0,
      sentenceEnd: text.length,
      langHint,
      documentLang,
      chunkCount: chunks.length,
      chunkPlan,
      primaryScript: textProfile.primaryScript,
      isRtl: textProfile.isRtl,
      containsArabic: textProfile.containsArabic,
      containsLatin: textProfile.containsLatin,
      newlineCount: textProfile.newlineCount,
    })
  );

  chrome.tts.stop();

  return new Promise((resolve, reject) => {
    let startSettled = false;

    function isCurrentRequest() {
      return requestId === activeRequestId;
    }

    function clearOwnedPageReaderSession() {
      if (
        activePageReaderSession &&
        activePageReaderSession.requestId === requestId
      ) {
        activePageReaderSession = null;
      }
    }

    function settleStartSuccess() {
      if (startSettled) {
        return;
      }
      startSettled = true;
      resolve(buildStatus(state));
    }

    function settleStartError(message) {
      if (startSettled) {
        return;
      }
      startSettled = true;
      reject(new Error(message));
    }

    function buildManualAttemptMeta(attempt, extra = {}) {
      return buildManualRunReportMeta(normalizedSourceLabel, text.length, {
        requestId,
        sentenceCount,
        sentenceIndex: 0,
        sentenceLength: text.length,
        sentenceStart: 0,
        sentenceEnd: text.length,
        ...buildAttemptEventMeta(attempt || {}),
        ...extra,
      });
    }

    function emitFailure(finalAttempt, message, failureCode) {
      if (!isCurrentRequest()) {
        if (!startSettled) {
          settleStartError(message);
        }
        return;
      }

      clearOwnedPageReaderSession();
      captureRuntimeError(message, {
        failureCode,
        attemptId: finalAttempt ? finalAttempt.attemptId : "",
      });
      void appendRunReportEvent(
        "manual_read_error",
        buildManualAttemptMeta(finalAttempt || {}, {
          error: message,
          message,
          failureCode,
        })
      );
      if (pageReaderSession) {
        void sendPageReaderEvent(pageReaderSession, "error", {
          error: message,
        });
      }
      if (!startSettled) {
        settleStartError(message);
      }
    }

    const speakInvokedAt = Date.now();
    const attempt = buildPlaybackAttempt({
      requestId,
      surface: "manual",
      sourceLabel: normalizedSourceLabel,
      host: "",
      tabId: 0,
      blockId: "",
      selectedVoiceKey: selectedVoice.key,
      selectedVoiceLabel: selectedVoice.label,
      selectedVoiceName: selectedVoice.voiceName,
      speechRate: state.speechRate,
      textLength: text.length,
      sentenceCount,
      sentenceIndex: 0,
      sentenceLength: text.length,
      sentenceStart: 0,
      sentenceEnd: text.length,
      langHint: chunks[0]?.langHint || langHint,
      documentLang,
      listKind: pageReaderSession?.listKind || "none",
      listDepth: pageReaderSession?.listDepth || 0,
      listMarkerText: pageReaderSession?.listMarkerText || "",
      chunkCount: chunks.length,
      chunkPlan,
      textProfile,
      requestedAt,
      speakInvokedAt,
      gapFromPreviousSentenceEndMs: 0,
    });

    runChunkedTtsAttempt({
      attempt,
      chunks,
      contextTextLength: text.length,
      isCurrentRequest,
      selectedVoiceName: selectedVoice.voiceName,
      speechRate: state.speechRate,
      onChunkEvent(eventType, eventMeta) {
        void appendRunReportEvent(
          "manual_" + eventType,
          buildManualAttemptMeta(attempt, eventMeta)
        );
      },
      onChunkStart(chunk, chunkIndex, configuredStartTimeoutMs, retryCount, hadStarted) {
        if (hadStarted) {
          void appendRunReportEvent(
            "manual_chunk_started",
            buildManualAttemptMeta(
              attempt,
              buildChunkEventMeta(
                attempt,
                chunk,
                chunkIndex,
                configuredStartTimeoutMs,
                { retryCount }
              )
            )
          );
        }
      },
      onFirstChunkStart(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
        setRuntimeState({
          isSpeaking: true,
          isPaused: false,
          lastEvent: "start",
          lastError: "",
          lastFailureCode: "",
          lastAttemptId: attempt.attemptId,
          sourceLabel: normalizedSourceLabel,
          textLength: text.length,
        });
        void appendRunReportEvent(
          "manual_read_started",
          buildManualAttemptMeta(
            attempt,
            buildChunkEventMeta(
              attempt,
              chunk,
              chunkIndex,
              configuredStartTimeoutMs,
              { retryCount }
            )
          )
        );
        if (pageReaderSession) {
          void sendPageReaderEvent(pageReaderSession, "start");
        }
        settleStartSuccess();
      },
      onPause(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
        setRuntimeState({
          isSpeaking: false,
          isPaused: true,
          lastEvent: "paused",
          lastError: "",
          lastFailureCode: "",
          lastAttemptId: attempt.attemptId,
          sourceLabel: normalizedSourceLabel,
          textLength: text.length,
        });
        void appendRunReportEvent(
          "paused",
          buildManualAttemptMeta(
            attempt,
            buildChunkEventMeta(
              attempt,
              chunk,
              chunkIndex,
              configuredStartTimeoutMs,
              { retryCount }
            )
          )
        );
        if (pageReaderSession) {
          void sendPageReaderEvent(pageReaderSession, "paused");
        }
      },
      onResume(chunk, chunkIndex, configuredStartTimeoutMs, retryCount) {
        setRuntimeState({
          isSpeaking: true,
          isPaused: false,
          lastEvent: "resumed",
          lastError: "",
          lastFailureCode: "",
          lastAttemptId: attempt.attemptId,
          sourceLabel: normalizedSourceLabel,
          textLength: text.length,
        });
        void appendRunReportEvent(
          "resumed",
          buildManualAttemptMeta(
            attempt,
            buildChunkEventMeta(
              attempt,
              chunk,
              chunkIndex,
              configuredStartTimeoutMs,
              { retryCount }
            )
          )
        );
        if (pageReaderSession) {
          void sendPageReaderEvent(pageReaderSession, "resumed");
        }
      },
      onFailure(finalAttempt, message, failureCode) {
        emitFailure(finalAttempt, message, failureCode);
      },
      onInterrupted(finalAttempt, eventType, message) {
        clearOwnedPageReaderSession();
        if (pageReaderSession) {
          void sendPageReaderEvent(pageReaderSession, eventType);
        }
        clearRuntimeState(eventType);
        void appendRunReportEvent(
          eventType === "cancelled" ? "manual_read_cancelled" : "manual_read_interrupted",
          buildManualAttemptMeta(finalAttempt || attempt, {
            message,
          })
        );
        if (!startSettled) {
          settleStartSuccess();
        }
      },
      onComplete(finalAttempt) {
        clearOwnedPageReaderSession();
        if (pageReaderSession) {
          void sendPageReaderEvent(pageReaderSession, "end");
        }
        clearRuntimeState("end");
        void appendRunReportEvent(
          "manual_read_finished",
          buildManualAttemptMeta(finalAttempt || attempt)
        );
        if (!startSettled) {
          settleStartSuccess();
        }
      },
    });
  });
}

async function pauseSpeaking() {
  if (!runtimeState.isSpeaking && !runtimeState.isPaused) {
    const state = await getStoredState();
    return buildStatus(state);
  }

  chrome.tts.pause();
  setRuntimeState({
    isSpeaking: false,
    isPaused: true,
    lastEvent: "paused",
    lastError: "",
  });
  void appendRunReportEvent("paused", buildActiveRunReportMeta());
  if (activePageReaderSession) {
    await sendPageReaderEvent(activePageReaderSession, "paused", {
      ...buildPageReaderSentenceMeta(activePageReaderSession),
    });
  }
  const state = await getStoredState();
  return buildStatus(state);
}

async function resumeSpeaking() {
  chrome.tts.resume();
  setRuntimeState({
    isSpeaking: true,
    isPaused: false,
    lastEvent: "resumed",
    lastError: "",
  });
  void appendRunReportEvent("resumed", buildActiveRunReportMeta());
  if (activePageReaderSession) {
    await sendPageReaderEvent(activePageReaderSession, "resumed", {
      ...buildPageReaderSentenceMeta(activePageReaderSession),
    });
  }
  const state = await getStoredState();
  return buildStatus(state);
}

async function stopSpeaking(options = {}) {
  activeRequestId += 1;
  const pageReaderSession = activePageReaderSession;
  const runReportMeta = pageReaderSession
    ? buildPageReaderRunReportMeta(pageReaderSession)
    : buildManualRunReportMeta(runtimeState.sourceLabel, runtimeState.textLength);
  activePageReaderSession = null;
  chrome.tts.stop();
  clearRuntimeState(options.lastEvent || "stopped");
  void appendRunReportEvent("stopped", runReportMeta);
  if (pageReaderSession && options.notifyPageReader !== false) {
    await sendPageReaderEvent(
      pageReaderSession,
      options.pageReaderEvent || "stopped",
      {
        ...buildPageReaderSentenceMeta(pageReaderSession),
      }
    );
  }
  const state = await getStoredState();
  return buildStatus(state);
}

async function importOrReadSelection(importOnly) {
  const extracted = await extractSelectionFromActiveTab();
  await patchStoredState({
    draftText: extracted.text,
  });
  void appendRunReportEvent("selection_loaded", {
    surface: importOnly ? "import" : "manual",
    sourceLabel: extracted.sourceLabel || "selected text",
    textLength: String(extracted.text || "").length,
  });

  if (importOnly) {
    clearRuntimeState("selection-loaded");
    const state = await getStoredState();
    return {
      text: extracted.text,
      sourceLabel: extracted.sourceLabel || "selected text",
      status: buildStatus(state),
    };
  }

  return {
    text: extracted.text,
    sourceLabel: extracted.sourceLabel || "selected text",
    status: await speakText(
      extracted.text,
      extracted.sourceLabel || "selected text"
    ),
  };
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STATE_KEY]) {
    return;
  }
  cachedState = sanitizeState(changes[STATE_KEY].newValue);
});

chrome.runtime.onInstalled.addListener(() => {
  void getStoredState();
  void getStoredRunReport();
  void updateActionPresentation();
});

chrome.runtime.onStartup.addListener(() => {
  void getStoredState();
  void getStoredRunReport();
  void updateActionPresentation();
});

chrome.action.onClicked.addListener((tab) => {
  void openOrFocusPageReader(tab);
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    try {
      if (command === "read-selection") {
        await importOrReadSelection(false);
        return;
      }
      if (command === "stop-reading") {
        await stopSpeaking();
      }
    } catch (error) {
      captureRuntimeError(error && error.message ? error.message : String(error));
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      const type = message && typeof message.type === "string" ? message.type : "";

      if (type === "get_status") {
        const status = await runVoiceProbe(false);
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "open_run_report") {
        await openRunReport();
        sendResponse({
          ok: true,
        });
        return;
      }

      if (type === "get_run_report") {
        sendResponse({
          ok: true,
          report: await buildRunReportSnapshot(),
        });
        return;
      }

      if (type === "clear_run_report") {
        await clearRunReport();
        sendResponse({
          ok: true,
          report: await buildRunReportSnapshot(),
        });
        return;
      }

      if (type === "record_extension_error") {
        await appendExtensionError(message && message.error ? message.error : {});
        sendResponse({
          ok: true,
        });
        return;
      }

      if (type === "speak_text") {
        const status = await speakText(message.text, "popup text");
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "page_reader_speak_block") {
        const tabId = sender && sender.tab ? Number(sender.tab.id || 0) : 0;
        if (!tabId) {
          throw new Error("The page reader could not resolve the source tab.");
        }

        const status = await speakPageReaderBlock(
          message.text,
          message.sourceLabel || "page paragraph",
          {
            tabId,
            blockId: message.blockId,
            host: (() => {
              try {
                return sender?.tab?.url ? new URL(sender.tab.url).host : "";
              } catch (_error) {
                return "";
              }
            })(),
            startSentenceIndex: message.startSentenceIndex,
            sourceLabel: message.sourceLabel || "page paragraph",
            langHint: message.langHint,
            documentLang: message.documentLang,
            listKind: message.listKind,
            listDepth: message.listDepth,
            listMarkerText: message.listMarkerText,
            spokenPrefix: message.spokenPrefix,
            langRanges: message.langRanges || message.langSegments,
            transitionSource: message.transitionSource,
          }
        );
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "read_selection") {
        const result = await importOrReadSelection(Boolean(message.importOnly));
        sendResponse({
          ok: true,
          ...result,
        });
        return;
      }

      if (type === "pause_speaking") {
        const status = await pauseSpeaking();
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "resume_speaking") {
        const status = await resumeSpeaking();
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "stop_speaking") {
        const status = await stopSpeaking();
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      if (type === "clear_runtime_feedback") {
        clearTransientRuntimeFeedback();
        const state = await getStoredState();
        sendResponse({
          ok: true,
          status: buildStatus(state),
        });
        return;
      }

      if (type === "retry_voice_probe") {
        const status = await runVoiceProbe(true);
        sendResponse({
          ok: true,
          status,
        });
        return;
      }

      sendResponse({
        ok: false,
        error: `Unsupported message type: ${type}`,
      });
    } catch (error) {
      const messageText = error && error.message ? error.message : String(error);
      captureRuntimeError(messageText);
      sendResponse({
        ok: false,
        error: messageText,
        status: buildStatus(cachedState),
      });
    }
  })();

  return true;
});
