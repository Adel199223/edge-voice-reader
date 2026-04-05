"use strict";

(function initEdgeVoiceReaderCore(globalScope) {
  const MAX_DRAFT_CHARS = 20000;
  const MIN_SPEECH_RATE = 0.7;
  const MAX_SPEECH_RATE = 2.0;
  const DEFAULT_SPEECH_RATE = 1.0;
  const STATE_KEY = "edge_voice_reader_state";
  const REPORT_KEY = "edge_voice_reader_run_report";
  const PLAYBACK_MODE = "edge_native";
  const TRANSIENT_RUNTIME_EVENTS = Object.freeze([
    "cancelled",
    "end",
    "error",
    "interrupted",
    "selection-loaded",
    "stopped",
  ]);

  const VOICE_OPTIONS = Object.freeze([
    Object.freeze({
      key: "ava",
      label: "Ava",
      voiceName: "Microsoft AvaMultilingual Online (Natural) - English (United States)",
      description: "Clear and warm multilingual voice",
    }),
    Object.freeze({
      key: "andrew",
      label: "Andrew",
      voiceName: "Microsoft AndrewMultilingual Online (Natural) - English (United States)",
      description: "Steady and calm multilingual voice",
    }),
  ]);

  const VOICE_BY_KEY = Object.freeze(
    Object.fromEntries(VOICE_OPTIONS.map((voice) => [voice.key, voice]))
  );

  function createEmptyVoiceAvailability() {
    return {
      ava: {
        status: "unknown",
        checkedAt: 0,
        error: "",
      },
      andrew: {
        status: "unknown",
        checkedAt: 0,
        error: "",
      },
    };
  }

  function buildDefaultState() {
    return {
      schemaVersion: 1,
      playbackMode: PLAYBACK_MODE,
      preferredVoiceKey: "ava",
      preferredVoiceName: VOICE_BY_KEY.ava.voiceName,
      speechRate: DEFAULT_SPEECH_RATE,
      draftText: "",
      voiceAvailability: createEmptyVoiceAvailability(),
    };
  }

  function normalizeVoiceKey(rawValue) {
    return Object.prototype.hasOwnProperty.call(VOICE_BY_KEY, rawValue) ? rawValue : "ava";
  }

  function normalizeSpeechRate(rawValue) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_SPEECH_RATE;
    }
    const clamped = Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, numeric));
    return Math.round(clamped * 100) / 100;
  }

  function trimDraftText(rawValue) {
    const text = String(rawValue || "").replace(/\r/g, "").trim();
    if (text.length <= MAX_DRAFT_CHARS) {
      return text;
    }
    return text.slice(0, MAX_DRAFT_CHARS).trimEnd();
  }

  function sanitizeAvailabilityEntry(rawEntry) {
    const status =
      rawEntry && typeof rawEntry.status === "string"
        ? rawEntry.status
        : "unknown";
    const checkedAt =
      rawEntry && Number.isFinite(Number(rawEntry.checkedAt))
        ? Math.max(0, Math.trunc(Number(rawEntry.checkedAt)))
        : 0;
    const error =
      rawEntry && typeof rawEntry.error === "string" ? rawEntry.error.trim() : "";

    if (status !== "available" && status !== "unavailable" && status !== "unknown") {
      return {
        status: "unknown",
        checkedAt,
        error,
      };
    }

    return {
      status,
      checkedAt,
      error,
    };
  }

  function sanitizeVoiceAvailability(rawAvailability) {
    const next = createEmptyVoiceAvailability();
    for (const voice of VOICE_OPTIONS) {
      next[voice.key] = sanitizeAvailabilityEntry(
        rawAvailability && typeof rawAvailability === "object"
          ? rawAvailability[voice.key]
          : undefined
      );
    }
    return next;
  }

  function sanitizeState(rawState) {
    const preferredVoiceKey = normalizeVoiceKey(rawState && rawState.preferredVoiceKey);

    return {
      schemaVersion: 1,
      playbackMode: PLAYBACK_MODE,
      preferredVoiceKey,
      preferredVoiceName: VOICE_BY_KEY[preferredVoiceKey].voiceName,
      speechRate: normalizeSpeechRate(rawState && rawState.speechRate),
      draftText: trimDraftText(rawState && rawState.draftText),
      voiceAvailability: sanitizeVoiceAvailability(rawState && rawState.voiceAvailability),
    };
  }

  function getVoiceByKey(voiceKey) {
    return VOICE_BY_KEY[normalizeVoiceKey(voiceKey)];
  }

  function describeSelectionCaptureError(tabUrl, message) {
    const url = String(tabUrl || "");
    const normalizedMessage = String(message || "").trim();

    if (url.startsWith("edge://") || url.startsWith("chrome://")) {
      return "Edge blocks extensions from reading selections on browser-internal pages like edge://.";
    }
    if (normalizedMessage.includes("Cannot access chrome:// and edge:// URLs")) {
      return "Edge blocks extensions from reading selections on browser-internal pages like edge://.";
    }
    if (url.startsWith("chrome-extension://") || url.startsWith("extension://")) {
      return "Selections inside extension pages are not available to Edge Voice Reader.";
    }
    if (normalizedMessage.includes("Extension manifest must request permission")) {
      return "Edge needs a direct popup or keyboard-shortcut gesture before it can read selections from this page.";
    }
    if (normalizedMessage.includes("Cannot access contents of url")) {
      return "Edge blocked selection capture on this page.";
    }
    if (!normalizedMessage) {
      return "Selection capture failed.";
    }
    return `Selection capture failed: ${normalizedMessage}`;
  }

  function describeVoiceUnavailable(voice, availability) {
    const detail =
      availability && typeof availability.error === "string" && availability.error.trim()
        ? ` ${availability.error.trim()}`
        : "";
    return `${voice.label} is unavailable in this Edge installation.${detail}`.trim();
  }

  function isTransientRuntimeFeedback(rawRuntime) {
    const runtime = rawRuntime && typeof rawRuntime === "object" ? rawRuntime : {};
    if (runtime.isSpeaking) {
      return false;
    }

    if (typeof runtime.lastError === "string" && runtime.lastError.trim()) {
      return true;
    }

    const lastEvent = typeof runtime.lastEvent === "string" ? runtime.lastEvent : "";
    return TRANSIENT_RUNTIME_EVENTS.includes(lastEvent);
  }

  const api = {
    DEFAULT_SPEECH_RATE,
    MAX_DRAFT_CHARS,
    MAX_SPEECH_RATE,
    MIN_SPEECH_RATE,
    PLAYBACK_MODE,
    REPORT_KEY,
    STATE_KEY,
    VOICE_OPTIONS,
    buildDefaultState,
    createEmptyVoiceAvailability,
    describeSelectionCaptureError,
    describeVoiceUnavailable,
    getVoiceByKey,
    isTransientRuntimeFeedback,
    normalizeSpeechRate,
    normalizeVoiceKey,
    sanitizeState,
    trimDraftText,
  };

  globalScope.EdgeVoiceReaderCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
