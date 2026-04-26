"use strict";

(function initEdgeVoiceReaderDebugCore(globalScope) {
  const REPORT_SCHEMA_VERSION = 5;
  const REPORT_MAX_EVENTS = 80;
  const REPORT_MAX_ATTEMPTS = 20;
  const REPORT_MAX_EXTENSION_ERRORS = 20;
  const REPORT_MAX_CHUNK_PLAN = 8;
  const START_TIMEOUT_DEFAULT_MS = 2500;
  const START_TIMEOUT_STARTUP_CLAUSE_MS = 3000;
  const START_TIMEOUT_LONG_MS = 3500;
  const START_TIMEOUT_VERY_LONG_CONTEXT_MS = 5000;
  const START_TIMEOUT_RTL_MS = 4500;
  const START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS = 9000;
  const START_RETRY_DELAY_MS = 150;
  const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/g;
  const LATIN_PATTERN = /[A-Za-z\u00C0-\u024F]/g;
  const RTL_PATTERN = /[\u0590-\u08FF]/g;
  const LIST_KINDS = Object.freeze(["none", "ordered", "unordered"]);

  function sanitizeInteger(rawValue, minimum = 0) {
    return Number.isFinite(Number(rawValue))
      ? Math.max(minimum, Math.trunc(Number(rawValue)))
      : minimum;
  }

  function sanitizeRoundedRate(rawValue) {
    return Number.isFinite(Number(rawValue))
      ? Math.max(0.1, Math.round(Number(rawValue) * 100) / 100)
      : 0;
  }

  function sanitizeRoundedNumber(rawValue, minimum = 0) {
    return Number.isFinite(Number(rawValue))
      ? Math.max(minimum, Math.round(Number(rawValue) * 100) / 100)
      : 0;
  }

  function sanitizeBoolean(rawValue) {
    return rawValue === true;
  }

  function sanitizeString(rawValue, maxLength = 260) {
    return typeof rawValue === "string" ? rawValue.trim().slice(0, maxLength) : "";
  }

  function sanitizeLangHint(rawValue) {
    const value = sanitizeString(rawValue, 40);
    return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
      ? value
      : "";
  }

  function sanitizeListKind(rawValue) {
    const value = sanitizeString(rawValue, 16).toLowerCase();
    return LIST_KINDS.includes(value) ? value : "none";
  }

  function sanitizeReportCounter(rawValue) {
    return sanitizeInteger(rawValue, 0);
  }

  function countMatches(text, pattern) {
    const matches = String(text || "").match(pattern);
    return matches ? matches.length : 0;
  }

  function analyzeTextProfile(rawText) {
    const text = String(rawText || "");
    const arabicCount = countMatches(text, ARABIC_PATTERN);
    const latinCount = countMatches(text, LATIN_PATTERN);
    const rtlCount = countMatches(text, RTL_PATTERN);
    const newlineCount = countMatches(text, /\n/g);

    let primaryScript = "unknown";
    if (arabicCount && latinCount) {
      if (arabicCount >= latinCount * 1.5) {
        primaryScript = "arabic";
      } else if (latinCount >= arabicCount * 1.5) {
        primaryScript = "latin";
      } else {
        primaryScript = "mixed";
      }
    } else if (arabicCount) {
      primaryScript = "arabic";
    } else if (latinCount) {
      primaryScript = "latin";
    }

    return {
      primaryScript,
      isRtl: rtlCount > 0,
      containsArabic: arabicCount > 0,
      containsLatin: latinCount > 0,
      newlineCount,
    };
  }

  function resolveStartTimeoutMs(input = {}) {
    const sentenceLength = sanitizeInteger(input.sentenceLength, 0);
    const textLength = sanitizeInteger(input.textLength, 0);
    const chunkCount = sanitizeInteger(input.chunkCount, 0);
    const chunkReason = sanitizeString(input.chunkReason, 80).toLowerCase();
    const listKind = sanitizeListKind(input.listKind);
    const transitionSource = sanitizeString(input.transitionSource, 24).toLowerCase();
    const textProfile = input.textProfile && typeof input.textProfile === "object"
      ? input.textProfile
      : {};

    if (
      transitionSource === "auto_advance" &&
      listKind !== "none" &&
      (textProfile.isRtl || textProfile.containsArabic)
    ) {
      return START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS;
    }

    if (textProfile.isRtl || textProfile.containsArabic) {
      return START_TIMEOUT_RTL_MS;
    }

    if (chunkReason === "startup_clause") {
      return START_TIMEOUT_STARTUP_CLAUSE_MS;
    }

    if (
      chunkCount === 1 &&
      chunkReason === "context" &&
      textProfile.primaryScript === "latin" &&
      textProfile.containsLatin &&
      !textProfile.containsArabic &&
      sentenceLength >= 260
    ) {
      return START_TIMEOUT_VERY_LONG_CONTEXT_MS;
    }

    if (sentenceLength >= 120 || textLength >= 180) {
      return START_TIMEOUT_LONG_MS;
    }

    return START_TIMEOUT_DEFAULT_MS;
  }

  function sanitizeChunkPlanEntry(rawEntry) {
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    return {
      index: sanitizeInteger(entry.index, 0),
      langHint: sanitizeLangHint(entry.langHint),
      textLength: sanitizeInteger(entry.textLength, 0),
      reason: sanitizeString(entry.reason, 80) || "base",
    };
  }

  function sanitizeChunkPlan(rawChunkPlan) {
    return Array.isArray(rawChunkPlan)
      ? rawChunkPlan
          .map((entry) => sanitizeChunkPlanEntry(entry))
          .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
          .slice(0, REPORT_MAX_CHUNK_PLAN)
      : [];
  }

  function sanitizeStringList(rawValues, maxItems = 12, maxLength = 40) {
    return Array.isArray(rawValues)
      ? rawValues
          .map((value) => sanitizeString(value, maxLength))
          .filter(Boolean)
          .slice(0, maxItems)
      : [];
  }

  function sanitizeSpeakOptions(rawOptions) {
    const options = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
    const sanitized = {};
    const voiceName = sanitizeString(options.voiceName, 160);
    const rate = sanitizeRoundedRate(options.rate);
    const lang = sanitizeLangHint(options.lang);
    const requiredEventTypes = sanitizeStringList(options.requiredEventTypes, 12, 40);

    if (voiceName) {
      sanitized.voiceName = voiceName;
    }
    if (rate) {
      sanitized.rate = rate;
    }
    if (lang) {
      sanitized.lang = lang;
    }
    if (Object.prototype.hasOwnProperty.call(options, "enqueue")) {
      sanitized.enqueue = options.enqueue === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, "volume")) {
      sanitized.volume = sanitizeRoundedNumber(options.volume, 0);
    }
    if (requiredEventTypes.length) {
      sanitized.requiredEventTypes = requiredEventTypes;
    }

    return sanitized;
  }

  function sanitizeTraceEvent(rawEvent) {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    return {
      type: sanitizeString(event.type, 80) || "unknown",
      at: sanitizeInteger(event.at, 0),
      offsetMs: sanitizeInteger(event.offsetMs, 0),
      charIndex: sanitizeInteger(event.charIndex, -1),
      length: sanitizeInteger(event.length, 0),
      errorMessage: sanitizeString(event.errorMessage, 260),
    };
  }

  function sanitizeRunReportEvent(rawEvent) {
    const event = rawEvent && typeof rawEvent === "object" ? rawEvent : {};
    return {
      id: sanitizeString(event.id, 80) || `report-${Date.now()}`,
      attemptId: sanitizeString(event.attemptId, 80),
      requestId: sanitizeInteger(event.requestId, 0),
      at: sanitizeInteger(event.at, 0),
      type: sanitizeString(event.type, 80) || "unknown",
      surface: sanitizeString(event.surface, 80),
      sourceLabel: sanitizeString(event.sourceLabel, 120),
      textLength: sanitizeInteger(event.textLength, 0),
      sentenceLength: sanitizeInteger(event.sentenceLength, 0),
      blockId: sanitizeString(event.blockId, 120),
      sentenceIndex: sanitizeInteger(event.sentenceIndex, -1),
      sentenceCount: sanitizeInteger(event.sentenceCount, 0),
      sentenceStart: sanitizeInteger(event.sentenceStart, 0),
      sentenceEnd: sanitizeInteger(event.sentenceEnd, 0),
      host: sanitizeString(event.host, 120),
      tabId: sanitizeInteger(event.tabId, 0),
      selectedVoiceKey: sanitizeString(event.selectedVoiceKey, 40),
      selectedVoiceLabel: sanitizeString(event.selectedVoiceLabel, 80),
      selectedVoiceName: sanitizeString(event.selectedVoiceName, 160),
      speechRate: sanitizeRoundedRate(event.speechRate),
      langHint: sanitizeLangHint(event.langHint),
      documentLang: sanitizeLangHint(event.documentLang),
      listKind: sanitizeListKind(event.listKind),
      listDepth: sanitizeInteger(event.listDepth, 0),
      listMarkerText: sanitizeString(event.listMarkerText, 40),
      chunkCount: sanitizeInteger(event.chunkCount, 0),
      chunkPlan: sanitizeChunkPlan(event.chunkPlan),
      usedStartupChunks: sanitizeBoolean(event.usedStartupChunks),
      startupStrategy: sanitizeString(event.startupStrategy, 40),
      usedRecoveryChunks: sanitizeBoolean(event.usedRecoveryChunks),
      recoveryStrategy: sanitizeString(event.recoveryStrategy, 40),
      primaryScript: sanitizeString(event.primaryScript, 24),
      isRtl: sanitizeBoolean(event.isRtl),
      containsArabic: sanitizeBoolean(event.containsArabic),
      containsLatin: sanitizeBoolean(event.containsLatin),
      newlineCount: sanitizeInteger(event.newlineCount, 0),
      configuredStartTimeoutMs: sanitizeInteger(event.configuredStartTimeoutMs, 0),
      retryCount: sanitizeInteger(event.retryCount, 0),
      stopSettleMs: sanitizeInteger(event.stopSettleMs, 0),
      stopSettleReason: sanitizeString(event.stopSettleReason, 80),
      speakOptions: sanitizeSpeakOptions(event.speakOptions),
      startLatencyMs: sanitizeInteger(event.startLatencyMs, 0),
      firstWordLatencyMs: sanitizeInteger(event.firstWordLatencyMs, 0),
      firstWordBoundaryGapMs: sanitizeInteger(event.firstWordBoundaryGapMs, 0),
      gapFromPreviousSentenceEndMs: sanitizeInteger(event.gapFromPreviousSentenceEndMs, 0),
      failureCode: sanitizeString(event.failureCode, 80),
      message: sanitizeString(event.message, 260),
      settledByEvent: sanitizeString(event.settledByEvent, 80),
      runtimeLastError: sanitizeString(event.runtimeLastError, 260),
      note: sanitizeString(event.note, 180),
      error: sanitizeString(event.error, 260),
    };
  }

  function sanitizeRunReportAttempt(rawAttempt) {
    const attempt = rawAttempt && typeof rawAttempt === "object" ? rawAttempt : {};
    return {
      attemptId: sanitizeString(attempt.attemptId, 80) || `attempt-${Date.now()}`,
      requestId: sanitizeInteger(attempt.requestId, 0),
      surface: sanitizeString(attempt.surface, 80),
      sourceLabel: sanitizeString(attempt.sourceLabel, 120),
      host: sanitizeString(attempt.host, 120),
      tabId: sanitizeInteger(attempt.tabId, 0),
      blockId: sanitizeString(attempt.blockId, 120),
      selectedVoiceKey: sanitizeString(attempt.selectedVoiceKey, 40),
      selectedVoiceLabel: sanitizeString(attempt.selectedVoiceLabel, 80),
      selectedVoiceName: sanitizeString(attempt.selectedVoiceName, 160),
      speechRate: sanitizeRoundedRate(attempt.speechRate),
      textLength: sanitizeInteger(attempt.textLength, 0),
      sentenceCount: sanitizeInteger(attempt.sentenceCount, 0),
      sentenceIndex: sanitizeInteger(attempt.sentenceIndex, -1),
      sentenceLength: sanitizeInteger(attempt.sentenceLength, 0),
      sentenceStart: sanitizeInteger(attempt.sentenceStart, 0),
      sentenceEnd: sanitizeInteger(attempt.sentenceEnd, 0),
      langHint: sanitizeLangHint(attempt.langHint),
      documentLang: sanitizeLangHint(attempt.documentLang),
      listKind: sanitizeListKind(attempt.listKind),
      listDepth: sanitizeInteger(attempt.listDepth, 0),
      listMarkerText: sanitizeString(attempt.listMarkerText, 40),
      chunkCount: sanitizeInteger(attempt.chunkCount, 0),
      chunkPlan: sanitizeChunkPlan(attempt.chunkPlan),
      usedStartupChunks: sanitizeBoolean(attempt.usedStartupChunks),
      startupStrategy: sanitizeString(attempt.startupStrategy, 40),
      usedRecoveryChunks: sanitizeBoolean(attempt.usedRecoveryChunks),
      recoveryStrategy: sanitizeString(attempt.recoveryStrategy, 40),
      primaryScript: sanitizeString(attempt.primaryScript, 24),
      isRtl: sanitizeBoolean(attempt.isRtl),
      containsArabic: sanitizeBoolean(attempt.containsArabic),
      containsLatin: sanitizeBoolean(attempt.containsLatin),
      newlineCount: sanitizeInteger(attempt.newlineCount, 0),
      requestedAt: sanitizeInteger(attempt.requestedAt, 0),
      speakInvokedAt: sanitizeInteger(attempt.speakInvokedAt, 0),
      startAt: sanitizeInteger(attempt.startAt, 0),
      endAt: sanitizeInteger(attempt.endAt, 0),
      lastEventAt: sanitizeInteger(attempt.lastEventAt, 0),
      startLatencyMs: sanitizeInteger(attempt.startLatencyMs, 0),
      firstWordLatencyMs: sanitizeInteger(attempt.firstWordLatencyMs, 0),
      firstWordBoundaryGapMs: sanitizeInteger(attempt.firstWordBoundaryGapMs, 0),
      gapFromPreviousSentenceEndMs: sanitizeInteger(attempt.gapFromPreviousSentenceEndMs, 0),
      configuredStartTimeoutMs: sanitizeInteger(attempt.configuredStartTimeoutMs, 0),
      retryCount: sanitizeInteger(attempt.retryCount, 0),
      stopSettleMs: sanitizeInteger(attempt.stopSettleMs, 0),
      stopSettleReason: sanitizeString(attempt.stopSettleReason, 80),
      speakOptions: sanitizeSpeakOptions(attempt.speakOptions),
      status: sanitizeString(attempt.status, 40),
      failureCode: sanitizeString(attempt.failureCode, 80),
      message: sanitizeString(attempt.message, 260),
      settledByEvent: sanitizeString(attempt.settledByEvent, 80),
      runtimeLastError: sanitizeString(attempt.runtimeLastError, 260),
      ttsEvents: Array.isArray(attempt.ttsEvents)
        ? attempt.ttsEvents
            .map((event) => sanitizeTraceEvent(event))
            .sort((left, right) => Number(left.at || 0) - Number(right.at || 0))
        : [],
    };
  }

  function sanitizeExtensionErrorEntry(rawEntry) {
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    return {
      at: sanitizeInteger(entry.at, 0),
      surface: sanitizeString(entry.surface, 80),
      message: sanitizeString(entry.message, 260),
      stackHead: sanitizeString(entry.stackHead, 400),
      file: sanitizeString(entry.file, 200),
      line: sanitizeInteger(entry.line, 0),
      column: sanitizeInteger(entry.column, 0),
      host: sanitizeString(entry.host, 120),
      blockId: sanitizeString(entry.blockId, 120),
      attemptId: sanitizeString(entry.attemptId, 80),
    };
  }

  function isSupportedRunReportResetUrl(rawUrl) {
    const url = String(rawUrl || "").trim();
    return /^https?:\/\//i.test(url);
  }

  function shouldResetRunReportForPageSessionStart(input = {}) {
    const senderTabId = sanitizeInteger(input.senderTabId, 0);
    const activeTabId = sanitizeInteger(input.activeTabId, 0);
    const frameId = Number.isFinite(Number(input.frameId))
      ? Math.trunc(Number(input.frameId))
      : 0;
    const senderUrl = String(
      input.senderUrl || input.senderTabUrl || input.messageUrl || ""
    ).trim();
    const activeTabUrl = String(input.activeTabUrl || "").trim();
    const effectiveUrl = senderUrl || activeTabUrl;

    return Boolean(
      senderTabId &&
        activeTabId &&
        senderTabId === activeTabId &&
        frameId === 0 &&
        isSupportedRunReportResetUrl(effectiveUrl)
    );
  }

  function shouldStopPlaybackForRunReportReset(input = {}) {
    const senderTabId = sanitizeInteger(input.senderTabId, 0);
    const activeSessionTabId = sanitizeInteger(input.activeSessionTabId, 0);
    const activeSessionMode = sanitizeString(input.activeSessionMode, 40);
    return Boolean(
      senderTabId &&
        activeSessionTabId &&
        senderTabId === activeSessionTabId &&
        activeSessionMode === "page_reader"
    );
  }

  function compareRunReportAttemptsByRecency(left, right) {
    const leftAt = Number(
      left.lastEventAt ||
        left.endAt ||
        left.startAt ||
        left.speakInvokedAt ||
        left.requestedAt ||
        0
    );
    const rightAt = Number(
      right.lastEventAt ||
        right.endAt ||
        right.startAt ||
        right.speakInvokedAt ||
        right.requestedAt ||
        0
    );
    return rightAt - leftAt;
  }

  function sortRunReportAttempts(rawAttempts) {
    return Array.isArray(rawAttempts)
      ? rawAttempts
          .map((attempt) => sanitizeRunReportAttempt(attempt))
          .sort(compareRunReportAttemptsByRecency)
          .slice(0, REPORT_MAX_ATTEMPTS)
      : [];
  }

  function isRecoveredRunReportAttempt(rawAttempt) {
    const attempt = sanitizeRunReportAttempt(rawAttempt);
    return (
      sanitizeInteger(attempt.retryCount, 0) > 0 &&
      sanitizeString(attempt.status, 40).toLowerCase() === "finished" &&
      !sanitizeString(attempt.failureCode, 80)
    );
  }

  function countRecoveredRunReportStarts(rawAttempts) {
    return Array.isArray(rawAttempts)
      ? rawAttempts.reduce((count, attempt) => {
          return count + (isRecoveredRunReportAttempt(attempt) ? 1 : 0);
        }, 0)
      : 0;
  }

  function collectStartedRunReportLatencies(rawAttempts) {
    return Array.isArray(rawAttempts)
      ? rawAttempts
          .map((attempt) => sanitizeRunReportAttempt(attempt))
          .filter((attempt) => {
            return (
              sanitizeInteger(attempt.startAt, 0) > 0 &&
              sanitizeInteger(attempt.startLatencyMs, 0) > 0
            );
          })
          .map((attempt) => sanitizeInteger(attempt.startLatencyMs, 0))
          .sort((left, right) => left - right)
      : [];
  }

  function computeMedianLatencyMs(sortedLatencies) {
    if (!Array.isArray(sortedLatencies) || !sortedLatencies.length) {
      return 0;
    }

    const middleIndex = Math.floor(sortedLatencies.length / 2);
    if (sortedLatencies.length % 2 === 1) {
      return sanitizeInteger(sortedLatencies[middleIndex], 0);
    }

    return Math.round(
      (sanitizeInteger(sortedLatencies[middleIndex - 1], 0) +
        sanitizeInteger(sortedLatencies[middleIndex], 0)) /
        2
    );
  }

  function computeNearestRankLatencyMs(sortedLatencies, percentile) {
    if (!Array.isArray(sortedLatencies) || !sortedLatencies.length) {
      return 0;
    }

    const safePercentile = Number.isFinite(Number(percentile))
      ? Math.max(0, Math.min(1, Number(percentile)))
      : 0;
    const rank = Math.max(1, Math.ceil(sortedLatencies.length * safePercentile));
    return sanitizeInteger(
      sortedLatencies[Math.min(sortedLatencies.length - 1, rank - 1)],
      0
    );
  }

  function buildRunReportInsights(rawReport) {
    const report = rawReport && typeof rawReport === "object" ? rawReport : {};
    const attempts = sortRunReportAttempts(report.attempts);
    const latestAttempt = attempts[0] || null;
    const startedLatencies = collectStartedRunReportLatencies(attempts);
    const latestFailureCode =
      latestAttempt && latestAttempt.failureCode ? latestAttempt.failureCode : "";
    return {
      latestAttempt,
      lastFailureCode: latestFailureCode,
      lastFailureMessage:
        latestFailureCode && latestAttempt ? latestAttempt.message : "",
      recoveredStarts: countRecoveredRunReportStarts(attempts),
      startLatencySampleCount: startedLatencies.length,
      startLatencyMedianMs: computeMedianLatencyMs(startedLatencies),
      startLatencyP95Ms: computeNearestRankLatencyMs(startedLatencies, 0.95),
      startLatencyMaxMs: startedLatencies.length
        ? sanitizeInteger(startedLatencies[startedLatencies.length - 1], 0)
        : 0,
    };
  }

  function buildDefaultRunReport() {
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      lastUpdatedAt: 0,
      counters: {
        voiceProbes: 0,
        selectionLoads: 0,
        manualReads: 0,
        pageReaderReads: 0,
        pauses: 0,
        resumes: 0,
        stops: 0,
        errors: 0,
        recoveredStarts: 0,
      },
      attempts: [],
      events: [],
      extensionErrors: [],
    };
  }

  function sanitizeRunReport(rawReport) {
    const report = rawReport && typeof rawReport === "object" ? rawReport : {};
    const counters = report.counters && typeof report.counters === "object"
      ? report.counters
      : {};
    const attempts = sortRunReportAttempts(report.attempts);
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      lastUpdatedAt: sanitizeInteger(report.lastUpdatedAt, 0),
      counters: {
        voiceProbes: sanitizeReportCounter(counters.voiceProbes),
        selectionLoads: sanitizeReportCounter(counters.selectionLoads),
        manualReads: sanitizeReportCounter(counters.manualReads),
        pageReaderReads: sanitizeReportCounter(counters.pageReaderReads),
        pauses: sanitizeReportCounter(counters.pauses),
        resumes: sanitizeReportCounter(counters.resumes),
        stops: sanitizeReportCounter(counters.stops),
        errors: sanitizeReportCounter(counters.errors),
        recoveredStarts: countRecoveredRunReportStarts(attempts),
      },
      attempts,
      events: Array.isArray(report.events)
        ? report.events
            .map((event) => sanitizeRunReportEvent(event))
            .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
            .slice(0, REPORT_MAX_EVENTS)
        : [],
      extensionErrors: Array.isArray(report.extensionErrors)
        ? report.extensionErrors
            .map((entry) => sanitizeExtensionErrorEntry(entry))
            .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
            .slice(0, REPORT_MAX_EXTENSION_ERRORS)
        : [],
    };
  }

  function pickRunReportCounter(type) {
    const normalized = sanitizeString(type, 80);
    if (normalized === "voice_probe_started") {
      return "voiceProbes";
    }
    if (normalized === "selection_loaded") {
      return "selectionLoads";
    }
    if (normalized === "manual_read_requested") {
      return "manualReads";
    }
    if (normalized === "page_reader_requested") {
      return "pageReaderReads";
    }
    if (normalized === "paused") {
      return "pauses";
    }
    if (normalized === "resumed") {
      return "resumes";
    }
    if (normalized === "stopped") {
      return "stops";
    }
    if (normalized.endsWith("_error")) {
      return "errors";
    }
    return "";
  }

  const api = {
    REPORT_SCHEMA_VERSION,
    REPORT_MAX_ATTEMPTS,
    REPORT_MAX_CHUNK_PLAN,
    REPORT_MAX_EVENTS,
    REPORT_MAX_EXTENSION_ERRORS,
    START_RETRY_DELAY_MS,
    START_TIMEOUT_DEFAULT_MS,
    START_TIMEOUT_STARTUP_CLAUSE_MS,
    START_TIMEOUT_LONG_MS,
    START_TIMEOUT_VERY_LONG_CONTEXT_MS,
    START_TIMEOUT_RTL_MS,
    START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS,
    analyzeTextProfile,
    buildRunReportInsights,
    buildDefaultRunReport,
    countRecoveredRunReportStarts,
    isSupportedRunReportResetUrl,
    isRecoveredRunReportAttempt,
    pickRunReportCounter,
    resolveStartTimeoutMs,
    sanitizeChunkPlan,
    sanitizeExtensionErrorEntry,
    sanitizeRunReport,
    sanitizeRunReportAttempt,
    sanitizeRunReportEvent,
    sanitizeSpeakOptions,
    shouldResetRunReportForPageSessionStart,
    shouldStopPlaybackForRunReportReset,
  };

  globalScope.EdgeVoiceReaderDebugCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
