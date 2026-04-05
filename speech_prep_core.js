"use strict";

(function initEdgeVoiceReaderSpeechPrepCore(globalScope) {
  const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/g;
  const LATIN_PATTERN = /[A-Za-z\u00C0-\u024F]/g;
  const RTL_PATTERN = /[\u0590-\u08FF]/g;
  const MAX_CHUNK_PLAN = 8;
  const WRAPPER_OPENERS = Object.freeze({
    "(": ")",
    "[": "]",
    "\"": "\"",
    "'": "'",
    "“": "”",
    "‘": "’",
  });
  const LATIN_PHRASE_PATTERN = /[A-Za-z][A-Za-z0-9]*(?:[./:_-][A-Za-z0-9]+)*(?:\s+[A-Za-z][A-Za-z0-9]*(?:[./:_-][A-Za-z0-9]+)*)*/g;
  const STRONG_SPAN_PATTERNS = Object.freeze([
    {
      reason: "url",
      priority: 5,
      regex: /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi,
    },
    {
      reason: "email",
      priority: 5,
      regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    },
    {
      reason: "path",
      priority: 4,
      regex: /\b(?:[A-Za-z]:\\[^\s]+|(?:\.{0,2}\/|\/)[^\s)]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)\b/g,
    },
    {
      reason: "code",
      priority: 4,
      regex: /\b(?:v?\d+(?:\.\d+){1,}|[A-Za-z]+(?:[-_/.:][A-Za-z0-9]+)+|[A-Z]{2,}\d*[A-Z0-9_-]*)\b/g,
    },
    {
      reason: "quoted_latin",
      priority: 3,
      regex: /(?:\([^)]+\)|\[[^\]]+\]|"[^"]+"|'[^']+'|“[^”]+”|‘[^’]+’)/g,
      filter(matchText) {
        return countMatches(matchText, LATIN_PATTERN) > 0;
      },
    },
    {
      reason: "latin_phrase",
      priority: 2,
      regex: LATIN_PHRASE_PATTERN,
    },
  ]);

  function sanitizeInteger(rawValue, minimum = 0) {
    return Number.isFinite(Number(rawValue))
      ? Math.max(minimum, Math.trunc(Number(rawValue)))
      : minimum;
  }

  function sanitizeString(rawValue, maxLength = 260) {
    return typeof rawValue === "string" ? rawValue.trim().slice(0, maxLength) : "";
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

  function sanitizeLangHint(rawValue) {
    const value = sanitizeString(rawValue, 40).replace(/_/g, "-");
    if (!value) {
      return "";
    }

    const parts = value.split("-").filter(Boolean);
    if (!parts.length || !/^[A-Za-z]{2,8}$/.test(parts[0])) {
      return "";
    }

    return parts
      .map((part, index) => {
        if (index === 0) {
          return part.toLowerCase();
        }
        if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) {
          return part.toUpperCase();
        }
        if (/^[A-Za-z]{4}$/.test(part)) {
          return part[0].toUpperCase() + part.slice(1).toLowerCase();
        }
        return part;
      })
      .join("-");
  }

  function sanitizeLangRanges(rawRanges) {
    const ranges = Array.isArray(rawRanges)
      ? rawRanges
          .map((range) => {
            const start = sanitizeInteger(range?.start, 0);
            const end = Math.max(start, sanitizeInteger(range?.end, 0));
            const langHint = sanitizeLangHint(range?.langHint);
            if (!langHint || end <= start) {
              return null;
            }
            return {
              start,
              end,
              langHint,
            };
          })
          .filter(Boolean)
          .sort((left, right) => {
            if (left.start !== right.start) {
              return left.start - right.start;
            }
            return left.end - right.end;
          })
      : [];

    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.langHint === range.langHint &&
        previous.end >= range.start
      ) {
        previous.end = Math.max(previous.end, range.end);
        continue;
      }
      merged.push({ ...range });
    }
    return merged;
  }

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function applySpokenPrefix(text, spokenPrefix) {
    const normalizedText = normalizeWhitespace(text);
    const prefix = normalizeWhitespace(spokenPrefix);
    if (!prefix) {
      return normalizedText;
    }
    if (!normalizedText) {
      return prefix;
    }
    const normalizedLower = normalizedText.toLowerCase();
    const prefixLower = prefix.toLowerCase();
    if (
      normalizedLower === prefixLower ||
      normalizedLower.startsWith(`${prefixLower} `)
    ) {
      return normalizedText;
    }
    return `${prefix} ${normalizedText}`;
  }

  function expandWrappedSpan(text, start, end) {
    let nextStart = start;
    let nextEnd = end;
    const before = text[nextStart - 1] || "";
    const after = text[nextEnd] || "";
    if (WRAPPER_OPENERS[before] && WRAPPER_OPENERS[before] === after) {
      nextStart -= 1;
      nextEnd += 1;
    }
    return {
      start: nextStart,
      end: nextEnd,
    };
  }

  function collectStrongMixedSpans(text, overallProfile) {
    if (!overallProfile.containsArabic || !overallProfile.containsLatin) {
      return [];
    }

    const candidates = [];
    for (const pattern of STRONG_SPAN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(text))) {
        const rawText = String(match[0] || "");
        if (!rawText) {
          continue;
        }
        if (typeof pattern.filter === "function" && !pattern.filter(rawText)) {
          continue;
        }
        const expanded = expandWrappedSpan(text, match.index, match.index + rawText.length);
        const spanText = text.slice(expanded.start, expanded.end);
        const spanProfile = analyzeTextProfile(spanText);
        if (!spanProfile.containsLatin) {
          continue;
        }
        candidates.push({
          start: expanded.start,
          end: expanded.end,
          reason: pattern.reason,
          priority: pattern.priority,
          length: expanded.end - expanded.start,
        });
      }
    }

    candidates.sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      if (left.length !== right.length) {
        return right.length - left.length;
      }
      return left.start - right.start;
    });

    const selected = [];
    for (const candidate of candidates) {
      const overlaps = selected.some(
        (span) => candidate.start < span.end && candidate.end > span.start
      );
      if (!overlaps) {
        selected.push(candidate);
      }
    }

    return selected.sort((left, right) => left.start - right.start);
  }

  function trimChunkBounds(text, start, end) {
    let nextStart = start;
    let nextEnd = end;
    while (nextStart < nextEnd && /\s/.test(text[nextStart])) {
      nextStart += 1;
    }
    while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1])) {
      nextEnd -= 1;
    }
    return {
      start: nextStart,
      end: nextEnd,
    };
  }

  function isNeutralChunk(text) {
    const profile = analyzeTextProfile(text);
    return !profile.containsArabic && !profile.containsLatin;
  }

  function mergeChunks(left, right) {
    return {
      start: Math.min(left.start, right.start),
      end: Math.max(left.end, right.end),
      reason: left.reason === "context" ? right.reason : left.reason,
    };
  }

  function mergeWeakChunks(chunks, text) {
    const normalized = [];
    for (const chunk of chunks) {
      const trimmed = trimChunkBounds(text, chunk.start, chunk.end);
      if (trimmed.end <= trimmed.start) {
        continue;
      }
      normalized.push({
        ...chunk,
        start: trimmed.start,
        end: trimmed.end,
      });
    }

    if (normalized.length <= 1) {
      return normalized;
    }

    const merged = [];
    for (const chunk of normalized) {
      const chunkText = text.slice(chunk.start, chunk.end);
      const previous = merged[merged.length - 1];
      if (
        isNeutralChunk(chunkText) &&
        chunkText.length <= 4 &&
        previous
      ) {
        previous.end = chunk.end;
        continue;
      }

      if (previous) {
        const previousText = text.slice(previous.start, previous.end);
        const previousProfile = analyzeTextProfile(previousText);
        const chunkProfile = analyzeTextProfile(chunkText);
        const shouldMergeSameContext =
          previous.reason === "context" &&
          chunk.reason === "context" &&
          previousProfile.primaryScript === chunkProfile.primaryScript;
        if (shouldMergeSameContext) {
          previous.end = chunk.end;
          continue;
        }
      }

      merged.push({ ...chunk });
    }

    if (merged.length > 1) {
      const last = merged[merged.length - 1];
      const lastText = text.slice(last.start, last.end);
      if (isNeutralChunk(lastText) && lastText.length <= 4) {
        merged[merged.length - 2].end = last.end;
        merged.pop();
      }
    }

    return merged;
  }

  function buildChunksFromSpans(text, spans) {
    if (!spans.length) {
      return [
        {
          start: 0,
          end: text.length,
          reason: "context",
        },
      ];
    }

    const chunks = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) {
        chunks.push({
          start: cursor,
          end: span.start,
          reason: "context",
        });
      }
      chunks.push({
        start: span.start,
        end: span.end,
        reason: span.reason,
      });
      cursor = span.end;
    }
    if (cursor < text.length) {
      chunks.push({
        start: cursor,
        end: text.length,
        reason: "context",
      });
    }
    return mergeWeakChunks(chunks, text);
  }

  function resolveRangeLangHint(chunkStart, chunkEnd, sentenceStart, langRanges) {
    const absoluteStart = sanitizeInteger(sentenceStart, 0) + sanitizeInteger(chunkStart, 0);
    const absoluteEnd = Math.max(absoluteStart, sanitizeInteger(sentenceStart, 0) + sanitizeInteger(chunkEnd, 0));
    let bestRange = null;
    let bestOverlap = 0;
    for (const range of sanitizeLangRanges(langRanges)) {
      const overlap = Math.min(absoluteEnd, range.end) - Math.max(absoluteStart, range.start);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestRange = range;
      }
    }
    return bestRange ? bestRange.langHint : "";
  }

  function resolveChunkLangHint(chunkText, options = {}) {
    const rangeLangHint = resolveRangeLangHint(
      options.chunkStart,
      options.chunkEnd,
      options.sentenceStart,
      options.langRanges
    );
    if (rangeLangHint) {
      return rangeLangHint;
    }

    const chunkProfile = analyzeTextProfile(chunkText);
    if (chunkProfile.containsArabic && !chunkProfile.containsLatin) {
      return "ar";
    }
    if (chunkProfile.containsLatin && !chunkProfile.containsArabic) {
      return "en-US";
    }

    const directLangHint = sanitizeLangHint(options.langHint);
    if (directLangHint) {
      return directLangHint;
    }

    const documentLang = sanitizeLangHint(options.documentLang);
    if (documentLang) {
      return documentLang;
    }

    if (chunkProfile.isRtl || chunkProfile.containsArabic) {
      return "ar";
    }
    if (chunkProfile.containsLatin) {
      return "en-US";
    }

    return "";
  }

  function buildChunkPlan(rawChunks) {
    return Array.isArray(rawChunks)
      ? rawChunks.slice(0, MAX_CHUNK_PLAN).map((chunk, index) => ({
          index: Number.isFinite(Number(chunk?.index))
            ? Math.max(0, Math.trunc(Number(chunk.index)))
            : index,
          langHint: sanitizeLangHint(chunk?.langHint),
          textLength: Math.max(0, Math.trunc(Number(chunk?.textLength || String(chunk?.text || "").length || 0))),
          reason: sanitizeString(chunk?.reason || "context", 80),
        }))
      : [];
  }

  function prepareSpeechChunks(rawText, options = {}) {
    const mergedOptions = {
      ...options,
      langRanges: Array.isArray(options.langRanges) ? options.langRanges : options.langSegments,
    };
    const text = normalizeWhitespace(rawText);
    if (!text) {
      return {
        textProfile: analyzeTextProfile(""),
        chunks: [],
        chunkPlan: [],
      };
    }

    const textProfile = analyzeTextProfile(text);
    const spans = collectStrongMixedSpans(text, textProfile);
    const rawChunks = buildChunksFromSpans(text, spans);
    const spokenPrefix = sanitizeString(mergedOptions.spokenPrefix, 80);

    const chunks = rawChunks.map((chunk, index) => {
      const chunkText = text.slice(chunk.start, chunk.end);
      const profile = analyzeTextProfile(chunkText);
      const langHint = resolveChunkLangHint(chunkText, {
        chunkStart: chunk.start,
        chunkEnd: chunk.end,
        sentenceStart: mergedOptions.sentenceStart,
        langRanges: mergedOptions.langRanges,
        langHint: mergedOptions.langHint,
        documentLang: mergedOptions.documentLang,
      });
      const resolvedText =
        index === 0 && spokenPrefix
          ? applySpokenPrefix(chunkText, spokenPrefix)
          : chunkText;
      return {
        index,
        start: chunk.start,
        end: chunk.end,
        text: resolvedText,
        textLength: resolvedText.length,
        langHint,
        profile,
        reason: chunk.reason,
      };
    });

    return {
      textProfile,
      chunks,
      chunkPlan: buildChunkPlan(chunks),
    };
  }

  function buildSpeechChunks(rawText, options = {}) {
    return prepareSpeechChunks(rawText, options).chunks;
  }

  const api = {
    analyzeTextProfile,
    applySpokenPrefix,
    buildChunkPlan,
    buildSpeechChunks,
    normalizeLangHint: sanitizeLangHint,
    prepareSpeechChunks,
    sanitizeLangHint,
    sanitizeLangRanges,
  };

  globalScope.EdgeVoiceReaderSpeechPrepCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
