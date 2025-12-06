use image::{GenericImageView, ImageBuffer, Rgb, RgbImage};
use rand::prelude::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rand_distr::{Distribution, WeightedIndex};
use std::cmp::Ordering;
use std::collections::HashMap;
#[cfg(not(target_arch = "wasm32"))]
use std::env;
use std::error::Error;
use std::fmt;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone)]
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct Config {
    pub k_colors: usize,
    k_seed: u64,
    resample_mode: ResampleMode,
    edge_weight: f64,
    /// Input image path only used for CLI use
    #[allow(dead_code)]
    input_path: String,
    /// Output image path only used for CLI use
    #[allow(dead_code)]
    output_path: String,
    max_kmeans_iterations: usize,
    peak_threshold_multiplier: f64,
    peak_distance_filter: usize,
    walker_search_window_ratio: f64,
    walker_min_search_window: f64,
    walker_strength_threshold: f64,
    min_cuts_per_axis: usize,
    fallback_target_segments: usize,
    max_step_ratio: f64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            k_colors: 16,
            k_seed: 42,
            resample_mode: ResampleMode::Majority,
            edge_weight: 1.0,
            input_path: "samples/2/skeleton.png".to_string(),
            output_path: "samples/2/skeleton_fixed_clean2.png".to_string(),
            max_kmeans_iterations: 15,
            peak_threshold_multiplier: 0.2,
            peak_distance_filter: 4,
            walker_search_window_ratio: 0.35,
            walker_min_search_window: 2.0,
            walker_strength_threshold: 0.5,
            min_cuts_per_axis: 4,
            fallback_target_segments: 64,
            max_step_ratio: 1.8, // Lowered from 3.0 to catch more skew cases
        }
    }
}

#[derive(Debug)]
pub enum PixelSnapperError {
    ImageError(image::ImageError),
    InvalidInput(String),
    ProcessingError(String),
}

#[derive(Debug, Clone, Copy)]
pub enum ResampleMode {
    Majority,
    Center,
    EdgeAware,
}

impl fmt::Display for PixelSnapperError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PixelSnapperError::ImageError(e) => write!(f, "Image error: {}", e),
            PixelSnapperError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            PixelSnapperError::ProcessingError(msg) => write!(f, "Processing error: {}", msg),
        }
    }
}

impl Error for PixelSnapperError {}

impl From<image::ImageError> for PixelSnapperError {
    fn from(error: image::ImageError) -> Self {
        PixelSnapperError::ImageError(error)
    }
}

#[cfg(target_arch = "wasm32")]
impl From<PixelSnapperError> for wasm_bindgen::JsValue {
    fn from(err: PixelSnapperError) -> wasm_bindgen::JsValue {
        wasm_bindgen::JsValue::from_str(&err.to_string())
    }
}

type Result<T> = std::result::Result<T, PixelSnapperError>;

/// CLI entry point
#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
fn main() -> Result<()> {
    let config = parse_args().unwrap_or_default();
    process_image(&config)
}

fn process_image_bytes_common(input_bytes: &[u8], config: Option<Config>) -> Result<Vec<u8>> {
    let config = config.unwrap_or_default();

    let img = image::load_from_memory(input_bytes)?;
    let (width, height) = img.dimensions();

    validate_image_dimensions(width, height)?;

    let rgb_img = img.to_rgb8();

    let quantized_img = if config.k_colors == usize::MAX {
        rgb_img.clone()
    } else {
        quantize_image(&rgb_img, &config)?
    };
    let (profile_x, profile_y) = compute_profiles(&quantized_img)?;

    // Estimate step sizes
    let step_x_opt = estimate_step_size(&profile_x, &config);
    let step_y_opt = estimate_step_size(&profile_y, &config);

    // Resolve step sizes. Some instabilities so use sibling axis if one fails, or fallback if both fail
    let (step_x, step_y) = resolve_step_sizes(step_x_opt, step_y_opt, width, height, &config);

    let raw_col_cuts = walk(&profile_x, step_x, width as usize, &config)?;
    let raw_row_cuts = walk(&profile_y, step_y, height as usize, &config)?;

    // Two-pass stabilization: first pass with raw cuts, then cross-validate
    let (col_cuts, row_cuts) = stabilize_both_axes(
        &profile_x,
        &profile_y,
        raw_col_cuts,
        raw_row_cuts,
        width as usize,
        height as usize,
        &config,
    );

    let output_img = resample(&quantized_img, &col_cuts, &row_cuts, &config)?;

    // Returns bytes for both implementations
    let mut output_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut output_bytes);
    output_img
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| PixelSnapperError::ImageError(e))?;

    Ok(output_bytes)
}

/// WASM entry point
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn process_image(
    input_bytes: &[u8],
    k_colors: Option<u32>,
) -> std::result::Result<Vec<u8>, wasm_bindgen::JsValue> {
    let config = build_config(k_colors, None, None, None, None)?;
    process_image_bytes_common(input_bytes, Some(config)).map_err(|e| wasm_bindgen::JsValue::from(e))
}

/// WASM entry point with extra tunables
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn process_image_with(
    input_bytes: &[u8],
    k_colors: Option<u32>,
    k_seed: Option<u64>,
    max_kmeans_iterations: Option<u32>,
    resample_mode: Option<String>,
    edge_weight: Option<f64>,
) -> std::result::Result<Vec<u8>, wasm_bindgen::JsValue> {
    let config = build_config(k_colors, k_seed, max_kmeans_iterations, resample_mode, edge_weight)?;
    process_image_bytes_common(input_bytes, Some(config)).map_err(|e| wasm_bindgen::JsValue::from(e))
}

#[cfg(target_arch = "wasm32")]
fn build_config(
    k_colors: Option<u32>,
    k_seed: Option<u64>,
    max_kmeans_iterations: Option<u32>,
    resample_mode: Option<String>,
    edge_weight: Option<f64>,
) -> std::result::Result<Config, wasm_bindgen::JsValue> {
    let mut config = Config::default();
    if let Some(k) = k_colors {
        if k == 0 {
            return Err(wasm_bindgen::JsValue::from_str(
                "k_colors must be greater than 0",
            ));
        }
        // Use usize::MAX as sentinel to mean "passthrough/no quantization"
        config.k_colors = if k == u32::MAX { usize::MAX } else { k as usize };
    }
    if let Some(seed) = k_seed {
        config.k_seed = seed;
    }
    if let Some(iter) = max_kmeans_iterations {
        if iter == 0 {
            return Err(wasm_bindgen::JsValue::from_str(
                "max_kmeans_iterations must be greater than 0",
            ));
        }
        config.max_kmeans_iterations = iter as usize;
    }
    if let Some(mode) = resample_mode {
        let lower = mode.to_lowercase();
        config.resample_mode = match lower.as_str() {
            "center" => ResampleMode::Center,
            "edge" | "edge-aware" | "edgeaware" => ResampleMode::EdgeAware,
            _ => ResampleMode::Majority,
        };
    }
    if let Some(weight) = edge_weight {
        if weight >= 0.0 && weight.is_finite() {
            config.edge_weight = weight.min(5.0);
        }
    }
    Ok(config)
}

#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
fn parse_args() -> Option<Config> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        return None;
    }

    let mut config = Config {
        input_path: args[1].clone(),
        output_path: args[2].clone(),
        ..Default::default()
    };

    if let Some(k_arg) = args.get(3) {
        match k_arg.parse::<usize>() {
            Ok(k) if k > 0 => config.k_colors = k,
            _ => eprintln!(
                "Warning: invalid k_colors '{}', falling back to default ({})",
                k_arg, config.k_colors
            ),
        }
    }

    Some(config)
}

#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
fn process_image(config: &Config) -> Result<()> {
    println!("Processing: {}", config.input_path);

    let img_bytes = std::fs::read(&config.input_path).map_err(|e| {
        PixelSnapperError::ProcessingError(format!("Failed to read input file: {}", e))
    })?;

    let output_bytes = process_image_bytes_common(&img_bytes, Some(config.clone()))?;

    std::fs::write(&config.output_path, output_bytes).map_err(|e| {
        PixelSnapperError::ProcessingError(format!("Failed to write output file: {}", e))
    })?;

    println!("Saved to: {}", config.output_path);
    Ok(())
}

fn validate_image_dimensions(width: u32, height: u32) -> Result<()> {
    if width == 0 || height == 0 {
        return Err(PixelSnapperError::InvalidInput(
            "Image dimensions cannot be zero".to_string(),
        ));
    }
    if width > 10000 || height > 10000 {
        return Err(PixelSnapperError::InvalidInput(
            "Image dimensions too large (max 10000x10000)".to_string(),
        ));
    }
    Ok(())
}

fn quantize_image(img: &RgbImage, config: &Config) -> Result<RgbImage> {
    if config.k_colors == 0 {
        return Err(PixelSnapperError::InvalidInput(
            "Number of colors must be greater than 0".to_string(),
        ));
    }
    if config.k_colors == usize::MAX {
        return Ok(img.clone());
    }

    let pixels_f32: Vec<[f32; 3]> = img
        .pixels()
        .map(|p| [p[0] as f32, p[1] as f32, p[2] as f32])
        .collect();
    let n_pixels = pixels_f32.len();
    if n_pixels == 0 {
        return Err(PixelSnapperError::InvalidInput(
            "Image has no pixels".to_string(),
        ));
    }

    let mut rng = ChaCha8Rng::seed_from_u64(config.k_seed);
    let k = config.k_colors.min(n_pixels);

    fn sample_index(rng: &mut ChaCha8Rng, upper: usize) -> usize {
        debug_assert!(upper > 0);
        let upper = upper as u64;
        rng.gen_range(0..upper) as usize
    }

    fn dist_sq(p: &[f32; 3], c: &[f32; 3]) -> f32 {
        let dr = p[0] - c[0];
        let dg = p[1] - c[1];
        let db = p[2] - c[2];
        dr * dr + dg * dg + db * db
    }

    let mut centroids: Vec<[f32; 3]> = Vec::with_capacity(k);
    let first_idx = sample_index(&mut rng, n_pixels);
    centroids.push(pixels_f32[first_idx]);
    let mut distances = vec![f32::MAX; n_pixels];

    // Maybe try a faster algorithm for this? like https://crates.io/crates/kmeans_colors
    for _ in 1..k {
        let last_c = centroids.last().unwrap();
        let mut sum_sq_dist = 0.0;

        for (i, p) in pixels_f32.iter().enumerate() {
            let d_sq = dist_sq(p, last_c);
            if d_sq < distances[i] {
                distances[i] = d_sq;
            }
            sum_sq_dist += distances[i];
        }

        if sum_sq_dist <= 0.0 {
            let idx = sample_index(&mut rng, n_pixels);
            centroids.push(pixels_f32[idx]);
        } else {
            let dist = WeightedIndex::new(&distances).map_err(|e| {
                PixelSnapperError::ProcessingError(format!("Failed to sample new centroid: {}", e))
            })?;
            let idx = dist.sample(&mut rng);
            centroids.push(pixels_f32[idx]);
        }
    }

    let mut prev_centroids = centroids.clone();
    for iteration in 0..config.max_kmeans_iterations {
        let mut sums = vec![[0.0f32; 3]; k];
        let mut counts = vec![0usize; k];

        for p in &pixels_f32 {
            let mut min_dist = f32::MAX;
            let mut best_k = 0;

            for (i, c) in centroids.iter().enumerate() {
                let d = dist_sq(p, c);
                if d < min_dist {
                    min_dist = d;
                    best_k = i;
                }
            }
            sums[best_k][0] += p[0];
            sums[best_k][1] += p[1];
            sums[best_k][2] += p[2];
            counts[best_k] += 1;
        }

        for i in 0..k {
            if counts[i] > 0 {
                let fcount = counts[i] as f32;
                centroids[i] = [
                    sums[i][0] / fcount,
                    sums[i][1] / fcount,
                    sums[i][2] / fcount,
                ];
            }
        }

        if iteration > 0 {
            let mut max_movement = 0.0f32;
            for (new_c, old_c) in centroids.iter().zip(prev_centroids.iter()) {
                let movement = dist_sq(new_c, old_c);
                if movement > max_movement {
                    max_movement = movement;
                }
            }

            if max_movement < 0.01 {
                break;
            }
        }

        prev_centroids.copy_from_slice(&centroids);
    }

    let mut new_img = RgbImage::new(img.width(), img.height());
    for ((x, y, _), p) in img.enumerate_pixels().zip(pixels_f32.iter()) {
        let mut min_dist = f32::MAX;
        let mut best_c = [0u8; 3];

        for c in &centroids {
            let d = dist_sq(p, c);
            if d < min_dist {
                min_dist = d;
                best_c = [c[0].round() as u8, c[1].round() as u8, c[2].round() as u8];
            }
        }
        new_img.put_pixel(x, y, Rgb(best_c));
    }
    Ok(new_img)
}

fn compute_profiles(img: &RgbImage) -> Result<(Vec<f64>, Vec<f64>)> {
    let (w, h) = img.dimensions();

    if w < 3 || h < 3 {
        return Err(PixelSnapperError::InvalidInput(
            "Image too small (minimum 3x3)".to_string(),
        ));
    }

    let mut col_proj = vec![0.0; w as usize];
    let mut row_proj = vec![0.0; h as usize];

    let gray = |x, y| {
        let p = img.get_pixel(x, y);
        0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64
    };

    // kernels: [-1, 0, 1]
    for y in 0..h {
        for x in 1..w - 1 {
            let left = gray(x - 1, y);
            let right = gray(x + 1, y);
            let grad = (right - left).abs();
            col_proj[x as usize] += grad;
        }
    }
    for x in 0..w {
        for y in 1..h - 1 {
            let top = gray(x, y - 1);
            let bottom = gray(x, y + 1);
            let grad = (bottom - top).abs();
            row_proj[y as usize] += grad;
        }
    }

    Ok((col_proj, row_proj))
}

fn estimate_step_size(profile: &[f64], config: &Config) -> Option<f64> {
    if profile.is_empty() {
        return None;
    }

    let max_val = profile.iter().cloned().fold(0.0 / 0.0, f64::max);
    if max_val == 0.0 {
        return None; // Decide later
    }
    let threshold = max_val * config.peak_threshold_multiplier;

    let mut peaks = Vec::new();
    for i in 1..profile.len() - 1 {
        if profile[i] > threshold && profile[i] > profile[i - 1] && profile[i] > profile[i + 1] {
            peaks.push(i);
        }
    }

    if peaks.len() < 2 {
        return None;
    }

    let mut clean_peaks = vec![peaks[0]];
    for &p in peaks.iter().skip(1) {
        if p - clean_peaks.last().unwrap() > (config.peak_distance_filter - 1) {
            clean_peaks.push(p);
        }
    }

    if clean_peaks.len() < 2 {
        return None;
    }

    // Compute diffs
    let mut diffs: Vec<f64> = clean_peaks
        .windows(2)
        .map(|w| (w[1] - w[0]) as f64)
        .collect();

    // Median
    diffs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    Some(diffs[diffs.len() / 2])
}

fn resolve_step_sizes(
    step_x_opt: Option<f64>,
    step_y_opt: Option<f64>,
    width: u32,
    height: u32,
    config: &Config,
) -> (f64, f64) {
    match (step_x_opt, step_y_opt) {
        (Some(sx), Some(sy)) => {
            let ratio = if sx > sy { sx / sy } else { sy / sx };
            if ratio > config.max_step_ratio {
                let smaller = sx.min(sy);
                (smaller, smaller)
            } else {
                let avg = (sx + sy) / 2.0;
                (avg, avg)
            }
        }

        (Some(sx), None) => (sx, sx),

        (None, Some(sy)) => (sy, sy),

        (None, None) => {
            let fallback_step =
                ((width.min(height) as f64) / config.fallback_target_segments as f64).max(1.0);
            (fallback_step, fallback_step)
        }
    }
}

fn stabilize_both_axes(
    profile_x: &[f64],
    profile_y: &[f64],
    raw_col_cuts: Vec<usize>,
    raw_row_cuts: Vec<usize>,
    width: usize,
    height: usize,
    config: &Config,
) -> (Vec<usize>, Vec<usize>) {
    let col_cuts_pass1 = stabilize_cuts(
        profile_x,
        raw_col_cuts.clone(),
        width,
        &raw_row_cuts,
        height,
        config,
    );
    let row_cuts_pass1 = stabilize_cuts(
        profile_y,
        raw_row_cuts.clone(),
        height,
        &raw_col_cuts,
        width,
        config,
    );

    // Check if the results are coherent
    let col_cells = col_cuts_pass1.len().saturating_sub(1).max(1);
    let row_cells = row_cuts_pass1.len().saturating_sub(1).max(1);
    let col_step = width as f64 / col_cells as f64;
    let row_step = height as f64 / row_cells as f64;

    let step_ratio = if col_step > row_step {
        col_step / row_step
    } else {
        row_step / col_step
    };

    if step_ratio > config.max_step_ratio {
        let target_step = col_step.min(row_step);

        let final_col_cuts = if col_step > target_step * 1.2 {
            snap_uniform_cuts(
                profile_x,
                width,
                target_step,
                config,
                config.min_cuts_per_axis,
            )
        } else {
            col_cuts_pass1
        };

        let final_row_cuts = if row_step > target_step * 1.2 {
            snap_uniform_cuts(
                profile_y,
                height,
                target_step,
                config,
                config.min_cuts_per_axis,
            )
        } else {
            row_cuts_pass1
        };

        (final_col_cuts, final_row_cuts)
    } else {
        (col_cuts_pass1, row_cuts_pass1)
    }
}

// Tried uniform grid instead of an elastic-ish walker, but the result was a bit worse.
// Keeping the walker for now. But some distortions might happen...
fn walk(profile: &[f64], step_size: f64, limit: usize, config: &Config) -> Result<Vec<usize>> {
    if profile.is_empty() {
        return Err(PixelSnapperError::ProcessingError(
            "Cannot walk on empty profile".to_string(),
        ));
    }

    let mut cuts = vec![0];
    let mut current_pos = 0.0;
    let search_window =
        (step_size * config.walker_search_window_ratio).max(config.walker_min_search_window);
    let mean_val: f64 = profile.iter().sum::<f64>() / profile.len() as f64;

    while current_pos < limit as f64 {
        let target = current_pos + step_size;
        if target >= limit as f64 {
            cuts.push(limit);
            break;
        }

        let start_search = ((target - search_window) as usize).max((current_pos + 1.0) as usize);
        let end_search = ((target + search_window) as usize).min(limit);

        if end_search <= start_search {
            current_pos = target;
            continue;
        }

        let mut max_val = -1.0;
        let mut max_idx = start_search;
        for i in start_search..end_search {
            if profile[i] > max_val {
                max_val = profile[i];
                max_idx = i;
            }
        }

        if max_val > mean_val * config.walker_strength_threshold {
            cuts.push(max_idx);
            current_pos = max_idx as f64;
        } else {
            cuts.push(target as usize);
            current_pos = target;
        }
    }
    Ok(cuts)
}

fn stabilize_cuts(
    profile: &[f64],
    cuts: Vec<usize>,
    limit: usize,
    sibling_cuts: &[usize],
    sibling_limit: usize,
    config: &Config,
) -> Vec<usize> {
    if limit == 0 {
        return vec![0];
    }

    let cuts = sanitize_cuts(cuts, limit);
    let min_required = config.min_cuts_per_axis.max(2).min(limit.saturating_add(1));
    let axis_cells = cuts.len().saturating_sub(1);
    let sibling_cells = sibling_cuts.len().saturating_sub(1);
    let sibling_has_grid =
        sibling_limit > 0 && sibling_cells >= min_required.saturating_sub(1) && sibling_cells > 0;
    let steps_skewed = sibling_has_grid && axis_cells > 0 && {
        let axis_step = limit as f64 / axis_cells as f64;
        let sibling_step = sibling_limit as f64 / sibling_cells as f64;
        let step_ratio = axis_step / sibling_step;
        step_ratio > config.max_step_ratio || step_ratio < 1.0 / config.max_step_ratio
    };
    let has_enough = cuts.len() >= min_required;

    if has_enough && !steps_skewed {
        return cuts;
    }

    let mut target_step = if sibling_has_grid {
        sibling_limit as f64 / sibling_cells as f64
    } else if config.fallback_target_segments > 1 {
        limit as f64 / config.fallback_target_segments as f64
    } else if axis_cells > 0 {
        limit as f64 / axis_cells as f64
    } else {
        limit as f64
    };
    if !target_step.is_finite() || target_step <= 0.0 {
        target_step = 1.0;
    }

    snap_uniform_cuts(profile, limit, target_step, config, min_required)
}

fn sanitize_cuts(mut cuts: Vec<usize>, limit: usize) -> Vec<usize> {
    if limit == 0 {
        return vec![0];
    }

    let mut has_zero = false;
    let mut has_limit = false;

    for value in cuts.iter_mut() {
        if *value == 0 {
            has_zero = true;
        }
        if *value >= limit {
            *value = limit;
        }
        if *value == limit {
            has_limit = true;
        }
    }

    if !has_zero {
        cuts.push(0);
    }
    if !has_limit {
        cuts.push(limit);
    }

    cuts.sort_unstable();
    cuts.dedup();
    cuts
}

fn snap_uniform_cuts(
    profile: &[f64],
    limit: usize,
    target_step: f64,
    config: &Config,
    min_required: usize,
) -> Vec<usize> {
    if limit == 0 {
        return vec![0];
    }
    if limit == 1 {
        return vec![0, 1];
    }

    // Get desired cells
    let mut desired_cells = if target_step.is_finite() && target_step > 0.0 {
        (limit as f64 / target_step).round() as usize
    } else {
        0
    };
    desired_cells = desired_cells
        .max(min_required.saturating_sub(1))
        .max(1)
        .min(limit);

    let cell_width = limit as f64 / desired_cells as f64;
    let search_window =
        (cell_width * config.walker_search_window_ratio).max(config.walker_min_search_window);
    let mean_val = if profile.is_empty() {
        0.0
    } else {
        profile.iter().sum::<f64>() / profile.len() as f64
    };

    let mut cuts = Vec::with_capacity(desired_cells + 1);
    cuts.push(0);
    for idx in 1..desired_cells {
        let target = cell_width * idx as f64;
        let prev = *cuts.last().unwrap();
        if prev + 1 >= limit {
            break;
        }
        let mut start = ((target - search_window).floor() as isize)
            .max(prev as isize + 1)
            .max(0);
        let mut end = ((target + search_window).ceil() as isize).min(limit as isize - 1);
        if end < start {
            start = prev as isize + 1;
            end = start;
        }
        let start = start as usize;
        let end = end as usize;
        let mut best_idx = start.min(profile.len().saturating_sub(1));
        let mut best_val = -1.0;
        for i in start..=end.min(profile.len().saturating_sub(1)) {
            let v = profile.get(i).copied().unwrap_or(0.0);
            if v > best_val {
                best_val = v;
                best_idx = i;
            }
        }
        let strength_threshold = mean_val * config.walker_strength_threshold;
        if best_val < strength_threshold {
            let mut fallback_idx = target.round() as isize;
            if fallback_idx <= prev as isize {
                fallback_idx = prev as isize + 1;
            }
            if fallback_idx >= limit as isize {
                fallback_idx = (limit as isize - 1).max(prev as isize + 1);
            }
            best_idx = fallback_idx as usize;
        }
        cuts.push(best_idx);
    }
    if *cuts.last().unwrap() != limit {
        cuts.push(limit);
    }
    cuts = sanitize_cuts(cuts, limit);
    cuts
}

fn resample(img: &RgbImage, cols: &[usize], rows: &[usize], config: &Config) -> Result<RgbImage> {
    if cols.len() < 2 || rows.len() < 2 {
        return Err(PixelSnapperError::ProcessingError(
            "Insufficient grid cuts for resampling".to_string(),
        ));
    }

    // First compute a representative color per grid cell (same as before)
    let cells_w = cols.len() - 1;
    let cells_h = rows.len() - 1;
    let mut cell_colors = vec![vec!([0u8; 3]; cells_w); cells_h];

    let width = img.width() as usize;
    let height = img.height() as usize;

    for (y_i, w_y) in rows.windows(2).enumerate() {
        for (x_i, w_x) in cols.windows(2).enumerate() {
            let ys = w_y[0];
            let ye = w_y[1];
            let xs = w_x[0];
            let xe = w_x[1];

            if xe <= xs || ye <= ys {
                continue;
            }

            let best_pixel = match config.resample_mode {
                ResampleMode::Center => {
                    let cx = ((xs + xe.saturating_sub(1)) / 2).min(width.saturating_sub(1));
                    let cy = ((ys + ye.saturating_sub(1)) / 2).min(height.saturating_sub(1));
                    img.get_pixel(cx as u32, cy as u32).0
                }
                ResampleMode::Majority => {
                    let mut counts: HashMap<[u8; 3], f64> = HashMap::new();
                    for y in ys..ye {
                        for x in xs..xe {
                            if x < width && y < height {
                                let p = img.get_pixel(x as u32, y as u32).0;
                                *counts.entry(p).or_insert(0.0) += 1.0;
                            }
                        }
                    }
                    counts
                        .into_iter()
                        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(Ordering::Equal))
                        .map(|(color, _)| color)
                        .unwrap_or([0, 0, 0])
                }
                ResampleMode::EdgeAware => {
                    let mut counts: HashMap<[u8; 3], f64> = HashMap::new();
                    let weight = config.edge_weight.max(0.0);
                    for y in ys..ye {
                        for x in xs..xe {
                            if x >= width || y >= height {
                                continue;
                            }
                            let p = img.get_pixel(x as u32, y as u32).0;
                            let lum = 0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64;
                            let xm1 = x.saturating_sub(1);
                            let xp1 = (x + 1).min(width - 1);
                            let ym1 = y.saturating_sub(1);
                            let yp1 = (y + 1).min(height - 1);
                            let lum_left = {
                                let pl = img.get_pixel(xm1 as u32, y as u32).0;
                                0.299 * pl[0] as f64 + 0.587 * pl[1] as f64 + 0.114 * pl[2] as f64
                            };
                            let lum_right = {
                                let pr = img.get_pixel(xp1 as u32, y as u32).0;
                                0.299 * pr[0] as f64 + 0.587 * pr[1] as f64 + 0.114 * pr[2] as f64
                            };
                            let lum_up = {
                                let pu = img.get_pixel(x as u32, ym1 as u32).0;
                                0.299 * pu[0] as f64 + 0.587 * pu[1] as f64 + 0.114 * pu[2] as f64
                            };
                            let lum_down = {
                                let pd = img.get_pixel(x as u32, yp1 as u32).0;
                                0.299 * pd[0] as f64 + 0.587 * pd[1] as f64 + 0.114 * pd[2] as f64
                            };
                            let grad = (lum - lum_left).abs()
                                + (lum - lum_right).abs()
                                + (lum - lum_up).abs()
                                + (lum - lum_down).abs();
                            let norm_grad = (grad / (4.0 * 255.0)).min(1.0);
                            let w = 1.0 + weight * norm_grad;
                            *counts.entry(p).or_insert(0.0) += w;
                        }
                    }
                    counts
                        .into_iter()
                        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(Ordering::Equal))
                        .map(|(color, _)| color)
                        .unwrap_or([0, 0, 0])
                }
            };

            cell_colors[y_i][x_i] = best_pixel;
        }
    }

    // Then expand each cell color back to the original resolution so the output
    // matches the input dimensions.
    let mut final_img = ImageBuffer::new(img.width(), img.height());
    let max_w = img.width() as usize;
    let max_h = img.height() as usize;

    for (y_i, w_y) in rows.windows(2).enumerate() {
        let ys = w_y[0];
        let ye = w_y[1].min(max_h);
        for (x_i, w_x) in cols.windows(2).enumerate() {
            let xs = w_x[0];
            let xe = w_x[1].min(max_w);
            let color = cell_colors[y_i][x_i];
            for y in ys..ye {
                for x in xs..xe {
                    final_img.put_pixel(x as u32, y as u32, Rgb(color));
                }
            }
        }
    }

    Ok(final_img)
}
