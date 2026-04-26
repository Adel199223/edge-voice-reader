"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REPORT_SCHEMA_VERSION,
  START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS,
  START_TIMEOUT_DEFAULT_MS,
  START_TIMEOUT_LONG_MS,
  START_TIMEOUT_RTL_MS,
  START_TIMEOUT_STARTUP_CLAUSE_MS,
  START_TIMEOUT_VERY_LONG_CONTEXT_MS,
  analyzeTextProfile,
  buildRunReportInsights,
  buildDefaultRunReport,
  isSupportedRunReportResetUrl,
  pickRunReportCounter,
  resolveStartTimeoutMs,
  sanitizeRunReport,
  shouldResetRunReportForPageSessionStart,
  shouldStopPlaybackForRunReportReset,
} = require("./debug_report_core.js");

test("buildDefaultRunReport creates the current debug schema", () => {
  const report = buildDefaultRunReport();
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.equal(report.counters.recoveredStarts, 0);
  assert.deepEqual(report.attempts, []);
  assert.deepEqual(report.events, []);
  assert.deepEqual(report.extensionErrors, []);
});

test("sanitizeRunReport keeps bounded structured buffers and strips unknown fields", () => {
  const report = sanitizeRunReport({
    schemaVersion: 999,
    lastUpdatedAt: 10,
    counters: {
      errors: 3,
    },
    attempts: [
      {
        attemptId: "attempt-1",
        requestId: 7,
        sentenceLength: 42,
        langHint: "en-US",
        documentLang: "ar",
        listKind: "ordered",
        listDepth: 2,
        listMarkerText: "3",
        chunkCount: 2,
        chunkPlan: [
          { index: 1, langHint: "en-US", textLength: 8, reason: "latin_phrase" },
          { index: 0, langHint: "ar", textLength: 20, reason: "base" },
        ],
        stopSettleMs: 150,
        stopSettleReason: "page_reader_supersede",
        speakOptions: {
          voiceName: "Microsoft AvaMultilingual Online (Natural) - English (United States)",
          rate: 1.45,
          lang: "en-US",
          enqueue: false,
          requiredEventTypes: ["start", "end", "error"],
          text: "should not survive",
        },
        primaryScript: "arabic",
        runtimeLastError: "boom",
        sentenceText: "should not survive",
        ttsEvents: [
          { type: "start", at: 15, offsetMs: 3, errorMessage: "" },
        ],
      },
    ],
    events: [
      {
        id: "evt-1",
        type: "page_reader_error",
        at: 20,
        message: "timed out",
        failureCode: "start_timeout",
        langHint: "ar",
        documentLang: "ar",
        listKind: "unordered",
        listDepth: 1,
        listMarkerText: "bullet",
        chunkCount: 2,
        chunkPlan: [
          { index: 0, langHint: "ar", textLength: 12, reason: "base" },
          { index: 1, langHint: "en-US", textLength: 10, reason: "url" },
        ],
        stopSettleMs: 150,
        stopSettleReason: "chunk_retry",
        speakOptions: {
          voiceName: "Microsoft AvaMultilingual Online (Natural) - English (United States)",
          rate: 1.45,
          lang: "en-US",
          enqueue: false,
          requiredEventTypes: ["start", "end"],
          rawText: "should not survive",
        },
        sentenceText: "should not survive",
      },
    ],
    extensionErrors: [
      {
        at: 30,
        surface: "popup",
        message: "uncaught",
        stackHead: "line 1",
        extra: "ignored",
      },
    ],
  });

  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.equal(report.counters.errors, 3);
  assert.equal(report.counters.recoveredStarts, 0);
  assert.equal(report.attempts[0].attemptId, "attempt-1");
  assert.equal(report.attempts[0].sentenceLength, 42);
  assert.equal(report.attempts[0].langHint, "en-US");
  assert.equal(report.attempts[0].documentLang, "ar");
  assert.equal(report.attempts[0].listKind, "ordered");
  assert.equal(report.attempts[0].chunkCount, 2);
  assert.deepEqual(report.attempts[0].chunkPlan, [
    { index: 0, langHint: "ar", textLength: 20, reason: "base" },
    { index: 1, langHint: "en-US", textLength: 8, reason: "latin_phrase" },
  ]);
  assert.equal(report.attempts[0].runtimeLastError, "boom");
  assert.equal(report.attempts[0].stopSettleMs, 150);
  assert.equal(report.attempts[0].stopSettleReason, "page_reader_supersede");
  assert.deepEqual(report.attempts[0].speakOptions, {
    voiceName: "Microsoft AvaMultilingual Online (Natural) - English (United States)",
    rate: 1.45,
    lang: "en-US",
    enqueue: false,
    requiredEventTypes: ["start", "end", "error"],
  });
  assert.equal("text" in report.attempts[0].speakOptions, false);
  assert.equal("sentenceText" in report.attempts[0], false);
  assert.equal(report.events[0].failureCode, "start_timeout");
  assert.equal(report.events[0].listKind, "unordered");
  assert.equal(report.events[0].chunkCount, 2);
  assert.equal(report.events[0].stopSettleReason, "chunk_retry");
  assert.equal("rawText" in report.events[0].speakOptions, false);
  assert.equal("sentenceText" in report.events[0], false);
  assert.equal(report.extensionErrors[0].surface, "popup");
  assert.equal("extra" in report.extensionErrors[0], false);
});

test("analyzeTextProfile detects Arabic and RTL text", () => {
  const profile = analyzeTextProfile("مرحبا بالعالم\nهذا اختبار");
  assert.equal(profile.primaryScript, "arabic");
  assert.equal(profile.isRtl, true);
  assert.equal(profile.containsArabic, true);
  assert.equal(profile.containsLatin, false);
  assert.equal(profile.newlineCount, 1);
});

test("analyzeTextProfile detects Latin text", () => {
  const profile = analyzeTextProfile("Hello world");
  assert.equal(profile.primaryScript, "latin");
  assert.equal(profile.isRtl, false);
  assert.equal(profile.containsArabic, false);
  assert.equal(profile.containsLatin, true);
});

test("resolveStartTimeoutMs uses default, long, and RTL timeouts", () => {
  assert.equal(
    resolveStartTimeoutMs({
      textLength: 40,
      sentenceLength: 40,
      textProfile: analyzeTextProfile("Hello world"),
    }),
    START_TIMEOUT_DEFAULT_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 220,
      sentenceLength: 140,
      textProfile: analyzeTextProfile("This is a deliberately long English sentence that should trigger the longer timeout because it is very long and should not be treated like a short sentence."),
    }),
    START_TIMEOUT_LONG_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 120,
      sentenceLength: 120,
      textProfile: analyzeTextProfile("مرحبا بكم في هذا الاختبار الذي يجب أن يستخدم مهلة بدء أطول للغة العربية"),
    }),
    START_TIMEOUT_RTL_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 120,
      sentenceLength: 120,
      listKind: "unordered",
      transitionSource: "auto_advance",
      textProfile: analyzeTextProfile("مرحبا بكم في هذا الاختبار الذي يجب أن يستخدم مهلة بدء أطول للغة العربية"),
    }),
    START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 380,
      sentenceLength: 380,
      chunkCount: 1,
      chunkReason: "context",
      textProfile: analyzeTextProfile("This is a deliberately long English context sentence that keeps going with descriptive phrases, commas, quoted labels, and inline-code style wording so we can verify that very long single-context chunks get the larger risky-start timeout instead of the normal long-sentence budget."),
    }),
    START_TIMEOUT_VERY_LONG_CONTEXT_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 380,
      sentenceLength: 96,
      chunkCount: 4,
      chunkReason: "startup_clause",
      textProfile: analyzeTextProfile("This is a short startup clause that should use the dedicated faster-start timeout tier instead of the larger single-context budget."),
    }),
    START_TIMEOUT_STARTUP_CLAUSE_MS
  );

  assert.equal(
    resolveStartTimeoutMs({
      textLength: 380,
      sentenceLength: 140,
      chunkCount: 3,
      chunkReason: "recovery_clause",
      textProfile: analyzeTextProfile("This is a shorter clause-sized English recovery chunk that should stay on the normal long-sentence timeout path."),
    }),
    START_TIMEOUT_LONG_MS
  );
});

test("pickRunReportCounter preserves existing counters and treats extension errors as errors", () => {
  assert.equal(pickRunReportCounter("page_reader_requested"), "pageReaderReads");
  assert.equal(pickRunReportCounter("manual_read_requested"), "manualReads");
  assert.equal(pickRunReportCounter("extension_error"), "errors");
  assert.equal(pickRunReportCounter("paused"), "pauses");
});

test("isSupportedRunReportResetUrl only allows web pages", () => {
  assert.equal(isSupportedRunReportResetUrl("https://chatgpt.com"), true);
  assert.equal(isSupportedRunReportResetUrl("http://example.com"), true);
  assert.equal(isSupportedRunReportResetUrl("chrome-extension://abc/report.html"), false);
  assert.equal(isSupportedRunReportResetUrl("edge://settings"), false);
});

test("shouldResetRunReportForPageSessionStart only resets for the active top-level web tab", () => {
  assert.equal(
    shouldResetRunReportForPageSessionStart({
      senderTabId: 22,
      senderTabUrl: "https://chatgpt.com/",
      activeTabId: 22,
      activeTabUrl: "https://chatgpt.com/",
      frameId: 0,
    }),
    true
  );

  assert.equal(
    shouldResetRunReportForPageSessionStart({
      senderTabId: 22,
      senderTabUrl: "https://chatgpt.com/",
      activeTabId: 19,
      activeTabUrl: "https://chatgpt.com/",
      frameId: 0,
    }),
    false
  );

  assert.equal(
    shouldResetRunReportForPageSessionStart({
      senderTabId: 22,
      senderTabUrl: "https://chatgpt.com/",
      activeTabId: 22,
      activeTabUrl: "https://chatgpt.com/",
      frameId: 3,
    }),
    false
  );

  assert.equal(
    shouldResetRunReportForPageSessionStart({
      senderTabId: 22,
      senderTabUrl: "edge://settings",
      activeTabId: 22,
      activeTabUrl: "edge://settings",
      frameId: 0,
    }),
    false
  );
});

test("shouldStopPlaybackForRunReportReset only targets matching page reader sessions", () => {
  assert.equal(
    shouldStopPlaybackForRunReportReset({
      senderTabId: 14,
      activeSessionTabId: 14,
      activeSessionMode: "page_reader",
    }),
    true
  );

  assert.equal(
    shouldStopPlaybackForRunReportReset({
      senderTabId: 14,
      activeSessionTabId: 14,
      activeSessionMode: "manual",
    }),
    false
  );

  assert.equal(
    shouldStopPlaybackForRunReportReset({
      senderTabId: 14,
      activeSessionTabId: 15,
      activeSessionMode: "page_reader",
    }),
    false
  );
});

test("sanitizeRunReport derives recoveredStarts from successful retry attempts", () => {
  const report = sanitizeRunReport({
    counters: {
      recoveredStarts: 99,
    },
    attempts: [
      {
        attemptId: "attempt-finished-retry",
        requestedAt: 30,
        lastEventAt: 30,
        retryCount: 1,
        status: "finished",
        settledByEvent: "end",
      },
      {
        attemptId: "attempt-hard-timeout",
        requestedAt: 20,
        lastEventAt: 20,
        retryCount: 1,
        status: "error",
        failureCode: "start_timeout",
        message: "Timed out.",
      },
      {
        attemptId: "attempt-clean-success",
        requestedAt: 10,
        lastEventAt: 10,
        retryCount: 0,
        status: "finished",
      },
    ],
  });

  assert.equal(report.counters.recoveredStarts, 1);
});

test("buildRunReportInsights clears failure summary after a newer success", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-success",
        requestedAt: 20,
        lastEventAt: 20,
        retryCount: 1,
        status: "finished",
        settledByEvent: "end",
      },
      {
        attemptId: "attempt-failure",
        requestedAt: 10,
        lastEventAt: 10,
        retryCount: 1,
        status: "error",
        failureCode: "start_timeout",
        message: "Ava did not start in time.",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.latestAttempt.attemptId, "attempt-success");
  assert.equal(insights.lastFailureCode, "");
  assert.equal(insights.lastFailureMessage, "");
  assert.equal(insights.recoveredStarts, 1);
});

test("buildRunReportInsights keeps failure summary for the latest failed attempt", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-failure",
        requestedAt: 20,
        lastEventAt: 20,
        retryCount: 1,
        status: "error",
        failureCode: "start_timeout",
        message: "Ava did not start in time.",
      },
      {
        attemptId: "attempt-older-success",
        requestedAt: 10,
        lastEventAt: 10,
        retryCount: 1,
        status: "finished",
        settledByEvent: "end",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.latestAttempt.attemptId, "attempt-failure");
  assert.equal(insights.lastFailureCode, "start_timeout");
  assert.equal(insights.lastFailureMessage, "Ava did not start in time.");
  assert.equal(insights.recoveredStarts, 1);
});

test("buildRunReportInsights computes mixed latency sample metrics", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-a",
        requestedAt: 40,
        lastEventAt: 40,
        startAt: 10,
        startLatencyMs: 120,
        status: "finished",
        settledByEvent: "end",
      },
      {
        attemptId: "attempt-b",
        requestedAt: 30,
        lastEventAt: 30,
        startAt: 10,
        startLatencyMs: 580,
        status: "finished",
        settledByEvent: "end",
      },
      {
        attemptId: "attempt-c",
        requestedAt: 20,
        lastEventAt: 20,
        startAt: 10,
        startLatencyMs: 2735,
        status: "finished",
        settledByEvent: "end",
      },
      {
        attemptId: "attempt-d",
        requestedAt: 10,
        lastEventAt: 10,
        startAt: 10,
        startLatencyMs: 184,
        status: "finished",
        settledByEvent: "end",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.startLatencySampleCount, 4);
  assert.equal(insights.startLatencyMedianMs, 382);
  assert.equal(insights.startLatencyP95Ms, 2735);
  assert.equal(insights.startLatencyMaxMs, 2735);
});

test("buildRunReportInsights rounds even-sized latency medians", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-a",
        requestedAt: 40,
        lastEventAt: 40,
        startAt: 10,
        startLatencyMs: 101,
        status: "finished",
      },
      {
        attemptId: "attempt-b",
        requestedAt: 30,
        lastEventAt: 30,
        startAt: 10,
        startLatencyMs: 102,
        status: "finished",
      },
      {
        attemptId: "attempt-c",
        requestedAt: 20,
        lastEventAt: 20,
        startAt: 10,
        startLatencyMs: 105,
        status: "finished",
      },
      {
        attemptId: "attempt-d",
        requestedAt: 10,
        lastEventAt: 10,
        startAt: 10,
        startLatencyMs: 106,
        status: "finished",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.startLatencySampleCount, 4);
  assert.equal(insights.startLatencyMedianMs, 104);
  assert.equal(insights.startLatencyP95Ms, 106);
  assert.equal(insights.startLatencyMaxMs, 106);
});

test("buildRunReportInsights excludes pre-start failures from latency metrics", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-pre-start-failure",
        requestedAt: 20,
        lastEventAt: 20,
        startAt: 0,
        startLatencyMs: 0,
        status: "error",
        failureCode: "start_timeout",
      },
      {
        attemptId: "attempt-started-success",
        requestedAt: 10,
        lastEventAt: 10,
        startAt: 10,
        startLatencyMs: 200,
        status: "finished",
        settledByEvent: "end",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.startLatencySampleCount, 1);
  assert.equal(insights.startLatencyMedianMs, 200);
  assert.equal(insights.startLatencyP95Ms, 200);
  assert.equal(insights.startLatencyMaxMs, 200);
});

test("buildRunReportInsights returns zero latency metrics when no attempts started", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-request-only",
        requestedAt: 10,
        lastEventAt: 10,
        startAt: 0,
        startLatencyMs: 0,
        status: "error",
        failureCode: "start_timeout",
      },
    ],
  });
  const insights = buildRunReportInsights(report);

  assert.equal(insights.startLatencySampleCount, 0);
  assert.equal(insights.startLatencyMedianMs, 0);
  assert.equal(insights.startLatencyP95Ms, 0);
  assert.equal(insights.startLatencyMaxMs, 0);
});


test("sanitizeRunReport preserves chunk plans and list metadata without storing sentence text", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-2",
        langHint: "en-US",
        documentLang: "ar",
        listKind: "ordered",
        listDepth: 2,
        listMarkerText: "3",
        chunkCount: 2,
        chunkPlan: [
          { index: 0, langHint: "ar", textLength: 24, reason: "context" },
          { index: 1, langHint: "en-US", textLength: 8, reason: "latin_phrase" },
        ],
        sentenceText: "should not survive",
      },
    ],
    events: [
      {
        id: "evt-2",
        langHint: "ar",
        documentLang: "ar",
        listKind: "unordered",
        listDepth: 1,
        listMarkerText: "?",
        chunkCount: 1,
        chunkPlan: [{ index: 0, langHint: "ar", textLength: 12, reason: "context" }],
        sentenceText: "should not survive",
      },
    ],
  });

  assert.equal(report.attempts[0].langHint, "en-US");
  assert.equal(report.attempts[0].documentLang, "ar");
  assert.equal(report.attempts[0].listKind, "ordered");
  assert.equal(report.attempts[0].chunkCount, 2);
  assert.deepEqual(report.attempts[0].chunkPlan, [
    { index: 0, langHint: "ar", textLength: 24, reason: "context" },
    { index: 1, langHint: "en-US", textLength: 8, reason: "latin_phrase" },
  ]);
  assert.equal("sentenceText" in report.attempts[0], false);
  assert.equal(report.events[0].listMarkerText, "?");
  assert.deepEqual(report.events[0].chunkPlan, [
    { index: 0, langHint: "ar", textLength: 12, reason: "context" },
  ]);
  assert.equal("sentenceText" in report.events[0], false);
});

test("sanitizeRunReport preserves startup and recovery metadata without storing text", () => {
  const report = sanitizeRunReport({
    attempts: [
      {
        attemptId: "attempt-recovery",
        failureCode: "superseded_before_start",
        usedStartupChunks: true,
        startupStrategy: "clause",
        usedRecoveryChunks: true,
        recoveryStrategy: "clause",
        firstWordLatencyMs: 4270,
        firstWordBoundaryGapMs: 188,
        chunkPlan: [
          { index: 0, langHint: "en-US", textLength: 102, reason: "startup_clause" },
          { index: 1, langHint: "en-US", textLength: 120, reason: "recovery_clause" },
          { index: 2, langHint: "en-US", textLength: 118, reason: "recovery_clause" },
        ],
        sentenceText: "should not survive",
      },
    ],
    events: [
      {
        id: "evt-recovery",
        failureCode: "superseded_before_start",
        usedStartupChunks: true,
        startupStrategy: "clause",
        usedRecoveryChunks: true,
        recoveryStrategy: "clause",
        firstWordLatencyMs: 4270,
        firstWordBoundaryGapMs: 188,
        chunkPlan: [
          { index: 0, langHint: "en-US", textLength: 102, reason: "startup_clause" },
        ],
        sentenceText: "should not survive",
      },
    ],
  });

  assert.equal(report.attempts[0].failureCode, "superseded_before_start");
  assert.equal(report.attempts[0].usedStartupChunks, true);
  assert.equal(report.attempts[0].startupStrategy, "clause");
  assert.equal(report.attempts[0].usedRecoveryChunks, true);
  assert.equal(report.attempts[0].recoveryStrategy, "clause");
  assert.equal(report.attempts[0].firstWordLatencyMs, 4270);
  assert.equal(report.attempts[0].firstWordBoundaryGapMs, 188);
  assert.equal(report.attempts[0].chunkPlan[0].reason, "startup_clause");
  assert.equal("sentenceText" in report.attempts[0], false);
  assert.equal(report.events[0].failureCode, "superseded_before_start");
  assert.equal(report.events[0].usedStartupChunks, true);
  assert.equal(report.events[0].startupStrategy, "clause");
  assert.equal(report.events[0].usedRecoveryChunks, true);
  assert.equal(report.events[0].recoveryStrategy, "clause");
  assert.equal(report.events[0].firstWordLatencyMs, 4270);
  assert.equal(report.events[0].firstWordBoundaryGapMs, 188);
  assert.equal(report.events[0].chunkPlan[0].reason, "startup_clause");
  assert.equal("sentenceText" in report.events[0], false);
});
