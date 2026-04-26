"use strict";

(function initEdgeVoiceReaderContent() {
  if (window.__edgeVoiceReaderPageInitialized) {
    return;
  }
  window.__edgeVoiceReaderPageInitialized = true;

  const { STATE_KEY, VOICE_OPTIONS, sanitizeState } = EdgeVoiceReaderCore;
  const {
    advanceQueueIndex,
    buildPreview,
    buildReadingQueue,
    buildSpokenBlockText,
    isLikelyChatGptHost,
    normalizeLangHint,
    normalizeSentenceStartIndex,
    reconcileReadingQueue,
    resolveFirstAvailableBlockId,
    resolveProjectionCharIndex,
    resolveQueueStartBlockId,
    resolveHoverChipActionTarget,
    resolveInlineChipState,
    resolveHoverChipPlacement,
    resolveSentenceIndexForCharIndex,
    resolveSingleSentenceFallbackTarget,
    segmentTextIntoSentences,
    selectArticleBlocks,
    selectChatGptBlocks,
    shouldAutoOpenRailForStart,
    shouldHandleSentenceJumpClick,
    shouldKeepHoverChipVisible,
  } = EdgeVoiceReaderPageCore;

  const BLOCK_ATTR = "data-edge-voice-reader-block-id";
  const LIST_ROOT_ATTR = "data-edge-voice-reader-list-root-id";
  const ACTIVE_ATTR = "data-edge-voice-reader-active";
  const READ_ATTR = "data-edge-voice-reader-read";
  const SENTENCE_HIGHLIGHT_NAME = "edge-voice-reader-sentence";
  const SENTENCE_HOVER_HIGHLIGHT_NAME = "edge-voice-reader-sentence-hover";
  const SENTENCE_TARGET_ATTR = "data-edge-voice-reader-sentence-target";
  const HOVER_CHIP_SIZE = 24;
  const HOVER_CHIP_GAP = 8;
  const HOVER_CHIP_EDGE_PADDING = 10;
  const HOVER_CHIP_INSET_OFFSET = 6;
  const HOVER_CHIP_TOP_INSET = 6;
  const HOVER_CHIP_HIDE_DELAY_MS = 120;
  const HOVER_CHIP_RETARGET_DELAY_MS = 130;
  const AUTO_ADVANCE_DELAY_MS = 150;
  const AUTO_ADVANCE_LIST_ITEM_DELAY_MS = 400;
  const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/g;
  const LATIN_SCRIPT_PATTERN = /[A-Za-z\u00C0-\u024F]/g;
  const INLINE_TEXT_EXCLUDE_SELECTOR =
    "button, input, textarea, select, option, svg, canvas, [aria-hidden='true'], [role='button'], [role='textbox'], [contenteditable='true'], [data-edge-voice-reader-ignore='true']";
  const SHADOW_HTML = `
    <style>
      :host {
        all: initial;
      }

      .shell {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 2147483646;
        font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
        color: #f5f7fb;
        pointer-events: none;
      }

      .rail {
        width: 320px;
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        border-radius: 28px;
        overflow: hidden;
        background:
          radial-gradient(circle at top right, rgba(255, 173, 71, 0.18), transparent 30%),
          linear-gradient(180deg, rgba(13, 21, 38, 0.97), rgba(9, 16, 30, 0.96));
        box-shadow:
          0 28px 64px rgba(4, 8, 18, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(18px);
        transform: translateX(118%);
        opacity: 0;
        transition:
          transform 220ms ease,
          opacity 220ms ease;
        pointer-events: auto;
      }

      .rail.open {
        transform: translateX(0);
        opacity: 1;
      }

      .rail.collapsed {
        width: 60px;
      }

      .rail.collapsed .rail-body,
      .rail.collapsed .status-card,
      .rail.collapsed .meta-card,
      .rail.collapsed .queue-card,
      .rail.collapsed .footer-hint {
        display: none;
      }

      .rail.collapsed .rail-header {
        justify-content: center;
      }

      .rail.collapsed .brand-copy {
        display: none;
      }

      .rail.collapsed .header-actions {
        width: 100%;
        justify-content: center;
      }

      .rail.collapsed .icon-button[data-action="collapse"] {
        background: rgba(255, 173, 71, 0.22);
      }

      .reopen-handle {
        position: fixed;
        top: 50%;
        right: 0;
        transform: translate(108%, -50%);
        pointer-events: auto;
        border: 0;
        border-radius: 18px 0 0 18px;
        padding: 14px 12px;
        background: linear-gradient(180deg, #0f6cbd, #11549f);
        color: #ffffff;
        box-shadow: 0 16px 28px rgba(15, 108, 189, 0.28);
        cursor: pointer;
        opacity: 0;
        transition:
          transform 180ms ease,
          opacity 180ms ease;
        font: inherit;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        writing-mode: vertical-rl;
      }

      .reopen-handle.visible {
        transform: translate(0, -50%);
        opacity: 1;
      }

      .hover-button {
        position: fixed;
        z-index: 2147483647;
        width: ${HOVER_CHIP_SIZE}px;
        height: ${HOVER_CHIP_SIZE}px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid rgba(17, 84, 159, 0.18);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 248, 255, 0.96));
        color: #11549f;
        box-shadow:
          0 7px 14px rgba(15, 26, 48, 0.13),
          inset 0 1px 0 rgba(255, 255, 255, 0.78);
        cursor: pointer;
        pointer-events: auto;
        opacity: 0;
        transform: scale(0.96);
        transition:
          transform 150ms ease,
          opacity 150ms ease;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }

      .hover-button[data-mode="pause"] {
        border-color: rgba(255, 173, 71, 0.34);
        background: linear-gradient(180deg, rgba(255, 191, 92, 0.98), rgba(255, 152, 66, 0.98));
        color: #101827;
        box-shadow:
          0 10px 18px rgba(255, 145, 54, 0.18),
          0 2px 7px rgba(15, 26, 48, 0.12);
      }

      .hover-button[data-persistent="true"] {
        opacity: 1;
        transform: scale(1);
      }

      .hover-button.visible {
        opacity: 1;
        transform: scale(1);
      }

      .button-icon {
        width: 16px;
        height: 16px;
        display: block;
        fill: currentColor;
        flex: 0 0 auto;
      }

      .hover-button .button-icon {
        width: 11px;
        height: 11px;
      }

      .rail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 18px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .brand-mark {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, rgba(255, 173, 71, 0.26), rgba(15, 108, 189, 0.18));
        color: #ffd98e;
        font-size: 16px;
      }

      .brand-copy {
        display: grid;
        gap: 2px;
      }

      .eyebrow {
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(245, 247, 251, 0.62);
      }

      .title {
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
      }

      .header-actions {
        display: flex;
        gap: 8px;
      }

      .icon-button,
      .transport-button {
        border: 0;
        cursor: pointer;
        font: inherit;
      }

      .icon-button {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.08);
        color: #f5f7fb;
      }

      .icon-button.report-button {
        width: auto;
        min-width: 66px;
        padding: 0 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .rail-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-gutter: stable both-edges;
        padding: 16px 18px 18px;
        display: grid;
        gap: 14px;
      }

      .status-card,
      .meta-card,
      .queue-card {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 9px;
        border-radius: 999px;
        background: rgba(255, 173, 71, 0.14);
        color: #ffd98e;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .status-title {
        margin-top: 10px;
        font-size: 18px;
        line-height: 1.25;
        font-weight: 700;
        color: #ffffff;
      }

      .status-copy {
        margin-top: 6px;
        font-size: 12px;
        line-height: 1.55;
        color: rgba(245, 247, 251, 0.72);
      }

      .transport {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
      }

      .transport-button {
        min-height: 42px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        font-weight: 700;
        display: grid;
        place-items: center;
      }

      .transport-button.primary {
        background: linear-gradient(180deg, #ffb457, #ff9342);
        color: #101827;
      }

      .transport-button:disabled {
        opacity: 0.46;
        cursor: not-allowed;
      }

      .meta-grid {
        display: grid;
        gap: 12px;
      }

      .meta-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(245, 247, 251, 0.58);
      }

      .meta-preview {
        margin-top: 6px;
        font-size: 13px;
        line-height: 1.55;
        color: rgba(245, 247, 251, 0.86);
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field select,
      .field input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.05);
        color: #ffffff;
        font: inherit;
      }

      .field select {
        padding: 10px 12px;
      }

      .field input[type="range"] {
        accent-color: #ffb457;
      }

      .queue-list {
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }

      .queue-item {
        padding: 9px 10px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.04);
        font-size: 12px;
        line-height: 1.45;
        color: rgba(245, 247, 251, 0.72);
      }

      .queue-item.active {
        background: rgba(255, 180, 87, 0.14);
        color: #ffffff;
      }

      .footer-hint {
        font-size: 11px;
        line-height: 1.5;
        color: rgba(245, 247, 251, 0.56);
      }
    </style>
    <div class="shell">
      <button id="reopenHandle" class="reopen-handle" type="button">Reader</button>
      <button id="hoverPlayButton" class="hover-button" type="button" aria-label="Read from here"></button>
      <aside id="rail" class="rail" aria-label="Edge Voice Reader rail">
        <div class="rail-header">
          <div class="brand">
            <div class="brand-mark">▶</div>
            <div class="brand-copy">
              <div class="eyebrow">Edge Voice Reader</div>
              <div class="title">Page Reader</div>
            </div>
          </div>
          <div class="header-actions">
            <button class="icon-button report-button" type="button" data-action="copy-debug" title="Copy debug report">Copy Debug</button>
            <button class="icon-button" type="button" data-action="collapse" title="Collapse rail">◂</button>
            <button class="icon-button" type="button" data-action="close" title="Hide rail">✕</button>
          </div>
        </div>
        <div class="rail-body">
          <section class="status-card">
            <div id="statusPill" class="status-pill">Ready</div>
            <div id="statusTitle" class="status-title">Hover a paragraph to read from there.</div>
            <div id="statusCopy" class="status-copy">Start reading inline from the page, or open Reader when you want the side rail.</div>
          </section>
          <div class="transport">
            <button id="prevButton" class="transport-button" type="button" aria-label="Previous paragraph" title="Previous paragraph"></button>
            <button id="playPauseButton" class="transport-button primary" type="button" aria-label="Play queue" title="Play queue"></button>
            <button id="nextButton" class="transport-button" type="button" aria-label="Next paragraph" title="Next paragraph"></button>
            <button id="stopButton" class="transport-button" type="button" aria-label="Stop reading" title="Stop reading"></button>
          </div>
          <section class="meta-card meta-grid">
            <div class="field">
              <label class="meta-label" for="voiceSelect">Voice</label>
              <select id="voiceSelect"></select>
            </div>
            <div class="field">
              <label class="meta-label" for="speedInput">Speed <span id="speedValue">1.00x</span></label>
              <input id="speedInput" type="range" min="0.7" max="2" step="0.05" />
            </div>
            <div>
              <div class="meta-label">Now Reading</div>
              <div id="currentPreview" class="meta-preview">No page block selected yet.</div>
            </div>
          </section>
          <section class="queue-card">
            <div class="meta-label">Queue</div>
            <ul id="queueList" class="queue-list"></ul>
          </section>
          <div class="footer-hint">Ava and Andrew stay as the only surfaced voices. Playback remains browser-native in Edge.</div>
        </div>
      </aside>
    </div>
  `;
  const ICONS = Object.freeze({
    play:
      '<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 2.9c0-.72.78-1.17 1.4-.8l6.45 3.85a.93.93 0 0 1 0 1.6L6 11.4c-.62.37-1.4-.08-1.4-.8V2.9Z"></path></svg>',
    pause:
      '<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 2.75A.75.75 0 0 1 5.5 2h1a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1-.75-.75v-10Zm4 0A.75.75 0 0 1 9.5 2h1a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1-.75-.75v-10Z"></path></svg>',
    prev:
      '<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3.25c.41 0 .75.34.75.75v8a.75.75 0 0 1-1.5 0V4c0-.41.34-.75.75-.75Zm8.4.56c.57.4.53 1.26-.08 1.6L8.9 7.44a.65.65 0 0 0 0 1.12l3.42 2.03c.6.35.65 1.2.08 1.6a.98.98 0 0 1-1.05.04L6.1 9.1a1.25 1.25 0 0 1 0-2.2l5.25-3.1a.98.98 0 0 1 1.05.01Z"></path></svg>',
    next:
      '<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3.25c.41 0 .75.34.75.75v8a.75.75 0 0 1-1.5 0V4c0-.41.34-.75.75-.75ZM3.6 3.81a.98.98 0 0 1 1.05-.01l5.25 3.1a1.25 1.25 0 0 1 0 2.2l-5.25 3.1a.98.98 0 0 1-1.05-.04c-.57-.4-.53-1.26.08-1.6L7.1 8.56a.65.65 0 0 0 0-1.12L3.68 5.4c-.6-.35-.65-1.2-.08-1.6Z"></path></svg>',
    stop:
      '<svg class="button-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.25 3.25h5.5c1.1 0 2 .9 2 2v5.5c0 1.1-.9 2-2 2h-5.5c-1.1 0-2-.9-2-2v-5.5c0-1.1.9-2 2-2Z"></path></svg>',
  });

  const state = {
    blocks: [],
    blocksById: new Map(),
    blockProjections: new Map(),
    currentQueue: [],
    currentIndex: -1,
    queueStartBlockId: "",
    queueCursorBlockId: "",
    activeBlockId: "",
    activeSentenceIndex: -1,
    activeSentenceCount: 0,
    hoveredSentenceBlockId: "",
    hoveredSentenceIndex: -1,
    hoveredBlockId: "",
    hoverChipBlockId: "",
    pendingHoverBlockId: "",
    isHoverChipHovered: false,
    railVisible: false,
    railCollapsed: false,
    isPlaying: false,
    isPaused: false,
    statusPill: "Ready",
    statusTitle: "Hover a paragraph to read from there.",
    statusCopy: "Start reading inline from the page, or open Reader when you want the side rail.",
    currentPreview: "No page block selected yet.",
    locationHref: location.href,
    scanTimer: 0,
    hoverFrame: 0,
    prefs: sanitizeState(),
    ui: null,
    nextBlockIdSeed: 1,
    nextListRootIdSeed: 1,
    mutationObserver: null,
    hideHoverTimer: 0,
    retargetHoverTimer: 0,
    pendingAdvanceTimer: 0,
  };

  function extractErrorMessage(rawError) {
    if (!rawError) {
      return "Unexpected page reader error.";
    }

    if (typeof rawError === "string") {
      return rawError;
    }

    if (typeof rawError.message === "string" && rawError.message.trim()) {
      return rawError.message.trim();
    }

    return String(rawError);
  }

  function buildStackHead(rawStack) {
    return typeof rawStack === "string"
      ? rawStack
          .split(/\r?\n/)
          .slice(0, 3)
          .join(" | ")
          .slice(0, 400)
      : "";
  }

  function reportContentExtensionError(rawError, extra = {}) {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }

    Promise.resolve(
      chrome.runtime.sendMessage({
        type: "record_extension_error",
        error: {
          surface: "page_reader",
          message: extractErrorMessage(rawError),
          stackHead: buildStackHead(extra.stack || rawError?.stack || ""),
          file: typeof extra.file === "string" ? extra.file : "",
          line: Number(extra.line || 0),
          column: Number(extra.column || 0),
          host: location.host || "",
          blockId: state.activeBlockId || state.hoveredBlockId || "",
          attemptId: "",
          at: Date.now(),
        },
      })
    ).catch(() => {});
  }

  async function reportPageSessionStart() {
    if (
      !chrome.runtime ||
      !chrome.runtime.id ||
      window.top !== window
    ) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: "page_session_started",
        url: location.href || "",
      });
    } catch (_error) {
      // Ignore startup messaging failures during navigation churn.
    }
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "true");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(helper);
    if (!copied) {
      throw new Error("Clipboard copy is unavailable on this page.");
    }
  }

  function setButtonIcon(button, iconName, label) {
    if (!button) {
      return;
    }

    button.innerHTML = ICONS[iconName] || "";
    if (label) {
      button.setAttribute("aria-label", label);
      button.title = label;
    }
  }

  function getInlineChipState() {
    return resolveInlineChipState({
      activeBlockId: state.activeBlockId,
      hoveredBlockId: state.hoveredBlockId,
      pinnedBlockId: state.hoverChipBlockId,
      isChipHovered: state.isHoverChipHovered,
      isPlaying: state.isPlaying,
      isPaused: state.isPaused,
    });
  }

  function syncHoverButtonVisual(chipState = getInlineChipState()) {
    if (!state.ui) {
      return;
    }

    const iconName = chipState.mode === "pause" ? "pause" : "play";
    const label =
      chipState.mode === "pause"
        ? "Pause reading here"
        : chipState.mode === "resume"
          ? "Resume reading here"
          : "Read from here";

    setButtonIcon(state.ui.hoverPlayButton, iconName, label);
    state.ui.hoverPlayButton.dataset.mode = chipState.mode;
    state.ui.hoverPlayButton.dataset.persistent = chipState.isPersistent
      ? "true"
      : "false";
  }

  function syncTransportButtonVisuals() {
    if (!state.ui) {
      return;
    }

    setButtonIcon(state.ui.prevButton, "prev", "Previous paragraph");
    setButtonIcon(
      state.ui.playPauseButton,
      state.isPlaying ? "pause" : "play",
      state.isPaused
        ? "Resume reading"
        : state.isPlaying
          ? "Pause reading"
          : "Play queue"
    );
    setButtonIcon(state.ui.nextButton, "next", "Next paragraph");
    setButtonIcon(state.ui.stopButton, "stop", "Stop reading");
  }

  function hasExpandedTextSelection(target = null) {
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.isCollapsed) {
      return false;
    }

    if (!String(selection).trim()) {
      return false;
    }

    if (!target || !selection.rangeCount) {
      return true;
    }

    const targetNode =
      target.nodeType === Node.TEXT_NODE
        ? target.parentNode
        : target.closest
          ? target.closest(`[${BLOCK_ATTR}]`)
          : null;
    if (!targetNode) {
      return true;
    }

    try {
      return selection.getRangeAt(0).intersectsNode(targetNode);
    } catch (_error) {
      return true;
    }
  }

  function ensureElementBlockId(element) {
    const existing = element.getAttribute(BLOCK_ATTR);
    if (existing) {
      return existing;
    }
    const nextId = `evr-${state.nextBlockIdSeed}`;
    state.nextBlockIdSeed += 1;
    element.setAttribute(BLOCK_ATTR, nextId);
    return nextId;
  }

  function ensureListRootId(element) {
    const existing = element.getAttribute(LIST_ROOT_ATTR);
    if (existing) {
      return existing;
    }
    const nextId = `evr-list-${state.nextListRootIdSeed}`;
    state.nextListRootIdSeed += 1;
    element.setAttribute(LIST_ROOT_ATTR, nextId);
    return nextId;
  }

  function countPatternMatches(text, pattern) {
    const matches = String(text || "").match(pattern);
    return matches ? matches.length : 0;
  }

  function analyzeReadableTextProfile(text) {
    const arabicCount = countPatternMatches(text, ARABIC_SCRIPT_PATTERN);
    const latinCount = countPatternMatches(text, LATIN_SCRIPT_PATTERN);
    return {
      containsArabic: arabicCount > 0,
      containsLatin: latinCount > 0,
      primaryScript:
        arabicCount && latinCount
          ? arabicCount >= latinCount
            ? "arabic"
            : "latin"
          : arabicCount
            ? "arabic"
            : latinCount
              ? "latin"
              : "unknown",
      };
  }

  function inferLangHintFromText(text, fallback = "") {
    const profile = analyzeReadableTextProfile(text);
    if (profile.containsArabic && !profile.containsLatin) {
      return "ar";
    }
    if (profile.containsLatin && !profile.containsArabic) {
      return "en-US";
    }
    if (profile.primaryScript === "arabic" || profile.containsArabic) {
      return "ar";
    }
    if (profile.primaryScript === "latin" || profile.containsLatin) {
      return "en-US";
    }
    return normalizeLangHint(fallback);
  }

  function resolveDocumentLang() {
    return normalizeLangHint(
      document.documentElement?.getAttribute("lang") ||
        document.documentElement?.lang ||
        ""
    );
  }

  function resolveNearestExplicitLangHint(element) {
    let current = element;
    while (current) {
      if (current === document.documentElement) {
        break;
      }
      const langHint = normalizeLangHint(current.getAttribute?.("lang") || "");
      if (langHint) {
        return langHint;
      }
      current = current.parentElement;
    }
    return "";
  }

  function resolveBlockLangHint(element, text, documentLang = "") {
    const explicitLangHint = resolveNearestExplicitLangHint(element);
    if (explicitLangHint) {
      return explicitLangHint;
    }
    return inferLangHintFromText(text, documentLang);
  }

  function shouldAcceptProjectionTextNode(node) {
    if (!node || !node.nodeValue) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent) {
      return false;
    }

    if (
      parent.closest(INLINE_TEXT_EXCLUDE_SELECTOR) ||
      parent.closest("#edge-voice-reader-shadow-host")
    ) {
      return false;
    }

    const style = window.getComputedStyle(parent);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return true;
  }

  function pushProjectionSegment(segments, nextSegment) {
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.node === nextSegment.node &&
      previous.langHint === nextSegment.langHint &&
      previous.rawEndOffset === nextSegment.rawStartOffset &&
      previous.normEnd === nextSegment.normStart
    ) {
      previous.rawEndOffset = nextSegment.rawEndOffset;
      previous.normEnd = nextSegment.normEnd;
      return;
    }
    segments.push(nextSegment);
  }

  function buildProjectionLanguageSegments(segments, textLength) {
    const safeLength = Math.max(0, Math.trunc(Number(textLength || 0)));
    const languageSegments = [];
    for (const segment of Array.isArray(segments) ? segments : []) {
      const langHint = normalizeLangHint(segment?.langHint);
      if (!langHint) {
        continue;
      }

      const start = Math.max(0, Math.min(safeLength, Number(segment.normStart || 0)));
      const end = Math.max(start, Math.min(safeLength, Number(segment.normEnd || 0)));
      if (end <= start) {
        continue;
      }

      const previous = languageSegments[languageSegments.length - 1];
      if (
        previous &&
        previous.langHint === langHint &&
        previous.end >= start
      ) {
        previous.end = Math.max(previous.end, end);
        continue;
      }

      languageSegments.push({
        start,
        end,
        langHint,
      });
    }

    return languageSegments;
  }

  function parseIntegerAttribute(element, attributeName) {
    const rawValue = element?.getAttribute?.(attributeName);
    if (rawValue == null || rawValue === "") {
      return null;
    }

    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function resolveListDepth(listElement) {
    let depth = 0;
    let current = listElement;
    while (current) {
      if (current.tagName === "OL" || current.tagName === "UL") {
        depth += 1;
      }
      current = current.parentElement?.closest?.("ol, ul") || null;
    }
    return depth;
  }

  function resolveOrderedListMarkerText(listElement, targetItem) {
    if (!listElement || !targetItem) {
      return "";
    }

    const items = Array.from(listElement.children).filter(
      (child) => child.tagName === "LI"
    );
    if (!items.length) {
      return "";
    }

    const reversed = listElement.hasAttribute("reversed");
    const explicitStart = parseIntegerAttribute(listElement, "start");
    let currentValue = reversed
      ? explicitStart ?? items.length
      : explicitStart ?? 1;

    for (const item of items) {
      const explicitValue = parseIntegerAttribute(item, "value");
      if (explicitValue != null) {
        currentValue = explicitValue;
      }

      if (item === targetItem) {
        return String(currentValue);
      }

      currentValue += reversed ? -1 : 1;
    }

    return "";
  }

  function buildListMetadata(element, text, langHint = "") {
    const defaults = {
      listRootId: "",
      listKind: "none",
      listDepth: 0,
      listItemIndex: -1,
      listItemCount: 0,
      listMarkerText: "",
      spokenPrefix: "",
    };

    const listItem = element?.tagName === "LI" ? element : null;
    if (!listItem) {
      return defaults;
    }

    const listElement = listItem.parentElement;
    if (!listElement || (listElement.tagName !== "OL" && listElement.tagName !== "UL")) {
      return defaults;
    }

    const profile = analyzeReadableTextProfile(text);
    const prefersArabic =
      String(langHint || "").toLowerCase().startsWith("ar") ||
      profile.primaryScript === "arabic" ||
      profile.containsArabic;
    const listKind = listElement.tagName === "OL" ? "ordered" : "unordered";
    const directItems = Array.from(listElement.children).filter(
      (child) => child.tagName === "LI"
    );
    const listItemIndex = directItems.findIndex((child) => child === listItem);
    const listMarkerText =
      listKind === "ordered"
        ? resolveOrderedListMarkerText(listElement, listItem)
        : "bullet";
    const spokenPrefix =
      listKind === "ordered"
        ? listMarkerText
          ? prefersArabic
            ? `البند ${listMarkerText}`
            : `Item ${listMarkerText}`
          : prefersArabic
            ? "البند"
            : "Item"
        : "";

    return {
      listRootId: ensureListRootId(listElement),
      listKind,
      listDepth: resolveListDepth(listElement),
      listItemIndex: listItemIndex >= 0 ? listItemIndex : -1,
      listItemCount: directItems.length,
      listMarkerText,
      spokenPrefix,
    };
  }

  function buildSpokenLangRanges(languageRanges) {
    return Array.isArray(languageRanges)
      ? languageRanges
          .map((range) => ({
            start: Number(range.start || 0),
            end: Number(range.end || 0),
            langHint: normalizeLangHint(range.langHint),
          }))
          .filter((range) => range.langHint && range.end > range.start)
      : [];
  }

  function resolveAutoAdvanceDelayMs(block) {
    return block && block.listKind && block.listKind !== "none"
      ? AUTO_ADVANCE_LIST_ITEM_DELAY_MS
      : AUTO_ADVANCE_DELAY_MS;
  }

  function buildReadableTextProjection(element) {
    if (!element) {
      return {
        text: "",
        segments: [],
        languageSegments: [],
        sentences: [],
        sentenceRanges: [],
      };
    }

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldAcceptProjectionTextNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      }
    );
    const segments = [];
    let text = "";
    let lastWasWhitespace = true;
    let currentNode = null;

    while ((currentNode = walker.nextNode())) {
      const currentLangHint = resolveNearestExplicitLangHint(
        currentNode.parentElement
      );
      const rawText = String(currentNode.nodeValue || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "");

      for (let index = 0; index < rawText.length; index += 1) {
        const rawChar = rawText[index];
        const normalizedChar = /\s/.test(rawChar) ? " " : rawChar;
        if (normalizedChar === " ") {
          if (!text.length || lastWasWhitespace) {
            continue;
          }
        }

        const normStart = text.length;
        text += normalizedChar;
        lastWasWhitespace = normalizedChar === " ";
        pushProjectionSegment(segments, {
          node: currentNode,
          rawStartOffset: index,
          rawEndOffset: index + 1,
          normStart,
          normEnd: normStart + 1,
          langHint: currentLangHint,
        });
      }
    }

    const trimmedText = text.trimEnd();
    const trimmedLength = trimmedText.length;
    const normalizedSegments = segments
      .filter((segment) => segment.normStart < trimmedLength)
      .map((segment) => ({
        ...segment,
        normEnd: Math.min(segment.normEnd, trimmedLength),
      }));

    return {
      text: trimmedText,
      segments: normalizedSegments,
      languageSegments: buildProjectionLanguageSegments(
        normalizedSegments,
        trimmedLength
      ),
      sentences: [],
      sentenceRanges: [],
    };
  }

  function buildSentenceRangesFromProjection(projection, sentences) {
    if (!projection || !projection.segments.length || !sentences.length) {
      return [];
    }

    return sentences.map((sentence) => {
      const spans = [];
      for (const segment of projection.segments) {
        if (
          segment.normEnd <= sentence.start ||
          segment.normStart >= sentence.end ||
          !segment.node?.isConnected
        ) {
          continue;
        }

        const nodeLength = segment.node.nodeValue?.length || 0;
        const rawStartOffset = Math.max(
          0,
          Math.min(segment.rawStartOffset, nodeLength)
        );
        const rawEndOffset = Math.max(
          rawStartOffset,
          Math.min(segment.rawEndOffset, nodeLength)
        );
        const rawSpanLength = rawEndOffset - rawStartOffset;
        if (!rawSpanLength) {
          continue;
        }

        const startOffset = Math.min(
          nodeLength,
          rawStartOffset + Math.max(0, sentence.start - segment.normStart)
        );
        const endOffset = Math.min(
          nodeLength,
          rawStartOffset +
            Math.min(rawSpanLength, sentence.end - segment.normStart)
        );
        if (endOffset <= startOffset) {
          continue;
        }

        const previous = spans[spans.length - 1];
        if (
          previous &&
          previous.node === segment.node &&
          previous.endOffset === startOffset
        ) {
          previous.endOffset = endOffset;
          continue;
        }

        spans.push({
          node: segment.node,
          startOffset,
          endOffset,
        });
      }

      return spans.flatMap((span) => {
        const nodeLength = span.node.nodeValue?.length || 0;
        const safeStart = Math.max(0, Math.min(span.startOffset, nodeLength));
        const safeEnd = Math.max(safeStart, Math.min(span.endOffset, nodeLength));
        if (safeEnd <= safeStart) {
          return [];
        }

        const range = document.createRange();
        range.setStart(span.node, safeStart);
        range.setEnd(span.node, safeEnd);
        return [range];
      });
    });
  }

  function ensureProjectionSentences(blockId) {
    const projection = state.blockProjections.get(blockId);
    if (!projection || !projection.text) {
      return null;
    }

    if (!projection.sentences.length) {
      projection.sentences = segmentTextIntoSentences(projection.text);
      projection.sentenceRanges = buildSentenceRangesFromProjection(
        projection,
        projection.sentences
      );
    }

    return projection;
  }

  function getSentenceHighlightRanges(blockId, sentenceIndex) {
    const projection = ensureProjectionSentences(blockId);
    if (!projection) {
      return [];
    }

    return projection.sentenceRanges[sentenceIndex] || [];
  }

  function clearSentenceHighlight() {
    state.activeSentenceIndex = -1;
    state.activeSentenceCount = 0;
    if (
      typeof CSS === "undefined" ||
      !CSS.highlights ||
      typeof Highlight !== "function"
    ) {
      return;
    }
    CSS.highlights.delete(SENTENCE_HIGHLIGHT_NAME);
  }

  function clearSentenceHoverTarget() {
    const previousElement = state.blocksById.get(state.hoveredSentenceBlockId);
    if (previousElement) {
      previousElement.removeAttribute(SENTENCE_TARGET_ATTR);
    }
    state.hoveredSentenceBlockId = "";
    state.hoveredSentenceIndex = -1;
    if (
      typeof CSS === "undefined" ||
      !CSS.highlights ||
      typeof Highlight !== "function"
    ) {
      return;
    }
    CSS.highlights.delete(SENTENCE_HOVER_HIGHLIGHT_NAME);
  }

  function applySentenceHighlight(blockId, sentenceIndex, sentenceCount = 0) {
    state.activeSentenceIndex = Number.isInteger(sentenceIndex) ? sentenceIndex : -1;
    state.activeSentenceCount = Math.max(0, Number(sentenceCount || 0));
    if (
      typeof CSS === "undefined" ||
      !CSS.highlights ||
      typeof Highlight !== "function"
    ) {
      return;
    }

    const ranges = getSentenceHighlightRanges(blockId, sentenceIndex);
    if (!ranges.length) {
      CSS.highlights.delete(SENTENCE_HIGHLIGHT_NAME);
      return;
    }

    CSS.highlights.set(
      SENTENCE_HIGHLIGHT_NAME,
      new Highlight(...ranges)
    );
  }

  function applySentenceHoverTarget(blockId, sentenceIndex) {
    const previousElement = state.blocksById.get(state.hoveredSentenceBlockId);
    if (previousElement) {
      previousElement.removeAttribute(SENTENCE_TARGET_ATTR);
    }
    state.hoveredSentenceBlockId = String(blockId || "");
    state.hoveredSentenceIndex = Number.isInteger(sentenceIndex) ? sentenceIndex : -1;

    const element = state.blocksById.get(blockId);
    if (element) {
      element.setAttribute(SENTENCE_TARGET_ATTR, "true");
    }

    if (
      typeof CSS === "undefined" ||
      !CSS.highlights ||
      typeof Highlight !== "function"
    ) {
      return;
    }

    const ranges = getSentenceHighlightRanges(blockId, sentenceIndex);
    if (!ranges.length) {
      CSS.highlights.delete(SENTENCE_HOVER_HIGHLIGHT_NAME);
      return;
    }

    CSS.highlights.set(
      SENTENCE_HOVER_HIGHLIGHT_NAME,
      new Highlight(...ranges)
    );
  }

  function getSentenceCountForBlock(blockId) {
    return ensureProjectionSentences(blockId)?.sentences.length || 0;
  }

  function isSentenceJumpModeActive() {
    return Boolean((state.isPlaying || state.isPaused) && state.currentQueue.length);
  }

  function maybeOpenRailForStart(startSource) {
    if (shouldAutoOpenRailForStart(startSource, state.railVisible)) {
      openRail();
    }
  }

  function resolveCaretTextPosition(clientX, clientY) {
    if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(clientX, clientY);
      if (range) {
        return {
          node: range.startContainer || null,
          offset: Number(range.startOffset || 0),
        };
      }
    }

    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(clientX, clientY);
      if (position) {
        return {
          node: position.offsetNode || null,
          offset: Number(position.offset || 0),
        };
      }
    }

    return null;
  }

  function resolveTextNodeFromCaret(node, offset) {
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return {
        node,
        offset: Math.max(0, Math.min(Number(offset || 0), node.nodeValue?.length || 0)),
      };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node;
    const childIndex = Math.max(0, Math.min(element.childNodes.length - 1, Number(offset || 0)));
    const preferredChild =
      element.childNodes[childIndex] ||
      element.childNodes[Math.max(0, childIndex - 1)] ||
      null;
    if (!preferredChild) {
      return null;
    }

    if (preferredChild.nodeType === Node.TEXT_NODE) {
      return {
        node: preferredChild,
        offset: 0,
      };
    }

    const walker = document.createTreeWalker(preferredChild, NodeFilter.SHOW_TEXT);
    const firstTextNode = walker.nextNode();
    if (!firstTextNode) {
      return null;
    }

    return {
      node: firstTextNode,
      offset: 0,
    };
  }

  function resolveFallbackSentenceTargetForBlock(blockId) {
    const resolvedBlockId = String(blockId || "").trim();
    if (!resolvedBlockId) {
      return null;
    }

    const projection = ensureProjectionSentences(resolvedBlockId);
    const blockMeta =
      state.blocks.find((block) => block.id === resolvedBlockId) || null;
    return resolveSingleSentenceFallbackTarget(
      blockMeta,
      projection?.sentences?.length || 0
    );
  }

  function normalizeReadableBlockTarget(target) {
    if (!target) {
      return null;
    }
    if (target.nodeType === Node.TEXT_NODE) {
      return target.parentElement || null;
    }
    if (target.nodeType === Node.ELEMENT_NODE) {
      return target;
    }
    return target.parentElement || null;
  }

  function collectAncestorBlockIds(target) {
    const blockIds = [];
    let current = normalizeReadableBlockTarget(target);
    while (current) {
      if (current.hasAttribute && current.hasAttribute(BLOCK_ATTR)) {
        const blockId = String(current.getAttribute(BLOCK_ATTR) || "").trim();
        if (blockId && !blockIds.includes(blockId)) {
          blockIds.push(blockId);
        }
      }
      current = current.parentElement;
    }
    return blockIds;
  }

  function appendUniqueBlockIds(targetList, blockIds) {
    for (const blockId of Array.isArray(blockIds) ? blockIds : []) {
      const resolvedId = String(blockId || "").trim();
      if (resolvedId && !targetList.includes(resolvedId)) {
        targetList.push(resolvedId);
      }
    }
  }

  function prependUniqueBlockId(targetList, blockId) {
    const resolvedId = String(blockId || "").trim();
    if (!resolvedId || targetList.includes(resolvedId)) {
      return;
    }
    targetList.unshift(resolvedId);
  }

  function resolveSurvivingBlockIdFromTarget(target) {
    return resolveFirstAvailableBlockId(
      collectAncestorBlockIds(target),
      state.blocksById.keys()
    );
  }

  function collectOrderedCandidateBlockIdsForPoint(
    clientX,
    clientY,
    originalTarget = null
  ) {
    const blockIds = [];
    appendUniqueBlockIds(blockIds, collectAncestorBlockIds(originalTarget));
    if (typeof document.elementsFromPoint === "function") {
      const elements = document.elementsFromPoint(clientX, clientY) || [];
      for (const element of elements) {
        appendUniqueBlockIds(blockIds, collectAncestorBlockIds(element));
      }
    }
    return blockIds;
  }

  function resolveSurvivingBlockIdFromPoint(clientX, clientY, originalTarget = null) {
    return resolveFirstAvailableBlockId(
      collectOrderedCandidateBlockIdsForPoint(clientX, clientY, originalTarget),
      state.blocksById.keys()
    );
  }

  function resolveFallbackSentenceTargetFromBlockIds(blockIds) {
    for (const candidateBlockId of Array.isArray(blockIds) ? blockIds : []) {
      const fallbackTarget = resolveFallbackSentenceTargetForBlock(
        candidateBlockId
      );
      if (fallbackTarget) {
        return fallbackTarget;
      }
    }

    return null;
  }

  function resolveSentenceTargetFromPoint(clientX, clientY, originalTarget = null) {
    const interactiveTarget =
      originalTarget && typeof originalTarget.closest === "function"
        ? originalTarget.closest(
            "a[href], button, input, textarea, select, option, label, summary"
          )
        : null;
    if (interactiveTarget) {
      return null;
    }

    const fallbackBlockIds = collectOrderedCandidateBlockIdsForPoint(
      clientX,
      clientY,
      originalTarget
    );

    const caret = resolveCaretTextPosition(clientX, clientY);
    if (!caret) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }

    const textPosition = resolveTextNodeFromCaret(caret.node, caret.offset);
    if (!textPosition?.node) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }

    const blockId = resolveSurvivingBlockIdFromTarget(textPosition.node);
    if (!blockId) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }
    prependUniqueBlockId(fallbackBlockIds, blockId);

    const projection = ensureProjectionSentences(blockId);
    if (!projection || !projection.sentences.length) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }

    const charIndex = resolveProjectionCharIndex(
      projection.segments,
      textPosition.node,
      textPosition.offset
    );
    if (charIndex < 0) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }

    const sentenceIndex = resolveSentenceIndexForCharIndex(
      projection.sentences,
      charIndex
    );
    if (sentenceIndex < 0) {
      return resolveFallbackSentenceTargetFromBlockIds(fallbackBlockIds);
    }

    return {
      blockId,
      sentenceIndex,
    };
  }

  function cancelHoverChipRetarget() {
    clearTimeout(state.retargetHoverTimer);
    state.retargetHoverTimer = 0;
    state.pendingHoverBlockId = "";
  }

  function findNearestReadableAncestorId(element, candidateIds) {
    let ancestor = element ? element.parentElement : null;
    while (ancestor) {
      if (candidateIds.has(ancestor)) {
        return candidateIds.get(ancestor);
      }
      ancestor = ancestor.parentElement;
    }
    return "";
  }

  function collectCandidates() {
    const isChatPage = isLikelyChatGptHost(location.hostname);
    const scopeSelector = isChatPage
      ? "main p, main li, main blockquote, main h1, main h2, main h3, main h4"
      : "article p, article li, article blockquote, article h1, article h2, article h3, article h4, main p, main li, main blockquote, main h1, main h2, main h3, main h4, [role='main'] p, [role='main'] li, [role='main'] blockquote, [role='main'] h1, [role='main'] h2, [role='main'] h3, [role='main'] h4";

    const candidateElements = Array.from(document.querySelectorAll(scopeSelector));
    const candidateIds = new WeakMap();
    candidateElements.forEach((element) => {
      candidateIds.set(element, ensureElementBlockId(element));
    });

    return candidateElements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const projection = buildReadableTextProjection(element);
      const documentLang = resolveDocumentLang();
      const langHint = resolveBlockLangHint(
        element,
        projection.text,
        documentLang
      );
      const listMetadata = buildListMetadata(element, projection.text, langHint);
      const spokenText = buildSpokenBlockText(
        projection.text,
        listMetadata.spokenPrefix
      );
      return {
        id: candidateIds.get(element),
        order: index,
        tagName: element.tagName.toLowerCase(),
        text: projection.text,
        spokenText,
        parentReadableId: findNearestReadableAncestorId(element, candidateIds),
        isVisible:
          rect.width > 1 &&
          rect.height > 1 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0",
        insideMain: Boolean(element.closest("main, [role='main']")),
        insideArticle: Boolean(element.closest("article")),
        insideDisallowed: Boolean(
          element.closest(
            "nav, header, footer, aside, pre, code, textarea, input, select, option, button, form, svg, canvas, [contenteditable='true'], [role='textbox']"
          )
        ),
        insideComposer: Boolean(
          element.closest(
            "form, [data-testid*='composer'], [id*='composer'], [role='textbox'], textarea"
          )
        ),
        langHint,
        documentLang,
        listRootId: listMetadata.listRootId,
        listKind: listMetadata.listKind,
        listDepth: listMetadata.listDepth,
        listItemIndex: listMetadata.listItemIndex,
        listItemCount: listMetadata.listItemCount,
        listMarkerText: listMetadata.listMarkerText,
        spokenPrefix: listMetadata.spokenPrefix,
        langRanges: buildSpokenLangRanges(projection.languageSegments),
        element,
        projection,
      };
    });
  }

  function scanReadableBlocks() {
    const candidates = collectCandidates();
    const serializedCandidates = candidates.map((candidate) => ({
      ...candidate,
      element: undefined,
    }));

    const nextBlocks = isLikelyChatGptHost(location.hostname)
      ? selectChatGptBlocks(serializedCandidates)
      : selectArticleBlocks(serializedCandidates);

    const nextBlocksById = new Map();
    const nextBlockProjections = new Map();
    for (const block of nextBlocks) {
      const match = candidates.find((candidate) => candidate.id === block.id);
      if (match && match.element) {
        nextBlocksById.set(block.id, match.element);
        nextBlockProjections.set(block.id, match.projection);
      }
    }

    state.blocks = nextBlocks;
    state.blocksById = nextBlocksById;
    state.blockProjections = nextBlockProjections;

    if (state.hoverChipBlockId && !state.blocksById.has(state.hoverChipBlockId)) {
      clearHoverChipState();
    }
    if (state.hoveredSentenceBlockId && !state.blocksById.has(state.hoveredSentenceBlockId)) {
      clearSentenceHoverTarget();
    }

    if (state.activeBlockId && !state.blocksById.has(state.activeBlockId)) {
      void stopReading({
        preserveRail: true,
        reason: "The current page content changed while reading.",
      });
    } else if (state.currentQueue.length) {
      const reconciledQueue = reconcileReadingQueue(state.blocks, state.currentQueue, {
        activeBlockId: state.activeBlockId,
        currentIndex: state.currentIndex,
        queueStartBlockId: state.queueStartBlockId,
        queueCursorBlockId: state.queueCursorBlockId,
        hoveredBlockId: state.hoveredBlockId,
      });
      state.currentQueue = reconciledQueue.queue;
      state.currentIndex = reconciledQueue.currentIndex;
      state.queueStartBlockId = reconciledQueue.queueStartBlockId;
      state.queueCursorBlockId = reconciledQueue.queueCursorBlockId;
      if (reconciledQueue.isComplete) {
        finishQueueRun();
        return;
      }
    }

    if (state.activeBlockId && state.activeSentenceIndex >= 0) {
      applySentenceHighlight(
        state.activeBlockId,
        state.activeSentenceIndex,
        state.activeSentenceCount
      );
    }

    render();
    updateHoverButtonPosition();
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = window.setTimeout(() => {
      if (state.locationHref !== location.href) {
        state.locationHref = location.href;
        clearHoverChipState();
        clearSentenceHoverTarget();
        state.currentQueue = [];
        state.currentIndex = -1;
        state.queueStartBlockId = "";
        state.queueCursorBlockId = "";
        state.activeBlockId = "";
      }
      scanReadableBlocks();
    }, 140);
  }

  function clearMarkers() {
    for (const element of document.querySelectorAll(`[${BLOCK_ATTR}]`)) {
      element.removeAttribute(ACTIVE_ATTR);
      element.removeAttribute(READ_ATTR);
    }
  }

  function updateMarkers() {
    clearMarkers();
    if (!state.currentQueue.length) {
      return;
    }

    state.currentQueue.forEach((block, index) => {
      const element = state.blocksById.get(block.id);
      if (!element) {
        return;
      }
      if (block.id === state.activeBlockId) {
        element.setAttribute(ACTIVE_ATTR, "true");
      } else if (index < state.currentIndex) {
        element.setAttribute(READ_ATTR, "true");
      }
    });
  }

  function getCurrentBlock() {
    if (state.currentIndex < 0 || state.currentIndex >= state.currentQueue.length) {
      return null;
    }
    return state.currentQueue[state.currentIndex];
  }

  function getQueueBlockById(blockId) {
    const normalizedBlockId = String(blockId || "").trim();
    if (!normalizedBlockId) {
      return null;
    }
    return state.currentQueue.find((block) => block.id === normalizedBlockId) || null;
  }

  function syncQueueCursorBlock(blockId) {
    const normalizedBlockId = String(blockId || "").trim();
    if (!normalizedBlockId) {
      return;
    }
    state.queueCursorBlockId = normalizedBlockId;
    const currentIndex = state.currentQueue.findIndex((block) => block.id === normalizedBlockId);
    if (currentIndex !== -1) {
      state.currentIndex = currentIndex;
    }
  }

  function finishQueueRun() {
    cancelPendingAdvance();
    state.isPlaying = false;
    state.isPaused = false;
    state.activeBlockId = "";
    state.activeSentenceIndex = -1;
    state.activeSentenceCount = 0;
    state.queueCursorBlockId = "";
    state.currentIndex = state.currentQueue.length;
    clearSentenceHighlight();
    clearHoverChipState();
    setStatus(
      "Finished",
      "Finished reading the queued blocks.",
      "Hover another paragraph to start a new run."
    );
    updateHoverButtonPosition();
    render();
  }

  function cancelHoverChipHide() {
    clearTimeout(state.hideHoverTimer);
    state.hideHoverTimer = 0;
  }

  function hideHoverButton() {
    if (!state.ui) {
      return;
    }
    state.ui.hoverPlayButton.classList.remove("visible");
    state.ui.hoverPlayButton.dataset.persistent = "false";
  }

  function clearHoverChipState() {
    cancelHoverChipHide();
    cancelHoverChipRetarget();
    state.hoveredBlockId = "";
    state.hoverChipBlockId = "";
    state.isHoverChipHovered = false;
    if (!state.ui) {
      return;
    }
    state.ui.hoverPlayButton.dataset.blockId = "";
    state.ui.hoverPlayButton.dataset.mode = "play";
    state.ui.hoverPlayButton.dataset.placement = "";
    state.ui.hoverPlayButton.dataset.persistent = "false";
    hideHoverButton();
  }

  function scheduleHideHoverChip(delayMs = HOVER_CHIP_HIDE_DELAY_MS) {
    if (getInlineChipState().isPersistent) {
      updateHoverButtonPosition();
      return;
    }

    cancelHoverChipHide();
    state.hideHoverTimer = window.setTimeout(() => {
      state.hideHoverTimer = 0;
      if (
        getInlineChipState().isPersistent ||
        shouldKeepHoverChipVisible({
          hoveredBlockId: state.hoveredBlockId,
          pinnedBlockId: state.hoverChipBlockId,
          isChipHovered: state.isHoverChipHovered,
        })
      ) {
        updateHoverButtonPosition();
        return;
      }
      clearHoverChipState();
      render();
    }, delayMs);
  }

  function updateHoverButtonPosition() {
    if (!state.ui) {
      return;
    }

    const chipState = getInlineChipState();
    syncHoverButtonVisual(chipState);

    if (!chipState.targetBlockId || !chipState.isVisible) {
      hideHoverButton();
      return;
    }

    const element = state.blocksById.get(chipState.targetBlockId);
    if (!element) {
      if (!chipState.isPersistent) {
        clearHoverChipState();
      } else {
        hideHoverButton();
      }
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      hideHoverButton();
      return;
    }

    const computedStyle = window.getComputedStyle(element);
    const fontSize = parseFloat(computedStyle.fontSize) || 16;
    const parsedLineHeight = parseFloat(computedStyle.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : fontSize * 1.35;
    const placement = resolveHoverChipPlacement(
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      {
        chipSize: HOVER_CHIP_SIZE,
        gutterGap: HOVER_CHIP_GAP,
        edgePadding: HOVER_CHIP_EDGE_PADDING,
        insetOffset: HOVER_CHIP_INSET_OFFSET,
        topInset: HOVER_CHIP_TOP_INSET,
        lineHeight,
      }
    );
    state.ui.hoverPlayButton.style.left = `${placement.x}px`;
    state.ui.hoverPlayButton.style.top = `${placement.y}px`;
    state.ui.hoverPlayButton.dataset.blockId = chipState.targetBlockId;
    state.ui.hoverPlayButton.dataset.placement = placement.placement;
    state.ui.hoverPlayButton.dataset.persistent = chipState.isPersistent
      ? "true"
      : "false";
    state.ui.hoverPlayButton.classList.add("visible");
  }

  function pinHoverChipToBlock(blockId) {
    const resolvedBlockId = String(blockId || "").trim();
    if (!resolvedBlockId || !state.blocksById.has(resolvedBlockId)) {
      return;
    }

    cancelHoverChipHide();
    cancelHoverChipRetarget();
    state.hoverChipBlockId = resolvedBlockId;
    updateHoverButtonPosition();
    render();
  }

  function scheduleHoverChipRetarget(blockId) {
    const resolvedBlockId = String(blockId || "").trim();
    if (
      !resolvedBlockId ||
      resolvedBlockId === state.hoverChipBlockId ||
      state.isHoverChipHovered
    ) {
      cancelHoverChipRetarget();
      return;
    }

    if (
      state.pendingHoverBlockId === resolvedBlockId &&
      state.retargetHoverTimer
    ) {
      return;
    }

    cancelHoverChipRetarget();
    state.pendingHoverBlockId = resolvedBlockId;
    state.retargetHoverTimer = window.setTimeout(() => {
      state.retargetHoverTimer = 0;
      const pendingBlockId = state.pendingHoverBlockId;
      state.pendingHoverBlockId = "";
      if (
        !pendingBlockId ||
        pendingBlockId !== state.hoveredBlockId ||
        state.isHoverChipHovered
      ) {
        return;
      }

      state.hoverChipBlockId = pendingBlockId;
      updateHoverButtonPosition();
      render();
    }, HOVER_CHIP_RETARGET_DELAY_MS);
  }

  function openRail(options = {}) {
    state.railVisible = true;
    if (options.expand !== false) {
      state.railCollapsed = false;
    }
    render();
  }

  function hideRail() {
    state.railVisible = false;
    state.railCollapsed = false;
    render();
  }

  function collapseRail() {
    state.railVisible = true;
    state.railCollapsed = true;
    render();
  }

  function setStatus(pill, title, copy) {
    state.statusPill = pill;
    state.statusTitle = title;
    state.statusCopy = copy;
    render();
  }

  function focusActiveBlock() {
    const block = getCurrentBlock();
    if (!block) {
      return;
    }
    const element = state.blocksById.get(block.id);
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    const viewportTop = window.innerHeight * 0.18;
    const viewportBottom = window.innerHeight * 0.78;
    if (rect.top >= viewportTop && rect.bottom <= viewportBottom) {
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }

  async function loadPrefs() {
    const values = await chrome.storage.local.get(STATE_KEY);
    state.prefs = sanitizeState(values[STATE_KEY]);
  }

  async function savePrefs(patch) {
    state.prefs = sanitizeState({
      ...state.prefs,
      ...patch,
    });
    await chrome.storage.local.set({
      [STATE_KEY]: state.prefs,
    });
    render();
  }

  async function copyDebugReport() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "get_run_report",
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Could not build the debug report.");
      }

      const report = response.report || {};
      await copyTextToClipboard(JSON.stringify(report, null, 2));
      const summary = report.summary || {};
      const copy = summary.lastFailureCode
        ? "Debug report copied. Last failure: " + summary.lastFailureCode + ". Paste the JSON here when you want me to inspect it."
        : "Debug report copied. Paste the JSON here when you want me to inspect a run.";
      setStatus(
        "Copied",
        "The JSON debug report is in your clipboard.",
        copy
      );
    } catch (error) {
      setStatus(
        "Error",
        error?.message || "Could not copy the debug report.",
        "Reload the extension and try copying the report again."
      );
    }
  }

  function renderQueue() {
    const currentBlock = getCurrentBlock();
    state.currentPreview = currentBlock ? currentBlock.preview : "No page block selected yet.";

    state.ui.queueList.innerHTML = "";
    const previewQueue = state.currentQueue.slice(0, 6);
    if (!previewQueue.length) {
      const empty = document.createElement("li");
      empty.className = "queue-item";
      empty.textContent = "No queue yet. Hover a readable block and press play.";
      state.ui.queueList.appendChild(empty);
      return;
    }

    previewQueue.forEach((block) => {
      const item = document.createElement("li");
      item.className = `queue-item${block.id === state.activeBlockId ? " active" : ""}`;
      item.textContent = block.preview;
      state.ui.queueList.appendChild(item);
    });
  }

  function render() {
    if (!state.ui) {
      return;
    }

    const hoverChipTarget = getInlineChipState().targetBlockId;
    state.ui.rail.classList.toggle("open", state.railVisible);
    state.ui.rail.classList.toggle("collapsed", state.railVisible && state.railCollapsed);
    state.ui.reopenHandle.classList.toggle(
      "visible",
      !state.railVisible || state.railCollapsed
    );
    state.ui.statusPill.textContent = state.statusPill;
    state.ui.statusTitle.textContent = state.statusTitle;
    state.ui.statusCopy.textContent = state.statusCopy;
    state.ui.currentPreview.textContent = state.currentPreview;
    state.ui.speedInput.value = String(state.prefs.speechRate);
    state.ui.speedValue.textContent = `${Number(state.prefs.speechRate).toFixed(2)}x`;
    syncHoverButtonVisual();
    syncTransportButtonVisuals();
    state.ui.playPauseButton.disabled = !state.currentQueue.length && !hoverChipTarget;
    state.ui.prevButton.disabled = state.currentIndex <= 0;
    state.ui.nextButton.disabled =
      !state.currentQueue.length || state.currentIndex >= state.currentQueue.length - 1;
    state.ui.stopButton.disabled = !state.isPlaying && !state.isPaused;

    if (!state.ui.voiceSelect.options.length) {
      for (const voice of VOICE_OPTIONS) {
        const option = document.createElement("option");
        option.value = voice.key;
        option.textContent = voice.label;
        state.ui.voiceSelect.appendChild(option);
      }
    }
    state.ui.voiceSelect.value = state.prefs.preferredVoiceKey;

    renderQueue();
    updateMarkers();
  }

  function resetQueueState(clearMarkersOnly = false) {
    cancelPendingAdvance();
    state.isPlaying = false;
    state.isPaused = false;
    state.activeBlockId = "";
    state.activeSentenceIndex = -1;
    state.activeSentenceCount = 0;
    state.queueStartBlockId = "";
    state.queueCursorBlockId = "";
    clearHoverChipState();
    clearSentenceHoverTarget();
    if (!clearMarkersOnly) {
      state.currentQueue = [];
      state.currentIndex = -1;
    }
    clearMarkers();
  }

  function cancelPendingAdvance() {
    if (state.pendingAdvanceTimer) {
      clearTimeout(state.pendingAdvanceTimer);
      state.pendingAdvanceTimer = 0;
    }
  }

  function ensureUi() {
    if (state.ui) {
      return;
    }

    const host = document.createElement("div");
    host.id = "edge-voice-reader-shadow-host";
    const shadow = host.attachShadow({
      mode: "open",
    });
    shadow.innerHTML = SHADOW_HTML;
    document.documentElement.appendChild(host);

    state.ui = {
      host,
      shadow,
      rail: shadow.getElementById("rail"),
      reopenHandle: shadow.getElementById("reopenHandle"),
      hoverPlayButton: shadow.getElementById("hoverPlayButton"),
      statusPill: shadow.getElementById("statusPill"),
      statusTitle: shadow.getElementById("statusTitle"),
      statusCopy: shadow.getElementById("statusCopy"),
      playPauseButton: shadow.getElementById("playPauseButton"),
      prevButton: shadow.getElementById("prevButton"),
      nextButton: shadow.getElementById("nextButton"),
      stopButton: shadow.getElementById("stopButton"),
      voiceSelect: shadow.getElementById("voiceSelect"),
      speedInput: shadow.getElementById("speedInput"),
      speedValue: shadow.getElementById("speedValue"),
      currentPreview: shadow.getElementById("currentPreview"),
      queueList: shadow.getElementById("queueList"),
    };

    state.ui.hoverPlayButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    state.ui.hoverPlayButton.addEventListener("pointerenter", () => {
      state.isHoverChipHovered = true;
      cancelHoverChipHide();
      cancelHoverChipRetarget();
      const blockId = resolveHoverChipActionTarget(
        state.ui.hoverPlayButton.dataset.blockId,
        state.hoverChipBlockId
      );
      if (blockId) {
        state.hoverChipBlockId = blockId;
      }
    });
    state.ui.hoverPlayButton.addEventListener("pointerleave", () => {
      state.isHoverChipHovered = false;
      if (!state.hoveredBlockId) {
        scheduleHideHoverChip();
      }
    });
    state.ui.hoverPlayButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const chipState = getInlineChipState();
      const blockId = String(
        state.ui.hoverPlayButton.dataset.blockId || chipState.targetBlockId || ""
      ).trim();
      if (!blockId) {
        return;
      }

      if (chipState.isPersistent && blockId === state.activeBlockId) {
        if (state.isPaused) {
          void resumeReading();
          return;
        }
        if (state.isPlaying) {
          void pauseReading();
          return;
        }
      }

      void startReadingFromBlock(blockId, {
        startSource: "inline",
        queueStartMode: "list-root",
      });
    });
    state.ui.reopenHandle.addEventListener("click", () => openRail());
    state.ui.voiceSelect.addEventListener("change", () => {
      void savePrefs({
        preferredVoiceKey: state.ui.voiceSelect.value,
      });
    });
    state.ui.speedInput.addEventListener("input", () => {
      state.ui.speedValue.textContent = `${Number(state.ui.speedInput.value).toFixed(2)}x`;
    });
    state.ui.speedInput.addEventListener("change", () => {
      void savePrefs({
        speechRate: state.ui.speedInput.value,
      });
    });
    state.ui.playPauseButton.addEventListener("click", () => {
      if (state.isPaused) {
        void resumeReading();
        return;
      }
      if (state.isPlaying) {
        void pauseReading();
        return;
      }
      if (state.currentQueue.length) {
        const currentBlock = getCurrentBlock() || state.currentQueue[0];
        if (currentBlock) {
          void startReadingFromBlock(currentBlock.id, {
            startSource: "explicit",
          });
        }
        return;
      }
      const blockId = resolveHoverChipActionTarget(
        state.hoverChipBlockId,
        state.hoveredBlockId
      );
      if (blockId) {
        void startReadingFromBlock(blockId, {
          startSource: "explicit",
          queueStartMode: "list-root",
        });
      }
    });
    state.ui.prevButton.addEventListener("click", () => {
      void jumpRelative(-1);
    });
    state.ui.nextButton.addEventListener("click", () => {
      void jumpRelative(1);
    });
    state.ui.stopButton.addEventListener("click", () => {
      void stopReading({
        preserveRail: true,
        reason: "Playback stopped.",
      });
    });

    for (const button of state.ui.shadow.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-action");
        if (action === "copy-debug") {
          void copyDebugReport();
          return;
        }
        if (action === "collapse") {
          if (state.railCollapsed) {
            openRail();
            return;
          }
          collapseRail();
          return;
        }
        if (action === "close") {
          hideRail();
        }
      });
    }

    render();
  }

  async function jumpRelative(offset) {
    if (!state.currentQueue.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(state.currentQueue.length - 1, state.currentIndex + offset));
    const block = state.currentQueue[nextIndex];
    if (!block) {
      return;
    }
    await startReadingFromBlock(block.id, {
      startSource: state.railVisible ? "explicit" : "inline",
    });
  }

  async function beginBlockPlayback(block, options = {}) {
    if (!block) {
      return;
    }

    cancelPendingAdvance();
    const currentIndex = state.currentQueue.findIndex((candidate) => candidate.id === block.id);
    if (currentIndex !== -1) {
      state.currentIndex = currentIndex;
    }
    if (!state.queueStartBlockId) {
      state.queueStartBlockId = String(
        (state.currentQueue[0] && state.currentQueue[0].id) || block.id || ""
      ).trim();
    }
    syncQueueCursorBlock(block.id);
    const projection = ensureProjectionSentences(block.id);
    const sentenceCount = projection?.sentences?.length || 0;
    const requestedSentenceIndex = normalizeSentenceStartIndex(
      options.startSentenceIndex,
      sentenceCount
    );
    const startSentenceIndex = requestedSentenceIndex >= 0 ? requestedSentenceIndex : 0;
    const shouldOpenRail = shouldAutoOpenRailForStart(
      options.startSource || "inline",
      state.railVisible
    );
    state.activeBlockId = block.id;
    state.activeSentenceIndex = requestedSentenceIndex;
    state.activeSentenceCount = sentenceCount;
    state.isPlaying = true;
    state.isPaused = false;
    setStatus(
      "Reading",
      buildPreview(block.spokenText || block.text, 84),
      `${sentenceCount ? `Sentence ${startSentenceIndex + 1} of ${sentenceCount}. ` : ""}Block ${state.currentIndex + 1} of ${state.currentQueue.length}. The active sentence will stay highlighted while Edge reads it.`
    );
    cancelHoverChipHide();
    cancelHoverChipRetarget();
    state.hoveredBlockId = "";
    state.hoverChipBlockId = block.id;
    updateMarkers();
    clearSentenceHighlight();
    clearSentenceHoverTarget();
    focusActiveBlock();
    updateHoverButtonPosition();

    try {
      const response = await chrome.runtime.sendMessage({
        type: "page_reader_speak_block",
        text: block.text,
        blockId: block.id,
        startSentenceIndex,
        sourceLabel: block.kind === "heading" ? "page heading" : "page paragraph",
        langHint: block.langHint,
        documentLang: block.documentLang,
        listKind: block.listKind,
        listDepth: block.listDepth,
        listMarkerText: block.listMarkerText,
        spokenPrefix: block.spokenPrefix,
        langRanges: block.langRanges,
        transitionSource:
          options.transitionSource === "auto_advance" ? "auto_advance" : "",
      });
      if (!response || response.ok !== true) {
        throw new Error(response && response.error ? response.error : "Edge rejected page playback.");
      }
      if (shouldOpenRail) {
        openRail();
      } else {
        render();
        updateHoverButtonPosition();
      }
    } catch (error) {
      state.isPlaying = false;
      state.isPaused = false;
      clearHoverChipState();
      setStatus(
        "Error",
        error && error.message ? error.message : String(error),
        "The page reader kept the current queue in place so you can try another block."
      );
      updateHoverButtonPosition();
    }
  }

  async function startReadingFromSentence(blockId, sentenceIndex, options = {}) {
    const projection = ensureProjectionSentences(blockId);
    const startSentenceIndex = normalizeSentenceStartIndex(
      sentenceIndex,
      projection?.sentences?.length || 0
    );
    if (startSentenceIndex < 0) {
      return;
    }

    await startReadingFromBlock(blockId, {
      ...options,
      startSource: options.startSource || "sentence-jump",
      startSentenceIndex,
    });
  }

  async function startReadingFromBlock(blockId, options = {}) {
    cancelPendingAdvance();
    const shouldOpenRail = shouldAutoOpenRailForStart(
      options.startSource || "inline",
      state.railVisible
    );
    const startSentenceIndex = Number.isInteger(options.startSentenceIndex)
      ? options.startSentenceIndex
      : 0;
    const queueStartBlockId = resolveQueueStartBlockId(state.blocks, blockId, {
      mode: options.queueStartMode || "exact",
    });
    const playbackBlockId = queueStartBlockId || blockId;
    const queue = buildReadingQueue(state.blocks, playbackBlockId);
    if (!queue.length) {
      if (shouldOpenRail || state.railVisible) {
        openRail();
      }
      setStatus(
        "Unavailable",
        "No readable blocks were found on this page yet.",
        "Try a page with paragraph content or use the manual reader for pasted text."
      );
      return;
    }

    cancelHoverChipHide();
    if (!isSentenceJumpModeActive()) {
      pinHoverChipToBlock(playbackBlockId);
    }
    const currentIndex = queue.findIndex((block) => block.id === playbackBlockId);
    state.currentQueue = queue;
    state.currentIndex = Math.max(0, currentIndex);
    state.queueStartBlockId = String(queue[0] && queue[0].id ? queue[0].id : "").trim();
    state.queueCursorBlockId = String(
      queue[state.currentIndex] && queue[state.currentIndex].id
        ? queue[state.currentIndex].id
        : ""
    ).trim();
    if (shouldOpenRail) {
      openRail();
    }
    await beginBlockPlayback(queue[state.currentIndex], {
      startSource: options.startSource || "inline",
      startSentenceIndex,
    });
  }

  async function pauseReading() {
    cancelPendingAdvance();
    await chrome.runtime.sendMessage({
      type: "pause_speaking",
    }).catch(() => {});
    state.isPlaying = false;
    state.isPaused = true;
    if (state.activeBlockId) {
      syncQueueCursorBlock(state.activeBlockId);
    }
    state.hoverChipBlockId = state.activeBlockId || state.hoverChipBlockId;
    setStatus(
      "Paused",
      state.currentPreview,
      "Resume to keep reading from the current block."
    );
    updateHoverButtonPosition();
  }

  async function resumeReading() {
    cancelPendingAdvance();
    if (!state.activeBlockId && state.currentQueue.length) {
      const nextBlock =
        getQueueBlockById(state.queueCursorBlockId) || getCurrentBlock();
      if (nextBlock) {
        await beginBlockPlayback(nextBlock, {
          startSource: state.railVisible ? "explicit" : "inline",
          startSentenceIndex: 0,
        });
        return;
      }
    }
    await chrome.runtime.sendMessage({
      type: "resume_speaking",
    }).catch(() => {});
    state.isPlaying = true;
    state.isPaused = false;
    state.hoverChipBlockId = state.activeBlockId || state.hoverChipBlockId;
    setStatus(
      "Reading",
      state.currentPreview,
      `${state.currentIndex + 1} of ${state.currentQueue.length}.`
    );
    updateHoverButtonPosition();
  }

  async function stopReading(options = {}) {
    await chrome.runtime.sendMessage({
      type: "stop_speaking",
    }).catch(() => {});
    cancelHoverChipHide();
    resetQueueState(false);
    if (!options.preserveRail) {
      hideRail();
    }
    setStatus(
      "Ready",
      options.reason || "Hover a paragraph to read from there.",
      "Start reading inline from the page, or open Reader when you want the side rail."
    );
    updateHoverButtonPosition();
  }

  function advanceAfterEnd(blockId) {
    if (state.activeBlockId !== blockId) {
      return;
    }

    clearSentenceHighlight();
    const nextStep = advanceQueueIndex(state.currentIndex, state.currentQueue.length);
    if (nextStep.isComplete) {
      finishQueueRun();
      return;
    }

    const nextBlock = state.currentQueue[nextStep.nextIndex];
    const nextBlockId = String(nextBlock && nextBlock.id ? nextBlock.id : "").trim();
    if (!nextBlockId) {
      finishQueueRun();
      return;
    }
    state.currentIndex = nextStep.nextIndex;
    state.activeBlockId = "";
    state.activeSentenceIndex = -1;
    state.activeSentenceCount = 0;
    state.queueCursorBlockId = nextBlockId;
    const advanceDelayMs = resolveAutoAdvanceDelayMs(nextBlock);
    cancelPendingAdvance();
    state.pendingAdvanceTimer = window.setTimeout(() => {
      state.pendingAdvanceTimer = 0;
      if (state.isPaused || state.activeBlockId || state.queueCursorBlockId !== nextBlockId) {
        return;
      }
      const queuedBlock = getQueueBlockById(nextBlockId);
      if (!queuedBlock) {
        finishQueueRun();
        return;
      }
      void beginBlockPlayback(queuedBlock, {
        startSentenceIndex: 0,
        transitionSource: "auto_advance",
      });
    }, advanceDelayMs);
  }

  function handlePointerMove(event) {
    if (state.hoverFrame) {
      cancelAnimationFrame(state.hoverFrame);
    }
    state.hoverFrame = window.requestAnimationFrame(() => {
      if (isSentenceJumpModeActive()) {
        cancelHoverChipRetarget();
        state.hoveredBlockId = "";
        updateHoverButtonPosition();
        const sentenceTarget = resolveSentenceTargetFromPoint(
          event.clientX,
          event.clientY,
          event.target
        );
        if (
          sentenceTarget &&
          !(
            sentenceTarget.blockId === state.activeBlockId &&
            sentenceTarget.sentenceIndex === state.activeSentenceIndex
          )
        ) {
          if (
            sentenceTarget.blockId !== state.hoveredSentenceBlockId ||
            sentenceTarget.sentenceIndex !== state.hoveredSentenceIndex
          ) {
            applySentenceHoverTarget(
              sentenceTarget.blockId,
              sentenceTarget.sentenceIndex
            );
          }
          return;
        }

        clearSentenceHoverTarget();
        return;
      }

      clearSentenceHoverTarget();
      const blockId = resolveSurvivingBlockIdFromPoint(
        event.clientX,
        event.clientY,
        event.target
      );
      if (!blockId) {
        state.hoveredBlockId = "";
        cancelHoverChipRetarget();
        if (!state.isHoverChipHovered) {
          scheduleHideHoverChip();
        }
        render();
        return;
      }
      cancelHoverChipHide();
      state.hoveredBlockId = blockId;
      if (!state.hoverChipBlockId) {
        pinHoverChipToBlock(blockId);
        return;
      }
      if (blockId === state.hoverChipBlockId) {
        cancelHoverChipRetarget();
        updateHoverButtonPosition();
        render();
        return;
      }
      scheduleHoverChipRetarget(blockId);
      render();
    });
  }

  function handleSentenceJumpClick(event) {
    const sentenceTarget = resolveSentenceTargetFromPoint(
      event.clientX,
      event.clientY,
      event.target
    );

    if (
      !shouldHandleSentenceJumpClick({
        isJumpModeActive: isSentenceJumpModeActive(),
        button: event.button,
        hasModifier: Boolean(
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        ),
        insideUi: Boolean(
          state.ui?.host && event.composedPath?.().includes(state.ui.host)
        ),
        hasExpandedSelection: hasExpandedTextSelection(event.target),
        hasTarget: Boolean(sentenceTarget),
        isSameSentence: Boolean(
          sentenceTarget &&
            sentenceTarget.blockId === state.activeBlockId &&
            sentenceTarget.sentenceIndex === state.activeSentenceIndex
        ),
      })
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void startReadingFromSentence(
      sentenceTarget.blockId,
      sentenceTarget.sentenceIndex,
      {
        startSource: "sentence-jump",
      }
    );
  }

  function handleViewportChange() {
    if (isSentenceJumpModeActive()) {
      clearSentenceHoverTarget();
      updateHoverButtonPosition();
      return;
    }

    updateHoverButtonPosition();
  }

  function handlePageReaderEvent(message) {
    if (message.type !== "page_reader_event") {
      return false;
    }

    const sentenceIndex = Number.isInteger(message.sentenceIndex)
      ? message.sentenceIndex
      : -1;
    const sentenceCount = Math.max(0, Number(message.sentenceCount || 0));
    const sentenceLabel =
      sentenceIndex >= 0 && sentenceCount
        ? `Sentence ${sentenceIndex + 1} of ${sentenceCount}`
        : `Block ${state.currentIndex + 1} of ${state.currentQueue.length}`;

    if (message.event === "start") {
      if (message.blockId) {
        state.activeBlockId = message.blockId;
        state.hoverChipBlockId = message.blockId;
        syncQueueCursorBlock(message.blockId);
      }
      state.isPlaying = true;
      state.isPaused = false;
      applySentenceHighlight(message.blockId, sentenceIndex, sentenceCount);
      setStatus(
        "Reading",
        buildPreview(message.sentenceText || state.currentPreview, 84),
        `${sentenceLabel}. Block ${state.currentIndex + 1} of ${state.currentQueue.length}.`
      );
      focusActiveBlock();
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "sentence") {
      if (message.blockId) {
        state.activeBlockId = message.blockId;
        state.hoverChipBlockId = message.blockId;
        syncQueueCursorBlock(message.blockId);
      }
      state.isPlaying = true;
      state.isPaused = false;
      applySentenceHighlight(message.blockId, sentenceIndex, sentenceCount);
      setStatus(
        "Reading",
        buildPreview(message.sentenceText || state.currentPreview, 84),
        `${sentenceLabel}. Block ${state.currentIndex + 1} of ${state.currentQueue.length}.`
      );
      focusActiveBlock();
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "end") {
      advanceAfterEnd(message.blockId);
      return true;
    }

    if (message.event === "paused") {
      state.isPlaying = false;
      state.isPaused = true;
      state.hoverChipBlockId = state.activeBlockId || state.hoverChipBlockId;
      setStatus(
        "Paused",
        buildPreview(message.sentenceText || state.currentPreview, 84),
        `${sentenceLabel}. Resume to keep reading from the current block.`
      );
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "resumed") {
      state.isPlaying = true;
      state.isPaused = false;
      state.hoverChipBlockId = state.activeBlockId || state.hoverChipBlockId;
      syncQueueCursorBlock(message.blockId || state.activeBlockId);
      applySentenceHighlight(message.blockId, sentenceIndex, sentenceCount);
      setStatus(
        "Reading",
        buildPreview(message.sentenceText || state.currentPreview, 84),
        `${sentenceLabel}. Block ${state.currentIndex + 1} of ${state.currentQueue.length}.`
      );
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "stopped" || message.event === "cancelled") {
      resetQueueState(true);
      setStatus(
        "Stopped",
        "Playback stopped.",
        "Hover another paragraph or use the rail controls to start again."
      );
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "interrupted") {
      cancelPendingAdvance();
      state.isPlaying = false;
      state.isPaused = false;
      syncQueueCursorBlock(message.blockId || state.activeBlockId || state.queueCursorBlockId);
      state.activeBlockId = "";
      clearSentenceHighlight();
      clearSentenceHoverTarget();
      clearMarkers();
      clearHoverChipState();
      setStatus(
        "Ready",
        "Page playback ended early.",
        "Choose another paragraph or press Play to restart the queue."
      );
      updateHoverButtonPosition();
      render();
      return true;
    }

    if (message.event === "error") {
      cancelPendingAdvance();
      state.isPlaying = false;
      state.isPaused = false;
      syncQueueCursorBlock(message.blockId || state.activeBlockId || state.queueCursorBlockId);
      state.activeBlockId = "";
      clearSentenceHighlight();
      clearSentenceHoverTarget();
      clearMarkers();
      clearHoverChipState();
      setStatus(
        "Error",
        message.error || "Edge could not continue page playback.",
        "Try another paragraph or rerun the voice check."
      );
      updateHoverButtonPosition();
      return true;
    }

    return false;
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local" || !changes[STATE_KEY]) {
      return;
    }
    state.prefs = sanitizeState(changes[STATE_KEY].newValue);
    render();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "page_reader_toggle_rail") {
      openRail();
      scanReadableBlocks();
      if (!state.blocks.length) {
        setStatus(
          "Unavailable",
          "No readable blocks were found on this page yet.",
          "Try a page with paragraph content or use the manual reader for pasted text."
        );
      }
      sendResponse({
        ok: true,
        blockCount: state.blocks.length,
      });
      return false;
    }

    if (handlePageReaderEvent(message || {})) {
      sendResponse({
        ok: true,
      });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener(handleStorageChange);

  void loadPrefs().then(() => {
    ensureUi();
    scanReadableBlocks();
    void reportPageSessionStart();
  });

  state.mutationObserver = new MutationObserver(() => {
    scheduleScan();
  });
  state.mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  document.addEventListener("mousemove", handlePointerMove, true);
  document.addEventListener("click", handleSentenceJumpClick, true);
  window.addEventListener("error", (event) => {
    reportContentExtensionError(event.error || event.message, {
      stack: event.error && event.error.stack ? event.error.stack : "",
      file: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportContentExtensionError(event.reason, {
      stack: event.reason && event.reason.stack ? event.reason.stack : "",
    });
  });
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
})();
