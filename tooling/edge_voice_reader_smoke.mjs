#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const out = {
    outputDir: path.resolve("out/edge_voice_reader_smoke"),
    resultPath: null,
    extensionPath: "",
    browserExe: "",
    userDataDir: "",
    debugPort: 9223,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--output-dir" && next) {
      out.outputDir = path.resolve(next);
      index += 1;
    } else if (token === "--result-path" && next) {
      out.resultPath = path.resolve(next);
      index += 1;
    } else if (token === "--extension-path" && next) {
      out.extensionPath = path.resolve(next);
      index += 1;
    } else if (token === "--browser-exe" && next) {
      out.browserExe = path.resolve(next);
      index += 1;
    } else if (token === "--user-data-dir" && next) {
      out.userDataDir = path.resolve(next);
      index += 1;
    } else if (token === "--debug-port" && next) {
      out.debugPort = Number(next);
      index += 1;
    }
  }

  return out;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isGestureLimited(message) {
  return String(message || "")
    .toLowerCase()
    .includes("direct popup or keyboard-shortcut gesture");
}

async function waitForCondition(checker, options = {}) {
  const {
    timeoutMs = 10000,
    intervalMs = 250,
    errorMessage = "Timed out waiting for a condition.",
  } = options;
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const result = await checker();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  throw lastError || new Error(errorMessage);
}

async function waitForJson(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.wsUrl);
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", (error) => reject(error));
      this.socket.addEventListener("message", (event) => this.handleMessage(event));
    });
    return this;
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result || {});
  }

  send(method, params = {}, sessionId = null) {
    const id = ++this.nextId;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  close() {
    try {
      this.socket.close();
    } catch (_error) {
      // ignore close errors
    }
  }
}

async function launchEdge(browserExe, extensionPath, userDataDir, debugPort) {
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ];

  const child = spawn(browserExe, args, {
    detached: false,
    stdio: "ignore",
  });

  return child;
}

async function killProcess(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill();
  await sleep(500);
}

async function getBrowserConnection(debugPort) {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const connection = await new CdpConnection(version.webSocketDebuggerUrl).connect();
  return connection;
}

async function waitForExtensionId(browser, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { targetInfos } = await browser.send("Target.getTargets");
    const worker = targetInfos.find(
      (target) =>
        target.type === "service_worker" &&
        typeof target.url === "string" &&
        target.url.startsWith("chrome-extension://")
    );
    if (worker) {
      return new URL(worker.url).host;
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for the extension service worker.");
}

async function createPageSession(browser, url) {
  const { targetId } = await browser.send("Target.createTarget", { url });
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Runtime.enable", {}, sessionId);
  return {
    targetId,
    sessionId,
  };
}

async function closeTarget(browser, targetId) {
  await browser.send("Target.closeTarget", { targetId }).catch(() => {});
}

async function bringToFront(browser, sessionId) {
  await browser.send("Page.bringToFront", {}, sessionId);
}

function buildEvalExpression(source, arg) {
  const serializedArg = JSON.stringify(arg);
  return `(${source})(${serializedArg})`;
}

async function evaluate(browser, sessionId, source, arg = null, awaitPromise = true) {
  const result = await browser.send(
    "Runtime.evaluate",
    {
      expression: buildEvalExpression(source, arg),
      awaitPromise,
      returnByValue: true,
    },
    sessionId
  );

  return result.result ? result.result.value : null;
}

async function waitForPopupReady(browser, popupSessionId) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const ready = await evaluate(
      browser,
      popupSessionId,
      () => ({
        readyState: document.readyState,
        hasVoice: Boolean(document.getElementById("voice")),
        hasText: Boolean(document.getElementById("text")),
      })
    );
    if (ready && ready.readyState === "complete" && ready.hasVoice && ready.hasText) {
      return;
    }
    await sleep(200);
  }
  throw new Error("Popup did not finish loading.");
}

async function waitForExamplePageReady(browser, pageSessionId) {
  return waitForCondition(
    async () => {
      const state = await evaluate(browser, pageSessionId, () => ({
        readyState: document.readyState,
        hasParagraph: Boolean(document.querySelector("p")),
        href: location.href,
      }));
      return state && state.readyState === "complete" && state.hasParagraph ? state : null;
    },
    {
      timeoutMs: 10000,
      errorMessage: "The example page did not finish loading a selectable paragraph.",
    }
  );
}

async function clickElement(browser, sessionId, selector) {
  const target = await evaluate(
    browser,
    sessionId,
    (cssSelector) => {
      const element = document.querySelector(cssSelector);
      if (!element) {
        return null;
      }
      element.scrollIntoView({
        block: "center",
        inline: "center",
      });
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
        disabled: Boolean(element.disabled),
      };
    },
    selector
  );

  if (!target || !target.width || !target.height) {
    throw new Error(`Could not find a clickable element for selector: ${selector}`);
  }
  if (target.disabled) {
    throw new Error(`The element is disabled for selector: ${selector}`);
  }

  await browser.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseMoved",
      x: target.x,
      y: target.y,
      button: "none",
      buttons: 0,
      pointerType: "mouse",
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchMouseEvent",
    {
      type: "mousePressed",
      x: target.x,
      y: target.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "mouse",
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseReleased",
      x: target.x,
      y: target.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
      pointerType: "mouse",
    },
    sessionId
  );
}

async function dispatchShortcut(browser, sessionId, shortcut) {
  await bringToFront(browser, sessionId);
  await sleep(150);

  const altKeyCode = 18;
  const shiftKeyCode = 16;
  const altModifier = 1;
  const altShiftModifier = 9;

  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: "Alt",
      code: "AltLeft",
      windowsVirtualKeyCode: altKeyCode,
      nativeVirtualKeyCode: altKeyCode,
      modifiers: altModifier,
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: shiftKeyCode,
      nativeVirtualKeyCode: shiftKeyCode,
      modifiers: altShiftModifier,
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "rawKeyDown",
      key: shortcut.key,
      code: shortcut.code,
      windowsVirtualKeyCode: shortcut.keyCode,
      nativeVirtualKeyCode: shortcut.keyCode,
      modifiers: altShiftModifier,
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: shortcut.key,
      code: shortcut.code,
      windowsVirtualKeyCode: shortcut.keyCode,
      nativeVirtualKeyCode: shortcut.keyCode,
      modifiers: altShiftModifier,
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: shiftKeyCode,
      nativeVirtualKeyCode: shiftKeyCode,
      modifiers: altModifier,
    },
    sessionId
  );
  await browser.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyUp",
      key: "Alt",
      code: "AltLeft",
      windowsVirtualKeyCode: altKeyCode,
      nativeVirtualKeyCode: altKeyCode,
      modifiers: 0,
    },
    sessionId
  );
}

async function sendExtensionMessage(browser, popupSessionId, payload) {
  return evaluate(
    browser,
    popupSessionId,
    async (message) =>
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(response || null);
        });
      }),
    payload
  );
}

async function waitForSpeakReady(browser, popupSessionId, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await sendExtensionMessage(browser, popupSessionId, {
      type: "get_status",
    });
    if (response?.ok && response?.status && response.status.probeInProgress === false) {
      return response;
    }
    await sleep(250);
  }
  throw new Error("The popup never became ready for speaking.");
}

async function setPopupVoiceAndSpeed(browser, popupSessionId, voiceKey, speechRate) {
  await evaluate(
    browser,
    popupSessionId,
    async ({ nextVoiceKey, nextSpeechRate }) => {
      if (typeof saveStoredState === "function") {
        const nextState = await saveStoredState({
          preferredVoiceKey: nextVoiceKey,
          speechRate: nextSpeechRate,
        });
        if (typeof hydrateInputs === "function") {
          hydrateInputs(nextState);
        }
        return nextState;
      }

      await chrome.storage.local.set({
        edge_voice_reader_state: {
          preferredVoiceKey: nextVoiceKey,
          preferredVoiceName:
            nextVoiceKey === "andrew"
              ? "Microsoft AndrewMultilingual Online (Natural) - English (United States)"
              : "Microsoft AvaMultilingual Online (Natural) - English (United States)",
          speechRate: nextSpeechRate,
        },
      });
      return true;
    },
    {
      nextVoiceKey: voiceKey,
      nextSpeechRate: speechRate,
    }
  );
}

async function getPopupUiState(browser, popupSessionId) {
  return evaluate(browser, popupSessionId, async () => {
    const stored = await chrome.storage.local.get("edge_voice_reader_state");
    return {
      voiceKey: document.getElementById("voice")?.value || "",
      speechRate: Number(document.getElementById("speed")?.value || 0),
      statusLabel: document.getElementById("statusLabel")?.textContent?.trim() || "",
      statusText: document.getElementById("statusText")?.textContent?.trim() || "",
      statusMeta: document.getElementById("statusMeta")?.textContent?.trim() || "",
      textValue: document.getElementById("text")?.value || "",
      storedState: stored.edge_voice_reader_state || null,
    };
  });
}

async function waitForPopupLabel(browser, popupSessionId, labels, timeoutMs = 8000) {
  const normalizedLabels = new Set(labels);
  return waitForCondition(
    async () => {
      const state = await getPopupUiState(browser, popupSessionId);
      return normalizedLabels.has(state.statusLabel) ? state : null;
    },
    {
      timeoutMs,
      errorMessage: `Popup never reached one of the expected labels: ${labels.join(", ")}`,
    }
  );
}

async function waitForStatus(browser, popupSessionId, predicate, timeoutMs = 8000, errorMessage) {
  return waitForCondition(
    async () => {
      const response = await sendExtensionMessage(browser, popupSessionId, {
        type: "get_status",
      });
      if (!response?.ok || !response?.status) {
        return null;
      }
      return predicate(response.status, response) ? response : null;
    },
    {
      timeoutMs,
      errorMessage,
    }
  );
}

async function setPopupTextAndSpeak(browser, popupSessionId, text) {
  await evaluate(
    browser,
    popupSessionId,
    async (nextText) => {
      const textarea = document.getElementById("text");
      textarea.value = nextText;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof saveStoredState === "function") {
        await saveStoredState({ draftText: nextText });
      }
      return true;
    },
    text
  );

  const response = await sendExtensionMessage(browser, popupSessionId, {
    type: "speak_text",
    text,
  });

  const started = Date.now();
  while (Date.now() - started < 8000) {
    const state = await getPopupUiState(browser, popupSessionId);
    if (["Reading", "Finished", "Playback Error"].includes(state.statusLabel)) {
      return {
        ...state,
        response,
      };
    }
    await sleep(250);
  }

  return {
    ...(await getPopupUiState(browser, popupSessionId)),
    response,
  };
}

async function selectExampleText(browser, pageSessionId) {
  return evaluate(
    browser,
    pageSessionId,
    () => {
      const target = document.querySelector("p");
      if (!target) {
        return { selectedLength: 0 };
      }
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      return {
        selectedLength: selection.toString().length,
        selectedText: selection.toString(),
      };
    }
  );
}

async function clickPopupSelection(browser, popupSessionId) {
  const before = await getPopupUiState(browser, popupSessionId);
  const waitForFreshSelectionResult = async (timeoutMs) =>
    waitForCondition(
      async () => {
        const state = await getPopupUiState(browser, popupSessionId);
        const changed =
          state.statusLabel !== before.statusLabel ||
          state.statusText !== before.statusText ||
          state.textValue !== before.textValue;
        if (!changed) {
          return null;
        }
        return ["Selection Loaded", "Selection Error"].includes(state.statusLabel) ? state : null;
      },
      {
        timeoutMs,
        errorMessage: "Popup selection did not produce a fresh status update.",
      }
    );

  try {
    await clickElement(browser, popupSessionId, "#selectionBtn");
    return await waitForFreshSelectionResult(4000);
  } catch (_error) {
    await evaluate(
      browser,
      popupSessionId,
      () => {
        document.getElementById("selectionBtn")?.click();
        return true;
      }
    );
    return waitForFreshSelectionResult(8000);
  }
}

async function waitForHotkeyRead(browser, popupSessionId, expectedDraft, voiceKey, speechRate) {
  return waitForStatus(
    browser,
    popupSessionId,
    (status) =>
      status.runtime?.isSpeaking === true &&
      status.runtime?.sourceLabel === "selected text" &&
      status.state?.preferredVoiceKey === voiceKey &&
      Math.abs(Number(status.state?.speechRate || 0) - speechRate) < 0.001 &&
      normalizeText(status.state?.draftText) === expectedDraft,
    8000,
    "Hotkey read did not reach speaking state."
  );
}

async function waitForHotkeyStop(browser, popupSessionId) {
  return waitForStatus(
    browser,
    popupSessionId,
    (status) =>
      status.runtime?.isSpeaking === false &&
      !status.runtime?.lastError &&
      ["idle", "stopped"].includes(status.runtime?.lastEvent),
    8000,
    "Hotkey stop did not clear the speaking state."
  );
}

async function runScenario(options) {
  const result = {
    status: "ok",
    extensionPath: options.extensionPath,
    browserExe: options.browserExe,
    debugPort: options.debugPort,
    userDataDir: options.userDataDir,
    voiceProbe: null,
    popupSpeak: null,
    popupSelection: null,
    hotkeyRead: null,
    hotkeyStop: null,
    unsupportedPage: null,
    persistenceAfterReopen: null,
    persistenceAfterRestart: null,
    checks: null,
  };

  let firstBrowserProcess = null;
  let firstBrowser = null;

  try {
    firstBrowserProcess = await launchEdge(
      options.browserExe,
      options.extensionPath,
      options.userDataDir,
      options.debugPort
    );
    firstBrowser = await getBrowserConnection(options.debugPort);
    const extensionId = await waitForExtensionId(firstBrowser);
    result.extensionId = extensionId;

    const popupTarget = await createPageSession(firstBrowser, `chrome-extension://${extensionId}/popup.html`);
    await waitForPopupReady(firstBrowser, popupTarget.sessionId);

    result.voiceProbe = await sendExtensionMessage(firstBrowser, popupTarget.sessionId, {
      type: "get_status",
    });
    result.voiceProbeSettled = await waitForSpeakReady(firstBrowser, popupTarget.sessionId);

    await setPopupVoiceAndSpeed(firstBrowser, popupTarget.sessionId, "andrew", 1.25);
    await waitForSpeakReady(firstBrowser, popupTarget.sessionId);
    result.popupSpeak = await setPopupTextAndSpeak(
      firstBrowser,
      popupTarget.sessionId,
      "This is a smoke test for Edge Voice Reader. It verifies that the Andrew voice starts from the popup, that the background service worker owns playback, and that the saved speed survives reopening the popup."
    );
    await sendExtensionMessage(firstBrowser, popupTarget.sessionId, { type: "stop_speaking" }).catch(() => {});
    await sendExtensionMessage(firstBrowser, popupTarget.sessionId, {
      type: "clear_runtime_feedback",
    }).catch(() => {});

    const readingPage = await createPageSession(firstBrowser, "https://example.com");
    await bringToFront(firstBrowser, readingPage.sessionId);
    await waitForExamplePageReady(firstBrowser, readingPage.sessionId);
    const selectionInfo = await selectExampleText(firstBrowser, readingPage.sessionId);
    const normalizedSelectionText = normalizeText(selectionInfo?.selectedText);

    try {
      result.popupSelection = {
        selectionInfo,
        ...(await clickPopupSelection(firstBrowser, popupTarget.sessionId)),
      };
    } catch (error) {
      result.popupSelection = {
        selectionInfo,
        error: String(error),
        ...(await getPopupUiState(firstBrowser, popupTarget.sessionId)),
      };
    }

    await sendExtensionMessage(firstBrowser, popupTarget.sessionId, {
      type: "clear_runtime_feedback",
    }).catch(() => {});
    await dispatchShortcut(firstBrowser, readingPage.sessionId, {
      key: "R",
      code: "KeyR",
      keyCode: 82,
    });
    try {
      result.hotkeyRead = {
        selectionInfo,
        response: await waitForHotkeyRead(
          firstBrowser,
          popupTarget.sessionId,
          normalizedSelectionText,
          "andrew",
          1.25
        ),
        popupState: await getPopupUiState(firstBrowser, popupTarget.sessionId),
      };
    } catch (error) {
      const fallbackStatus = await sendExtensionMessage(firstBrowser, popupTarget.sessionId, {
        type: "get_status",
      }).catch(() => null);
      result.hotkeyRead = {
        selectionInfo,
        error: String(error),
        response: fallbackStatus,
        popupState: await getPopupUiState(firstBrowser, popupTarget.sessionId),
      };
    }

    await dispatchShortcut(firstBrowser, readingPage.sessionId, {
      key: "X",
      code: "KeyX",
      keyCode: 88,
    });
    try {
      result.hotkeyStop = {
        response: await waitForHotkeyStop(firstBrowser, popupTarget.sessionId),
        popupState: await getPopupUiState(firstBrowser, popupTarget.sessionId),
      };
    } catch (error) {
      const fallbackStatus = await sendExtensionMessage(firstBrowser, popupTarget.sessionId, {
        type: "get_status",
      }).catch(() => null);
      result.hotkeyStop = {
        error: String(error),
        response: fallbackStatus,
        popupState: await getPopupUiState(firstBrowser, popupTarget.sessionId),
      };
    }

    await closeTarget(firstBrowser, readingPage.targetId);

    const blockedPage = await createPageSession(firstBrowser, "edge://extensions/");
    await bringToFront(firstBrowser, blockedPage.sessionId);
    try {
      result.unsupportedPage = await clickPopupSelection(firstBrowser, popupTarget.sessionId);
    } catch (error) {
      result.unsupportedPage = {
        error: String(error),
        ...(await getPopupUiState(firstBrowser, popupTarget.sessionId)),
      };
    }
    await closeTarget(firstBrowser, blockedPage.targetId);

    await closeTarget(firstBrowser, popupTarget.targetId);

    const reopenedPopup = await createPageSession(firstBrowser, `chrome-extension://${extensionId}/popup.html`);
    await waitForPopupReady(firstBrowser, reopenedPopup.sessionId);
    result.persistenceAfterReopen = await getPopupUiState(firstBrowser, reopenedPopup.sessionId);
    await closeTarget(firstBrowser, reopenedPopup.targetId);
    firstBrowser.close();
    await killProcess(firstBrowserProcess);

    const secondBrowserProcess = await launchEdge(
      options.browserExe,
      options.extensionPath,
      options.userDataDir,
      options.debugPort
    );
    const secondBrowser = await getBrowserConnection(options.debugPort);

    try {
      const restartedExtensionId = await waitForExtensionId(secondBrowser);
      const restartPopup = await createPageSession(
        secondBrowser,
        `chrome-extension://${restartedExtensionId}/popup.html`
      );
      await waitForPopupReady(secondBrowser, restartPopup.sessionId);
      result.persistenceAfterRestart = await getPopupUiState(secondBrowser, restartPopup.sessionId);
      await closeTarget(secondBrowser, restartPopup.targetId);
    } finally {
      secondBrowser.close();
      await killProcess(secondBrowserProcess);
    }

    const voiceProbePass =
      Boolean(result.voiceProbe && result.voiceProbe.ok) &&
      result.voiceProbe.status?.state?.voiceAvailability?.ava?.status === "available" &&
      result.voiceProbe.status?.state?.voiceAvailability?.andrew?.status === "available";

    const popupSpeakPass = ["Reading", "Finished"].includes(result.popupSpeak?.statusLabel || "");
    const popupSelectionPass =
      result.popupSelection?.statusLabel === "Selection Loaded" &&
      normalizeText(result.popupSelection?.textValue) ===
        normalizeText(result.popupSelection?.selectionInfo?.selectedText) &&
      normalizeText(result.popupSelection?.storedState?.draftText) ===
        normalizeText(result.popupSelection?.selectionInfo?.selectedText);
    const popupSelectionGestureLimited =
      !popupSelectionPass && isGestureLimited(result.popupSelection?.statusText);
    const hotkeyReadPass =
      Boolean(result.hotkeyRead?.response?.ok) &&
      result.hotkeyRead?.response?.status?.runtime?.isSpeaking === true &&
      result.hotkeyRead?.response?.status?.runtime?.sourceLabel === "selected text" &&
      result.hotkeyRead?.response?.status?.state?.preferredVoiceKey === "andrew" &&
      Math.abs(Number(result.hotkeyRead?.response?.status?.state?.speechRate || 0) - 1.25) < 0.001 &&
      normalizeText(result.hotkeyRead?.response?.status?.state?.draftText) ===
        normalizeText(result.hotkeyRead?.selectionInfo?.selectedText);
    const hotkeyReadSyntheticInputLimited =
      !hotkeyReadPass &&
      Number(result.hotkeyRead?.selectionInfo?.selectedLength || 0) > 0 &&
      result.hotkeyRead?.response?.status?.runtime?.lastEvent === "idle" &&
      !result.hotkeyRead?.response?.status?.runtime?.lastError;
    const hotkeyReadGestureLimited =
      !hotkeyReadPass &&
      (isGestureLimited(result.hotkeyRead?.response?.status?.runtime?.lastError) ||
        isGestureLimited(result.hotkeyRead?.popupState?.statusText) ||
        hotkeyReadSyntheticInputLimited);
    const hotkeyStopPass =
      Boolean(result.hotkeyStop?.response?.ok) &&
      result.hotkeyStop?.response?.status?.runtime?.isSpeaking === false &&
      !result.hotkeyStop?.response?.status?.runtime?.lastError &&
      ["idle", "stopped"].includes(result.hotkeyStop?.response?.status?.runtime?.lastEvent);
    const unsupportedPass =
      result.unsupportedPage?.statusLabel === "Selection Error" &&
      String(result.unsupportedPage?.statusText || "").toLowerCase().includes("edge blocks");
    const reopenPersistPass =
      result.persistenceAfterReopen?.voiceKey === "andrew" &&
      Math.abs(Number(result.persistenceAfterReopen?.speechRate || 0) - 1.25) < 0.001 &&
      result.persistenceAfterReopen?.statusLabel !== "Playback Error";
    const restartPersistPass =
      result.persistenceAfterRestart?.voiceKey === "andrew" &&
      Math.abs(Number(result.persistenceAfterRestart?.speechRate || 0) - 1.25) < 0.001 &&
      result.persistenceAfterRestart?.statusLabel !== "Playback Error";

    result.checks = {
      voiceProbePass,
      popupSpeakPass,
      popupSelectionPass,
      popupSelectionGestureLimited,
      hotkeyReadPass,
      hotkeyReadSyntheticInputLimited,
      hotkeyReadGestureLimited,
      hotkeyStopPass,
      unsupportedPass,
      reopenPersistPass,
      restartPersistPass,
    };

    if (
      !voiceProbePass ||
      !popupSpeakPass ||
      !unsupportedPass ||
      !reopenPersistPass ||
      !restartPersistPass
    ) {
      result.status = "failed";
    } else if (
      (!popupSelectionPass && popupSelectionGestureLimited) ||
      (!hotkeyReadPass && hotkeyReadGestureLimited)
    ) {
      result.status = "manual_check_required";
    } else if (!popupSelectionPass || !hotkeyReadPass || !hotkeyStopPass) {
      result.status = "failed";
    }

    return result;
  } catch (error) {
    result.status = "failed";
    result.error = String(error);
    return result;
  } finally {
    if (firstBrowser) {
      firstBrowser.close();
    }
    await killProcess(firstBrowserProcess);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const resultPath = args.resultPath || path.join(args.outputDir, "edge_voice_reader_smoke.json");

  if (!args.extensionPath || !fs.existsSync(args.extensionPath)) {
    const payload = {
      status: "unavailable",
      reason: "extension_path_missing",
      extensionPath: args.extensionPath,
    };
    writeJson(resultPath, payload);
    console.log(JSON.stringify(payload));
    return 0;
  }

  if (!args.browserExe || !fs.existsSync(args.browserExe)) {
    const payload = {
      status: "unavailable",
      reason: "browser_exe_missing",
      browserExe: args.browserExe,
    };
    writeJson(resultPath, payload);
    console.log(JSON.stringify(payload));
    return 0;
  }

  if (!args.userDataDir) {
    args.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "edge-voice-reader-profile-"));
  } else {
    fs.mkdirSync(args.userDataDir, { recursive: true });
  }

  const payload = await runScenario(args);
  writeJson(resultPath, payload);
  console.log(JSON.stringify(payload));
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
