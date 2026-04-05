"use strict";

function pageReadSelection() {
  const maxDraftChars = 20000;

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function trimResult(result) {
    const text = normalizeWhitespace(result.text);
    if (!text) {
      return { ok: false, error: result.error || "No usable text found." };
    }
    if (text.length <= maxDraftChars) {
      return { ...result, ok: true, text };
    }
    return {
      ...result,
      ok: true,
      text: text.slice(0, maxDraftChars).trim(),
      truncated: true,
    };
  }

  try {
    const text = normalizeWhitespace(window.getSelection()?.toString() || "");
    if (!text) {
      return { ok: false, error: "No text is selected on this page." };
    }
    return trimResult({
      ok: true,
      text,
      sourceLabel: "selected text",
    });
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
    };
  }
}
