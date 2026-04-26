"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildChunkPlan,
  buildRecoveryChunks,
  buildStartupChunks,
  buildSpeechChunks,
} = require("./speech_prep_core.js");

test("buildSpeechChunks keeps pure Arabic text as one chunk", () => {
  const chunks = buildSpeechChunks("مرحبا بكم في اختبار عربي واضح.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].langHint, "ar");
  assert.equal(chunks[0].reason, "context");
});

test("buildSpeechChunks keeps pure English text as one chunk", () => {
  const chunks = buildSpeechChunks("This is a plain English sentence for playback.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].langHint, "en-US");
  assert.equal(chunks[0].reason, "context");
});

test("buildSpeechChunks keeps a pure Arabic bullet item unchanged on an English page", () => {
  const chunks = buildSpeechChunks("هي ليست لديها مناعة ضد داء المقوسات لذلك الوقاية مهمة.", {
    spokenPrefix: "",
    langHint: "ar",
    documentLang: "en-US",
    sentenceStart: 0,
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].langHint, "ar");
  assert.equal(
    chunks[0].text,
    "هي ليست لديها مناعة ضد داء المقوسات لذلك الوقاية مهمة."
  );
});

test("buildSpeechChunks isolates an English product phrase inside Arabic", () => {
  const chunks = buildSpeechChunks("افتح Windows Defender ثم عد إلى الإعدادات.");
  assert.equal(chunks.length >= 2, true);
  assert.equal(
    chunks.some((chunk) => chunk.text.includes("Windows Defender") && chunk.langHint === "en-US"),
    true
  );

  const plan = buildChunkPlan(chunks);
  assert.equal(plan.some((entry) => entry.reason === "latin_phrase"), true);
});

test("buildSpeechChunks isolates URLs, emails, and version-like spans", () => {
  const urlChunks = buildSpeechChunks("راجع الرابط https://example.com/docs ثم تابع.");
  assert.equal(urlChunks.some((chunk) => chunk.reason === "url"), true);

  const emailChunks = buildSpeechChunks("راسل support@example.com ثم انتظر الرد.");
  assert.equal(emailChunks.some((chunk) => chunk.reason === "email"), true);

  const versionChunks = buildSpeechChunks("حدّث إلى الإصدار v2.4.1 قبل المتابعة.");
  assert.equal(versionChunks.some((chunk) => chunk.reason === "code"), true);
});

test("buildSpeechChunks prefers overlapping lang segments when they exist", () => {
  const chunks = buildSpeechChunks("عنصر قائمة: افتح Settings ثم تابع.", {
    documentLang: "ar",
    langSegments: [
      { start: 0, end: 10, langHint: "ar" },
      { start: 16, end: 24, langHint: "en-US" },
    ],
  });

  assert.equal(
    chunks.some((chunk) => chunk.text.includes("Settings") && chunk.langHint === "en-US"),
    true
  );
});

test("buildSpeechChunks maps raw lang segments correctly when spokenPrefix is added separately", () => {
  const text = "افتح Settings ثم تابع.";
  const latinStart = text.indexOf("Settings");
  const chunks = buildSpeechChunks(text, {
    spokenPrefix: "عنصر قائمة",
    documentLang: "en-US",
    langHint: "ar",
    langSegments: [
      { start: latinStart, end: latinStart + "Settings".length, langHint: "en-US" },
    ],
  });

  assert.equal(
    chunks.some((chunk) => chunk.text.includes("Settings") && chunk.langHint === "en-US"),
    true
  );
  assert.equal(chunks[0].text.startsWith("عنصر قائمة "), true);
});

test("buildSpeechChunks keeps raw lang segment positions stable when no spoken prefix is added", () => {
  const text = "افتح Settings ثم تابع.";
  const latinStart = text.indexOf("Settings");
  const chunks = buildSpeechChunks(text, {
    spokenPrefix: "",
    documentLang: "en-US",
    langHint: "ar",
    langSegments: [
      { start: latinStart, end: latinStart + "Settings".length, langHint: "en-US" },
    ],
  });

  assert.equal(chunks[0].text.startsWith("عنصر قائمة "), false);
  assert.equal(
    chunks.some((chunk) => chunk.text.includes("Settings") && chunk.langHint === "en-US"),
    true
  );
});


test("buildSpeechChunks exposes chunk profiles and buildChunkPlan metadata", () => {
  const chunks = buildSpeechChunks("مرحبا ChatGPT", { sentenceStart: 0 });
  const chunkPlan = buildChunkPlan(chunks);
  assert.equal(chunks.length >= 2, true);
  assert.equal(typeof chunks[0].profile.primaryScript, "string");
  assert.equal(chunkPlan.length, chunks.length);
  assert.equal(chunkPlan.some((chunk) => chunk.langHint === "en-US"), true);
});

test("buildRecoveryChunks splits long English context into clause-sized chunks", () => {
  const text =
    'Right now, the browser app is already structurally simplified, but the first screen still exposes too much web-console texture: Simple Workspace Shell, App Mode, Refresh, workspace/live/shadow language, native file input, a raw output path field, Action Rail wording, and a Run Status card that lacks the Qt-style progress bar metrics even though the user guide describes one.';
  const chunks = buildRecoveryChunks(text, {
    documentLang: "en-US",
    langHint: "en-US",
  });

  assert.equal(chunks.length >= 3, true);
  assert.equal(
    chunks.every((chunk) => chunk.reason === "recovery_clause"),
    true
  );
  assert.equal(
    chunks.map((chunk) => chunk.text).join(" "),
    text
  );
  assert.equal(
    chunks.every((chunk) => chunk.textLength <= 190),
    true
  );
  assert.deepEqual(
    buildChunkPlan(chunks).map((chunk) => chunk.reason),
    chunks.map((chunk) => chunk.reason)
  );
});

test("buildStartupChunks splits long English context into a short lead chunk and ordered startup clauses", () => {
  const text =
    'Right now, the browser app is already structurally simplified, but the first screen still exposes too much "web-console" texture: `Simple Workspace Shell`, App Mode, Refresh, workspace/live/shadow language, native file input, a raw output path field, "Action Rail" wording, and a Run Status card that still lacks the Qt-style progress bar metrics the guide describes.';
  const chunks = buildStartupChunks(text, {
    documentLang: "en-US",
    langHint: "en-US",
  });

  assert.equal(chunks.length >= 3, true);
  assert.equal(chunks[0].reason, "startup_clause");
  assert.equal(chunks[0].textLength >= 70, true);
  assert.equal(chunks[0].textLength <= 130, true);
  assert.equal(
    chunks.every((chunk) => chunk.reason === "startup_clause"),
    true
  );
  assert.equal(
    chunks.map((chunk) => chunk.text).join(" "),
    text
  );
});

test("buildSpeechChunks keeps strong span isolation so startup splitting is not needed", () => {
  const text =
    "The setup uses https://example.com/docs, support@example.com, ./workspace/live/config.json, and Build.Run_Status before the Arabic label مرحبا appears in the same long sentence.";
  const chunks = buildSpeechChunks(text, {
    documentLang: "en-US",
    sentenceStart: 0,
  });

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.some((chunk) => chunk.reason === "url"), true);
  assert.equal(chunks.some((chunk) => chunk.reason === "email"), true);
  assert.equal(chunks.some((chunk) => chunk.reason === "path"), true);
  assert.equal(chunks.some((chunk) => chunk.reason === "code"), true);
});
