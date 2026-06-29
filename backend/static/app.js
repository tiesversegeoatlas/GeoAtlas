const state = {
  selectedCandidate: null,
  sources: [],
  allSources: [],
  sourceIndexLoaded: false,
  outputSources: [],
  sourceDuplicateIndex: {
    urls: new Map(),
    names: new Map(),
  },
  output: { items: [], events: [] },
  selectedOutputSourceId: "",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  csvRows: [],
  csvChecking: false,
  csvImporting: false,
  healthChecking: false,
  healthStopRequested: false,
  bulkCollecting: false,
  bulkStopRequested: false,
  aiProgressTimer: null,
  sourcePagination: {
    offset: 0,
    limit: 25,
    total: 0,
  },
};

const els = {
  adminKey: document.querySelector("#adminKey"),
  toggleKey: document.querySelector("#toggleKey"),
  feedUrl: document.querySelector("#feedUrl"),
  sourceName: document.querySelector("#sourceName"),
  interval: document.querySelector("#interval"),
  reliability: document.querySelector("#reliability"),
  categories: document.querySelector("#categories"),
  detectForm: document.querySelector("#detectForm"),
  saveSource: document.querySelector("#saveSource"),
  clearForm: document.querySelector("#clearForm"),
  detectionResult: document.querySelector("#detectionResult"),
  sourceList: document.querySelector("#sourceList"),
  sourceSearch: document.querySelector("#sourceSearch"),
  sourceStatus: document.querySelector("#sourceStatus"),
  sourcePageSize: document.querySelector("#sourcePageSize"),
  sourceSummary: document.querySelector("#sourceSummary"),
  sourceHealthProgress: document.querySelector("#sourceHealthProgress"),
  prevSources: document.querySelector("#prevSources"),
  nextSources: document.querySelector("#nextSources"),
  outputSource: document.querySelector("#outputSource"),
  outputPreview: document.querySelector("#outputPreview"),
  outputSummary: document.querySelector("#outputSummary"),
  healthStatus: document.querySelector("#healthStatus"),
  timeZoneStatus: document.querySelector("#timeZoneStatus"),
  messageBar: document.querySelector("#messageBar"),
  refreshSources: document.querySelector("#refreshSources"),
  healthCheckScope: document.querySelector("#healthCheckScope"),
  checkSourceHealth: document.querySelector("#checkSourceHealth"),
  fetchAllRss: document.querySelector("#fetchAllRss"),
  scrapeAllUrls: document.querySelector("#scrapeAllUrls"),
  stopSourceHealth: document.querySelector("#stopSourceHealth"),
  refreshOutput: document.querySelector("#refreshOutput"),
  copyOutput: document.querySelector("#copyOutput"),
  csvFile: document.querySelector("#csvFile"),
  duplicateMode: document.querySelector("#duplicateMode"),
  selectAllCsv: document.querySelector("#selectAllCsv"),
  clearCsv: document.querySelector("#clearCsv"),
  importCsv: document.querySelector("#importCsv"),
  exportImportStatus: document.querySelector("#exportImportStatus"),
  csvSummary: document.querySelector("#csvSummary"),
  csvPreview: document.querySelector("#csvPreview"),
  csvImportProgress: document.querySelector("#csvImportProgress"),
  csvImportStatus: document.querySelector("#csvImportStatus"),
  csvImportPercent: document.querySelector("#csvImportPercent"),
  csvImportFill: document.querySelector("#csvImportFill"),
  sourceHealthSummary: document.querySelector("#sourceHealthSummary"),
  sourceHealthPercent: document.querySelector("#sourceHealthPercent"),
  sourceHealthFill: document.querySelector("#sourceHealthFill"),
  sourceHealthChecked: document.querySelector("#sourceHealthChecked"),
  sourceHealthWorking: document.querySelector("#sourceHealthWorking"),
  sourceHealthFailing: document.querySelector("#sourceHealthFailing"),
  sourceHealthRemaining: document.querySelector("#sourceHealthRemaining"),
  aiWorkerState: document.querySelector("#aiWorkerState"),
  refreshAiProgress: document.querySelector("#refreshAiProgress"),
  aiProgressSummary: document.querySelector("#aiProgressSummary"),
  aiProgressPercent: document.querySelector("#aiProgressPercent"),
  aiProgressFill: document.querySelector("#aiProgressFill"),
  aiAnalyzedItems: document.querySelector("#aiAnalyzedItems"),
  aiRemainingItems: document.querySelector("#aiRemainingItems"),
  aiQueuedJobs: document.querySelector("#aiQueuedJobs"),
  aiActiveJobs: document.querySelector("#aiActiveJobs"),
  aiSuccessfulJobs: document.querySelector("#aiSuccessfulJobs"),
  aiFailedJobs: document.querySelector("#aiFailedJobs"),
  aiRankedSources: document.querySelector("#aiRankedSources"),
  aiProgressMeta: document.querySelector("#aiProgressMeta"),
  aiWorkerGrid: document.querySelector("#aiWorkerGrid"),
};

const savedKey = localStorage.getItem("geoAtlasAdminKey");
if (savedKey) {
  els.adminKey.value = savedKey;
}

els.timeZoneStatus.textContent = `Time zone: ${state.timeZone}`;

function adminHeaders() {
  const key = els.adminKey.value.trim();
  if (key) {
    localStorage.setItem("geoAtlasAdminKey", key);
  }
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": key,
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Request failed with ${response.status}`);
  }
  return body;
}

function showMessage(message, type = "good") {
  els.messageBar.hidden = false;
  els.messageBar.className = `notice ${type}`;
  els.messageBar.textContent = message;
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    els.messageBar.hidden = true;
  }, 5000);
}

function renderPanelError(target, error) {
  target.innerHTML = `<div class="empty">${escapeHtml(error.message || String(error))}</div>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: state.timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function isTimestampKey(key) {
  return /(^|_)(at|time|date)$/.test(key) || key.endsWith("_at") || key.endsWith("_time") || key.endsWith("_date");
}

function localizeTimestamps(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => localizeTimestamps(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, localizeTimestamps(entryValue, entryKey)])
    );
  }
  if (typeof value === "string" && isTimestampKey(key)) {
    return formatDate(value);
  }
  return value;
}

function setBusy(button, busyText) {
  const originalText = button.textContent;
  button.textContent = busyText;
  button.disabled = true;
  return () => {
    button.textContent = originalText;
    button.disabled = false;
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForIngestion(job, onProgress) {
  let current = job;
  while (current.status === "queued" || current.status === "running") {
    onProgress(current);
    await wait(current.status === "queued" ? 800 : 1200);
    current = await api(`/api/v1/ingestion/jobs/${current.id}`, { headers: adminHeaders() });
  }
  onProgress(current);
  return current;
}

async function checkHealth() {
  try {
    const data = await api("/health");
    const dbLabel = data.database === "ok" ? "DB ok" : "DB degraded";
    els.healthStatus.textContent = `${data.service}: ${dbLabel}`;
    els.healthStatus.className = `status ${data.database === "ok" ? "ok" : "warn"}`;
  } catch {
    els.healthStatus.textContent = "API unavailable";
    els.healthStatus.className = "status bad";
  }
}

function renderAiProgress(data) {
  const liveWorkers = data.workers.filter(
    (worker) => !["offline", "stopped", "drained"].includes(worker.status)
  );
  els.aiWorkerState.textContent = data.worker_status.replaceAll("_", " ");
  els.aiWorkerState.className = `worker-state ${data.worker_status}`;
  els.aiProgressSummary.textContent = `${data.analyzed_items.toLocaleString()} of ${data.total_items.toLocaleString()} news items analyzed`;
  els.aiProgressPercent.textContent = `${data.progress_percent.toFixed(1)}%`;
  els.aiProgressFill.style.width = `${Math.min(100, Math.max(0, data.progress_percent))}%`;
  els.aiAnalyzedItems.textContent = data.analyzed_items.toLocaleString();
  els.aiRemainingItems.textContent = data.remaining_items.toLocaleString();
  els.aiQueuedJobs.textContent = data.queued_jobs.toLocaleString();
  els.aiActiveJobs.textContent = `${liveWorkers.length.toLocaleString()}/${data.worker_capacity.toLocaleString()}`;
  els.aiSuccessfulJobs.textContent = data.successful_jobs.toLocaleString();
  els.aiFailedJobs.textContent = data.failed_jobs.toLocaleString();
  els.aiRankedSources.textContent = `${data.ranked_sources.toLocaleString()}/${data.total_sources.toLocaleString()}`;
  const lastCompleted = data.latest_completed_at ? formatDate(data.latest_completed_at) : "none yet";
  els.aiProgressMeta.textContent = `${data.worker_capacity} ${data.adaptive_workers ? "adaptive" : "fixed"} processing slots · automatic processing ${data.auto_analyze ? "on" : "off"} · last completion ${lastCompleted}`;
  renderAiWorkers(data.workers);
}

function renderAiWorkers(workers) {
  if (!workers.length) {
    els.aiWorkerGrid.innerHTML = `<div class="empty">No processing workers have registered yet.</div>`;
    return;
  }
  els.aiWorkerGrid.innerHTML = workers.map((worker, index) => {
    const memory = worker.available_memory_gb == null ? "n/a" : `${worker.available_memory_gb.toFixed(1)} GB free`;
    const cpu = worker.cpu_percent == null ? "n/a" : `${worker.cpu_percent.toFixed(1)}% CPU`;
    const job = worker.current_job_id ? `Job ${worker.current_job_id.slice(0, 8)}` : "No active job";
    return `
      <article class="ai-worker-card ${escapeHtml(worker.status)}">
        <div class="ai-worker-card-head">
          <div>
            <strong>Processing worker ${index + 1}</strong>
            <small>PID ${worker.process_id} · ${escapeHtml(worker.host_name)}</small>
          </div>
          <span class="worker-state ${escapeHtml(worker.status)}">${escapeHtml(worker.status)}</span>
        </div>
        <div class="ai-worker-metrics">
          <span><b>${worker.completed_count.toLocaleString()}</b> completed</span>
          <span><b>${worker.failed_count.toLocaleString()}</b> failed</span>
          <span><b>${escapeHtml(cpu)}</b></span>
          <span><b>${escapeHtml(memory)}</b></span>
        </div>
        <p>${escapeHtml(worker.status_message || job)}</p>
        <small>${escapeHtml(job)} · heartbeat ${escapeHtml(formatDate(worker.heartbeat_at))}</small>
      </article>
    `;
  }).join("");
}

async function loadAiProgress({ quiet = false } = {}) {
  if (!els.adminKey.value.trim()) {
    els.aiWorkerState.textContent = "Waiting for admin key";
    els.aiWorkerState.className = "worker-state waiting";
    return;
  }
  try {
    const data = await api("/api/v1/ai/progress", { headers: adminHeaders() });
    renderAiProgress(data);
  } catch (error) {
    els.aiWorkerState.textContent = "Unavailable";
    els.aiWorkerState.className = "worker-state error";
    if (!quiet) showMessage(error.message, "bad");
  }
}

function startAiProgressPolling() {
  window.clearInterval(state.aiProgressTimer);
  loadAiProgress({ quiet: true });
  state.aiProgressTimer = window.setInterval(
    () => loadAiProgress({ quiet: true }),
    5000
  );
}

els.toggleKey.addEventListener("click", () => {
  const showing = els.adminKey.type === "text";
  els.adminKey.type = showing ? "password" : "text";
  els.toggleKey.textContent = showing ? "Show" : "Hide";
  els.toggleKey.setAttribute("aria-label", showing ? "Show admin key" : "Hide admin key");
});

els.adminKey.addEventListener("change", startAiProgressPolling);
els.refreshAiProgress.addEventListener("click", () => loadAiProgress());

els.detectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.selectedCandidate = null;
  els.saveSource.disabled = true;
  els.detectionResult.innerHTML = `<div class="empty">Detecting feed metadata...</div>`;
  const done = setBusy(event.submitter || els.detectForm.querySelector("button[type='submit']"), "Detecting...");
  try {
    const result = await api("/api/v1/sources/detect", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ url: els.feedUrl.value.trim(), fetch_sample_items: true }),
    });
    renderDetection(result);
    showMessage(`Detected ${result.candidates.length} feed candidate${result.candidates.length === 1 ? "" : "s"}.`);
  } catch (error) {
    renderPanelError(els.detectionResult, error);
    showMessage(error.message, "bad");
  } finally {
    done();
  }
});

function renderDetection(result) {
  if (!result.candidates.length) {
    els.detectionResult.innerHTML = `<div class="empty">No feed candidates found.</div>`;
    return;
  }
  state.selectedCandidate = result.candidates[0];
  els.saveSource.disabled = false;
  els.detectionResult.innerHTML = result.candidates
    .map((candidate, index) => renderCandidate(candidate, index))
    .join("");
}

function renderCandidate(candidate, index) {
  const items = candidate.latest_items
    .map((item) => `<li>${escapeHtml(item.title || "Untitled")} <span class="meta">${escapeHtml(formatDate(item.published_at))}</span></li>`)
    .join("");
  const active = state.selectedCandidate?.feed_url === candidate.feed_url || (!state.selectedCandidate && index === 0);
  return `
    <article class="candidate ${active ? "active" : ""}" data-feed-url="${escapeHtml(candidate.feed_url)}">
      <header>
        <div>
          <strong>${escapeHtml(candidate.title || candidate.feed_url)}</strong>
          <p class="meta">${escapeHtml(candidate.feed_type)} - score ${candidate.score} - ${escapeHtml(candidate.feed_url)}</p>
          <p class="meta">Site: ${escapeHtml(candidate.site_url || "unknown")} | Language: ${escapeHtml(candidate.language || "unknown")}</p>
        </div>
        <span class="pill ${active ? "good" : ""}">${active ? "Selected" : "Candidate"}</span>
      </header>
      ${items ? `<ol class="sample-list">${items}</ol>` : `<p class="meta">No sample items found.</p>`}
    </article>
  `;
}

els.detectionResult.addEventListener("click", (event) => {
  const candidateEl = event.target.closest(".candidate");
  if (!candidateEl) return;
  const feedUrl = candidateEl.dataset.feedUrl;
  const candidates = [...els.detectionResult.querySelectorAll(".candidate")].map((node) => node.dataset.feedUrl);
  const index = candidates.indexOf(feedUrl);
  const detectedCards = [...els.detectionResult.querySelectorAll(".candidate")];
  detectedCards.forEach((node) => node.classList.remove("active"));
  candidateEl.classList.add("active");
  const title = candidateEl.querySelector("strong")?.textContent || feedUrl;
  state.selectedCandidate = {
    feed_url: feedUrl,
    title,
  };
  els.saveSource.disabled = index === -1;
});

els.saveSource.addEventListener("click", async () => {
  if (!state.selectedCandidate) return;
  const done = setBusy(els.saveSource, "Saving...");
  try {
    const categories = els.categories.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const source = await api("/api/v1/sources/rss", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        name: els.sourceName.value.trim() || state.selectedCandidate.title,
        feed_url: state.selectedCandidate.feed_url,
        fetch_interval_minutes: Number(els.interval.value || 30),
        reliability_score: Number(els.reliability.value || 0.7),
        enabled: true,
        category_scope: categories.length ? categories : null,
      }),
    });
    showMessage(`Saved source: ${source.name}`);
    await loadSources({ refreshIndex: true });
    selectOutputSource(source.id);
    await loadOutput(source.id);
  } catch (error) {
    renderPanelError(els.detectionResult, error);
    showMessage(error.message, "bad");
  } finally {
    done();
  }
});

els.clearForm.addEventListener("click", () => {
  state.selectedCandidate = null;
  els.feedUrl.value = "";
  els.sourceName.value = "";
  els.categories.value = "";
  els.detectionResult.innerHTML = `<div class="empty">No feed detected yet.</div>`;
  els.saveSource.disabled = true;
});

function sourceQueryParams({ offset = state.sourcePagination.offset, limit = state.sourcePagination.limit, includeArchived = true, useFilters = true } = {}) {
  const params = new URLSearchParams({
    include_archived: String(includeArchived),
    limit: String(limit),
    offset: String(offset),
  });
  if (useFilters) {
    const query = els.sourceSearch.value.trim();
    const status = els.sourceStatus.value;
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
  }
  return params;
}

async function fetchSourcesPage(options = {}) {
  const response = await fetch(`/api/v1/sources?${sourceQueryParams(options)}`, { headers: adminHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Request failed with ${response.status}`);
  }
  return {
    sources: body,
    total: Number(response.headers.get("X-Total-Count") || body.length || 0),
  };
}

async function loadSourceIndex() {
  if (!els.adminKey.value.trim()) return;
  const limit = 200;
  let offset = 0;
  let total = Infinity;
  const sources = [];
  while (offset < total) {
    const page = await fetchSourcesPage({ offset, limit, includeArchived: true, useFilters: false });
    sources.push(...page.sources);
    total = page.total;
    if (!page.sources.length) break;
    offset += page.sources.length;
  }
  state.allSources = sources;
  state.sourceIndexLoaded = true;
  rebuildSourceDuplicateIndex();
}

function updateIndexedSource(updatedSource) {
  state.sources = state.sources.map((source) => source.id === updatedSource.id ? updatedSource : source);
  state.allSources = state.allSources.map((source) => source.id === updatedSource.id ? updatedSource : source);
}

function setHealthProgress({ checked = 0, total = 0, working = 0, failing = 0, label = "", done = false } = {}) {
  els.sourceHealthProgress.hidden = false;
  const percent = total ? Math.round((checked / total) * 100) : 0;
  els.sourceHealthFill.style.width = `${percent}%`;
  els.sourceHealthPercent.textContent = `${percent}%`;
  els.sourceHealthChecked.textContent = checked;
  els.sourceHealthWorking.textContent = working;
  els.sourceHealthFailing.textContent = failing;
  els.sourceHealthRemaining.textContent = Math.max(0, total - checked);
  els.sourceHealthSummary.textContent = done
    ? label || `RSS health: ${working} working, ${failing} not working`
    : label || `Checking ${checked}/${total}`;
}

async function loadSources({ keepPage = true, refreshIndex = false } = {}) {
  if (!els.adminKey.value.trim()) {
    els.sourceList.innerHTML = `<div class="empty">Enter a generated admin key to load sources.</div>`;
    state.sources = [];
    state.allSources = [];
    state.sourcePagination.total = 0;
    renderSourcePager();
    updateOutputSourceOptions();
    return;
  }
  if (!keepPage) {
    state.sourcePagination.offset = 0;
  }
  els.sourceList.innerHTML = `<div class="empty">Loading sources...</div>`;
  try {
    const page = await fetchSourcesPage();
    state.sources = page.sources;
    state.sourcePagination.total = page.total;
    if (state.sourcePagination.offset >= page.total && page.total > 0) {
      state.sourcePagination.offset = Math.max(0, Math.floor((page.total - 1) / state.sourcePagination.limit) * state.sourcePagination.limit);
      return loadSources({ keepPage: true, refreshIndex });
    }
    renderSources();
    renderSourcePager();
    if (refreshIndex && state.sourceIndexLoaded) {
      await loadSourceIndex();
    } else {
      const pageIds = new Set(state.sources.map((source) => source.id));
      state.allSources = state.allSources
        .filter((source) => !pageIds.has(source.id))
        .concat(state.sources);
    }
  } catch (error) {
    renderPanelError(els.sourceList, error);
    showMessage(error.message, "bad");
  }
}

function renderSources() {
  if (!state.sources.length) {
    els.sourceList.innerHTML = `<div class="empty">No matching sources.</div>`;
    return;
  }
  els.sourceList.innerHTML = state.sources.map(renderSource).join("");
}

function renderSourcePager() {
  const { offset, limit, total } = state.sourcePagination;
  if (!total) {
    els.sourceSummary.textContent = "0 sources";
    els.prevSources.disabled = true;
    els.nextSources.disabled = true;
    return;
  }
  const start = offset + 1;
  const end = Math.min(offset + state.sources.length, total);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  els.sourceSummary.textContent = `Showing ${start}-${end} of ${total} sources | Page ${page} of ${pages}`;
  els.prevSources.disabled = offset === 0;
  els.nextSources.disabled = offset + limit >= total;
}

function renderSource(source) {
  const isChecking = source.healthCheckStatus === "checking";
  const isWorking = source.enabled && !source.archived && source.status === "active";
  const isArchived = source.archived || source.status === "archived";
  const isUrl = source.status === "url";
  const isUrlConnector = source.connector_type === "url";
  const isUnchecked = !isArchived && source.status === "unchecked";
  const healthClass = isChecking ? "checking" : isArchived ? "archived" : isUrl ? "web-url" : isWorking ? "working" : isUnchecked ? "unchecked" : "broken";
  const healthLabel = isChecking ? "Checking" : isArchived ? "Archived" : isUrl ? "URL" : isWorking ? "Working" : isUnchecked ? "Unchecked" : "Not working";
  const healthNote = isChecking
    ? "Testing RSS response and feed format"
    : isArchived
    ? "Stored as archived and hidden from public output"
    : isUrl
      ? "Stored as a webpage URL; no RSS/Atom feed detected"
    : isWorking
      ? "Visible in public output"
      : isUnchecked
        ? "Waiting for RSS health check"
        : "Hidden from public output";
  const statusClass = isWorking ? "good" : isArchived ? "bad" : "warn";
  return `
    <article class="source-card source-${healthClass}" data-source-id="${source.id}">
      <div class="source-main">
        <div class="source-info">
          <div class="source-title-row">
            <h3>${escapeHtml(source.name)}</h3>
            <span class="pill ${statusClass}">${escapeHtml(source.status)}</span>
          </div>
          <a class="source-url" href="${escapeHtml(source.feed_url)}" target="_blank" rel="noreferrer">${escapeHtml(source.feed_url)}</a>
          <div class="source-metrics">
            <span>Last success: ${escapeHtml(formatDate(source.last_success_at))}</span>
            <span>Reliability: ${source.reliability_score}</span>
          </div>
          ${source.last_error ? `<p class="source-error">Last error: ${escapeHtml(source.last_error)}</p>` : ""}
        </div>
        <div class="source-health">
          <span class="health-dot"></span>
          <strong>${healthLabel}</strong>
          <span>${healthNote}</span>
        </div>
      </div>
      <div class="source-actions">
        <div class="action-group">
          ${isArchived ? "" : `
            <button type="button" data-action="ingest">${isUrlConnector ? "Run scrape" : "Run ingest"}</button>
            <button type="button" data-action="view">View output</button>
          `}
        </div>
        <div class="action-group health-actions">
          ${isArchived || isUrl ? "" : `
            <button type="button" class="status-toggle ${isWorking ? "active" : ""}" data-action="mark-working" ${isWorking ? "disabled" : ""}>Working</button>
            <button type="button" class="status-toggle ${!isWorking && !isUnchecked ? "active danger-state" : ""}" data-action="mark-broken" ${!isWorking && !isUnchecked ? "disabled" : ""}>Not working</button>
          `}
        </div>
        <div class="action-group danger-actions">
          ${isArchived ? "" : `
          <button type="button" data-action="archive" class="danger">Archive</button>
          `}
          <button type="button" data-action="purge" class="danger">Remove from DB</button>
        </div>
      </div>
    </article>
  `;
}

els.sourceList.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest(".source-card");
  if (!button || !card) return;
  const sourceId = card.dataset.sourceId;
  const sourceRecord = state.sources.find((source) => source.id === sourceId);
  const isUrlSource = sourceRecord?.connector_type === "url";
  try {
    if (button.dataset.action === "ingest") {
      const done = setBusy(button, "Queueing...");
      try {
        const result = await api(`/api/v1/sources/${sourceId}/ingest`, { method: "POST", headers: adminHeaders() });
        const job = await waitForIngestion(result.job, (current) => {
          button.textContent = current.status === "queued"
            ? "Queued..."
            : `${isUrlSource ? "Scraping" : "Ingesting"} ${current.normalized_count}/${Math.max(current.fetched_count, current.normalized_count, 1)}...`;
        });
        showMessage(
          job.status === "success"
            ? `${isUrlSource ? "Scrape" : "Ingestion"} complete: ${job.normalized_count} normalized items.`
            : `${isUrlSource ? "Scrape" : "Ingestion"} failed: ${job.error_message || "Unknown error."}`,
          job.status === "success" ? "good" : "bad"
        );
        await loadSources();
        if (job.status === "success") await loadOutputSources();
        selectOutputSource(sourceId);
        await loadOutput(sourceId);
      } finally {
        done();
      }
    }
    if (button.dataset.action === "view") {
      selectOutputSource(sourceId);
      await loadOutput(sourceId);
    }
    if (button.dataset.action === "mark-working" || button.dataset.action === "mark-broken") {
      const working = button.dataset.action === "mark-working";
      const done = setBusy(button, working ? "Marking..." : "Hiding...");
      const source = await api(`/api/v1/sources/${sourceId}/mark`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ working }),
      });
      updateIndexedSource(source);
      updateOutputSourceOptions();
      done();
      showMessage(`${source.name} marked ${working ? "working" : "not working"}.`);
      await loadSources();
      await loadOutput(state.selectedOutputSourceId);
    }
    if (button.dataset.action === "archive") {
      const done = setBusy(button, "Archiving...");
      await api(`/api/v1/sources/${sourceId}`, { method: "DELETE", headers: adminHeaders() });
      done();
      showMessage("Source archived.");
      if (state.selectedOutputSourceId === sourceId) {
        selectOutputSource("");
      }
      await loadSources({ refreshIndex: true });
      await loadOutput(state.selectedOutputSourceId);
    }
    if (button.dataset.action === "purge") {
      if (!window.confirm("Remove this source and its collected items from the database? This cannot be undone.")) return;
      const done = setBusy(button, "Removing...");
      const result = await api(`/api/v1/sources/${sourceId}/purge`, { method: "DELETE", headers: adminHeaders() });
      done();
      showMessage(`Removed source and ${result.deleted_normalized_items} public item${result.deleted_normalized_items === 1 ? "" : "s"} from the database.`);
      if (state.selectedOutputSourceId === sourceId) {
        selectOutputSource("");
      }
      await loadSources({ refreshIndex: true });
      await loadOutput(state.selectedOutputSourceId);
    }
  } catch (error) {
    button.disabled = false;
    showMessage(error.message, "bad");
  }
});

function updateOutputSourceOptions() {
  const current = state.selectedOutputSourceId;
  els.outputSource.innerHTML = `<option value="">All sources</option>` + state.outputSources
    .map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.name)}</option>`)
    .join("");
  els.outputSource.value = current;
}

function selectOutputSource(sourceId) {
  state.selectedOutputSourceId = sourceId || "";
  if (
    state.selectedOutputSourceId
    && !state.outputSources.some((source) => source.id === state.selectedOutputSourceId)
  ) {
    const source = [...state.sources, ...state.allSources]
      .find((candidate) => candidate.id === state.selectedOutputSourceId);
    if (source) {
      state.outputSources.push(source);
      state.outputSources.sort((left, right) => left.name.localeCompare(right.name));
      updateOutputSourceOptions();
    }
  }
  els.outputSource.value = state.selectedOutputSourceId;
}

async function loadOutputSources() {
  try {
    state.outputSources = await api("/api/v1/public/output-sources");
    updateOutputSourceOptions();
  } catch (error) {
    state.outputSources = [];
    updateOutputSourceOptions();
    showMessage(`Output source list failed: ${error.message}`, "bad");
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function urlFingerprints(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const fingerprints = new Set([normalizeUrl(raw)]);
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const query = parsed.searchParams.toString();
    fingerprints.add(`${host}${path}${query ? `?${query}` : ""}`);
    fingerprints.add(`${host}${path}`);
    fingerprints.add(`${host}${path.replace(/\/(feed\/atom|rss\.xml|feed\.xml|feed|rss|atom)$/i, "") || "/"}`);
  } catch {
    fingerprints.add(normalizeUrl(raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "")));
  }
  return [...fingerprints].filter(Boolean);
}

function sourceFingerprints(source) {
  return [
    ...urlFingerprints(source.feed_url),
    ...urlFingerprints(source.site_url),
  ];
}

function rebuildSourceDuplicateIndex() {
  const urls = new Map();
  const names = new Map();
  state.allSources.forEach((source) => {
    sourceFingerprints(source).forEach((fingerprint) => {
      if (!urls.has(fingerprint)) urls.set(fingerprint, source);
    });
    const normalizedName = normalizeSourceName(source.name);
    if (normalizedName && !names.has(normalizedName)) names.set(normalizedName, source);
  });
  state.sourceDuplicateIndex = { urls, names };
}

function normalizeSourceName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function findDuplicateSource(baseUrl, sourceName = "") {
  const urlMatch = urlFingerprints(baseUrl)
    .map((fingerprint) => state.sourceDuplicateIndex.urls.get(fingerprint))
    .find(Boolean);
  if (urlMatch) return { source: urlMatch, matchedBy: "stored-url" };
  const normalizedName = normalizeSourceName(sourceName);
  if (!normalizedName) return null;
  const nameMatch = state.sourceDuplicateIndex.names.get(normalizedName);
  return nameMatch ? { source: nameMatch, matchedBy: "source-name" } : null;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV needs a header row and at least one source row.");
  }
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const required = ["source name", "base url", "category", "region", "language"];
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const record = Object.fromEntries(headers.map((header, columnIndex) => [header, cells[columnIndex] || ""]));
    return normalizeCsvRecord(record, index + 2);
  });
}

function normalizeCsvRecord(record, lineNumber) {
  const baseUrl = record["base url"]?.trim() || "";
  const categories = (record.category || "")
    .split(/[|;]/)
    .flatMap((part) => part.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const errors = [];
  if (!record["source name"]?.trim()) errors.push("source name missing");
  if (!baseUrl) errors.push("base url missing");
  try {
    if (baseUrl) new URL(baseUrl);
  } catch {
    errors.push("base url invalid");
  }
  return {
    id: crypto.randomUUID(),
    lineNumber,
    selected: errors.length === 0,
    duplicateId: null,
    duplicateName: null,
    duplicateMatch: null,
    importStatus: "ready",
    importMessage: "",
    errors,
    sourceName: record["source name"]?.trim() || "",
    baseUrl,
    category: categories,
    region: record.region?.trim() || "",
    language: record.language?.trim() || "",
  };
}

async function handleCsvFile(file) {
  if (!file) return;
  if (!els.adminKey.value.trim()) {
    showMessage("Enter the generated admin key before importing CSV sources.", "bad");
    els.csvFile.value = "";
    return;
  }
  try {
    state.csvImporting = false;
    els.csvImportProgress.hidden = true;
    els.csvImportFill.style.width = "0%";
    els.csvImportPercent.textContent = "0%";
    state.csvRows = parseCsv(await file.text());
    renderCsvPreview();
    showMessage(`Loaded ${state.csvRows.length} CSV row${state.csvRows.length === 1 ? "" : "s"}. Existing database links will be skipped during import.`);
  } catch (error) {
    state.csvChecking = false;
    state.csvRows = [];
    renderCsvPreview();
    showMessage(error.message, "bad");
  }
}

function showCsvLoadMessage(prefix = "") {
  const storedCount = state.csvRows.filter((row) => row.duplicateId).length;
  const selectableCount = selectedCsvRows().length;
  const base = `Loaded ${state.csvRows.length} CSV row${state.csvRows.length === 1 ? "" : "s"}: ${storedCount} already in DB, ${selectableCount} selected for add.`;
  showMessage(prefix ? `${prefix} ${base}` : base);
}

function csvImportStatusLabel(row) {
  if (row.importStatus === "added") return "Added";
  if (row.importStatus === "skipped" || row.duplicateMatch === "database") return "Skipped duplicate";
  if (row.importStatus === "failed") return "Failed";
  if (row.errors.length) return "Invalid";
  if (row.importStatus === "adding") return "Adding";
  return row.selected ? "Ready" : "Not selected";
}

function exportImportStatusCsv() {
  if (!state.csvRows.length) return;
  const headers = [
    "line",
    "source name",
    "base url",
    "category",
    "region",
    "language",
    "import status",
    "message",
  ];
  const rows = state.csvRows.map((row) => [
    row.lineNumber,
    row.sourceName,
    row.baseUrl,
    row.category.join("|"),
    row.region,
    row.language,
    csvImportStatusLabel(row),
    row.importMessage || row.errors.join(", "),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `geoatlas-import-status-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showMessage(`Exported import status for ${state.csvRows.length} row${state.csvRows.length === 1 ? "" : "s"}.`);
}

function renderCsvPreview() {
  els.selectAllCsv.disabled = state.csvImporting || state.csvRows.length === 0;
  els.clearCsv.disabled = state.csvImporting || state.csvRows.length === 0;
  els.importCsv.disabled = state.csvImporting || state.csvChecking || selectedCsvRows().length === 0;
  els.exportImportStatus.disabled = state.csvRows.length === 0;
  if (!state.csvRows.length) {
    els.csvSummary.textContent = "No CSV loaded.";
    els.csvPreview.className = "csv-preview empty";
    els.csvPreview.innerHTML = "Upload a CSV to review sources before adding them.";
    return;
  }
  const selected = selectedCsvRows().length;
  const duplicates = state.csvRows.filter((row) => row.duplicateId || row.duplicateMatch === "database").length;
  const invalid = state.csvRows.filter((row) => row.errors.length).length;
  const added = state.csvRows.filter((row) => row.importStatus === "added").length;
  const skipped = state.csvRows.filter((row) => row.importStatus === "skipped").length;
  const failed = state.csvRows.filter((row) => row.importStatus === "failed").length;
  const results = added || skipped || failed ? `, ${added} added, ${skipped} skipped, ${failed} failed` : "";
  els.csvSummary.textContent = `${selected}/${state.csvRows.length} selected, ${duplicates} duplicates, ${invalid} invalid${results}${state.csvChecking ? ", checking..." : ""}`;
  els.csvPreview.className = "csv-preview";
  els.csvPreview.innerHTML = `
    <table class="csv-table">
      <thead>
        <tr>
          <th>Add</th>
          <th>Source</th>
          <th>Base URL</th>
          <th>Category</th>
          <th>Region</th>
          <th>Language</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${state.csvRows.map(renderCsvRow).join("")}
      </tbody>
    </table>
  `;
}

function renderCsvRow(row) {
  const disabled = row.errors.length ? "disabled" : "";
  const status = row.importStatus === "adding"
    ? `<span class="pill warn">Adding</span>`
    : row.importStatus === "added"
      ? `<span class="pill good">Added</span>`
      : row.importStatus === "skipped"
        ? `<span class="pill warn">Skipped duplicate</span>`
        : row.importStatus === "failed"
          ? `<span class="pill bad">Failed: ${escapeHtml(row.importMessage || row.errors.join(", "))}</span>`
          : row.errors.length
    ? `<span class="pill bad">${escapeHtml(row.errors.join(", "))}</span>`
    : row.duplicateMatch === "database"
      ? `<span class="pill warn">Skipped duplicate</span>`
      : row.duplicateId
      ? `<span class="pill warn">Already in DB${row.duplicateMatch === "source-name" ? " by source name" : row.duplicateMatch === "detected-feed" ? " via feed detection" : ""}: ${escapeHtml(row.duplicateName)}</span>`
      : `<span class="pill">Ready</span>`;
  return `
    <tr class="${row.selected ? "" : "skip-row"}" data-row-id="${row.id}">
      <td><input type="checkbox" ${row.selected ? "checked" : ""} ${disabled} aria-label="Select row ${row.lineNumber}" /></td>
      <td>${escapeHtml(row.sourceName)}<div class="meta">Line ${row.lineNumber}</div></td>
      <td>${escapeHtml(row.baseUrl)}</td>
      <td>${escapeHtml(row.category.join(", "))}</td>
      <td>${escapeHtml(row.region || "-")}</td>
      <td>${escapeHtml(row.language || "-")}</td>
      <td>${status}</td>
    </tr>
  `;
}

function updateCsvImportProgress({ completed, total, added, skipped, failed, current = "", done = false }) {
  els.csvImportProgress.hidden = false;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  els.csvImportFill.style.width = `${percent}%`;
  els.csvImportPercent.textContent = `${percent}%`;
  els.csvImportStatus.textContent = done
    ? `Complete: ${added} added, ${skipped} skipped, ${failed} failed`
    : `${completed}/${total} processed${current ? ` - ${current}` : ""}`;
}

function selectedCsvRows() {
  return state.csvRows.filter((row) => row.selected && !row.errors.length);
}

function csvPayload(row) {
  return {
    name: row.sourceName,
    feed_url: row.baseUrl,
    fetch_interval_minutes: Number(els.interval.value || 30),
    reliability_score: Number(els.reliability.value || 0.7),
    enabled: true,
    category_scope: row.category.length ? row.category : null,
    country_scope: row.region || null,
    language: row.language || null,
  };
}

async function importCsvRows() {
  const rows = selectedCsvRows();
  if (!rows.length) return;
  const done = setBusy(els.importCsv, "Importing...");
  state.csvImporting = true;
  renderCsvPreview();
  let added = 0;
  let skipped = 0;
  let failed = 0;
  let completed = 0;
  const batchSize = 250;
  updateCsvImportProgress({ completed, total: rows.length, added, skipped, failed });
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    batch.forEach((row) => {
      row.importStatus = "adding";
      row.importMessage = "";
    });
    updateCsvImportProgress({
      completed,
      total: rows.length,
      added,
      skipped,
      failed,
      current: `Adding rows ${index + 1}-${Math.min(index + batch.length, rows.length)}`,
    });
    renderCsvPreview();
    try {
      const result = await api("/api/v1/sources/import", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ sources: batch.map(csvPayload) }),
      });
      result.items.forEach((item, itemIndex) => {
        const row = batch[itemIndex];
        if (!row) return;
        row.selected = false;
        row.importMessage = item.message || "";
        if (item.status === "added") {
          added += 1;
          row.importStatus = "added";
        } else if (item.status === "skipped") {
          skipped += 1;
          row.importStatus = "skipped";
          row.duplicateName = "Existing source";
          row.duplicateMatch = "database";
        } else {
          failed += 1;
          row.importStatus = "failed";
          row.errors = [item.message || "Import failed."];
        }
      });
    } catch (error) {
      batch.forEach((row) => {
        failed += 1;
        row.errors = [error.message];
        row.importStatus = "failed";
        row.importMessage = error.message;
        row.selected = false;
      });
    }
    completed += batch.length;
    updateCsvImportProgress({
      completed,
      total: rows.length,
      added,
      skipped,
      failed,
      current: `Processed ${completed} rows`,
    });
    renderCsvPreview();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  done();
  state.csvImporting = false;
  await loadSources({ refreshIndex: true });
  renderCsvPreview();
  updateCsvImportProgress({ completed, total: rows.length, added, skipped, failed, done: true });
  showMessage(`CSV import finished: ${added} added, ${skipped} duplicates skipped, ${failed} failed.`, failed ? "bad" : "good");
}

async function loadOutput(sourceId = state.selectedOutputSourceId) {
  els.outputSummary.textContent = "Loading output...";
  els.outputPreview.textContent = JSON.stringify({ status: "loading" }, null, 2);
  try {
    const params = new URLSearchParams({ limit: "25" });
    if (sourceId) params.set("source_id", sourceId);
    state.output = await api(`/api/v1/public/export.json?${params}`);
    els.outputPreview.textContent = JSON.stringify(localizeTimestamps(state.output), null, 2);
    els.outputSummary.textContent = `${state.output.items.length} items, ${state.output.events.length} events`;
  } catch (error) {
    state.output = { items: [], events: [] };
    els.outputPreview.textContent = JSON.stringify({ error: error.message }, null, 2);
    els.outputSummary.textContent = "Output failed to load.";
  }
}

let sourceSearchTimer;

els.sourceSearch.addEventListener("input", () => {
  window.clearTimeout(sourceSearchTimer);
  sourceSearchTimer = window.setTimeout(() => loadSources({ keepPage: false }), 250);
});
els.sourceStatus.addEventListener("change", () => loadSources({ keepPage: false }));
els.sourcePageSize.addEventListener("change", () => {
  state.sourcePagination.limit = Number(els.sourcePageSize.value || 25);
  loadSources({ keepPage: false });
});
els.prevSources.addEventListener("click", () => {
  state.sourcePagination.offset = Math.max(0, state.sourcePagination.offset - state.sourcePagination.limit);
  loadSources({ keepPage: true });
});
els.nextSources.addEventListener("click", () => {
  state.sourcePagination.offset += state.sourcePagination.limit;
  loadSources({ keepPage: true });
});
els.outputSource.addEventListener("change", async () => {
  selectOutputSource(els.outputSource.value);
  await loadOutput(state.selectedOutputSourceId);
});
els.refreshSources.addEventListener("click", loadSources);
els.checkSourceHealth.addEventListener("click", checkAllSourceHealth);
els.fetchAllRss.addEventListener("click", () => runBulkCollection("rss"));
els.scrapeAllUrls.addEventListener("click", () => runBulkCollection("url"));
els.stopSourceHealth.addEventListener("click", () => {
  state.healthStopRequested = true;
  state.bulkStopRequested = true;
  els.stopSourceHealth.disabled = true;
  els.sourceHealthSummary.textContent = "Stopping after the current source finishes...";
});
els.refreshOutput.addEventListener("click", () => loadOutput());
els.copyOutput.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.outputPreview.textContent);
  showMessage("Output JSON copied.");
});
els.adminKey.addEventListener("change", () => loadSources({ keepPage: false }));
els.csvFile.addEventListener("change", (event) => handleCsvFile(event.target.files[0]));
els.csvPreview.addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  const rowEl = event.target.closest("[data-row-id]");
  if (!checkbox || !rowEl) return;
  const row = state.csvRows.find((item) => item.id === rowEl.dataset.rowId);
  if (!row) return;
  row.selected = checkbox.checked;
  renderCsvPreview();
});
els.selectAllCsv.addEventListener("click", () => {
  const selectable = state.csvRows.filter((row) => !row.errors.length);
  const shouldSelect = selectable.some((row) => !row.selected);
  selectable.forEach((row) => {
    row.selected = shouldSelect;
  });
  els.selectAllCsv.textContent = shouldSelect ? "Clear selection" : "Select all";
  renderCsvPreview();
});
els.clearCsv.addEventListener("click", () => {
  state.csvImporting = false;
  state.csvRows = [];
  els.csvFile.value = "";
  els.selectAllCsv.textContent = "Select all";
  els.csvImportProgress.hidden = true;
  els.csvImportFill.style.width = "0%";
  els.csvImportPercent.textContent = "0%";
  renderCsvPreview();
});
els.importCsv.addEventListener("click", importCsvRows);
els.exportImportStatus.addEventListener("click", exportImportStatusCsv);

async function checkAllSourceHealth() {
  if (!els.adminKey.value.trim()) {
    showMessage("Enter the generated admin key before checking RSS health.", "bad");
    return;
  }
  if (state.healthChecking || state.bulkCollecting) return;
  state.healthChecking = true;
  state.healthStopRequested = false;
  const done = setBusy(els.checkSourceHealth, "Checking...");
  els.fetchAllRss.disabled = true;
  els.scrapeAllUrls.disabled = true;
  els.stopSourceHealth.disabled = false;
  els.healthCheckScope.disabled = true;
  setHealthProgress({ label: "Loading sources..." });
  let checked = 0;
  let working = 0;
  let failing = 0;
  try {
    await loadSourceIndex();
    const scope = els.healthCheckScope.value;
    const sources = state.allSources
      .filter((source) => !source.archived && (scope === "all" || source.status === "unchecked"))
      .sort((left, right) => Number(right.status === "unchecked") - Number(left.status === "unchecked"));
    if (!sources.length) {
      setHealthProgress({ label: scope === "unchecked" ? "No unchecked sources to clean." : "No active sources to check.", done: true });
      return;
    }
    const concurrency = 6;
    let nextIndex = 0;
    let activeName = "";
    showMessage(`Checking ${sources.length} source${sources.length === 1 ? "" : "s"}...`);

    const checkNext = async () => {
      while (!state.healthStopRequested) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= sources.length) return;
        const source = sources[index];
        activeName = source.name;
        source.healthCheckStatus = "checking";
        const visibleSource = state.sources.find((item) => item.id === source.id);
        if (visibleSource) visibleSource.healthCheckStatus = "checking";
        renderSources();
        setHealthProgress({
          checked,
          total: sources.length,
          working,
          failing,
          label: `Checking ${Math.min(checked + 1, sources.length)}/${sources.length}: ${source.name}`,
        });
        try {
          const result = await api(`/api/v1/sources/${source.id}/check-health`, {
            method: "POST",
            headers: adminHeaders(),
          });
          result.source.healthCheckStatus = result.working ? "working" : "failing";
          updateIndexedSource(result.source);
          if (result.working) {
            working += 1;
          } else {
            failing += 1;
          }
        } catch (error) {
          failing += 1;
          source.healthCheckStatus = "failing";
          source.last_error = error.message;
          const failedVisibleSource = state.sources.find((item) => item.id === source.id);
          if (failedVisibleSource) {
            failedVisibleSource.healthCheckStatus = "failing";
            failedVisibleSource.last_error = error.message;
          }
        }
        checked += 1;
        setHealthProgress({
          checked,
          total: sources.length,
          working,
          failing,
          label: `Checking sources${activeName ? ` - ${activeName}` : ""}`,
        });
        renderSources();
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, () => checkNext()));
    if (state.healthStopRequested) {
      setHealthProgress({
        checked,
        total: sources.length,
        working,
        failing,
        label: `Stopped: ${checked}/${sources.length} checked`,
      });
      showMessage(`Source health check stopped: ${checked}/${sources.length} checked.`, "bad");
    } else {
      setHealthProgress({ checked, total: sources.length, working, failing, done: true });
      showMessage(`Source health check complete: ${working} usable, ${failing} not working.`);
    }
    await loadSources({ keepPage: true });
    await loadOutput(state.selectedOutputSourceId);
  } catch (error) {
    setHealthProgress({ checked, total: checked || 1, working, failing, label: "RSS health check failed." });
    showMessage(error.message, "bad");
  } finally {
    state.healthChecking = false;
    state.healthStopRequested = false;
    els.stopSourceHealth.disabled = true;
    els.healthCheckScope.disabled = false;
    els.fetchAllRss.disabled = false;
    els.scrapeAllUrls.disabled = false;
    done();
  }
}

async function runBulkCollection(connectorType) {
  if (!els.adminKey.value.trim()) {
    showMessage("Enter the generated admin key before collecting sources.", "bad");
    return;
  }
  if (state.healthChecking || state.bulkCollecting) return;
  state.bulkCollecting = true;
  state.bulkStopRequested = false;
  const isUrl = connectorType === "url";
  const activeButton = isUrl ? els.scrapeAllUrls : els.fetchAllRss;
  const done = setBusy(activeButton, isUrl ? "Scraping..." : "Fetching...");
  els.checkSourceHealth.disabled = true;
  els.healthCheckScope.disabled = true;
  (isUrl ? els.fetchAllRss : els.scrapeAllUrls).disabled = true;
  els.stopSourceHealth.disabled = false;
  let completed = 0;
  let successful = 0;
  let failed = 0;
  try {
    setHealthProgress({ label: "Loading sources..." });
    await loadSourceIndex();
    const sources = state.allSources.filter(
      (source) => !source.archived && source.connector_type === connectorType
    );
    const operation = isUrl ? "URL scraping" : "RSS fetching";
    if (!sources.length) {
      setHealthProgress({ label: `No ${isUrl ? "URL" : "RSS"} sources found.`, done: true });
      return;
    }
    showMessage(`${operation} started for ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
    for (const source of sources) {
      if (state.bulkStopRequested) break;
      setHealthProgress({
        checked: completed,
        total: sources.length,
        working: successful,
        failing: failed,
        label: `${operation} ${completed + 1}/${sources.length}: ${source.name}`,
      });
      try {
        const result = await api(`/api/v1/sources/${source.id}/ingest`, {
          method: "POST",
          headers: adminHeaders(),
        });
        const job = await waitForIngestion(result.job, (current) => {
          setHealthProgress({
            checked: completed,
            total: sources.length,
            working: successful,
            failing: failed,
            label: `${operation}: ${source.name} (${current.normalized_count} stored)`,
          });
        });
        if (job.status === "success") {
          successful += 1;
          await loadOutputSources();
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      completed += 1;
      setHealthProgress({
        checked: completed,
        total: sources.length,
        working: successful,
        failing: failed,
        label: `${operation}: ${completed}/${sources.length} completed`,
      });
      await wait(50);
    }
    const stopped = state.bulkStopRequested;
    setHealthProgress({
      checked: completed,
      total: sources.length,
      working: successful,
      failing: failed,
      label: stopped
        ? `${operation} stopped: ${completed}/${sources.length} completed`
        : `${operation} complete: ${successful} successful, ${failed} failed`,
      done: !stopped,
    });
    showMessage(
      stopped
        ? `${operation} stopped after ${completed} sources.`
        : `${operation} complete: ${successful} successful, ${failed} failed.`,
      failed ? "bad" : "good"
    );
    await loadSources({ keepPage: true });
    await loadOutput(state.selectedOutputSourceId);
  } catch (error) {
    showMessage(error.message, "bad");
  } finally {
    state.bulkCollecting = false;
    state.bulkStopRequested = false;
    els.stopSourceHealth.disabled = true;
    els.checkSourceHealth.disabled = false;
    els.healthCheckScope.disabled = false;
    els.fetchAllRss.disabled = false;
    els.scrapeAllUrls.disabled = false;
    done();
  }
}

checkHealth();
startAiProgressPolling();
loadSources();
loadOutputSources();
loadOutput();
