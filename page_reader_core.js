"use strict";

(function initEdgeVoiceReaderPageCore(globalScope) {
  const CHATGPT_HOSTS = Object.freeze(["chatgpt.com", "chat.openai.com"]);
  const BLOCK_TAGS = Object.freeze(["p", "li", "blockquote", "h1", "h2", "h3", "h4"]);
  const HEADING_TAGS = Object.freeze(["h1", "h2", "h3", "h4"]);
  const MIN_BODY_CHARS = 18;
  const MIN_HEADING_CHARS = 3;
  const MIN_LIST_ITEM_CHARS = 3;

  function normalizeReadableText(rawValue) {
    return String(rawValue || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function normalizeShortString(rawValue, maxLength = 160) {
    return typeof rawValue === "string" ? rawValue.trim().slice(0, maxLength) : "";
  }

  function normalizeInteger(rawValue, minimum = 0) {
    return Number.isFinite(Number(rawValue))
      ? Math.max(minimum, Math.trunc(Number(rawValue)))
      : minimum;
  }

  function normalizeLangHint(rawValue) {
    const raw = String(rawValue || "")
      .trim()
      .replace(/_/g, "-");
    if (!raw) {
      return "";
    }

    const parts = raw
      .split("-")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length || !/^[A-Za-z]{2,3}$/.test(parts[0])) {
      return "";
    }

    const normalizedParts = [parts[0].toLowerCase()];
    for (let index = 1; index < parts.length; index += 1) {
      const part = parts[index];
      if (!/^[A-Za-z0-9]{2,8}$/.test(part)) {
        return "";
      }
      if (part.length === 2 && /^[A-Za-z]{2}$/.test(part)) {
        normalizedParts.push(part.toUpperCase());
        continue;
      }
      if (part.length === 4 && /^[A-Za-z]{4}$/.test(part)) {
        normalizedParts.push(part[0].toUpperCase() + part.slice(1).toLowerCase());
        continue;
      }
      normalizedParts.push(part.toLowerCase());
    }

    return normalizedParts.join("-").slice(0, 24);
  }

  function buildSpokenBlockText(text, spokenPrefix = "") {
    const normalizedText = normalizeReadableText(text);
    const normalizedPrefix = normalizeReadableText(spokenPrefix);
    if (!normalizedPrefix) {
      return normalizedText;
    }
    if (!normalizedText) {
      return normalizedPrefix;
    }
    return normalizeReadableText(`${normalizedPrefix} ${normalizedText}`);
  }

  function buildSpokenPreview(text, spokenPrefix = "", maxChars = 120) {
    return buildPreview(buildSpokenBlockText(text, spokenPrefix), maxChars);
  }

  function sanitizeLangRanges(rawRanges) {
    const normalized = Array.isArray(rawRanges)
      ? rawRanges
          .map((range) => {
            const start = normalizeInteger(range?.start, 0);
            const end = Math.max(start, normalizeInteger(range?.end, 0));
            const langHint = normalizeLangHint(range?.langHint);
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
    for (const range of normalized) {
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

  function isLikelyChatGptHost(hostname) {
    const host = String(hostname || "").trim().toLowerCase();
    return CHATGPT_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  }

  function buildPreview(text, maxChars = 120) {
    const normalized = normalizeReadableText(text);
    if (normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars).trimEnd()}...`;
  }

  function segmentTextIntoSentences(rawText) {
    const text = normalizeReadableText(rawText);
    if (!text) {
      return [];
    }

    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      try {
        const segmenter = new Intl.Segmenter(undefined, {
          granularity: "sentence",
        });
        const sentences = [];
        let sentenceIndex = 0;
        for (const segment of segmenter.segment(text)) {
          const rawSegment = String(segment.segment || "");
          const trimmedStartOffset = rawSegment.search(/\S/);
          const trimmedEndOffset =
            rawSegment.length - rawSegment.trimEnd().length;
          if (trimmedStartOffset === -1) {
            continue;
          }

          const start = Number(segment.index || 0) + trimmedStartOffset;
          const end = Math.max(start, Number(segment.index || 0) + rawSegment.length - trimmedEndOffset);
          const sentenceText = text.slice(start, end);
          if (!sentenceText) {
            continue;
          }

          sentences.push({
            index: sentenceIndex,
            start,
            end,
            text: sentenceText,
          });
          sentenceIndex += 1;
        }
        if (sentences.length) {
          return sentences;
        }
      } catch (_error) {
        // Fall back to the regex splitter below.
      }
    }

    const sentences = [];
    const boundaryPattern = /[.!?]+(?:["'”’)\]]+)?(?=\s+|$)/g;
    let cursor = 0;
    let sentenceIndex = 0;

    while (cursor < text.length) {
      boundaryPattern.lastIndex = cursor;
      const boundary = boundaryPattern.exec(text);
      let end = boundary ? boundary.index + boundary[0].length : text.length;
      if (!boundary) {
        const nextBreak = text.indexOf("\n", cursor);
        if (nextBreak !== -1) {
          end = nextBreak;
        }
      }

      const rawSegment = text.slice(cursor, end);
      const trimmedStartOffset = rawSegment.search(/\S/);
      if (trimmedStartOffset === -1) {
        cursor = Math.max(end + 1, cursor + 1);
        continue;
      }
      const trimmedEndOffset = rawSegment.length - rawSegment.trimEnd().length;
      const start = cursor + trimmedStartOffset;
      const resolvedEnd = Math.max(start, end - trimmedEndOffset);
      const sentenceText = text.slice(start, resolvedEnd);
      if (sentenceText) {
        sentences.push({
          index: sentenceIndex,
          start,
          end: resolvedEnd,
          text: sentenceText,
        });
        sentenceIndex += 1;
      }
      cursor = Math.max(end, cursor + 1);
      while (cursor < text.length && /\s/.test(text[cursor])) {
        cursor += 1;
      }
    }

    if (sentences.length) {
      return sentences;
    }

    return [
      {
        index: 0,
        start: 0,
        end: text.length,
        text,
      },
    ];
  }

  function normalizeSentenceStartIndex(requestedIndex, sentenceCount) {
    const count = Math.max(0, Math.trunc(Number(sentenceCount || 0)));
    if (!count) {
      return -1;
    }

    const nextIndex = Math.trunc(Number(requestedIndex || 0));
    return Math.max(0, Math.min(count - 1, nextIndex));
  }

  function resolveSentenceIndexForCharIndex(sentences, charIndex) {
    const normalizedSentences = Array.isArray(sentences) ? sentences : [];
    if (!normalizedSentences.length) {
      return -1;
    }

    const safeIndex = Math.max(0, Math.trunc(Number(charIndex || 0)));
    for (const sentence of normalizedSentences) {
      const start = Math.max(0, Number(sentence?.start || 0));
      const end = Math.max(start, Number(sentence?.end || start));
      if (safeIndex < end) {
        return Number(sentence?.index || 0);
      }
    }

    const lastSentence = normalizedSentences[normalizedSentences.length - 1];
    return Number(lastSentence?.index || normalizedSentences.length - 1);
  }

  function resolveProjectionCharIndex(segments, node, offset) {
    const normalizedSegments = Array.isArray(segments) ? segments : [];
    if (!normalizedSegments.length || !node) {
      return -1;
    }

    const safeOffset = Math.max(0, Math.trunc(Number(offset || 0)));
    let trailingIndex = -1;

    for (const segment of normalizedSegments) {
      if (!segment || segment.node !== node) {
        continue;
      }

      const rawStart = Math.max(0, Number(segment.rawStartOffset || 0));
      const rawEnd = Math.max(rawStart, Number(segment.rawEndOffset || rawStart));
      const normStart = Math.max(0, Number(segment.normStart || 0));
      const normEnd = Math.max(normStart, Number(segment.normEnd || normStart));

      if (safeOffset <= rawStart) {
        return normStart;
      }
      if (safeOffset < rawEnd) {
        return Math.min(normEnd, normStart + (safeOffset - rawStart));
      }

      trailingIndex = normEnd;
    }

    return trailingIndex;
  }

  function shouldAutoOpenRailForStart(startSource, isRailVisible = false) {
    if (Boolean(isRailVisible)) {
      return true;
    }

    return String(startSource || "").trim().toLowerCase() === "explicit";
  }

  function buildBlockKind(tagName) {
    const tag = String(tagName || "").trim().toLowerCase();
    if (HEADING_TAGS.includes(tag)) {
      return "heading";
    }
    if (tag === "blockquote") {
      return "quote";
    }
    if (tag === "li") {
      return "list-item";
    }
    return "paragraph";
  }

  function normalizeListKind(rawValue, tagName = "") {
    const normalized = String(rawValue || "").trim().toLowerCase();
    if (normalized === "ordered" || normalized === "unordered") {
      return normalized;
    }

    const tag = String(tagName || "").trim().toLowerCase();
    if (tag === "li") {
      return "unordered";
    }

    return "none";
  }

  function normalizeBlockListMeta(candidate) {
    const nextCandidate = candidate && typeof candidate === "object" ? candidate : {};
    const kind = buildBlockKind(nextCandidate.tagName);
    const isListItem = kind === "list-item";

    return {
      listRootId: isListItem ? String(nextCandidate.listRootId || "").trim() : "",
      listKind: isListItem
        ? normalizeListKind(nextCandidate.listKind, nextCandidate.tagName)
        : "none",
      listDepth: isListItem ? normalizeInteger(nextCandidate.listDepth, 0) : 0,
      listItemIndex: isListItem ? normalizeInteger(nextCandidate.listItemIndex, 0) : -1,
      listItemCount: isListItem ? normalizeInteger(nextCandidate.listItemCount, 0) : 0,
      listMarkerText: isListItem
        ? normalizeShortString(nextCandidate.listMarkerText, 40)
        : "",
      spokenPrefix: isListItem
        ? normalizeShortString(nextCandidate.spokenPrefix, 80)
        : "",
    };
  }

  function resolveCandidateMinChars(candidate) {
    const kind = buildBlockKind(candidate?.tagName);
    if (kind === "heading") {
      return MIN_HEADING_CHARS;
    }
    if (kind === "list-item") {
      return MIN_LIST_ITEM_CHARS;
    }
    return MIN_BODY_CHARS;
  }

  function shouldKeepCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    const tagName = String(candidate.tagName || "").trim().toLowerCase();
    if (!BLOCK_TAGS.includes(tagName)) {
      return false;
    }
    if (!candidate.id || candidate.isVisible === false || candidate.insideDisallowed) {
      return false;
    }

    const text = normalizeReadableText(candidate.text);
    if (!text) {
      return false;
    }

    const minChars = resolveCandidateMinChars(candidate);
    return text.length >= minChars;
  }

  function finalizeCandidates(candidates) {
    const seenIds = new Set();
    const preparedCandidates = (Array.isArray(candidates) ? candidates : [])
      .filter(shouldKeepCandidate)
      .filter((candidate) => {
        if (seenIds.has(candidate.id)) {
          return false;
        }
        seenIds.add(candidate.id);
        return true;
      })
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .map((candidate) => {
        const text = normalizeReadableText(candidate.text);
        const spokenText = normalizeReadableText(candidate.spokenText || text);
        const listMeta = normalizeBlockListMeta(candidate);
        return {
          id: candidate.id,
          text,
          spokenText,
          tagName: String(candidate.tagName || "").toLowerCase(),
          order: Number(candidate.order || 0),
          kind: buildBlockKind(candidate.tagName),
          preview: buildSpokenPreview(text, listMeta.spokenPrefix),
          parentReadableId: String(candidate.parentReadableId || "").trim(),
          listRootId: listMeta.listRootId,
          listKind: listMeta.listKind,
          listDepth: listMeta.listDepth,
          listItemIndex: listMeta.listItemIndex,
          listItemCount: listMeta.listItemCount,
          listMarkerText: listMeta.listMarkerText,
          spokenPrefix: listMeta.spokenPrefix,
          langHint: normalizeLangHint(candidate.langHint),
          documentLang: normalizeLangHint(candidate.documentLang),
          langRanges: sanitizeLangRanges(candidate.langRanges),
        };
      });

    const preparedCandidatesById = new Map(
      preparedCandidates.map((candidate) => [candidate.id, candidate])
    );

    return preparedCandidates
      .filter((candidate) => {
        const parentId = candidate.parentReadableId;
        if (!parentId) {
          return true;
        }

        const parentCandidate = preparedCandidatesById.get(parentId);
        if (!parentCandidate) {
          return true;
        }

        return parentCandidate.text !== candidate.text;
      })
      .map((candidate) => ({
        id: candidate.id,
        text: candidate.text,
        spokenText: candidate.spokenText,
        tagName: candidate.tagName,
        order: candidate.order,
        kind: candidate.kind,
        preview: candidate.preview,
        listRootId: candidate.listRootId,
        listKind: candidate.listKind,
        listDepth: candidate.listDepth,
        listItemIndex: candidate.listItemIndex,
        listItemCount: candidate.listItemCount,
        listMarkerText: candidate.listMarkerText,
        spokenPrefix: candidate.spokenPrefix,
        langHint: candidate.langHint,
        documentLang: candidate.documentLang,
        langRanges: candidate.langRanges,
      }));
  }

  function selectChatGptBlocks(candidates) {
    const normalized = Array.isArray(candidates) ? candidates : [];
    const conversationCandidates = normalized.filter(
      (candidate) => candidate && candidate.insideMain && !candidate.insideComposer
    );
    const preferred = conversationCandidates.length ? conversationCandidates : normalized;
    return finalizeCandidates(preferred);
  }

  function selectArticleBlocks(candidates) {
    const normalized = Array.isArray(candidates) ? candidates : [];
    const scoped = normalized.filter(
      (candidate) => candidate && (candidate.insideArticle || candidate.insideMain)
    );
    const preferred = scoped.length ? scoped : normalized;
    return finalizeCandidates(preferred);
  }

  function buildReadingQueue(blocks, startBlockId) {
    const normalized = Array.isArray(blocks) ? blocks : [];
    if (!normalized.length) {
      return [];
    }

    const startIndex = Math.max(
      0,
      normalized.findIndex((block) => block.id === startBlockId)
    );
    const resolvedStartIndex = startIndex === -1 ? 0 : startIndex;
    return normalized.slice(resolvedStartIndex).map((block, index) => ({
      ...block,
      queueIndex: index,
      queueLength: normalized.length - resolvedStartIndex,
    }));
  }

  function resolveQueueStartBlockId(blocks, targetBlockId, options = {}) {
    const normalized = Array.isArray(blocks) ? blocks : [];
    if (!normalized.length) {
      return "";
    }

    const requestedId = String(targetBlockId || "").trim();
    const targetBlock =
      normalized.find((block) => block.id === requestedId) || normalized[0] || null;
    if (!targetBlock) {
      return "";
    }

    const mode = String(options.mode || "exact").trim().toLowerCase();
    if (mode !== "list-root") {
      return targetBlock.id;
    }

    const listRootId = String(targetBlock.listRootId || "").trim();
    if (!listRootId) {
      return targetBlock.id;
    }

    const firstListItem = normalized.find(
      (block) => String(block.listRootId || "").trim() === listRootId
    );
    return firstListItem ? firstListItem.id : targetBlock.id;
  }

  function resolveFirstAvailableBlockId(candidateIds, availableBlockIds) {
    const available =
      availableBlockIds instanceof Set
        ? availableBlockIds
        : new Set(Array.from(availableBlockIds || []));

    for (const candidateId of Array.isArray(candidateIds) ? candidateIds : []) {
      const resolvedId = String(candidateId || "").trim();
      if (resolvedId && available.has(resolvedId)) {
        return resolvedId;
      }
    }

    return "";
  }

  function reconcileReadingQueue(blocks, previousQueue, options = {}) {
    const normalizedBlocks = Array.isArray(blocks) ? blocks : [];
    const previous = Array.isArray(previousQueue) ? previousQueue : [];
    const requestedStartBlockId = String(options.queueStartBlockId || "").trim();
    const activeBlockId = String(options.activeBlockId || "").trim();
    const requestedCursorBlockId = String(options.queueCursorBlockId || "").trim();
    const hoveredBlockId = String(options.hoveredBlockId || "").trim();
    const priorCurrentIndex = Math.max(-1, Math.trunc(Number(options.currentIndex ?? -1)));

    const availableBlockIds = new Set();
    for (const block of normalizedBlocks) {
      const blockId = String(block && block.id ? block.id : "").trim();
      if (blockId) {
        availableBlockIds.add(blockId);
      }
    }

    const previousQueueIds = previous
      .map((block) => String(block && block.id ? block.id : "").trim())
      .filter(Boolean);

    let resolvedStartBlockId = "";
    if (requestedStartBlockId && availableBlockIds.has(requestedStartBlockId)) {
      resolvedStartBlockId = requestedStartBlockId;
    } else {
      resolvedStartBlockId =
        previousQueueIds.find((blockId) => availableBlockIds.has(blockId)) ||
        (activeBlockId && availableBlockIds.has(activeBlockId) ? activeBlockId : "") ||
        (requestedCursorBlockId && availableBlockIds.has(requestedCursorBlockId)
          ? requestedCursorBlockId
          : "") ||
        (hoveredBlockId && availableBlockIds.has(hoveredBlockId) ? hoveredBlockId : "") ||
        String(
          normalizedBlocks[0] && normalizedBlocks[0].id ? normalizedBlocks[0].id : ""
        ).trim();
    }

    const queue = resolvedStartBlockId
      ? buildReadingQueue(normalizedBlocks, resolvedStartBlockId)
      : [];
    if (!queue.length) {
      return {
        queue: [],
        currentIndex: -1,
        queueStartBlockId: "",
        queueCursorBlockId: "",
        isComplete: true,
      };
    }

    const queueIds = new Set(
      queue
        .map((block) => String(block && block.id ? block.id : "").trim())
        .filter(Boolean)
    );

    const desiredCursorBlockId = activeBlockId || requestedCursorBlockId;
    if (desiredCursorBlockId && queueIds.has(desiredCursorBlockId)) {
      return {
        queue,
        currentIndex: queue.findIndex((block) => block.id === desiredCursorBlockId),
        queueStartBlockId: resolvedStartBlockId,
        queueCursorBlockId: desiredCursorBlockId,
        isComplete: false,
      };
    }

    if (requestedCursorBlockId) {
      const previousCursorIndex = previousQueueIds.indexOf(requestedCursorBlockId);
      if (previousCursorIndex !== -1) {
        for (let index = previousCursorIndex + 1; index < previousQueueIds.length; index += 1) {
          const candidateId = previousQueueIds[index];
          if (!queueIds.has(candidateId)) {
            continue;
          }
          return {
            queue,
            currentIndex: queue.findIndex((block) => block.id === candidateId),
            queueStartBlockId: resolvedStartBlockId,
            queueCursorBlockId: candidateId,
            isComplete: false,
          };
        }

        return {
          queue,
          currentIndex: queue.length,
          queueStartBlockId: resolvedStartBlockId,
          queueCursorBlockId: "",
          isComplete: true,
        };
      }
    }

    if (priorCurrentIndex >= previousQueueIds.length && previousQueueIds.length) {
      return {
        queue,
        currentIndex: queue.length,
        queueStartBlockId: resolvedStartBlockId,
        queueCursorBlockId: "",
        isComplete: true,
      };
    }

    const fallbackBlockId =
      priorCurrentIndex >= 0 && priorCurrentIndex < previousQueueIds.length
        ? previousQueueIds[priorCurrentIndex]
        : "";
    if (fallbackBlockId && queueIds.has(fallbackBlockId)) {
      return {
        queue,
        currentIndex: queue.findIndex((block) => block.id === fallbackBlockId),
        queueStartBlockId: resolvedStartBlockId,
        queueCursorBlockId: fallbackBlockId,
        isComplete: false,
      };
    }

    const firstBlockId = String(queue[0] && queue[0].id ? queue[0].id : "").trim();
    return {
      queue,
      currentIndex: firstBlockId ? 0 : -1,
      queueStartBlockId: resolvedStartBlockId,
      queueCursorBlockId: firstBlockId,
      isComplete: false,
    };
  }

  function resolveSingleSentenceFallbackTarget(block, sentenceCount) {
    const safeBlock = block && typeof block === "object" ? block : null;
    const safeSentenceCount = Math.max(0, Math.trunc(Number(sentenceCount || 0)));
    const blockId = String(safeBlock?.id || "").trim();
    if (!blockId || safeSentenceCount !== 1) {
      return null;
    }

    return {
      blockId,
      sentenceIndex: 0,
    };
  }

  function resolveHoverChipActionTarget(pinnedBlockId, hoveredBlockId = "") {
    const pinned = String(pinnedBlockId || "").trim();
    if (pinned) {
      return pinned;
    }
    return String(hoveredBlockId || "").trim();
  }

  function shouldKeepHoverChipVisible(rawState) {
    const state = rawState && typeof rawState === "object" ? rawState : {};
    const hasTarget = Boolean(
      resolveHoverChipActionTarget(state.pinnedBlockId, state.hoveredBlockId)
    );
    if (!hasTarget) {
      return false;
    }
    return Boolean(
      String(state.hoveredBlockId || "").trim() || state.isChipHovered
    );
  }

  function resolveInlineChipState(rawState) {
    const state = rawState && typeof rawState === "object" ? rawState : {};
    const activeBlockId = String(state.activeBlockId || "").trim();
    const isActiveSession = Boolean(
      activeBlockId && (state.isPlaying || state.isPaused)
    );

    if (isActiveSession) {
      return {
        targetBlockId: activeBlockId,
        mode: state.isPaused ? "resume" : "pause",
        isPersistent: true,
        isVisible: true,
      };
    }

    return {
      targetBlockId: resolveHoverChipActionTarget(
        state.pinnedBlockId,
        state.hoveredBlockId
      ),
      mode: "play",
      isPersistent: false,
      isVisible: shouldKeepHoverChipVisible(state),
    };
  }

  function shouldHandleSentenceJumpClick(rawOptions) {
    const options = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
    return Boolean(
      options.isJumpModeActive &&
        Number(options.button) === 0 &&
        !options.hasModifier &&
        !options.insideUi &&
        !options.hasExpandedSelection &&
        options.hasTarget &&
        !options.isSameSentence
    );
  }

  function resolveHoverChipPlacement(blockRect, viewport, options = {}) {
    const rect = blockRect && typeof blockRect === "object" ? blockRect : {};
    const view = viewport && typeof viewport === "object" ? viewport : {};
    const chipSize = Math.max(20, Math.trunc(Number(options.chipSize || 30)));
    const gutterGap = Math.max(0, Number(options.gutterGap || 10));
    const edgePadding = Math.max(0, Number(options.edgePadding || 12));
    const insetOffset = Math.max(0, Number(options.insetOffset || 8));
    const topInset = Math.max(0, Number(options.topInset || 8));
    const lineHeight = Math.max(0, Number(options.lineHeight || 0));
    const viewWidth = Math.max(0, Number(view.width || 0));
    const viewHeight = Math.max(0, Number(view.height || 0));
    const left = Number(rect.left || 0);
    const top = Number(rect.top || 0);
    const maxX = Math.max(edgePadding, viewWidth - chipSize - edgePadding);
    const maxY = Math.max(edgePadding, viewHeight - chipSize - edgePadding);
    const firstLineInset = Math.max(
      0,
      Math.min(topInset, lineHeight > chipSize ? (lineHeight - chipSize) / 2 : 0)
    );
    const anchoredY = Math.max(
      edgePadding,
      Math.min(maxY, top + firstLineInset)
    );
    const gutterX = left - chipSize - gutterGap;

    if (gutterX >= edgePadding) {
      return {
        x: Math.min(gutterX, maxX),
        y: anchoredY,
        placement: "gutter",
      };
    }

    return {
      x: Math.max(edgePadding, Math.min(maxX, left + insetOffset)),
      y: anchoredY,
      placement: "inset",
    };
  }

  function advanceQueueIndex(currentIndex, queueLength) {
    const safeLength = Math.max(0, Math.trunc(Number(queueLength || 0)));
    if (!safeLength) {
      return {
        nextIndex: -1,
        isComplete: true,
      };
    }

    const safeIndex = Math.max(-1, Math.trunc(Number(currentIndex || 0)));
    const nextIndex = safeIndex + 1;
    return {
      nextIndex: Math.min(nextIndex, safeLength),
      isComplete: nextIndex >= safeLength,
    };
  }

  function clampBoundaryProgress(text, charIndex, length) {
    const normalized = normalizeReadableText(text);
    const start = Math.max(0, Math.min(normalized.length, Number(charIndex || 0)));
    const nextLength = Math.max(0, Math.trunc(Number(length || 0)));
    const end = Math.max(start, Math.min(normalized.length, start + nextLength));
    return {
      start,
      end,
      text: normalized,
    };
  }

  const api = {
    BLOCK_TAGS,
    CHATGPT_HOSTS,
    advanceQueueIndex,
    buildPreview,
    buildSpokenBlockText,
    buildSpokenPreview,
    buildReadingQueue,
    clampBoundaryProgress,
    isLikelyChatGptHost,
    normalizeLangHint,
    normalizeSentenceStartIndex,
    normalizeReadableText,
    reconcileReadingQueue,
    resolveProjectionCharIndex,
    resolveFirstAvailableBlockId,
    resolveQueueStartBlockId,
    resolveHoverChipActionTarget,
    resolveInlineChipState,
    resolveHoverChipPlacement,
    resolveSentenceIndexForCharIndex,
    resolveSingleSentenceFallbackTarget,
    sanitizeLangRanges,
    segmentTextIntoSentences,
    selectArticleBlocks,
    selectChatGptBlocks,
    shouldAutoOpenRailForStart,
    shouldHandleSentenceJumpClick,
    shouldKeepHoverChipVisible,
  };

  globalScope.EdgeVoiceReaderPageCore = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
