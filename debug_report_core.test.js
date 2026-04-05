"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REPORT_SCHEMA_VERSION,
  START_TIMEOUT_AUTO_ADVANCE_RTL_LIST_MS,
  START_TIMEOUT_DEFAULT_MS,
  START_TIMEOUT_LONG_MS,
  START_TIMEOUT_RTL_MS,
  analyzeTextProfile,
  buildDefaultRunReport,
  pickRunReportCounter,
  resolveStartTimeoutMs,
  sanitizeRunReport,
} = require("./debug_report_core.js");

test("buildDefaultRunReport creates the v2 debug schema", () => {
  const report = buildDefaultRunReport();
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
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
  assert.equal("sentenceText" in report.attempts[0], false);
  assert.equal(report.events[0].failureCode, "start_timeout");
  assert.equal(report.events[0].listKind, "unordered");
  assert.equal(report.events[0].chunkCount, 2);
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
});

test("pickRunReportCounter preserves existing counters and treats extension errors as errors", () => {
  assert.equal(pickRunReportCounter("page_reader_requested"), "pageReaderReads");
  assert.equal(pickRunReportCounter("manual_read_requested"), "manualReads");
  assert.equal(pickRunReportCounter("extension_error"), "errors");
  assert.equal(pickRunReportCounter("paused"), "pauses");
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
