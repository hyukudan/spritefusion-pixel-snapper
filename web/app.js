import initWasm, { process_image_with, process_image_with_meta } from "../pkg/spritefusion_pixel_snapper.js";

const state = {
  wasmReady: false,
  inputBytes: null,
  inputName: null,
  inputUrl: null,
  outputUrl: null,
  outputBytes: null, // Store original output bytes for remapping
  queue: [],
  activeIndex: -1,
  inputStats: null,
  outputStats: null,
  lastDims: null,
  diffRatio: null,
  gridMeta: null,
  processing: false,
  batchProcessing: false,
  colorRemap: {}, // Color remapping: { "FF0000": "00FF00" }
  lang: (typeof localStorage !== "undefined" && localStorage.getItem("ps_lang")) || "en",
};

const PASS_THROUGH_K = 0xffff_ffff;

const BUILTIN_PRESETS = () => ({
  Default: {
    k: parseInt(els.kSlider?.value || "16", 10) || 16,
    seed: els.seed?.value || "42",
    iterations: els.iterations?.value || "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette: "",
  },
  "Game Boy (DMG)": {
    k: 4,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "center",
    edgeWeight: "1",
    palette: "#0F380F #306230 #8BAC0F #9BBC0F",
  },
  "Game Boy Pocket": {
    k: 4,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "center",
    edgeWeight: "1",
    palette: "#000000 #555555 #AAAAAA #FFFFFF",
  },
  "CGA (cyan/magenta)": {
    k: 4,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette: "#000000 #55FFFF #FF55FF #FFFFFF",
  },
  "EGA 16": {
    k: 16,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette:
      "#000000 #0000AA #00AA00 #00AAAA #AA0000 #AA00AA #AA5500 #AAAAAA #555555 #5555FF #55FF55 #55FFFF #FF5555 #FF55FF #FFFF55 #FFFFFF",
  },
  "PICO-8": {
    k: 16,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette:
      "#000000 #1D2B53 #7E2553 #008751 #AB5236 #5F574F #C2C3C7 #FFF1E8 #FF004D #FFA300 #FFEC27 #00E436 #29ADFF #83769C #FF77A8 #FFCCAA",
  },
  "C64 (16)": {
    k: 16,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette:
      "#000000 #FFFFFF #813338 #75cec8 #8e3c97 #56ac4d #2e2c9b #edf171 #8e5029 #553800 #c46c71 #4a4a4a #7b7b7b #a9ff9f #706deb #b2b2b2",
  },
  "ZX Spectrum": {
    k: 16,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette:
      "#000000 #0000D7 #D70000 #D700D7 #00D700 #00D7D7 #D7D700 #D7D7D7 #0000FF #FF0000 #FF00FF #00FF00 #00FFFF #FFFF00 #FFFFFF #000000",
  },
  "NES 16": {
    k: 54,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    // Nestopia NES palette (54 entries, vibrant, avoids washed-out grays)
    palette:
      "#7C7C7C #0000FC #0000BC #4428BC #940084 #A80020 #A81000 #881400 #503000 #007800 #006800 #005800 #004058 #000000 #BCBCBC #0078F8 #0058F8 #6844FC #D800CC #E40058 #F83800 #E45C10 #AC7C00 #00B800 #00A800 #00A844 #008888 #000000 #F8F8F8 #3CBCFC #6888FC #9878F8 #F878F8 #F85898 #F87858 #FCA044 #F8B800 #B8F818 #58D854 #58F898 #00E8D8 #787878 #FCFCFC #A4E4FC #B8B8F8 #D8B8F8 #F8B8F8 #F8A4C0 #F0D0B0 #FCE0A8 #F8D878 #D8F878 #B8F8B8 #B8F8D8 #00FCFC #F8D8F8",
  },
  "Apple II": {
    k: 6,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "center",
    edgeWeight: "1",
    palette: "#000000 #FFFFFF #DD00DD #00DDDD #0000DD #00DD00",
  },
  "CGA Artifact": {
    k: 4,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "center",
    edgeWeight: "1",
    palette: "#000000 #5555FF #FF5555 #FFFF55",
  },
  "Amiga WB": {
    k: 16,
    seed: "42",
    iterations: "15",
    quantize: true,
    resampleMode: "majority",
    edgeWeight: "1",
    palette:
      "#000000 #555555 #AAAAAA #FFFFFF #0055AA #00AABB #55FFFF #004488 #880000 #AA5500 #FFAA00 #226600 #448844 #88BB88 #6666AA #AA88CC",
  },
});

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
  resampleLabel: document.getElementById("resampleLabel"),
  resampleMode: document.getElementById("resampleMode"),
  resampleMajority: document.getElementById("resampleMajority"),
  resampleCenter: document.getElementById("resampleCenter"),
  resampleEdge: document.getElementById("resampleEdge"),
  edgeWeight: document.getElementById("edgeWeight"),
  edgeWeightLabel: document.getElementById("edgeWeightLabel"),
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
  presetLabel: document.getElementById("presetLabel"),
  presetSelect: document.getElementById("presetSelect"),
  applyPreset: document.getElementById("applyPreset"),
  savePreset: document.getElementById("savePreset"),
  deletePreset: document.getElementById("deletePreset"),
  presetName: document.getElementById("presetName"),
  paletteIOLabel: document.getElementById("paletteIOLabel"),
  importPalette: document.getElementById("importPalette"),
  exportPalette: document.getElementById("exportPalette"),
  importPaletteFile: document.getElementById("importPaletteFile"),
  diffToggle: document.getElementById("diffToggle"),
  diffToggleLabel: document.getElementById("diffToggleLabel"),
  diffInfo: document.getElementById("diffInfo"),
  diffOverlay: document.getElementById("diffOverlay"),
  loupeToggle: document.getElementById("loupeToggle"),
  loupeLabel: document.getElementById("loupeLabel"),
  loupe: document.getElementById("loupe"),
  targetWidth: document.getElementById("targetWidth"),
  targetHeight: document.getElementById("targetHeight"),
  targetWidthLabel: document.getElementById("targetWidthLabel"),
  targetHeightLabel: document.getElementById("targetHeightLabel"),
  gridStep: document.querySelector('[data-grid="snap"]'),
  gridCanvas: document.getElementById("gridCanvas"),
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
    resample_label: "Resampling",
    resample_majority: "Majority vote",
    resample_center: "Center sample",
    resample_edge: "Edge-aware vote",
    resample_help: "How to pick the color per cell: majority of pixels, center pixel, or edge-aware weighting.",
    edge_weight: "Edge weight",
    edge_weight_help: "How much edges influence the vote in edge-aware mode.",
    preset_label: "Presets",
    preset_apply: "Apply",
    preset_save: "Save",
    preset_delete: "Delete",
    palette_io: "Palette I/O",
    palette_import: "Import",
    palette_export: "Export",
    preset_saved: "Preset saved.",
    preset_applied: "Applied preset {name}.",
    palette_invalid: "Palette format not recognized.",
    palette_imported: "Palette imported.",
    target_width: "Target width",
    target_height: "Target height",
    diff_toggle: "Show diff mask",
    diff_info: "Diff: {pct}% pixels changed",
    loupe_label: "Loupe (1:1)",
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
    grid_regularity: "Grid regularity",
    color_similarity: "Color similarity",
    pixels_changed: "Pixels changed",
    click_to_remap: "Click to remap color",
    reset_remap: "Reset colors",
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
    resample_label: "Re-muestreo",
    resample_majority: "Mayoría",
    resample_center: "Centro",
    resample_edge: "Sens. bordes",
    resample_help: "Cómo elegir el color de cada celda: mayoría, píxel central o ponderado por bordes.",
    edge_weight: "Peso de borde",
    edge_weight_help: "Cuánto influye el borde en modo sensible a bordes.",
    preset_label: "Presets",
    preset_apply: "Aplicar",
    preset_save: "Guardar",
    preset_delete: "Borrar",
    palette_io: "I/O de paleta",
    palette_import: "Importar",
    palette_export: "Exportar",
    preset_saved: "Preset guardado.",
    preset_applied: "Preset aplicado: {name}.",
    palette_invalid: "Formato de paleta no reconocido.",
    palette_imported: "Paleta importada.",
    target_width: "Ancho objetivo",
    target_height: "Alto objetivo",
    diff_toggle: "Mostrar máscara diff",
    diff_info: "Diff: {pct}% de píxeles cambiados",
    loupe_label: "Lupa (1:1)",
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
    grid_regularity: "Regularidad del grid",
    color_similarity: "Similitud de color",
    pixels_changed: "Píxeles cambiados",
    click_to_remap: "Clic para reasignar color",
    reset_remap: "Restablecer colores",
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
    resample_label: "Re-échantillonnage",
    resample_majority: "Majorité",
    resample_center: "Centre",
    resample_edge: "Sens. bordures",
    resample_help: "Choix du pixel par cellule : majorité, centre, ou pondération par bordure.",
    edge_weight: "Poids des bords",
    edge_weight_help: "Poids des bords en mode sensible aux bordures.",
    preset_label: "Presets",
    preset_apply: "Appliquer",
    preset_save: "Sauver",
    preset_delete: "Supprimer",
    palette_io: "I/O palette",
    palette_import: "Importer",
    palette_export: "Exporter",
    preset_saved: "Preset enregistré.",
    preset_applied: "Preset appliqué : {name}.",
    palette_invalid: "Format de palette non reconnu.",
    palette_imported: "Palette importée.",
    target_width: "Largeur cible",
    target_height: "Hauteur cible",
    diff_toggle: "Afficher le masque diff",
    diff_info: "Diff : {pct}% de pixels modifiés",
    loupe_label: "Loupe (1:1)",
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
    grid_regularity: "Régularité de la grille",
    color_similarity: "Similarité des couleurs",
    pixels_changed: "Pixels modifiés",
    click_to_remap: "Cliquez pour remapper la couleur",
    reset_remap: "Réinitialiser les couleurs",
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
    resample_label: "リサンプリング",
    resample_majority: "多数決",
    resample_center: "中央ピクセル",
    resample_edge: "エッジ重み",
    resample_help: "セル内の色の決め方: 多数決 / 中央 / エッジ重み付け。",
    edge_weight: "エッジ重み",
    edge_weight_help: "エッジ感度モードでの重み付け。",
    preset_label: "プリセット",
    preset_apply: "適用",
    preset_save: "保存",
    preset_delete: "削除",
    palette_io: "パレット入出力",
    palette_import: "インポート",
    palette_export: "エクスポート",
    preset_saved: "プリセットを保存しました。",
    preset_applied: "プリセットを適用: {name}。",
    palette_invalid: "パレットの形式が正しくありません。",
    palette_imported: "パレットを読み込みました。",
    target_width: "目標幅",
    target_height: "目標高さ",
    target_width: "目標幅",
    target_height: "目標高さ",
    diff_toggle: "差分マスク表示",
    diff_info: "差分: {pct}% のピクセルが変更",
    loupe_label: "ルーペ (1:1)",
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
    grid_regularity: "グリッド規則性",
    color_similarity: "色の類似度",
    pixels_changed: "変更ピクセル",
    click_to_remap: "クリックして色を変更",
    reset_remap: "色をリセット",
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

const refreshResampleUI = () => {
  els.edgeWeight.disabled = els.resampleMode.value !== "edge" || state.processing || state.batchProcessing;
};

const updateDiffInfo = () => {
  if (!els.diffInfo) return;
  if (state.diffRatio === null) {
    els.diffInfo.textContent = "";
    return;
  }
  const pct = state.diffRatio.toFixed(2);
  els.diffInfo.textContent = t("diff_info", { pct });
};

const paletteToRgb = (palette) =>
  palette.map((hex) => {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  });

const paletteQuantize = async (bytes, palette) => {
  if (!palette.length) return bytes;
  const rgbPalette = paletteToRgb(palette);
  const blob = new Blob([bytes]);
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let idx = 0;
  while (idx < data.length) {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < rgbPalette.length; i++) {
      const [pr, pg, pb] = rgbPalette[i];
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    const [pr, pg, pb] = rgbPalette[best];
    data[idx] = pr;
    data[idx + 1] = pg;
    data[idx + 2] = pb;
    idx += 4;
  }
  ctx.putImageData(imageData, 0, 0);
  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const buf = await outBlob.arrayBuffer();
  return new Uint8Array(buf);
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
  set(els.resampleLabel, "resample_label");
  set(els.resampleMajority, "resample_majority");
  set(els.resampleCenter, "resample_center");
  set(els.resampleEdge, "resample_edge");
  set(els.edgeWeightLabel, "edge_weight");
  if (els.resampleMode) {
    els.resampleMode.title = t("resample_help");
  }
  if (els.edgeWeight) {
    els.edgeWeight.title = t("edge_weight_help");
  }
  set(els.targetWidthLabel, "target_width");
  set(els.targetHeightLabel, "target_height");
  set(els.presetLabel, "preset_label");
  set(els.applyPreset, "preset_apply");
  set(els.savePreset, "preset_save");
  set(els.deletePreset, "preset_delete");
  set(els.paletteIOLabel, "palette_io");
  set(els.importPalette, "palette_import");
  set(els.exportPalette, "palette_export");
  set(els.diffToggleLabel, "diff_toggle");
  set(els.loupeLabel, "loupe_label");
  set(els.swapBtn, "swap_btn");
  set(els.applyPalette, "apply_palette");
  set(els.targetWidthLabel, "target_width");
  set(els.targetHeightLabel, "target_height");
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

const computeGridRegularity = (meta) => {
  if (!meta || !meta.colCuts || !meta.rowCuts) return null;
  const colCuts = meta.colCuts;
  const rowCuts = meta.rowCuts;
  if (colCuts.length < 2 && rowCuts.length < 2) return null;

  const computeVariance = (cuts) => {
    if (cuts.length < 2) return 0;
    const gaps = [];
    for (let i = 1; i < cuts.length; i++) {
      gaps.push(cuts[i] - cuts[i - 1]);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
    return { mean, variance, stdDev: Math.sqrt(variance) };
  };

  const colStats = computeVariance(colCuts);
  const rowStats = computeVariance(rowCuts);

  // Regularity score: 100% = perfectly uniform, lower = more irregular
  const colRegularity = colStats.mean > 0 ? Math.max(0, 100 - (colStats.stdDev / colStats.mean) * 100) : 100;
  const rowRegularity = rowStats.mean > 0 ? Math.max(0, 100 - (rowStats.stdDev / rowStats.mean) * 100) : 100;

  return {
    colRegularity: colRegularity.toFixed(1),
    rowRegularity: rowRegularity.toFixed(1),
    avgRegularity: ((colRegularity + rowRegularity) / 2).toFixed(1),
  };
};

const computeColorDistance = async (inputUrl, outputUrl) => {
  if (!inputUrl || !outputUrl) return null;
  try {
    const [inImg, outImg] = await Promise.all([loadImage(inputUrl), loadImage(outputUrl)]);
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(inImg.naturalWidth, inImg.naturalHeight));
    const w = Math.max(1, Math.round(inImg.naturalWidth * scale));
    const h = Math.max(1, Math.round(inImg.naturalHeight * scale));

    const canvas1 = document.createElement("canvas");
    const canvas2 = document.createElement("canvas");
    canvas1.width = canvas2.width = w;
    canvas1.height = canvas2.height = h;

    const ctx1 = canvas1.getContext("2d");
    const ctx2 = canvas2.getContext("2d");
    ctx1.imageSmoothingEnabled = ctx2.imageSmoothingEnabled = false;
    ctx1.drawImage(inImg, 0, 0, w, h);
    ctx2.drawImage(outImg, 0, 0, w, h);

    const data1 = ctx1.getImageData(0, 0, w, h).data;
    const data2 = ctx2.getImageData(0, 0, w, h).data;

    let totalDist = 0;
    let pixelCount = 0;

    for (let i = 0; i < data1.length; i += 4) {
      const a1 = data1[i + 3];
      const a2 = data2[i + 3];
      if (a1 === 0 && a2 === 0) continue;

      const dr = data1[i] - data2[i];
      const dg = data1[i + 1] - data2[i + 1];
      const db = data1[i + 2] - data2[i + 2];
      totalDist += Math.sqrt(dr * dr + dg * dg + db * db);
      pixelCount++;
    }

    const avgDist = pixelCount > 0 ? totalDist / pixelCount : 0;
    // Max possible distance is sqrt(255^2 * 3) ≈ 441.67
    const maxDist = Math.sqrt(255 * 255 * 3);
    const similarity = ((1 - avgDist / maxDist) * 100).toFixed(1);

    return {
      avgDistance: avgDist.toFixed(2),
      similarity,
    };
  } catch (e) {
    console.error("Error computing color distance:", e);
    return null;
  }
};

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

const renderStats = (target, hintEl, stats, labelPrefix = "", qualityMetrics = null) => {
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

  // Add quality metrics if available
  if (qualityMetrics) {
    if (qualityMetrics.gridRegularity) {
      items.push({ label: t("grid_regularity"), value: `${qualityMetrics.gridRegularity}%` });
    }
    if (qualityMetrics.colorSimilarity) {
      items.push({ label: t("color_similarity"), value: `${qualityMetrics.colorSimilarity}%` });
    }
    if (qualityMetrics.pixelsChanged !== undefined) {
      items.push({ label: t("pixels_changed"), value: `${qualityMetrics.pixelsChanged}%` });
    }
  }

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

const applyColorRemap = async () => {
  if (!state.outputBytes || Object.keys(state.colorRemap).length === 0) return;

  const blob = new Blob([state.outputBytes], { type: "image/png" });
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Build lookup table from remap
  const remapLookup = {};
  for (const [from, to] of Object.entries(state.colorRemap)) {
    const fromR = parseInt(from.slice(0, 2), 16);
    const fromG = parseInt(from.slice(2, 4), 16);
    const fromB = parseInt(from.slice(4, 6), 16);
    const toR = parseInt(to.slice(0, 2), 16);
    const toG = parseInt(to.slice(2, 4), 16);
    const toB = parseInt(to.slice(4, 6), 16);
    remapLookup[`${fromR},${fromG},${fromB}`] = [toR, toG, toB];
  }

  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    if (remapLookup[key]) {
      const [r, g, b] = remapLookup[key];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

  if (state.outputUrl) {
    URL.revokeObjectURL(state.outputUrl);
  }
  state.outputUrl = URL.createObjectURL(outBlob);

  els.outputPreview.src = state.outputUrl;
  els.compareOverlay.src = state.outputUrl;
  els.download.href = state.outputUrl;

  // Re-analyze to update stats
  try {
    state.outputStats = await analyzeImage(state.outputUrl);
    renderPalette(state.outputStats.topColors);
  } catch (e) {
    console.error(e);
  }
};

const renderPalette = (colors) => {
  if (!els.palette) return;
  if (!colors || !colors.length) {
    els.palette.innerHTML = "";
    return;
  }
  const total = colors.reduce((sum, c) => sum + c.count, 0);

  // Add reset button if there are remaps
  const hasRemaps = Object.keys(state.colorRemap).length > 0;
  const resetBtn = hasRemaps
    ? `<button class="swatch reset-remap" title="${t("reset_remap")}">↺</button>`
    : "";

  els.palette.innerHTML = colors
    .map((c) => {
      const pct = Math.round((c.count / total) * 100);
      const remapped = state.colorRemap[c.hex];
      const displayColor = remapped ? `#${remapped}` : `#${c.hex}`;
      const remapIndicator = remapped ? " ✓" : "";
      return `<div class="swatch" style="background:${displayColor}; cursor: pointer;"
                   title="${t("click_to_remap")}: #${c.hex} · ${pct}%${remapIndicator}"
                   data-hex="${c.hex}">
        ${pct}%
      </div>`;
    })
    .join("") + resetBtn;

  // Add click handlers
  els.palette.querySelectorAll(".swatch[data-hex]").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const hex = swatch.dataset.hex;
      const currentColor = state.colorRemap[hex] || hex;

      // Create hidden color input
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = `#${currentColor}`;
      picker.style.position = "absolute";
      picker.style.opacity = "0";
      picker.style.pointerEvents = "none";
      document.body.appendChild(picker);

      picker.addEventListener("input", (e) => {
        const newColor = e.target.value.replace("#", "").toUpperCase();
        if (newColor !== hex) {
          state.colorRemap[hex] = newColor;
        } else {
          delete state.colorRemap[hex];
        }
        applyColorRemap();
      });

      picker.addEventListener("change", () => {
        document.body.removeChild(picker);
      });

      picker.click();
    });
  });

  // Reset button handler
  const resetEl = els.palette.querySelector(".reset-remap");
  if (resetEl) {
    resetEl.addEventListener("click", async () => {
      state.colorRemap = {};
      if (state.outputBytes) {
        const blob = new Blob([state.outputBytes], { type: "image/png" });
        if (state.outputUrl) {
          URL.revokeObjectURL(state.outputUrl);
        }
        state.outputUrl = URL.createObjectURL(blob);
        els.outputPreview.src = state.outputUrl;
        els.compareOverlay.src = state.outputUrl;
        els.download.href = state.outputUrl;
        try {
          state.outputStats = await analyzeImage(state.outputUrl);
          renderPalette(state.outputStats.topColors);
        } catch (e) {
          console.error(e);
        }
      }
    });
  }
};

const parsePaletteText = (text) =>
  (text || "")
    .split(/[\s,]+/)
    .map((hex) => hex.replace("#", ""))
    .filter((h) => /^[0-9a-fA-F]{6}$/.test(h));

const importPaletteText = (text) => {
  const colors = parsePaletteText(text);
  if (!colors.length) {
    setStatus(t("palette_invalid"));
    return;
  }
  const formatted = colors.map((h) => `#${h.toUpperCase()}`).join(" ");
  els.paletteInput.value = formatted;
  setStatus(t("palette_imported"));
};

const exportPaletteText = () => {
  let palette = parsePaletteText(els.paletteInput.value);
  if (!palette.length && state.outputStats?.topColors?.length) {
    palette = state.outputStats.topColors.map((c) => c.hex);
  }
  if (!palette.length) return;
  const content = palette.map((h) => `#${h.toUpperCase()}`).join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "palette.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
  els.resampleMode.disabled = disableInteractive;
  els.edgeWeight.disabled = disableInteractive || els.resampleMode.value !== "edge";
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
  // Clear grid canvas
  if (els.gridCanvas) {
    els.gridCanvas.hidden = true;
    const ctx = els.gridCanvas.getContext("2d");
    ctx.clearRect(0, 0, els.gridCanvas.width, els.gridCanvas.height);
  }
  els.outputMeta.textContent = t("output_hint");
  els.outputPlaceholder.textContent = t("output_placeholder");
  els.download.setAttribute("disabled", "true");
  els.download.removeAttribute("href");
  els.compare.hidden = true;
  els.comparePlaceholder.hidden = false;
  els.comparePlaceholder.textContent = t("compare_placeholder");
  els.compareSlider.disabled = true;
  state.diffRatio = null;
  if (els.diffOverlay) {
    els.diffOverlay.hidden = true;
    els.diffOverlay.src = "";
  }
  updateDiffInfo();
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
  const snapGrid = document.querySelector('[data-grid="snap"]');
  if (snapGrid) {
    snapGrid.classList.toggle("grid-on", on);
  }
  // Redraw canvas grid
  if (state.gridMeta) {
    setGridOverlay(state.gridMeta);
  }
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

const setGridOverlay = (meta) => {
  if (!meta || !els.outputPreview || !els.gridStep || !els.gridCanvas) return;
  const img = els.outputPreview;
  const rect = img.getBoundingClientRect();
  const containerRect = els.gridStep.getBoundingClientRect();

  // Calculate actual rendered image size considering object-fit: contain
  const naturalW = img.naturalWidth || 1;
  const naturalH = img.naturalHeight || 1;
  const elementW = rect.width;
  const elementH = rect.height;
  const scaleX = elementW / naturalW;
  const scaleY = elementH / naturalH;
  const scale = Math.min(scaleX, scaleY);
  const renderedW = naturalW * scale;
  const renderedH = naturalH * scale;

  // Calculate offset from container edge to rendered image edge
  const imgOffsetX = (elementW - renderedW) / 2;
  const imgOffsetY = (elementH - renderedH) / 2;
  const offsetX = (containerRect.width - elementW) / 2 + imgOffsetX;
  const offsetY = (containerRect.height - elementH) / 2 + imgOffsetY;

  // Set canvas size to match container
  const canvas = els.gridCanvas;
  canvas.width = containerRect.width;
  canvas.height = containerRect.height;
  canvas.style.width = `${containerRect.width}px`;
  canvas.style.height = `${containerRect.height}px`;

  // Draw grid lines at exact cut positions
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!els.gridToggle.checked) {
    canvas.hidden = true;
    return;
  }
  canvas.hidden = false;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;

  const colCuts = meta.colCuts || [];
  const rowCuts = meta.rowCuts || [];

  // Draw vertical lines at column cut positions
  ctx.beginPath();
  for (const cut of colCuts) {
    const x = offsetX + (cut / naturalW) * renderedW;
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + renderedH);
  }
  ctx.stroke();

  // Draw horizontal lines at row cut positions
  ctx.beginPath();
  for (const cut of rowCuts) {
    const y = offsetY + (cut / naturalH) * renderedH;
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + renderedW, y);
  }
  ctx.stroke();

  state.gridMeta = meta;
};

const presetsKey = "ps_presets";

const loadPresets = () => {
  let presets = BUILTIN_PRESETS();
  try {
    const raw = localStorage.getItem(presetsKey);
    if (raw) {
      const stored = JSON.parse(raw);
      presets = { ...presets, ...stored };
    }
  } catch (_) {
    presets = BUILTIN_PRESETS();
  }
  return presets;
};

const savePresets = (presets) => {
  try {
    localStorage.setItem(presetsKey, JSON.stringify(presets));
  } catch (_) {
    // ignore
  }
};

const refreshPresetSelect = () => {
  if (!els.presetSelect) return;
  const presets = loadPresets();
  els.presetSelect.innerHTML = Object.keys(presets)
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
};

const applyPreset = (name) => {
  const presets = loadPresets();
  const preset = presets[name];
  if (!preset) return;
  const k = preset.k || 16;
  els.kSlider.value = k;
  els.kInput.value = k;
  els.kValue.textContent = k;
  els.seed.value = preset.seed;
  els.iterations.value = preset.iterations;
  els.quantizeToggle.checked = preset.quantize !== false;
  els.resampleMode.value = preset.resampleMode || "majority";
  els.edgeWeight.value = preset.edgeWeight || "1";
  if (preset.palette !== undefined) {
    els.paletteInput.value = preset.palette;
    els.applyPalette.disabled = false;
  }
  refreshResampleUI();
  setStatus(t("preset_applied", { name }));
};

const handleSavePreset = () => {
  const name = (els.presetName.value || "").trim() || "Preset";
  const presets = loadPresets();
  presets[name] = {
    k: parseInt(els.kSlider.value, 10) || 16,
    seed: els.seed.value,
    iterations: els.iterations.value,
    quantize: els.quantizeToggle.checked,
    resampleMode: els.resampleMode.value,
    edgeWeight: els.edgeWeight.value,
    palette: els.paletteInput.value,
  };
  savePresets(presets);
  refreshPresetSelect();
  els.presetSelect.value = name;
  setStatus(t("preset_saved"));
};

const handleDeletePreset = () => {
  const name = els.presetSelect.value;
  const builtins = Object.keys(BUILTIN_PRESETS());
  if (!name || builtins.includes(name)) return;
  const presets = loadPresets();
  delete presets[name];
  savePresets(presets);
  refreshPresetSelect();
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

const computeDiffMask = async () => {
  if (!state.inputUrl || !state.outputUrl || !els.diffOverlay) return;
  const [inImg, outImg] = await Promise.all([loadImage(state.inputUrl), loadImage(state.outputUrl)]);
  if (inImg.naturalWidth !== outImg.naturalWidth || inImg.naturalHeight !== outImg.naturalHeight) {
    state.diffRatio = null;
    updateDiffInfo();
    els.diffOverlay.hidden = true;
    return;
  }
  const w = inImg.naturalWidth;
  const h = inImg.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(inImg, 0, 0);
  const inData = ctx.getImageData(0, 0, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(outImg, 0, 0);
  const outData = ctx.getImageData(0, 0, w, h);
  const diffData = ctx.createImageData(w, h);
  let changed = 0;
  for (let i = 0; i < inData.data.length; i += 4) {
    const r1 = inData.data[i];
    const g1 = inData.data[i + 1];
    const b1 = inData.data[i + 2];
    const r2 = outData.data[i];
    const g2 = outData.data[i + 1];
    const b2 = outData.data[i + 2];
    const different = r1 !== r2 || g1 !== g2 || b1 !== b2;
    if (different) {
      diffData.data[i] = 255;
      diffData.data[i + 1] = 0;
      diffData.data[i + 2] = 0;
      diffData.data[i + 3] = 160;
      changed += 1;
    } else {
      diffData.data[i + 3] = 0;
    }
  }
  state.diffRatio = (changed / (w * h)) * 100;
  updateDiffInfo();
  ctx.putImageData(diffData, 0, 0);
  els.diffOverlay.src = canvas.toDataURL("image/png");
  els.diffOverlay.hidden = !els.diffToggle.checked;
};

const updateLoupe = (event) => {
  if (!els.loupe || !els.loupeToggle.checked || !state.outputUrl) return;
  const img = els.compareOverlay;
  if (!img || !img.naturalWidth) return;
  const rect = els.compare.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const cw = rect.width;
  const ch = rect.height;
  const scale = Math.min(cw / iw, ch / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  const offsetX = (cw - drawW) / 2;
  const offsetY = (ch - drawH) / 2;
  if (x < offsetX || x > offsetX + drawW || y < offsetY || y > offsetY + drawH) return;
  const imgX = Math.max(0, Math.min(iw - 1, Math.round((x - offsetX) / scale)));
  const imgY = Math.max(0, Math.min(ih - 1, Math.round((y - offsetY) / scale)));
  const ctx = els.loupe.getContext("2d");
  const size = 24;
  const scaleFactor = 4;
  els.loupe.width = size * scaleFactor;
  els.loupe.height = size * scaleFactor;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, els.loupe.width, els.loupe.height);
  ctx.drawImage(
    img,
    imgX - size / 2,
    imgY - size / 2,
    size,
    size,
    0,
    0,
    els.loupe.width,
    els.loupe.height
  );
  const pad = 12;
  const lw = els.loupe.width;
  const lh = els.loupe.height;
  const left = Math.min(window.innerWidth - lw / 2 - pad, Math.max(lw / 2 + pad, event.clientX + 20));
  const top = Math.min(window.innerHeight - lh / 2 - pad, Math.max(lh / 2 + pad, event.clientY + 20));
  els.loupe.style.left = `${left}px`;
  els.loupe.style.top = `${top}px`;
  els.loupe.hidden = false;
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
    const customPalette = parsePaletteText(paletteText);
    let inputBytes = state.inputBytes;
    let k = quantize
      ? parseInt(els.kSlider.value, 10)
      : customPalette.length > 0
        ? Math.max(1, customPalette.length)
        : PASS_THROUGH_K; // passthrough
    if (customPalette.length) {
      // Map to the chosen palette first and skip further k-means inside WASM to preserve exact colors.
      inputBytes = await paletteQuantize(state.inputBytes, customPalette);
      k = PASS_THROUGH_K;
    }
    const seed = BigInt(els.seed.value || "0");
    const iterations = Math.max(1, parseInt(els.iterations.value, 10) || 1);
    const resampleMode = els.resampleMode.value;
    const edgeWeight = parseFloat(els.edgeWeight.value || "0");
    const targetWidth = parseInt(els.targetWidth.value, 10) || undefined;
    const targetHeight = parseInt(els.targetHeight.value, 10) || undefined;

    const result = process_image_with_meta(
      inputBytes,
      k,
      seed,
      iterations,
      resampleMode,
      edgeWeight,
      targetWidth,
      targetHeight
    );
    const outputBytes = new Uint8Array(result[0]);
    state.outputBytes = outputBytes; // Store for color remapping
    state.colorRemap = {}; // Reset color remaps
    const meta = {
      cols: Number(result[1]),
      rows: Number(result[2]),
      cellW: Number(result[3]),
      cellH: Number(result[4]),
      outW: Number(result[5]),
      outH: Number(result[6]),
      colCuts: Array.from(result[7] || []),
      rowCuts: Array.from(result[8] || []),
    };
    state.gridMeta = meta;

    const blob = new Blob([outputBytes], { type: "image/png" });
    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
    }
    state.outputUrl = URL.createObjectURL(blob);
    const img = els.outputPreview;
    const kLabel = k === PASS_THROUGH_K ? t("pass_through") : k;
    const applyMeta = () => {
      const gridStr =
        meta && meta.cellW && meta.cellH
          ? ` · grid ${Math.round(meta.cellW)}x${Math.round(meta.cellH)} (${meta.cols}x${meta.rows})`
          : "";
      els.outputMeta.textContent = `${img.naturalWidth}x${img.naturalHeight} · k=${kLabel} · seed=${seed} · iter=${iterations}${gridStr}`;
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

    if (meta.cellW && meta.cellH) {
      setGridOverlay(meta);
    }

    els.compareBase.src = state.inputUrl;
    els.compareOverlay.src = state.outputUrl;
    els.compare.hidden = false;
    els.comparePlaceholder.hidden = true;
    els.compareSlider.disabled = false;
    setCompareReveal(50);
    sizeCompare(img.naturalWidth, img.naturalHeight);
    computeDiffMask();

    try {
      state.outputStats = await analyzeImage(state.outputUrl);

      // Calculate quality metrics
      const qualityMetrics = {};

      // Grid regularity
      const gridReg = computeGridRegularity(meta);
      if (gridReg) {
        qualityMetrics.gridRegularity = gridReg.avgRegularity;
      }

      // Color similarity
      const colorDist = await computeColorDistance(state.inputUrl, state.outputUrl);
      if (colorDist) {
        qualityMetrics.colorSimilarity = colorDist.similarity;
      }

      // Pixels changed (from diff calculation)
      if (state.diffRatio !== null) {
        qualityMetrics.pixelsChanged = state.diffRatio.toFixed(1);
      }

      renderStats(els.outputStats, els.outputStatsHint, state.outputStats, "", qualityMetrics);
      renderPalette(state.outputStats.topColors);
    } catch (err) {
      console.error(err);
      setStatus(t("could_not_compute_result_stats"));
    }

    els.download.href = state.outputUrl;
    els.download.download = `${(els.outputName.value || "snapped").trim()}.png`;
    els.download.removeAttribute("disabled");

    const kDisplay = kLabel;
    const cellWarn =
      meta.cellW && meta.cellH && (Math.abs(meta.cellW - Math.round(meta.cellW)) > 0.01 || Math.abs(meta.cellH - Math.round(meta.cellH)) > 0.01);
    const warnMsg = cellWarn ? " (grid may be off due to non-integer scaling)" : "";
    setStatus(t("done_message", { k: kDisplay, seed, iter: iterations }) + warnMsg);
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
  const customPalette = parsePaletteText(paletteText);
  const k = quantize
    ? parseInt(els.kSlider.value, 10)
    : customPalette.length > 0
      ? Math.max(1, customPalette.length)
      : PASS_THROUGH_K;
    const seed = BigInt(els.seed.value || "0");
    const iterations = Math.max(1, parseInt(els.iterations.value, 10) || 1);
    const resampleMode = els.resampleMode.value;
    const edgeWeight = parseFloat(els.edgeWeight.value || "0");
    const targetWidth = parseInt(els.targetWidth.value, 10) || undefined;
    const targetHeight = parseInt(els.targetHeight.value, 10) || undefined;
    const zip = new JSZip();
    let processed = 0;
    for (const item of state.queue) {
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      const inputBytes =
        customPalette.length ? await paletteQuantize(bytes, customPalette) : bytes;
      const result = process_image_with(
        inputBytes,
        k,
        seed,
        iterations,
        resampleMode,
        edgeWeight,
        targetWidth,
        targetHeight
      );
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
  els.resampleMode.addEventListener("change", refreshResampleUI);
  els.edgeWeight.addEventListener("input", refreshResampleUI);
  els.compareSlider.addEventListener("input", (e) => {
    setCompareReveal(e.target.value);
  });
  els.zoom.addEventListener("input", (e) => {
    applyZoom(e.target.value);
    if (state.gridMeta) setGridOverlay(state.gridMeta);
  });
  els.gridToggle.addEventListener("change", (e) => {
    toggleGrid(e.target.checked);
  });
  window.addEventListener("resize", () => {
    if (state.lastDims) {
      sizeCompare(state.lastDims.width, state.lastDims.height);
    }
    if (state.gridMeta) {
      setGridOverlay(state.gridMeta);
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
  els.paletteInput.addEventListener("input", (e) => {
    els.applyPalette.disabled = !(e.target.value || "").trim().length;
  });
  els.diffToggle.addEventListener("change", () => {
    if (els.diffOverlay) {
      els.diffOverlay.hidden = !els.diffToggle.checked;
    }
    if (els.diffToggle.checked && state.outputUrl) {
      computeDiffMask();
    }
  });
  els.compare.addEventListener("mousemove", updateLoupe);
  els.compare.addEventListener("mouseleave", () => {
    if (els.loupe) els.loupe.hidden = true;
  });
  els.loupeToggle.addEventListener("change", (e) => {
    if (els.loupe) {
      els.loupe.hidden = !e.target.checked;
    }
  });
  els.applyPreset.addEventListener("click", () => applyPreset(els.presetSelect.value));
  els.savePreset.addEventListener("click", handleSavePreset);
  els.deletePreset.addEventListener("click", handleDeletePreset);
  els.presetSelect.addEventListener("change", () => applyPreset(els.presetSelect.value));
  els.importPalette.addEventListener("click", () => els.importPaletteFile.click());
  els.importPaletteFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importPaletteText(text);
    e.target.value = "";
  });
  els.exportPalette.addEventListener("click", exportPaletteText);
  refreshPresetSelect();
  if (els.presetSelect.value) {
    applyPreset(els.presetSelect.value);
  }
  refreshResampleUI();
  applyZoom(els.zoom.value);
  toggleGrid(els.gridToggle.checked);
};

wireUI();
renderStats(els.inputStats, els.inputStatsHint, null);
renderStats(els.outputStats, els.outputStatsHint, null);
boot();
