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
  lang: (typeof localStorage !== "undefined" && localStorage.getItem("ps_lang")) || "en",
};

const PASS_THROUGH_K = 0xffff_ffff;

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
  langSelect: document.getElementById("langSelect"),
  heroEyebrow: document.getElementById("heroEyebrow"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("meta"),
  badgeTitle: document.getElementById("badgeTitle"),
  badgeCopy: document.getElementById("badgeCopy"),
  dropTitle: document.getElementById("dropTitle"),
  dropSub: document.getElementById("dropSub"),
  paletteLabel: document.getElementById("paletteLabel"),
  seedLabel: document.getElementById("seedLabel"),
  iterLabel: document.getElementById("iterLabel"),
  zoomLabel: document.getElementById("zoomLabel"),
  gridLabel: document.getElementById("gridLabel"),
  outputNameLabel: document.getElementById("outputNameLabel"),
  quantizeLabel: document.getElementById("quantizeLabel"),
  originalTitle: document.getElementById("originalTitle"),
  snappedTitle: document.getElementById("snappedTitle"),
  compareTitle: document.getElementById("compareTitle"),
  compareHint: document.getElementById("compareHint"),
  comparePlaceholder: document.getElementById("comparePlaceholder"),
  inputPlaceholder: document.getElementById("inputPlaceholder"),
  outputPlaceholder: document.getElementById("outputPlaceholder"),
  statsOriginalTitle: document.getElementById("statsOriginalTitle"),
  statsSnappedTitle: document.getElementById("statsSnappedTitle"),
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

const translations = {
  en: {
    lede: "Snap messy pixel art to a crisp grid locally in your browser. Tweak the palette size, compare before/after, and export the cleaned PNG.",
    meta: "WASM runs locally in your browser. Files never leave your machine.",
    badgeTitle: "Grid-perfect output",
    badgeCopy: "Consistent pixels and locked palette.",
    upload_btn: "Upload your sprite",
    sample_btn: "Use sample",
    download_btn: "Download PNG",
    batch_btn: "Batch process",
    drop_title: "Drop one or more images, or click",
    drop_sub: "PNG/JPEG · up to 10k x 10k",
    palette_label: "Palette (k colors):",
    seed_label: "Seed",
    iter_label: "k-means iterations",
    zoom_label: "Zoom",
    grid_label: "Show grid overlay",
    output_name: "Output name",
    quantize_label: "Quantize to k colors",
    swap_btn: "Swap before/after",
    palette_placeholder: "Hex palette, e.g. #FF00FF #00FFFF",
    apply_palette: "Apply palette",
    snap_btn: "Snap pixels",
    status_ready: "Ready: drop an image to start.",
    original_title: "Original",
    snapped_title: "Snapped",
    input_hint: "No image yet",
    output_hint: "Process to see the result",
    input_placeholder: "Drop an image",
    output_placeholder: "Waiting for result…",
    compare_title: "Compare",
    compare_hint: "Drag the slider",
    compare_placeholder: "Process to compare",
    stats_original_title: "Original",
    stats_snapped_title: "Snapped",
    stats_snapped_hint: "Process to see stats",
    stats_note: "Computed on 1024px max downsample.",
    resolution: "Resolution",
    unique_colors: "Unique colors",
    sampled_pixels: "Sampled pixels",
    processing: "Processing…",
    only_images: "Only PNG or JPEG images are supported.",
    image_ready: "Image ready. Tweak palette and snap.",
    load_image_first: "Load an image first.",
    pass_through: "pass-through",
    could_not_compute_input_stats: "Could not compute image stats.",
    done_message: "Done. k={k}, seed={seed}, iter={iter}. Adjust and retry.",
    error_processing: "Error processing image: {err}",
    add_files_batch: "Add files to the queue before batch processing.",
    wasm_not_ready: "WASM is not ready yet.",
    jszip_missing: "JSZip is not available for batch compression.",
    batch_progress: "Batch {done}/{total}…",
    batch_ready: "Batch ready ({total} files).",
    batch_failed: "Batch failed: {err}",
    loading_sample: "Loading sample…",
    sample_failed: "Sample could not be loaded.",
    booting_wasm: "Booting WASM engine…",
    wasm_ready: "WASM ready. Drop a PNG or use the sample.",
    wasm_failed: "Could not initialize WASM module.",
    custom_palette_applied: "Custom palette will apply on next run.",
    could_not_compute_result_stats: "Could not compute result stats.",
  },
  es: {
    lede: "Alinea pixel art desordenado a una cuadrícula nítida en tu navegador. Ajusta la paleta, compara antes/después y exporta el PNG limpio.",
    meta: "WASM se ejecuta localmente. Tus archivos no se suben.",
    badgeTitle: "Salida perfecta a cuadrícula",
    badgeCopy: "Píxeles consistentes y paleta bloqueada.",
    upload_btn: "Sube tu sprite",
    sample_btn: "Usar muestra",
    download_btn: "Descargar PNG",
    batch_btn: "Procesar lote",
    drop_title: "Arrastra una o varias imágenes o haz clic",
    drop_sub: "PNG/JPEG · hasta 10k x 10k",
    palette_label: "Paleta (k colores):",
    seed_label: "Semilla",
    iter_label: "Iteraciones k-means",
    zoom_label: "Zoom",
    grid_label: "Mostrar grid overlay",
    output_name: "Nombre de salida",
    quantize_label: "Cuantizar a k colores",
    swap_btn: "Intercambiar antes/después",
    palette_placeholder: "Paleta hex, p.ej. #FF00FF #00FFFF",
    apply_palette: "Aplicar paleta",
    snap_btn: "Snap pixels",
    status_ready: "Listo: arrastra una imagen para empezar.",
    original_title: "Original",
    snapped_title: "Snapped",
    input_hint: "Sin imagen",
    output_hint: "Procesa para ver el resultado",
    input_placeholder: "Arrastra una imagen",
    output_placeholder: "Esperando resultado…",
    compare_title: "Comparar",
    compare_hint: "Arrastra el deslizador",
    compare_placeholder: "Procesa para comparar",
    stats_original_title: "Original",
    stats_snapped_title: "Snapped",
    stats_snapped_hint: "Procesa para ver métricas",
    stats_note: "Calculado sobre muestreo 1024px máx.",
    resolution: "Resolución",
    unique_colors: "Colores únicos",
    sampled_pixels: "Pixeles muestreados",
    processing: "Procesando…",
    only_images: "Solo se aceptan imágenes PNG o JPEG.",
    image_ready: "Imagen lista. Ajusta la paleta y procesa.",
    load_image_first: "Carga una imagen primero.",
    pass_through: "sin cuantizar",
    could_not_compute_input_stats: "No se pudieron calcular las stats de la imagen.",
    done_message: "Listo. k={k}, seed={seed}, iter={iter}. Ajusta y prueba de nuevo.",
    error_processing: "Error procesando la imagen: {err}",
    add_files_batch: "Añade archivos a la cola antes de procesar el lote.",
    wasm_not_ready: "El motor WASM no está listo.",
    jszip_missing: "JSZip no está disponible para el lote.",
    batch_progress: "Lote {done}/{total}…",
    batch_ready: "Lote listo ({total} archivos).",
    batch_failed: "Falló el lote: {err}",
    loading_sample: "Cargando muestra…",
    sample_failed: "No se pudo cargar la muestra.",
    booting_wasm: "Iniciando motor WASM…",
    wasm_ready: "WASM listo. Sube un PNG o usa la muestra.",
    wasm_failed: "No se pudo inicializar el módulo WASM.",
    custom_palette_applied: "Paleta personalizada se aplicará en el siguiente run.",
    could_not_compute_result_stats: "No se pudieron calcular las stats del resultado.",
  },
  fr: {
    lede: "Alignez un pixel art brouillon sur une grille nette dans votre navigateur. Ajustez la palette, comparez avant/après et exportez le PNG nettoyé.",
    meta: "WASM tourne en local. Aucun fichier n’est envoyé.",
    badgeTitle: "Sortie alignée à la grille",
    badgeCopy: "Pixels cohérents et palette verrouillée.",
    upload_btn: "Importer votre sprite",
    sample_btn: "Utiliser l’exemple",
    download_btn: "Télécharger le PNG",
    batch_btn: "Traitement batch",
    drop_title: "Déposez une ou plusieurs images, ou cliquez",
    drop_sub: "PNG/JPEG · jusqu’à 10k x 10k",
    palette_label: "Palette (k couleurs) :",
    seed_label: "Seed",
    iter_label: "Itérations k-means",
    zoom_label: "Zoom",
    grid_label: "Afficher la grille",
    output_name: "Nom de sortie",
    quantize_label: "Quantifier à k couleurs",
    swap_btn: "Inverser avant/après",
    palette_placeholder: "Palette hex, ex. #FF00FF #00FFFF",
    apply_palette: "Appliquer la palette",
    snap_btn: "Snap pixels",
    status_ready: "Prêt : déposez une image.",
    original_title: "Original",
    snapped_title: "Snap",
    input_hint: "Pas d’image",
    output_hint: "Traitez pour voir le résultat",
    input_placeholder: "Déposez une image",
    output_placeholder: "En attente du résultat…",
    compare_title: "Comparer",
    compare_hint: "Faites glisser le slider",
    compare_placeholder: "Traitez pour comparer",
    stats_original_title: "Original",
    stats_snapped_title: "Snap",
    stats_snapped_hint: "Traitez pour voir les stats",
    stats_note: "Calculé sur un échantillon max 1024px.",
    resolution: "Résolution",
    unique_colors: "Couleurs uniques",
    sampled_pixels: "Pixels échantillonnés",
    processing: "Traitement…",
    only_images: "Seules les images PNG ou JPEG sont prises en charge.",
    image_ready: "Image prête. Ajustez la palette et lancez.",
    load_image_first: "Chargez d’abord une image.",
    pass_through: "sans quantification",
    could_not_compute_input_stats: "Impossible de calculer les stats de l’image.",
    done_message: "Terminé. k={k}, seed={seed}, iter={iter}. Ajustez et réessayez.",
    error_processing: "Erreur de traitement : {err}",
    add_files_batch: "Ajoutez des fichiers à la file avant le batch.",
    wasm_not_ready: "WASM n’est pas prêt.",
    jszip_missing: "JSZip n’est pas disponible pour le batch.",
    batch_progress: "Batch {done}/{total}…",
    batch_ready: "Batch prêt ({total} fichiers).",
    batch_failed: "Batch échoué : {err}",
    loading_sample: "Chargement de l’exemple…",
    sample_failed: "Impossible de charger l’exemple.",
    booting_wasm: "Démarrage du moteur WASM…",
    wasm_ready: "WASM prêt. Déposez un PNG ou utilisez l’exemple.",
    wasm_failed: "Impossible d’initialiser WASM.",
    custom_palette_applied: "Palette perso appliquée au prochain run.",
    could_not_compute_result_stats: "Impossible de calculer les stats du résultat.",
  },
  ja: {
    lede: "ブラウザ内でピクセルアートをきれいなグリッドにスナップ。パレットを調整し、ビフォー/アフターを比較してPNGを書き出せます。",
    meta: "WASM はローカル実行。ファイルは送信されません。",
    badgeTitle: "グリッドにぴったり",
    badgeCopy: "ピクセルとパレットを一貫管理。",
    upload_btn: "画像をアップロード",
    sample_btn: "サンプルを使う",
    download_btn: "PNGをダウンロード",
    batch_btn: "バッチ処理",
    drop_title: "画像をドロップ、またはクリック",
    drop_sub: "PNG/JPEG · 最大 10k x 10k",
    palette_label: "パレット (k色):",
    seed_label: "シード",
    iter_label: "k-means 繰り返し",
    zoom_label: "ズーム",
    grid_label: "グリッドを表示",
    output_name: "出力名",
    quantize_label: "k色に量子化",
    swap_btn: "前後を入れ替え",
    palette_placeholder: "Hex パレット例: #FF00FF #00FFFF",
    apply_palette: "パレットを適用",
    snap_btn: "Snap pixels",
    status_ready: "準備OK: 画像をドロップしてください。",
    original_title: "元画像",
    snapped_title: "スナップ後",
    input_hint: "画像なし",
    output_hint: "処理して結果を表示",
    input_placeholder: "画像をドロップ",
    output_placeholder: "結果待ち…",
    compare_title: "比較",
    compare_hint: "スライダーを動かす",
    compare_placeholder: "処理して比較",
    stats_original_title: "元画像",
    stats_snapped_title: "スナップ後",
    stats_snapped_hint: "処理して統計を表示",
    stats_note: "最大1024pxにダウンサンプルして計算。",
    resolution: "解像度",
    unique_colors: "ユニーク色数",
    sampled_pixels: "サンプルピクセル",
    processing: "処理中…",
    only_images: "PNG/JPEG のみサポートしています。",
    image_ready: "画像を読み込みました。パレットを調整して実行。",
    load_image_first: "先に画像を読み込んでください。",
    pass_through: "パススルー",
    could_not_compute_input_stats: "画像統計を計算できませんでした。",
    done_message: "完了。k={k}, seed={seed}, iter={iter}. 再調整して試してください。",
    error_processing: "処理エラー: {err}",
    add_files_batch: "バッチ前にファイルを追加してください。",
    wasm_not_ready: "WASM がまだ準備できていません。",
    jszip_missing: "JSZip が利用できません。",
    batch_progress: "バッチ {done}/{total}…",
    batch_ready: "バッチ完了 ({total} ファイル)。",
    batch_failed: "バッチ失敗: {err}",
    loading_sample: "サンプル読込中…",
    sample_failed: "サンプルを読み込めませんでした。",
    booting_wasm: "WASM エンジン起動中…",
    wasm_ready: "WASM 準備OK。PNGをドロップするかサンプルを使ってください。",
    wasm_failed: "WASMモジュールを初期化できませんでした。",
    custom_palette_applied: "カスタムパレットは次回適用されます。",
    could_not_compute_result_stats: "結果の統計を計算できませんでした。",
  },
};

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const t = (key, vars = {}) => {
  const dict = translations[state.lang] || translations.en;
  const fallback = translations.en;
  const str = (dict && dict[key]) || fallback[key] || key;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
};

const setStatus = (msg) => {
  els.status.textContent = msg;
};

const setLang = (lang) => {
  const next = translations[lang] ? lang : "en";
  state.lang = next;
  try {
    localStorage.setItem("ps_lang", next);
  } catch (_) {
    // ignore
  }
  applyTranslations();
};

const applyTranslations = () => {
  const set = (el, key) => {
    if (el) el.textContent = t(key);
  };

  set(els.lede, "lede");
  set(els.heroMeta, "meta");
  set(els.badgeTitle, "badgeTitle");
  set(els.badgeCopy, "badgeCopy");
  set(els.pick, "upload_btn");
  set(els.sample, "sample_btn");
  set(els.download, "download_btn");
  set(els.batch, "batch_btn");
  set(els.dropTitle, "drop_title");
  set(els.dropSub, "drop_sub");
  set(els.paletteLabel, "palette_label");
  set(els.seedLabel, "seed_label");
  set(els.iterLabel, "iter_label");
  set(els.zoomLabel, "zoom_label");
  set(els.gridLabel, "grid_label");
  set(els.outputNameLabel, "output_name");
  set(els.quantizeLabel, "quantize_label");
  set(els.swapBtn, "swap_btn");
  set(els.applyPalette, "apply_palette");
  set(els.snap, state.processing ? "processing" : "snap_btn");
  set(els.originalTitle, "original_title");
  set(els.snappedTitle, "snapped_title");
  set(els.inputMeta, "input_hint");
  set(els.outputMeta, "output_hint");
  set(els.inputPlaceholder, "input_placeholder");
  set(els.outputPlaceholder, "output_placeholder");
  set(els.compareTitle, "compare_title");
  set(els.compareHint, "compare_hint");
  set(els.comparePlaceholder, "compare_placeholder");
  set(els.statsOriginalTitle, "stats_original_title");
  set(els.statsSnappedTitle, "stats_snapped_title");
  set(els.outputStatsHint, "stats_snapped_hint");
  if (els.paletteInput) {
    els.paletteInput.placeholder = t("palette_placeholder");
  }
  if (!state.inputUrl && els.inputMeta) {
    set(els.inputMeta, "input_hint");
  }
  if (!state.outputUrl && els.outputMeta) {
    set(els.outputMeta, "output_hint");
  }
  if (els.langSelect) {
    els.langSelect.value = state.lang;
  }
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
    { label: t("resolution"), value: `${stats.width} x ${stats.height}` },
    { label: t("unique_colors"), value: stats.uniqueColors },
    { label: t("sampled_pixels"), value: `${stats.sampleSize.toLocaleString()} px` },
  ];
  target.innerHTML = items
    .map(
      (item) => `<div class="stat-item">
        <p class="stat-label">${labelPrefix}${item.label}</p>
        <p class="stat-value">${item.value}</p>
      </div>`
    )
    .join("");
  hintEl.textContent = t("stats_note");
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
  els.snap.textContent = busy ? t("processing") : t("snap_btn");
};

const clearOutputPreview = () => {
  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
    state.outputUrl = null;
  }
  els.outputPreview.hidden = true;
  els.outputPlaceholder.hidden = false;
  els.outputMeta.textContent = t("output_hint");
  els.outputPlaceholder.textContent = t("output_placeholder");
  els.download.setAttribute("disabled", "true");
  els.download.removeAttribute("href");
  els.compare.hidden = true;
  els.comparePlaceholder.hidden = false;
  els.comparePlaceholder.textContent = t("compare_placeholder");
  els.compareSlider.disabled = true;
  setCompareReveal(50);
  state.outputStats = null;
  renderStats(els.outputStats, els.outputStatsHint, null);
  renderPalette([]);
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
    setStatus(t("only_images"));
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
  setStatus(t("image_ready"));
  clearOutputPreview();
  if (analyze) {
    try {
      state.inputStats = await analyzeImage(state.inputUrl);
      renderStats(els.inputStats, els.inputStatsHint, state.inputStats);
    } catch (err) {
      console.error(err);
      setStatus(t("could_not_compute_input_stats"));
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
    setStatus(t("load_image_first"));
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
        : PASS_THROUGH_K; // passthrough
    const seed = BigInt(els.seed.value || "0");
    const iterations = Math.max(1, parseInt(els.iterations.value, 10) || 1);
    const outputBytes = process_image_with(state.inputBytes, k, seed, iterations);
    const blob = new Blob([outputBytes], { type: "image/png" });
    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
    }
    state.outputUrl = URL.createObjectURL(blob);
    const img = els.outputPreview;
    const kLabel = k === PASS_THROUGH_K ? t("pass_through") : k;
    const applyMeta = () => {
      els.outputMeta.textContent = `${img.naturalWidth}x${img.naturalHeight} · k=${kLabel} · seed=${seed} · iter=${iterations}`;
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
      setStatus(t("could_not_compute_result_stats"));
    }

    els.download.href = state.outputUrl;
    els.download.download = `${(els.outputName.value || "snapped").trim()}.png`;
    els.download.removeAttribute("disabled");

    const kDisplay = kLabel;
    setStatus(t("done_message", { k: kDisplay, seed, iter: iterations }));
  } catch (err) {
    console.error(err);
    setStatus(t("error_processing", { err: err?.message || err }));
    clearOutputPreview();
  } finally {
    setProcessing(false);
    refreshButtons();
  }
};

const processBatch = async () => {
  if (!state.queue.length) {
    setStatus(t("add_files_batch"));
    return;
  }
  if (!state.wasmReady) {
    setStatus(t("wasm_not_ready"));
    return;
  }
  if (!window.JSZip) {
    setStatus(t("jszip_missing"));
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
        : PASS_THROUGH_K;
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
      setStatus(t("batch_progress", { done: processed, total: state.queue.length }));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snapped_batch.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(t("batch_ready", { total: state.queue.length }));
  } catch (err) {
    console.error(err);
    setStatus(t("batch_failed", { err: err?.message || err }));
  } finally {
    state.batchProcessing = false;
    setProcessing(false);
    refreshButtons();
  }
};

const loadSample = async () => {
  setStatus(t("loading_sample"));
  try {
    const res = await fetch("../static/details.png");
    const blob = await res.blob();
    const file = new File([blob], "sample.png", { type: blob.type });
    await acceptFile(file);
  } catch (err) {
    setStatus(t("sample_failed"));
    console.error(err);
  }
};

const boot = async () => {
  setStatus(t("booting_wasm"));
  try {
    await initWasm("../pkg/spritefusion_pixel_snapper_bg.wasm");
    state.wasmReady = true;
    setStatus(t("wasm_ready"));
  } catch (err) {
    console.error(err);
    setStatus(t("wasm_failed"));
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
  if (els.langSelect) {
    els.langSelect.value = state.lang;
    els.langSelect.addEventListener("change", (e) => setLang(e.target.value));
  }
  applyTranslations();
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
    setStatus(t("custom_palette_applied"));
  });
  applyZoom(els.zoom.value);
  toggleGrid(els.gridToggle.checked);
};

wireUI();
renderStats(els.inputStats, els.inputStatsHint, null);
renderStats(els.outputStats, els.outputStatsHint, null);
boot();
