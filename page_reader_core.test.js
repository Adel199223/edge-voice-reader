"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  advanceQueueIndex,
  buildPreview,
  buildSpokenBlockText,
  buildSpokenPreview,
  buildReadingQueue,
  clampBoundaryProgress,
  isLikelyChatGptHost,
  normalizeSentenceStartIndex,
  normalizeReadableText,
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
} = require("./page_reader_core.js");

test("normalizeReadableText trims and collapses whitespace for readable blocks", () => {
  assert.equal(
    normalizeReadableText(" Hello\t\tworld \n\n\n from \r\n Edge "),
    "Hello world\n\nfrom\nEdge"
  );
});

test("isLikelyChatGptHost recognizes ChatGPT domains", () => {
  assert.equal(isLikelyChatGptHost("chatgpt.com"), true);
  assert.equal(isLikelyChatGptHost("chat.openai.com"), true);
  assert.equal(isLikelyChatGptHost("news.example.com"), false);
});

test("selectChatGptBlocks filters out composer and short/noisy content", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "a",
      order: 2,
      tagName: "p",
      text: "Short",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "b",
      order: 1,
      tagName: "p",
      text: "This is a real conversation paragraph that should be readable.",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "c",
      order: 3,
      tagName: "p",
      text: "This composer text should be ignored even if it is long enough to qualify.",
      insideMain: true,
      insideComposer: true,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["b"]
  );
});

test("selectArticleBlocks prefers main/article scoped readable content", () => {
  const blocks = selectArticleBlocks([
    {
      id: "nav-copy",
      order: 1,
      tagName: "p",
      text: "This navigation helper copy should not win when article content exists.",
      insideMain: false,
      insideArticle: false,
      insideDisallowed: true,
      isVisible: true,
    },
    {
      id: "article-copy",
      order: 2,
      tagName: "p",
      text: "This is the core article paragraph that should be read out loud first.",
      insideMain: true,
      insideArticle: true,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["article-copy"]
  );
});

test("selectChatGptBlocks keeps short list items while filtering short standalone paragraphs", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "short-paragraph",
      order: 1,
      tagName: "p",
      text: "Short",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "list-item-1",
      order: 2,
      tagName: "li",
      text: "states",
      listRootId: "list-1",
      listKind: "unordered",
      listDepth: 1,
      listItemIndex: 0,
      listItemCount: 3,
      listMarkerText: "bullet",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "list-item-2",
      order: 3,
      tagName: "li",
      text: "ports",
      listRootId: "list-1",
      listKind: "unordered",
      listDepth: 1,
      listItemIndex: 1,
      listItemCount: 3,
      listMarkerText: "bullet",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["list-item-1", "list-item-2"]
  );
  assert.equal(blocks[0].listRootId, "list-1");
  assert.equal(blocks[0].listKind, "unordered");
  assert.equal(blocks[0].listDepth, 1);
  assert.equal(blocks[0].listItemIndex, 0);
  assert.equal(blocks[0].listItemCount, 3);
  assert.equal(blocks[0].listMarkerText, "bullet");
});


test("buildSpokenBlockText and buildSpokenPreview add list speech prefixes without touching raw text", () => {
  assert.equal(
    buildSpokenBlockText("شغل OpenAI من جديد", "البند 3"),
    "البند 3 شغل OpenAI من جديد"
  );
  assert.equal(
    buildSpokenPreview("First item in the queue", "Bullet", 80),
    "Bullet First item in the queue"
  );
});

test("selectChatGptBlocks preserves list metadata and spoken previews", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "ordered-step",
      order: 1,
      tagName: "li",
      text: "ثبت Ava ثم اختبر ChatGPT مرة أخرى.",
      spokenText: "البند 2 ثبت Ava ثم اختبر ChatGPT مرة أخرى.",
      listKind: "ordered",
      listDepth: 2,
      listMarkerText: "2",
      spokenPrefix: "البند 2",
      langHint: "ar",
      documentLang: "ar",
      langRanges: [
        { start: 0, end: 8, langHint: "ar" },
        { start: 9, end: 12, langHint: "en-US" },
      ],
      parentReadableId: "",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.equal(blocks[0].preview, "البند 2 ثبت Ava ثم اختبر ChatGPT مرة أخرى.");
  assert.equal(blocks[0].listKind, "ordered");
  assert.equal(blocks[0].listDepth, 2);
  assert.equal(blocks[0].listMarkerText, "2");
  assert.equal(blocks[0].spokenPrefix, "البند 2");
  assert.equal(blocks[0].langRanges.length, 2);
});

test("selectChatGptBlocks drops nested list duplicates with identical text", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "list-item",
      order: 1,
      tagName: "li",
      text: "Run 1-2 Enhance passes.",
      spokenText: "Item 1 Run 1-2 Enhance passes.",
      listKind: "ordered",
      listDepth: 1,
      listMarkerText: "1",
      spokenPrefix: "Item 1",
      parentReadableId: "",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "list-copy",
      order: 2,
      tagName: "p",
      text: "Run 1-2 Enhance passes.",
      parentReadableId: "list-item",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["list-item"]
  );
});

test("selectChatGptBlocks keeps nested readable blocks when their text differs", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "step",
      order: 1,
      tagName: "li",
      text: "Review the sharpened result before moving on to the next capture.",
      parentReadableId: "",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "step-detail",
      order: 2,
      tagName: "p",
      text: "If the blur remains, reshoot instead of trying to repair the face.",
      parentReadableId: "step",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["step", "step-detail"]
  );
});

test("selectChatGptBlocks preserves list metadata and spoken previews for ordered items", () => {
  const [block] = selectChatGptBlocks([
    {
      id: "step-1",
      order: 1,
      tagName: "li",
      text: "Install Node.js before running the build.",
      spokenText: "1: Install Node.js before running the build.",
      spokenPrefix: "1:",
      listKind: "ordered",
      listDepth: 1,
      listMarkerText: "1",
      langHint: "en-US",
      documentLang: "ar",
      langRanges: [
        { start: 0, end: 2, langHint: "en-US" },
        { start: 3, end: 42, langHint: "en-US" },
      ],
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.equal(block.text, "Install Node.js before running the build.");
  assert.equal(block.spokenText, "1: Install Node.js before running the build.");
  assert.equal(block.preview, "1: Install Node.js before running the build.");
  assert.equal(block.listKind, "ordered");
  assert.equal(block.listDepth, 1);
  assert.equal(block.listMarkerText, "1");
  assert.equal(block.langHint, "en-US");
  assert.deepEqual(block.langRanges, [
    { start: 0, end: 2, langHint: "en-US" },
    { start: 3, end: 42, langHint: "en-US" },
  ]);
});

test("selectChatGptBlocks keeps unordered list prefixes metadata-only without changing raw text", () => {
  const [block] = selectChatGptBlocks([
    {
      id: "bullet-1",
      order: 1,
      tagName: "li",
      text: "تأكد من تحديث المتصفح أولاً",
      spokenText: "تأكد من تحديث المتصفح أولاً",
      spokenPrefix: "",
      listKind: "unordered",
      listDepth: 2,
      listMarkerText: "bullet",
      langHint: "ar",
      documentLang: "ar",
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.equal(block.text, "تأكد من تحديث المتصفح أولاً");
  assert.equal(block.spokenText, "تأكد من تحديث المتصفح أولاً");
  assert.equal(block.preview, "تأكد من تحديث المتصفح أولاً");
  assert.equal(block.listKind, "unordered");
  assert.equal(block.listDepth, 2);
  assert.equal(block.spokenPrefix, "");
});

test("selectArticleBlocks drops nested duplicates with identical text", () => {
  const blocks = selectArticleBlocks([
    {
      id: "article-list-item",
      order: 1,
      tagName: "li",
      text: "Keep the phone steady and smooth.",
      parentReadableId: "",
      insideMain: true,
      insideArticle: true,
      insideDisallowed: false,
      isVisible: true,
    },
    {
      id: "article-list-copy",
      order: 2,
      tagName: "p",
      text: "Keep the phone steady and smooth.",
      parentReadableId: "article-list-item",
      insideMain: true,
      insideArticle: true,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.deepEqual(
    blocks.map((block) => block.id),
    ["article-list-item"]
  );
});

test("buildReadingQueue starts from the chosen block and preserves order", () => {
  const queue = buildReadingQueue(
    [
      { id: "one", text: "First" },
      { id: "two", text: "Second" },
      { id: "three", text: "Third" },
    ],
    "two"
  );

  assert.deepEqual(
    queue.map((block) => block.id),
    ["two", "three"]
  );
  assert.equal(queue[0].queueIndex, 0);
  assert.equal(queue[0].queueLength, 2);
});

test("buildReadingQueue keeps exact starts for later list items", () => {
  const queue = buildReadingQueue(
    [
      { id: "list-item-1", text: "states", listRootId: "list-1" },
      { id: "list-item-2", text: "ports", listRootId: "list-1" },
      { id: "list-item-3", text: "academies", listRootId: "list-1" },
      { id: "after-list", text: "Collecting practices continue here." },
    ],
    "list-item-3"
  );

  assert.deepEqual(
    queue.map((block) => block.id),
    ["list-item-3", "after-list"]
  );
});

test("resolveQueueStartBlockId snaps list-root starts while preserving exact starts", () => {
  const blocks = [
    {
      id: "list-item-1",
      text: "states",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "list-item-2",
      text: "ports",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "list-item-3",
      text: "observatories",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "after-list",
      text: "Collecting practices continue here.",
      kind: "paragraph",
      listRootId: "",
    },
  ];

  assert.equal(
    resolveQueueStartBlockId(blocks, "list-item-3", { mode: "list-root" }),
    "list-item-1"
  );
  assert.equal(
    resolveQueueStartBlockId(blocks, "list-item-3", { mode: "exact" }),
    "list-item-3"
  );
});

test("resolveFirstAvailableBlockId picks the first surviving candidate in stable order", () => {
  assert.equal(
    resolveFirstAvailableBlockId(
      ["dropped-inner", "list-item-2", "list-item-1"],
      new Set(["list-item-2", "list-item-1"])
    ),
    "list-item-2"
  );
  assert.equal(
    resolveFirstAvailableBlockId(
      ["", "dropped-inner", "dropped-inner", "list-item-3", "list-item-2"],
      ["list-item-2", "list-item-3"]
    ),
    "list-item-3"
  );
  assert.equal(
    resolveFirstAvailableBlockId(["dropped-inner"], new Set(["list-item-1"])),
    ""
  );
});

test("advanceQueueIndex reports the next position and queue completion", () => {
  assert.deepEqual(advanceQueueIndex(0, 3), {
    nextIndex: 1,
    isComplete: false,
  });
  assert.deepEqual(advanceQueueIndex(2, 3), {
    nextIndex: 3,
    isComplete: true,
  });
  assert.deepEqual(advanceQueueIndex(-1, 0), {
    nextIndex: -1,
    isComplete: true,
  });
});

test("reconcileReadingQueue keeps the active block selected across rescans", () => {
  const blocks = [
    { id: "intro", text: "Intro" },
    { id: "paragraph", text: "Paragraph" },
    { id: "bullet-1", text: "Bullet 1" },
    { id: "bullet-2", text: "Bullet 2" },
  ];
  const previousQueue = buildReadingQueue(blocks, "paragraph");

  const nextState = reconcileReadingQueue(blocks, previousQueue, {
    queueStartBlockId: "paragraph",
    queueCursorBlockId: "bullet-1",
    activeBlockId: "bullet-1",
    currentIndex: 1,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["paragraph", "bullet-1", "bullet-2"]
  );
  assert.equal(nextState.currentIndex, 1);
  assert.equal(nextState.queueStartBlockId, "paragraph");
  assert.equal(nextState.queueCursorBlockId, "bullet-1");
  assert.equal(nextState.isComplete, false);
});

test("reconcileReadingQueue preserves the queued-next block during delayed auto-advance", () => {
  const blocks = [
    { id: "intro", text: "Intro" },
    { id: "paragraph", text: "Paragraph" },
    { id: "bullet-1", text: "Bullet 1" },
    { id: "bullet-2", text: "Bullet 2" },
  ];
  const previousQueue = buildReadingQueue(blocks, "paragraph");

  const nextState = reconcileReadingQueue(blocks, previousQueue, {
    queueStartBlockId: "paragraph",
    queueCursorBlockId: "bullet-1",
    activeBlockId: "",
    currentIndex: 1,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["paragraph", "bullet-1", "bullet-2"]
  );
  assert.equal(nextState.currentIndex, 1);
  assert.equal(nextState.queueCursorBlockId, "bullet-1");
  assert.equal(nextState.isComplete, false);
});

test("reconcileReadingQueue preserves the original queue scope when the start block disappears", () => {
  const previousQueue = buildReadingQueue(
    [
      { id: "lead-in", text: "Lead in" },
      { id: "paragraph", text: "Paragraph" },
      { id: "bullet-1", text: "Bullet 1" },
      { id: "bullet-2", text: "Bullet 2" },
    ],
    "paragraph"
  );
  const blocksAfterRescan = [
    { id: "lead-in", text: "Lead in" },
    { id: "bullet-1", text: "Bullet 1" },
    { id: "bullet-2", text: "Bullet 2" },
  ];

  const nextState = reconcileReadingQueue(blocksAfterRescan, previousQueue, {
    queueStartBlockId: "paragraph",
    queueCursorBlockId: "bullet-1",
    activeBlockId: "",
    currentIndex: 1,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["bullet-1", "bullet-2"]
  );
  assert.equal(nextState.queueStartBlockId, "bullet-1");
  assert.equal(nextState.currentIndex, 0);
  assert.equal(nextState.queueCursorBlockId, "bullet-1");
  assert.equal(nextState.isComplete, false);
});

test("reconcileReadingQueue advances to the next surviving unread block when the cursor disappears", () => {
  const previousQueue = buildReadingQueue(
    [
      { id: "paragraph", text: "Paragraph" },
      { id: "bullet-1", text: "Bullet 1" },
      { id: "bullet-2", text: "Bullet 2" },
    ],
    "paragraph"
  );
  const blocksAfterRescan = [
    { id: "paragraph", text: "Paragraph" },
    { id: "bullet-2", text: "Bullet 2" },
  ];

  const nextState = reconcileReadingQueue(blocksAfterRescan, previousQueue, {
    queueStartBlockId: "paragraph",
    queueCursorBlockId: "bullet-1",
    activeBlockId: "",
    currentIndex: 1,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["paragraph", "bullet-2"]
  );
  assert.equal(nextState.currentIndex, 1);
  assert.equal(nextState.queueCursorBlockId, "bullet-2");
  assert.equal(nextState.isComplete, false);
});

test("reconcileReadingQueue finishes cleanly when no unread cursor blocks survive the rescan", () => {
  const previousQueue = buildReadingQueue(
    [
      { id: "paragraph", text: "Paragraph" },
      { id: "bullet-1", text: "Bullet 1" },
    ],
    "paragraph"
  );
  const blocksAfterRescan = [{ id: "paragraph", text: "Paragraph" }];

  const nextState = reconcileReadingQueue(blocksAfterRescan, previousQueue, {
    queueStartBlockId: "paragraph",
    queueCursorBlockId: "bullet-1",
    activeBlockId: "",
    currentIndex: 1,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["paragraph"]
  );
  assert.equal(nextState.currentIndex, 1);
  assert.equal(nextState.queueCursorBlockId, "");
  assert.equal(nextState.isComplete, true);
});

test("reconcileReadingQueue keeps an exact later list-item queue without replaying earlier items", () => {
  const blocks = [
    {
      id: "list-item-1",
      text: "states",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "list-item-2",
      text: "ports",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "list-item-3",
      text: "academies",
      kind: "list-item",
      listRootId: "list-1",
    },
    {
      id: "after-list",
      text: "Collecting practices continue here.",
      kind: "paragraph",
      listRootId: "",
    },
  ];
  const previousQueue = buildReadingQueue(blocks, "list-item-3");

  const nextState = reconcileReadingQueue(blocks, previousQueue, {
    queueStartBlockId: "list-item-3",
    queueCursorBlockId: "list-item-3",
    activeBlockId: "list-item-3",
    currentIndex: 0,
  });

  assert.deepEqual(
    nextState.queue.map((block) => block.id),
    ["list-item-3", "after-list"]
  );
  assert.equal(nextState.currentIndex, 0);
  assert.equal(nextState.queueStartBlockId, "list-item-3");
  assert.equal(nextState.queueCursorBlockId, "list-item-3");
  assert.equal(nextState.isComplete, false);
});

test("resolveHoverChipActionTarget prefers the pinned chip target", () => {
  assert.equal(resolveHoverChipActionTarget("block-7", "block-2"), "block-7");
  assert.equal(resolveHoverChipActionTarget("", "block-2"), "block-2");
  assert.equal(resolveHoverChipActionTarget("", ""), "");
});

test("shouldKeepHoverChipVisible stays alive while the block or chip is hovered", () => {
  assert.equal(
    shouldKeepHoverChipVisible({
      hoveredBlockId: "block-2",
      pinnedBlockId: "block-2",
      isChipHovered: false,
    }),
    true
  );
  assert.equal(
    shouldKeepHoverChipVisible({
      hoveredBlockId: "",
      pinnedBlockId: "block-2",
      isChipHovered: true,
    }),
    true
  );
  assert.equal(
    shouldKeepHoverChipVisible({
      hoveredBlockId: "",
      pinnedBlockId: "block-2",
      isChipHovered: false,
    }),
    false
  );
});

test("resolveInlineChipState promotes the active block into a persistent pause or resume chip", () => {
  assert.deepEqual(
    resolveInlineChipState({
      activeBlockId: "block-3",
      hoveredBlockId: "block-1",
      pinnedBlockId: "block-1",
      isPlaying: true,
      isPaused: false,
    }),
    {
      targetBlockId: "block-3",
      mode: "pause",
      isPersistent: true,
      isVisible: true,
    }
  );

  assert.deepEqual(
    resolveInlineChipState({
      activeBlockId: "block-3",
      hoveredBlockId: "",
      pinnedBlockId: "block-1",
      isPlaying: false,
      isPaused: true,
    }),
    {
      targetBlockId: "block-3",
      mode: "resume",
      isPersistent: true,
      isVisible: true,
    }
  );

  assert.deepEqual(
    resolveInlineChipState({
      activeBlockId: "",
      hoveredBlockId: "block-1",
      pinnedBlockId: "block-1",
      isPlaying: false,
      isPaused: false,
      isChipHovered: false,
    }),
    {
      targetBlockId: "block-1",
      mode: "play",
      isPersistent: false,
      isVisible: true,
    }
  );
});

test("resolveHoverChipPlacement uses a left gutter when possible and falls back to an inset", () => {
  assert.deepEqual(
    resolveHoverChipPlacement(
      { left: 200, top: 100, height: 80 },
      { width: 1000, height: 800 },
      {
        chipSize: 24,
        gutterGap: 8,
        edgePadding: 10,
        topInset: 6,
        insetOffset: 6,
        lineHeight: 28,
      }
    ),
    {
      x: 168,
      y: 102,
      placement: "gutter",
    }
  );

  assert.deepEqual(
    resolveHoverChipPlacement(
      { left: 24, top: 50, height: 60 },
      { width: 300, height: 200 },
      {
        chipSize: 24,
        gutterGap: 8,
        edgePadding: 10,
        topInset: 6,
        insetOffset: 6,
        lineHeight: 24,
      }
    ),
    {
      x: 30,
      y: 50,
      placement: "inset",
    }
  );
});

test("segmentTextIntoSentences preserves stable ranges for sentence playback", () => {
  const sentences = segmentTextIntoSentences(
    "First sentence. Second sentence! Third sentence?"
  );

  assert.deepEqual(
    sentences.map((sentence) => sentence.text),
    ["First sentence.", "Second sentence!", "Third sentence?"]
  );
  assert.deepEqual(sentences[0], {
    index: 0,
    start: 0,
    end: 15,
    text: "First sentence.",
  });
  assert.deepEqual(sentences[1], {
    index: 1,
    start: 16,
    end: 32,
    text: "Second sentence!",
  });
});

test("normalizeSentenceStartIndex clamps sentence jumps into range", () => {
  assert.equal(normalizeSentenceStartIndex(-5, 3), 0);
  assert.equal(normalizeSentenceStartIndex(1, 3), 1);
  assert.equal(normalizeSentenceStartIndex(12, 3), 2);
  assert.equal(normalizeSentenceStartIndex(0, 0), -1);
});

test("resolveProjectionCharIndex maps a text-node offset back to normalized text", () => {
  const node = { id: "text-node" };
  const otherNode = { id: "other-text-node" };
  const segments = [
    {
      node,
      rawStartOffset: 0,
      rawEndOffset: 5,
      normStart: 0,
      normEnd: 5,
    },
    {
      node,
      rawStartOffset: 6,
      rawEndOffset: 10,
      normStart: 6,
      normEnd: 10,
    },
    {
      node: otherNode,
      rawStartOffset: 0,
      rawEndOffset: 4,
      normStart: 11,
      normEnd: 15,
    },
  ];

  assert.equal(resolveProjectionCharIndex(segments, node, 0), 0);
  assert.equal(resolveProjectionCharIndex(segments, node, 3), 3);
  assert.equal(resolveProjectionCharIndex(segments, node, 8), 8);
  assert.equal(resolveProjectionCharIndex(segments, otherNode, 2), 13);
  assert.equal(resolveProjectionCharIndex(segments, { id: "missing" }, 1), -1);
});

test("resolveSentenceIndexForCharIndex finds the sentence containing a char offset", () => {
  const sentences = segmentTextIntoSentences(
    "First sentence. Second sentence! Third sentence?"
  );

  assert.equal(resolveSentenceIndexForCharIndex(sentences, 0), 0);
  assert.equal(resolveSentenceIndexForCharIndex(sentences, 18), 1);
  assert.equal(resolveSentenceIndexForCharIndex(sentences, 200), 2);
});

test("resolveSingleSentenceFallbackTarget only resolves safe single-sentence jumps", () => {
  assert.deepEqual(
    resolveSingleSentenceFallbackTarget(
      {
        id: "list-item-2",
        kind: "list-item",
      },
      1
    ),
    {
      blockId: "list-item-2",
      sentenceIndex: 0,
    }
  );
  assert.equal(
    resolveSingleSentenceFallbackTarget(
      {
        id: "paragraph-2",
        kind: "paragraph",
      },
      2
    ),
    null
  );
});

test("shouldAutoOpenRailForStart keeps inline starts closed unless the rail is already visible", () => {
  assert.equal(shouldAutoOpenRailForStart("inline", false), false);
  assert.equal(shouldAutoOpenRailForStart("sentence-jump", false), false);
  assert.equal(shouldAutoOpenRailForStart("explicit", false), true);
  assert.equal(shouldAutoOpenRailForStart("inline", true), true);
});

test("shouldHandleSentenceJumpClick only allows deliberate sentence jumps", () => {
  assert.equal(
    shouldHandleSentenceJumpClick({
      isJumpModeActive: true,
      button: 0,
      hasModifier: false,
      insideUi: false,
      hasExpandedSelection: false,
      hasTarget: true,
      isSameSentence: false,
    }),
    true
  );

  assert.equal(
    shouldHandleSentenceJumpClick({
      isJumpModeActive: true,
      button: 0,
      hasModifier: false,
      insideUi: false,
      hasExpandedSelection: true,
      hasTarget: true,
      isSameSentence: false,
    }),
    false
  );

  assert.equal(
    shouldHandleSentenceJumpClick({
      isJumpModeActive: true,
      button: 0,
      hasModifier: false,
      insideUi: false,
      hasExpandedSelection: false,
      hasTarget: true,
      isSameSentence: true,
    }),
    false
  );
});

test("buildPreview and clampBoundaryProgress stay bounded", () => {
  const preview = buildPreview("x".repeat(140), 40);
  assert.equal(preview.endsWith("..."), true);

  const progress = clampBoundaryProgress("hello world", 6, 50);
  assert.equal(progress.start, 6);
  assert.equal(progress.end, 11);
});


test("selectChatGptBlocks preserves spoken list metadata for readable items", () => {
  const blocks = selectChatGptBlocks([
    {
      id: "ordered-step",
      order: 1,
      tagName: "li",
      text: "Install the extension package.",
      spokenText: "????? 3 Install the extension package.",
      listKind: "ordered",
      listDepth: 2,
      listMarkerText: "3",
      spokenPrefix: "????? 3",
      langHint: "ar",
      documentLang: "ar",
      langRanges: [{ start: 0, end: 7, langHint: "ar" }],
      insideMain: true,
      insideComposer: false,
      insideDisallowed: false,
      isVisible: true,
    },
  ]);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].spokenText, "????? 3 Install the extension package.");
  assert.equal(blocks[0].preview.startsWith("????? 3"), true);
  assert.equal(blocks[0].listKind, "ordered");
  assert.equal(blocks[0].listDepth, 2);
  assert.equal(blocks[0].listMarkerText, "3");
  assert.equal(blocks[0].spokenPrefix, "????? 3");
  assert.equal(blocks[0].langHint, "ar");
  assert.equal(blocks[0].documentLang, "ar");
  assert.deepEqual(blocks[0].langRanges, [{ start: 0, end: 7, langHint: "ar" }]);
});
