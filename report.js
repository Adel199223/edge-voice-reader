"use strict";

const refreshButton = document.getElementById("refreshButton");
const copyButton = document.getElementById("copyButton");
const clearButton = document.getElementById("clearButton");
const summaryList = document.getElementById("summaryList");
const counterGrid = document.getElementById("counterGrid");
const eventList = document.getElementById("eventList");
const emptyState = document.getElementById("emptyState");
const feedback = document.getElementById("feedback");

let latestReport = null;
let refreshTimer = 0;

function setFeedback(message, isError = false) {
  feedback.textContent = message || "";
  feedback.style.color = isError ? "#b42318" : "#5d6d83";
}

async function requestBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.ok !== true) {
    throw new Error(
      response && response.error ? response.error : "Edge Voice Reader could not complete the report request."
    );
  }
  return response;
}

function formatDateTime(value) {
  const numeric = Number(value || 0);
  if (!numeric) {
    return "Not yet";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(numeric));
}

function formatEventType(type) {
  return String(type || "unknown")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLatencySample(summary) {
  const sampleCount = Math.max(
    0,
    Math.trunc(Number(summary && summary.startLatencySampleCount ? summary.startLatencySampleCount : 0))
  );
  return sampleCount
    ? `${sampleCount} started attempt${sampleCount === 1 ? "" : "s"}`
    : "No started attempts yet";
}

function formatLatencyMs(value, sampleCount) {
  const numeric = Math.max(0, Math.trunc(Number(value || 0)));
  return sampleCount > 0 && numeric > 0
    ? `${numeric} ms`
    : "No started attempts yet";
}

function renderSummary(report) {
  const summary = report && report.summary ? report.summary : {};
  const status = report && report.status ? report.status : {};
  const runtime = status.runtime || {};
  const availability = status.selectedVoiceAvailability || {};
  const state = status.state || {};
  const selectedVoice = status.selectedVoice || {};
  const latencySampleCount = Math.max(
    0,
    Math.trunc(Number(summary.startLatencySampleCount || 0))
  );

  const playbackState = runtime.lastError
    ? "Error"
    : runtime.isPaused
      ? "Paused"
      : runtime.isSpeaking
        ? "Reading"
        : runtime.lastEvent
          ? formatEventType(runtime.lastEvent)
          : "Idle";

  const items = [
    ["Playback", playbackState],
    [
      "Selected Voice",
      selectedVoice.label
        ? `${selectedVoice.label} at ${(Number(state.speechRate || 1)).toFixed(2)}x`
        : "Unavailable",
    ],
    ["Voice Check", availability.status ? formatEventType(availability.status) : "Unknown"],
    ["Last Source", runtime.sourceLabel || "No recent source"],
    [
      "Text Length",
      Number(runtime.textLength || 0)
        ? `${Math.trunc(Number(runtime.textLength || 0))} chars`
        : "No recent text",
    ],
    ["Last Error", runtime.lastError || "No recent runtime error"],
    [
      "Latest Settled Failure",
      summary.lastFailureMessage || "No settled failure in the latest attempt",
    ],
    ["Latency Sample", formatLatencySample(summary)],
    [
      "Median Start",
      formatLatencyMs(summary.startLatencyMedianMs, latencySampleCount),
    ],
    [
      "P95 Start",
      formatLatencyMs(summary.startLatencyP95Ms, latencySampleCount),
    ],
    [
      "Slowest Start",
      formatLatencyMs(summary.startLatencyMaxMs, latencySampleCount),
    ],
    ["Report Updated", formatDateTime(report.lastUpdatedAt)],
    ["Snapshot Generated", formatDateTime(report.generatedAt)],
  ];

  summaryList.innerHTML = "";
  for (const [labelText, valueText] of items) {
    const card = document.createElement("div");
    card.className = "card";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = labelText;

    const value = document.createElement("div");
    value.className = "value";
    value.textContent = valueText;

    card.append(label, value);
    summaryList.appendChild(card);
  }
}

function renderCounters(report) {
  const counters = report && report.counters ? report.counters : {};
  const items = [
    ["Voice Probes", counters.voiceProbes || 0],
    ["Selection Loads", counters.selectionLoads || 0],
    ["Manual Reads", counters.manualReads || 0],
    ["Page Reads", counters.pageReaderReads || 0],
    ["Pauses", counters.pauses || 0],
    ["Resumes", counters.resumes || 0],
    ["Stops", counters.stops || 0],
    ["Errors", counters.errors || 0],
    ["Recovered Starts", counters.recoveredStarts || 0],
  ];

  counterGrid.innerHTML = "";
  for (const [labelText, valueText] of items) {
    const card = document.createElement("div");
    card.className = "card";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = labelText;

    const value = document.createElement("div");
    value.className = "value counter-value";
    value.textContent = String(valueText);

    card.append(label, value);
    counterGrid.appendChild(card);
  }
}

function createChip(text, className = "") {
  const chip = document.createElement("span");
  chip.className = className ? `chip ${className}` : "chip";
  chip.textContent = text;
  return chip;
}

function renderEvents(report) {
  const events = Array.isArray(report && report.events) ? report.events : [];
  eventList.innerHTML = "";
  emptyState.hidden = events.length > 0;

  for (const event of events) {
    const item = document.createElement("article");
    item.className = "event-item";

    const head = document.createElement("div");
    head.className = "event-head";

    const title = document.createElement("div");
    title.className = "event-title";
    title.textContent = formatEventType(event.type);

    const time = document.createElement("div");
    time.className = "event-time";
    time.textContent = formatDateTime(event.at);

    head.append(title, time);

    const surface = document.createElement("div");
    surface.className = "event-surface";
    surface.textContent = event.surface ? `${event.surface} flow` : "Extension flow";

    const chips = document.createElement("div");
    chips.className = "chips";
    chips.appendChild(createChip(event.selectedVoiceLabel || event.selectedVoiceKey || "Unknown voice"));
    if (event.speechRate) {
      chips.appendChild(createChip(`${Number(event.speechRate).toFixed(2)}x`));
    }
    if (event.sourceLabel) {
      chips.appendChild(createChip(event.sourceLabel));
    }
    if (event.textLength) {
      chips.appendChild(createChip(`${event.textLength} chars`));
    }
    if (event.blockId) {
      chips.appendChild(createChip(`Block ${event.blockId}`));
    }
    if (event.sentenceCount) {
      const sentenceNumber = Number(event.sentenceIndex || 0) >= 0
        ? Number(event.sentenceIndex || 0) + 1
        : 1;
      chips.appendChild(createChip(`Sentence ${sentenceNumber}/${event.sentenceCount}`));
    }
    if (event.host) {
      chips.appendChild(createChip(event.host));
    }
    if (event.note) {
      chips.appendChild(createChip(event.note));
    }
    if (event.retryCount) {
      const retryCount = Math.max(0, Math.trunc(Number(event.retryCount || 0)));
      const retryLabel =
        retryCount === 1 ? "1 retry" : `${retryCount} retries`;
      const recoveredStart =
        retryCount > 0 &&
        !event.failureCode &&
        String(event.settledByEvent || "").toLowerCase() === "end";
      chips.appendChild(
        createChip(recoveredStart ? `Recovered start (${retryLabel})` : retryLabel)
      );
    }
    if (event.usedStartupChunks) {
      chips.appendChild(
        createChip(
          event.startupStrategy
            ? `Startup chunks (${event.startupStrategy})`
            : "Startup chunks"
        )
      );
    }
    if (event.usedRecoveryChunks) {
      chips.appendChild(
        createChip(
          event.recoveryStrategy
            ? `Recovery chunks (${event.recoveryStrategy})`
            : "Recovery chunks"
        )
      );
    }
    if (event.firstWordLatencyMs) {
      chips.appendChild(createChip(`First word ${event.firstWordLatencyMs} ms`));
    }
    if (event.firstWordBoundaryGapMs) {
      chips.appendChild(createChip(`Start to word ${event.firstWordBoundaryGapMs} ms`));
    }
    if (event.failureCode) {
      chips.appendChild(createChip(formatEventType(event.failureCode)));
    }
    if (event.error) {
      chips.appendChild(createChip(event.error, "error"));
    }

    item.append(head, surface, chips);
    eventList.appendChild(item);
  }
}

async function refreshReport() {
  const response = await requestBackground({
    type: "get_run_report",
  });
  latestReport = response.report || null;
  renderSummary(latestReport || {});
  renderCounters(latestReport || {});
  renderEvents(latestReport || {});
  setFeedback(latestReport ? `Snapshot refreshed at ${formatDateTime(latestReport.generatedAt)}.` : "");
}

async function copyReport() {
  if (!latestReport) {
    await refreshReport();
  }
  await navigator.clipboard.writeText(JSON.stringify(latestReport, null, 2));
  setFeedback("Run report copied to the clipboard.");
}

async function clearReport() {
  await requestBackground({
    type: "clear_run_report",
  });
  await refreshReport();
  setFeedback("Run report cleared.");
}

refreshButton.addEventListener("click", () => {
  void refreshReport().catch((error) => {
    setFeedback(error && error.message ? error.message : String(error), true);
  });
});

copyButton.addEventListener("click", () => {
  void copyReport().catch((error) => {
    setFeedback(error && error.message ? error.message : String(error), true);
  });
});

clearButton.addEventListener("click", () => {
  void clearReport().catch((error) => {
    setFeedback(error && error.message ? error.message : String(error), true);
  });
});

window.addEventListener("beforeunload", () => {
  clearInterval(refreshTimer);
});

void refreshReport()
  .then(() => {
    refreshTimer = window.setInterval(() => {
      void refreshReport().catch((error) => {
        setFeedback(error && error.message ? error.message : String(error), true);
      });
    }, 2000);
  })
  .catch((error) => {
    setFeedback(error && error.message ? error.message : String(error), true);
  });
