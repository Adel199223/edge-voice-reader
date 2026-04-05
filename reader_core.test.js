"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDefaultState,
  describeSelectionCaptureError,
  getVoiceByKey,
  isTransientRuntimeFeedback,
  sanitizeState,
  trimDraftText,
} = require("./reader_core.js");

test("buildDefaultState prefers Ava with a canonical Edge voice name", () => {
  const state = buildDefaultState();
  assert.equal(state.preferredVoiceKey, "ava");
  assert.equal(
    state.preferredVoiceName,
    "Microsoft AvaMultilingual Online (Natural) - English (United States)"
  );
  assert.equal(state.playbackMode, "edge_native");
});

test("sanitizeState repairs invalid settings and preserves the canonical voice map", () => {
  const state = sanitizeState({
    preferredVoiceKey: "not-real",
    preferredVoiceName: "Something else",
    speechRate: 9,
    draftText: "  hello world  ",
    voiceAvailability: {
      ava: {
        status: "available",
        checkedAt: 100,
        error: "",
      },
      andrew: {
        status: "bad-status",
        checkedAt: "nope",
        error: " issue ",
      },
    },
  });

  assert.equal(state.preferredVoiceKey, "ava");
  assert.equal(
    state.preferredVoiceName,
    "Microsoft AvaMultilingual Online (Natural) - English (United States)"
  );
  assert.equal(state.speechRate, 2);
  assert.equal(state.draftText, "hello world");
  assert.equal(state.voiceAvailability.ava.status, "available");
  assert.equal(state.voiceAvailability.andrew.status, "unknown");
  assert.equal(state.voiceAvailability.andrew.error, "issue");
});

test("describeSelectionCaptureError explains blocked browser pages clearly", () => {
  assert.equal(
    describeSelectionCaptureError("edge://extensions", "Cannot access contents of url"),
    "Edge blocks extensions from reading selections on browser-internal pages like edge://."
  );
  assert.equal(
    describeSelectionCaptureError(
      "https://example.com",
      "Cannot access chrome:// and edge:// URLs"
    ),
    "Edge blocks extensions from reading selections on browser-internal pages like edge://."
  );
  assert.equal(
    describeSelectionCaptureError(
      "https://example.com",
      "Extension manifest must request permission to access the respective host."
    ),
    "Edge needs a direct popup or keyboard-shortcut gesture before it can read selections from this page."
  );
});

test("trimDraftText trims and caps long drafts", () => {
  const padded = trimDraftText("  keep me  ");
  assert.equal(padded, "keep me");

  const giant = `x${"y".repeat(25000)}`;
  assert.equal(trimDraftText(giant).length, 20000);
});

test("getVoiceByKey falls back to Ava", () => {
  assert.equal(getVoiceByKey("andrew").label, "Andrew");
  assert.equal(getVoiceByKey("missing").label, "Ava");
});

test("isTransientRuntimeFeedback keeps active speech live and marks handled feedback as transient", () => {
  assert.equal(
    isTransientRuntimeFeedback({
      isSpeaking: false,
      lastEvent: "selection-loaded",
      lastError: "",
    }),
    true
  );
  assert.equal(
    isTransientRuntimeFeedback({
      isSpeaking: false,
      lastEvent: "idle",
      lastError: "Edge blocked this page.",
    }),
    true
  );
  assert.equal(
    isTransientRuntimeFeedback({
      isSpeaking: true,
      lastEvent: "start",
      lastError: "",
    }),
    false
  );
  assert.equal(
    isTransientRuntimeFeedback({
      isSpeaking: false,
      lastEvent: "idle",
      lastError: "",
    }),
    false
  );
});
