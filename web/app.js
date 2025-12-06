import initWasm, { process_image_with } from "../pkg/spritefusion_pixel_snapper.js";

const state = {
  wasmReady: false,
  inputBytes: null,
  inputName: null,
  inputUrl: null,
  outputUrl: null,
  queue: [],
  activeIndex: -1,
  inputStats: null,
  outputStats: null,
  lastDims: null,
  processing: false,
  batchProcessing: false,
};

const els = {
  drop: document.querySelector("[data-drop]"),
  fileInput: document.getElementById("file"),
  pick: document.getElementById("pick"),
  sample: document.getElementById("sample"),
  download: document.getElementById("download"),
  snap: document.getElementById("snap"),
  status: document.getElementById("status"),
  kSlider: document.getElementById("kSlider"),
  kValue: document.getElementById("kValue"),
  kInput: document.getElementById("kInput"),
  seed: document.getElementById("seed"),
  iterations: document.getElementById("iterations"),
  zoom: document.getElementById("zoom"),
  gridToggle: document.getElementById("gridToggle"),
  outputName: document.getElementById("outputName"),
  quantizeToggle: document.getElementById("quantizeToggle"),
  paletteInput: document.getElementById("paletteInput"),
  applyPalette: document.getElementById("applyPalette"),
  swapBtn: document.getElementById("swapBtn"),
  inputPreview: document.getElementById("inputPreview"),
  outputPreview: document.getElementById("outputPreview"),
  outputPlaceholder: document.getElementById("outputPlaceholder"),
  inputPlaceholder: document.getElementById("inputPlaceholder"),
  inputMeta: document.getElementById("inputMeta"),
  outputMeta: document.getElementById("outputMeta"),
  compare: document.getElementById("compare"),
  compareTop: document.getElementById("compareTop"),
  compareBase: document.getElementById("compareBase"),
  compareOverlay: document.getElementById("compareOverlay"),
  compareSlider: document.getElementById("compareSlider"),
  comparePlaceholder: document.getElementById("comparePlaceholder"),
  queue: document.getElementById("queue"),
  batch: document.getElementById("batch"),
  inputStats: document.getElementById("inputStats"),
  outputStats: document.getElementById("outputStats"),
  inputStatsHint: document.getElementById("inputStatsHint"),
  outputStatsHint: document.getElementById("outputStatsHint"),
  palette: document.getElementById("palette"),
};

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const setStatus = (msg) => {
  els.status.textContent = msg;
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

const toHex = (r, g, b) =>
  [r, g, b]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

const analyzeImage = async (url) => {
  const img = await loadImage(url);
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const hex = toHex(data[i], data[i + 1], data[i + 2]);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const topColors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex, count]) => ({ hex, count }));

  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    uniqueColors: counts.size,
    topColors,
    sampleSize: w * h,
  };
};

const renderStats = (target, hintEl, stats, labelPrefix = "") => {
  if (!target || !hintEl) return;
  if (!stats) {
    target.innerHTML = "";
    hintEl.textContent = "—";
    return;
  }
  const items = [
    { label: "Resolución", value: `${stats.width} x ${stats.height}` },
    { label: "Colores únicos", value: stats.uniqueColors },
    { label: "Muestreo", value: `${stats.sampleSize.toLocaleString()} px` },
  ];
  target.innerHTML = items
    .map(
      (item) => `<div class="stat-item">
        <p class="stat-label">${labelPrefix}${item.label}</p>
        <p class="stat-value">${item.value}</p>
      </div>`
    )
    .join("");
  hintEl.textContent = "Calculado sobre muestreo 1024px máx.";
};

const renderPalette = (colors) => {
  if (!els.palette) return;
  if (!colors || !colors.length) {
    els.palette.innerHTML = "";
    return;
  }
  const total = colors.reduce((sum, c) => sum + c.count, 0);
  els.palette.innerHTML = colors
    .map((c) => {
      const pct = Math.round((c.count / total) * 100);
      return `<div class="swatch" style="background:#${c.hex};" title="${c.hex} · ${pct}%">
        ${pct}%
      </div>`;
    })
    .join("");
};

const setProcessing = (busy) => {
  state.processing = busy;
  const disableInteractive = busy || state.batchProcessing;
  els.snap.disabled = disableInteractive || !state.inputBytes || !state.wasmReady;
  els.kSlider.disabled = disableInteractive;
  els.seed.disabled = disableInteractive;
  els.iterations.disabled = disableInteractive;
  els.zoom.disabled = disableInteractive;
  els.gridToggle.disabled = disableInteractive;
  els.batch.disabled = disableInteractive || !state.queue.length;
  els.download.setAttribute("aria-busy", busy);
  els.snap.textContent = busy ? "Procesando…" : "Snap pixels";
};

const clearOutputPreview = () => {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = null;
  }
  els.outputPreview.hidden = true;
  els.outputPlaceholder.hidden = false;
  els.outputMeta.textContent = "Procesa para ver el resultado";
  els.download.setAttribute("disabled", "true");
  els.download.removeAttribute("href");
  els.compare.hidden = true;
  els.comparePlaceholder.hidden = false;
  els.compareSlider.disabled = true;
  setCompareReveal(50);
  state.outputStats = null;
  renderStats(els.outputStats, els.outputStatsHint, null);
  renderPalette([]);
  els.inputPlaceholder.hidden = false;
  els.inputPreview.hidden = true;
};

const refreshButtons = () => {
  els.snap.disabled = !state.inputBytes || !state.wasmReady || state.processing;
  if (!state.outputUrl) {
    els.download.setAttribute("disabled", "true");
  } else {
    els.download.removeAttribute("disabled");
  }
  els.batch.disabled = state.processing || state.batchProcessing || !state.queue.length;
};

const applyZoom = (factor) => {
  document.querySelectorAll(".zoomable").forEach((img) => {
    img.style.transform = `scale(${factor})`;
  });
};

const toggleGrid = (on) => {
  document.querySelectorAll("[data-frame]").forEach((frame) => {
    frame.classList.toggle("grid-on", on);
  });
  els.compareTop?.classList.toggle("grid-on", on);
  els.compare?.classList.toggle("grid-on", on);
};

const renderQueue = () => {
  if (!els.queue) return;
  els.queue.innerHTML = state.queue
    .map(
      (item, idx) => `<button class="queue-pill ${idx === state.activeIndex ? "active" : ""}" data-idx="${idx}">
        ${item.file.name}
        <span class="muted">· ${formatBytes(item.file.size)}</span>
      </button>`
    )
    .join("");
  els.queue.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      setActiveFromQueue(idx);
    });
  });
};

const setActiveFromQueue = async (idx) => {
  if (idx < 0 || idx >= state.queue.length) return;
  state.activeIndex = idx;
  const file = state.queue[idx].file;
  await acceptFile(file, false);
  renderQueue();
};

const sizeCompare = (width, height) => {
  if (!els.compare) return;
  const body = els.compare.closest(".compare-body");
  if (!body) return;
  const ratio = width / height;
  const containerWidth = body.clientWidth || body.offsetWidth || 1;
  const targetHeight = Math.max(220, Math.round(containerWidth / ratio));
  body.style.height = `${targetHeight}px`;
  els.compare.style.setProperty("--ratio", ratio);
  els.compare.style.height = "100%";
  els.compare.style.width = "100%";
};

const setCompareReveal = (percent) => {
  const clamped = Math.min(100, Math.max(0, Number(percent) || 0));
  els.compareTop.style.setProperty("--reveal", `${clamped}%`);
  els.compareSlider.value = clamped;
};

const acceptFile = async (file, pushToQueue = true, analyze = true) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Only PNG or JPEG images are supported.");
    return;
  }

  state.inputBytes = new Uint8Array(await file.arrayBuffer());
  state.inputName = file.name.replace(/\.[^.]+$/, "");

  if (state.inputUrl) {
    URL.revokeObjectURL(state.inputUrl);
  }
  state.inputUrl = URL.createObjectURL(file);
  els.inputPreview.src = state.inputUrl;
  els.inputMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  els.inputPlaceholder.hidden = true;
  els.inputPreview.hidden = false;
  if (pushToQueue) {
    state.queue.push({ file });
    state.activeIndex = state.queue.length - 1;
  }
  renderQueue();
  setStatus("Image ready. Tweak palette and snap.");
  clearOutputPreview();
  if (analyze) {
    try {
      state.inputStats = await analyzeImage(state.inputUrl);
      renderStats(els.inputStats, els.inputStatsHint, state.inputStats);
    } catch (err) {
      console.error(err);
      setStatus("Could not compute image stats.");
    }
  }
  refreshButtons();
};

const acceptFiles = async (files) => {
  if (!files || !files.length) return;
  const list = Array.from(files);
  for (const [idx, file] of list.entries()) {
    const isLast = idx === list.length - 1;
    await acceptFile(file, true, isLast);
  }
};

const attachDropHandlers = () => {
  const zone = els.drop;

  zone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    zone.classList.add("dragging");
  });

  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));

  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    zone.classList.remove("dragging");
    const files = ev.dataTransfer.files;
    acceptFiles(files);
  });

  zone.addEventListener("click", () => els.fileInput.click());
};

const processImage = async () => {
  if (!state.inputBytes) {
    setStatus("Load an image first.");
    return;
  }
  setProcessing(true);
  try {
    const quantize = els.quantizeToggle.checked;
    const paletteText = (els.paletteInput.value || "").trim();
    const customPalette = paletteText
      ? paletteText
          .split(/\s+/)
          .map((hex) => hex.replace("#", ""))
          .filter((h) => /^[0-9a-fA-F]{6}$/.test(h))
      : [];
    const k = quantize
      ? parseInt(els.kSlider.value, 10)
      : customPalette.length > 0
        ? Math.max(1, customPalette.length)
        : Number.MAX_SAFE_INTEGER; // passthrough
    const seed = BigInt(els.seed.value || "0");
    const iterations = Math.max(1, parseInt(els.iterations.value, 10) || 1);
    const outputBytes = process_image_with(state.inputBytes, k, seed, iterations);
    const blob = new Blob([outputBytes], { type: "image/png" });
    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
    }
    state.outputUrl = URL.createObjectURL(blob);
    const img = els.outputPreview;
    const applyMeta = () => {
      els.outputMeta.textContent = `${img.naturalWidth}x${img.naturalHeight} · k=${k} · seed=${seed} · iter=${iterations}`;
    };

    const waitForImage = new Promise((resolve) => {
      img.onload = () => {
        applyMeta();
        resolve();
      };
    });

    img.hidden = false;
    els.outputPlaceholder.hidden = true;
    img.src = state.outputUrl;
    if (img.complete && img.naturalWidth) {
      applyMeta();
      state.lastDims = { width: img.naturalWidth, height: img.naturalHeight };
      img.onload = null;
    } else {
      await waitForImage;
      state.lastDims = { width: img.naturalWidth, height: img.naturalHeight };
    }

    els.compareBase.src = state.inputUrl;
    els.compareOverlay.src = state.outputUrl;
    els.compare.hidden = false;
    els.comparePlaceholder.hidden = true;
    els.compareSlider.disabled = false;
    setCompareReveal(50);
    sizeCompare(img.naturalWidth, img.naturalHeight);

    try {
      state.outputStats = await analyzeImage(state.outputUrl);
      renderStats(els.outputStats, els.outputStatsHint, state.outputStats);
      renderPalette(state.outputStats.topColors);
    } catch (err) {
      console.error(err);
      setStatus("No se pudieron calcular stats del resultado.");
    }

    els.download.href = state.outputUrl;
    els.download.download = `${(els.outputName.value || "snapped").trim()}.png`;
    els.download.removeAttribute("disabled");

    setStatus(`Done. k=${k === Number.MAX_SAFE_INTEGER ? "pass-through" : k}, seed=${seed}, iter=${iterations}. Adjust and retry.`);
  } catch (err) {
    console.error(err);
    setStatus(`Error processing image: ${err?.message || err}`);
    clearOutputPreview();
  } finally {
    setProcessing(false);
    refreshButtons();
  }
};

const processBatch = async () => {
  if (!state.queue.length) {
    setStatus("Add files to the queue before batch processing.");
    return;
  }
  if (!state.wasmReady) {
    setStatus("WASM is not ready yet.");
    return;
  }
  if (!window.JSZip) {
    setStatus("JSZip is not available for batch compression.");
    return;
  }
  state.batchProcessing = true;
  setProcessing(true);
  try {
    const quantize = els.quantizeToggle.checked;
    const paletteText = (els.paletteInput.value || "").trim();
    const customPalette = paletteText
      ? paletteText
          .split(/\s+/)
          .map((hex) => hex.replace("#", ""))
          .filter((h) => /^[0-9a-fA-F]{6}$/.test(h))
      : [];
    const k = quantize
      ? parseInt(els.kSlider.value, 10)
      : customPalette.length > 0
        ? Math.max(1, customPalette.length)
        : Number.MAX_SAFE_INTEGER;
    const seed = BigInt(els.seed.value || "0");
    const iterations = Math.max(1, parseInt(els.iterations.value, 10) || 1);
    const zip = new JSZip();
    let processed = 0;
    for (const item of state.queue) {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const result = process_image_with(bytes, k, seed, iterations);
      const base = item.file.name.replace(/\.[^.]+$/, "");
      zip.file(`${base}_snapped.png`, result);
      processed += 1;
      setStatus(`Batch ${processed}/${state.queue.length}…`);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snapped_batch.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Batch ready (${state.queue.length} files).`);
  } catch (err) {
    console.error(err);
    setStatus(`Batch failed: ${err?.message || err}`);
  } finally {
    state.batchProcessing = false;
    setProcessing(false);
    refreshButtons();
  }
};

const loadSample = async () => {
  setStatus("Loading sample…");
  try {
    const res = await fetch("../static/details.png");
    const blob = await res.blob();
    const file = new File([blob], "sample.png", { type: blob.type });
    await acceptFile(file);
  } catch (err) {
    setStatus("Sample could not be loaded.");
    console.error(err);
  }
};

const boot = async () => {
  setStatus("Booting WASM engine…");
  try {
    await initWasm("../pkg/spritefusion_pixel_snapper_bg.wasm");
    state.wasmReady = true;
    setStatus("WASM ready. Drop a PNG or use the sample.");
  } catch (err) {
    console.error(err);
    setStatus("Could not initialize WASM module.");
  } finally {
    refreshButtons();
  }
};

const wireUI = () => {
  attachDropHandlers();
  els.kValue.textContent = els.kSlider.value;
  const syncK = (val) => {
    const k = Math.min(128, Math.max(4, parseInt(val || "16", 10)));
    els.kSlider.value = k;
    els.kInput.value = k;
    els.kValue.textContent = k;
  };
  els.fileInput.addEventListener("change", (e) => {
    acceptFiles(e.target.files);
    e.target.value = "";
  });
  els.pick.addEventListener("click", () => els.fileInput.click());
  els.sample.addEventListener("click", loadSample);
  els.snap.addEventListener("click", processImage);
  els.batch.addEventListener("click", processBatch);
  els.kSlider.addEventListener("input", (e) => {
    syncK(e.target.value);
  });
  els.kInput.addEventListener("input", (e) => {
    syncK(e.target.value);
  });
  els.compareSlider.addEventListener("input", (e) => {
    setCompareReveal(e.target.value);
  });
  els.zoom.addEventListener("input", (e) => {
    applyZoom(e.target.value);
  });
  els.gridToggle.addEventListener("change", (e) => {
    toggleGrid(e.target.checked);
  });
  window.addEventListener("resize", () => {
    if (state.lastDims) {
      sizeCompare(state.lastDims.width, state.lastDims.height);
    }
  });
  els.swapBtn.addEventListener("click", () => {
    const tmp = els.compareBase.src;
    els.compareBase.src = els.compareOverlay.src;
    els.compareOverlay.src = tmp;
  });
  els.applyPalette.addEventListener("click", () => {
    setStatus("Custom palette applied to next run.");
  });
  applyZoom(els.zoom.value);
  toggleGrid(els.gridToggle.checked);
};

wireUI();
renderStats(els.inputStats, els.inputStatsHint, null);
renderStats(els.outputStats, els.outputStatsHint, null);
boot();
