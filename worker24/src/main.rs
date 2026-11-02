mod multi_brain;

use axum::{
    extract::State,
    http::Method,
    routing::{get, post},
    Json, Router,
};
use serde_json::Value;
use std::{
    env,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

const MAGIC: &[u8] = b"WGFLYBRN";
const HEADER_BYTES: usize = 64;
const NEURON_BYTES: usize = 32;

const DT_MS: f32 = 1.0;
const TAU_MS: f32 = 20.0;
const V_THRESH: f32 = -45.0;
const V_RESET: f32 = -52.0;
const V_REST: f32 = -52.0;
const REFRACTORY_MS: f32 = 2.2;
const EXT_GAIN: f32 = 2.0;
const W_SYN: f32 = 0.005;
const A_SYN: f32 = 0.81873;

const SUPER_CLASS_LABELS: [&str; 11] = [
    "unknown",
    "sensory",
    "ascending",
    "intrinsic",
    "central",
    "descending",
    "motor",
    "endocrine",
    "visual centrifugal",
    "visual projection",
    "optic",
];

#[derive(Clone)]
struct Brain {
    num_neurons: usize,
    num_edges: usize,
    pos_x: Vec<f32>,
    cell_type: Vec<u32>,
    super_class: Vec<u32>,
    row_ptr: Vec<u32>,
    col_idx: Vec<u32>,
    weight: Vec<f32>,
}

#[derive(Clone)]
struct Partitions {
    optic_left: Vec<usize>,
    optic_right: Vec<usize>,
    sensory: Vec<usize>,
    dn_left: Vec<usize>,
    dn_right: Vec<usize>,
    mbon: Vec<usize>,
    region_counts: Vec<usize>,
}

struct Sim {
    brain: Arc<Brain>,
    vm: Vec<f32>,
    refrac: Vec<u32>,
    g_x: Vec<f32>,
    g_y: Vec<f32>,
    spikes_prev: Vec<u32>,
    spikes_curr: Vec<u32>,
    ext: Vec<f32>,
    refractory_steps: u32,
    alpha: f32,
}

impl Sim {
    fn new(brain: Arc<Brain>) -> Self {
        let n = brain.num_neurons;
        let words = (n + 31) >> 5;
        Self {
            brain,
            vm: vec![V_REST; n],
            refrac: vec![0; n],
            g_x: vec![0.0; n],
            g_y: vec![0.0; n],
            spikes_prev: vec![0; words],
            spikes_curr: vec![0; words],
            ext: vec![0.0; n],
            refractory_steps: (REFRACTORY_MS / DT_MS).round().max(0.0) as u32,
            alpha: (-DT_MS / TAU_MS).exp(),
        }
    }

    fn set_input(&mut self, ext: &[f32]) {
        self.ext.copy_from_slice(ext);
    }

    fn step(&mut self) {
        for word in &mut self.spikes_curr {
            *word = 0;
        }
        let n = self.brain.num_neurons;
        for i in 0..n {
            let row_start = self.brain.row_ptr[i] as usize;
            let row_end = self.brain.row_ptr[i + 1] as usize;
            let mut delta_in = 0.0f32;

            for k in row_start..row_end {
                let pre = self.brain.col_idx[k] as usize;
                let word = self.spikes_prev[pre >> 5];
                let fired = ((word >> (pre & 31)) & 1) as f32;
                delta_in += self.brain.weight[k] * fired;
            }

            let gx_old = self.g_x[i];
            let gy_old = self.g_y[i];
            let gy_new = gy_old * A_SYN + gx_old;
            let gx_new = gx_old * A_SYN + delta_in;
            self.g_x[i] = gx_new;
            self.g_y[i] = gy_new;

            let i_syn = gy_new * W_SYN;
            let i_in = i_syn + self.ext[i] * EXT_GAIN;

            if self.refrac[i] > 0 {
                self.vm[i] = V_RESET;
                self.refrac[i] -= 1;
            } else {
                let v_new = V_REST + self.alpha * (self.vm[i] - V_REST) + i_in;
                if v_new >= V_THRESH {
                    self.vm[i] = V_RESET;
                    self.refrac[i] = self.refractory_steps;
                    self.spikes_curr[i >> 5] |= 1u32 << (i & 31);
                } else {
                    self.vm[i] = v_new;
                }
            }
        }
        std::mem::swap(&mut self.spikes_prev, &mut self.spikes_curr);
    }

    fn fired(&self, idx: usize) -> bool {
        ((self.spikes_prev[idx >> 5] >> (idx & 31)) & 1) != 0
    }
}

#[derive(Clone)]
struct AppState {
    brain: Arc<Brain>,
    multi_brains: Arc<Mutex<multi_brain::MultiBrainRegistry>>,
}

fn clamp64(v: f64, min: f64, max: f64) -> f64 {
    v.max(min).min(max)
}

fn neural_unit(rate: f64, gain: f64) -> f64 {
    if !rate.is_finite() || rate <= 0.0 {
        0.0
    } else {
        clamp64(1.0 - (-rate * gain).exp(), 0.0, 1.0)
    }
}

fn sample_evenly(values: &[usize], max: usize) -> Vec<usize> {
    if values.len() <= max {
        return values.to_vec();
    }
    let stride = values.len() as f64 / max as f64;
    (0..max)
        .map(|i| values[(i as f64 * stride).floor() as usize])
        .collect()
}

fn read_u32(buf: &[u8], off: usize) -> u32 {
    u32::from_le_bytes(buf[off..off + 4].try_into().unwrap())
}

fn read_f32(buf: &[u8], off: usize) -> f32 {
    f32::from_le_bytes(buf[off..off + 4].try_into().unwrap())
}

fn parse_brain(buf: &[u8]) -> Result<Brain, String> {
    if buf.len() < HEADER_BYTES || &buf[0..8] != MAGIC {
        return Err("invalid brain.bin magic/header".into());
    }
    let num_neurons = read_u32(buf, 12) as usize;
    let num_edges = read_u32(buf, 16) as usize;
    let mut pos_x = vec![0.0f32; num_neurons];
    let mut cell_type = vec![0u32; num_neurons];
    let mut super_class = vec![0u32; num_neurons];

    for i in 0..num_neurons {
        let base = HEADER_BYTES + i * NEURON_BYTES;
        pos_x[i] = read_f32(buf, base);
        cell_type[i] = read_u32(buf, base + 16);
        super_class[i] = read_u32(buf, base + 20);
    }

    let row_ptr_off = HEADER_BYTES + num_neurons * NEURON_BYTES;
    let col_idx_off = row_ptr_off + (num_neurons + 1) * 4;
    let weight_off = col_idx_off + num_edges * 4;

    if weight_off + num_edges * 4 > buf.len() {
        return Err("brain.bin truncated".into());
    }

    let mut row_ptr = vec![0u32; num_neurons + 1];
    let mut col_idx = vec![0u32; num_edges];
    let mut weight = vec![0.0f32; num_edges];

    for i in 0..=num_neurons {
        row_ptr[i] = read_u32(buf, row_ptr_off + i * 4);
    }
    for i in 0..num_edges {
        col_idx[i] = read_u32(buf, col_idx_off + i * 4);
        weight[i] = read_f32(buf, weight_off + i * 4);
    }

    Ok(Brain {
        num_neurons,
        num_edges,
        pos_x,
        cell_type,
        super_class,
        row_ptr,
        col_idx,
        weight,
    })
}

fn partition(brain: &Brain) -> Partitions {
    let mut cx = 0.0f64;
    let mut n = 0usize;
    for &x in &brain.pos_x {
        if x != 0.0 {
            cx += x as f64;
            n += 1;
        }
    }
    let cx = if n > 0 { (cx / n as f64) as f32 } else { 0.0 };

    let mut ol = Vec::new();
    let mut or = Vec::new();
    let mut sens = Vec::new();
    let mut dl = Vec::new();
    let mut dr = Vec::new();
    let mut mb = Vec::new();
    let mut region_counts = vec![0usize; SUPER_CLASS_LABELS.len()];

    for i in 0..brain.num_neurons {
        let x = brain.pos_x[i];
        let sc = brain.super_class[i] as usize;
        let hero = (brain.cell_type[i] & 0xff) as usize;
        if sc < region_counts.len() {
            region_counts[sc] += 1;
        }
        if sc == 10 {
            if x < cx { ol.push(i); } else { or.push(i); }
        }
        if sc == 1 {
            sens.push(i);
        }
        if hero == 7 {
            if x < cx { dl.push(i); } else { dr.push(i); }
        }
        if hero == 2 {
            mb.push(i);
        }
    }

    Partitions {
        optic_left: sample_evenly(&ol, 4200),
        optic_right: sample_evenly(&or, 4200),
        sensory: sample_evenly(&sens, 2200),
        dn_left: dl,
        dn_right: dr,
        mbon: mb,
        region_counts,
    }
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let res = reqwest::get(url)
        .await
        .map_err(|e| format!("fetch {url}: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("{url} HTTP {}", res.status()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("read {url}: {e}"))?;
    Ok(bytes.to_vec())
}

async fn ensure_brain_file() -> Result<Vec<u8>, String> {
    if let Ok(path) = env::var("BRAIN_PATH") {
        if Path::new(&path).exists() {
            return fs::read(&path).map_err(|e| format!("read BRAIN_PATH: {e}"));
        }
    }

    let cache_path = PathBuf::from(
        env::var("BRAIN_CACHE_PATH").unwrap_or_else(|_| "/data/brain.bin".into()),
    );
    if cache_path.exists() {
        match fs::read(&cache_path) {
            Ok(bytes) if bytes.len() >= HEADER_BYTES && &bytes[0..8] == MAGIC => {
                eprintln!(
                    "loading cached full FlyWire brain from {} ({:.1} MB)",
                    cache_path.display(),
                    bytes.len() as f64 / 1_000_000.0
                );
                return Ok(bytes);
            }
            Ok(_) => eprintln!("cached brain is invalid; rebuilding from network"),
            Err(e) => eprintln!("cached brain read failed: {e}"),
        }
    }

    let url = env::var("BRAIN_URL")
        .unwrap_or_else(|_| "https://fruit-fly-driving-scooter.vercel.app/brain.bin".into());
    eprintln!("loading full FlyWire brain from {url}");

    // First try the original monolithic file.
    if let Ok(bytes) = fetch_bytes(&url).await {
        if bytes.len() >= HEADER_BYTES && &bytes[0..8] == MAGIC {
            if let Some(parent) = cache_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&cache_path, &bytes);
            return Ok(bytes);
        }
    }

    // Vercel Hobby serves this ~125 MB asset as deterministic <24 MB chunks.
    // Reconstruct the exact original brain.bin from the same manifest the browser uses.
    let manifest_url = format!("{url}.parts.json");
    eprintln!("monolithic brain unavailable; reconstructing from {manifest_url}");
    let manifest_bytes = fetch_bytes(&manifest_url).await?;
    let manifest: Value = serde_json::from_slice(&manifest_bytes)
        .map_err(|e| format!("parse brain chunk manifest: {e}"))?;

    let total = manifest
        .get("totalBytes")
        .and_then(|x| x.as_u64())
        .ok_or_else(|| "brain chunk manifest missing totalBytes".to_string())? as usize;
    let parts = manifest
        .get("parts")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "brain chunk manifest missing parts".to_string())?;

    let base = url
        .rsplit_once('/')
        .map(|(left, _)| format!("{left}/"))
        .ok_or_else(|| "invalid BRAIN_URL".to_string())?;

    let mut out = Vec::with_capacity(total);
    for (index, part) in parts.iter().enumerate() {
        let file = part
            .get("file")
            .and_then(|x| x.as_str())
            .ok_or_else(|| format!("brain part {index} missing file"))?;
        let expected = part
            .get("size")
            .and_then(|x| x.as_u64())
            .ok_or_else(|| format!("brain part {index} missing size"))? as usize;
        let part_url = if file.starts_with("http://") || file.starts_with("https://") {
            file.to_string()
        } else {
            format!("{base}{file}")
        };
        let bytes = fetch_bytes(&part_url).await?;
        if bytes.len() != expected {
            return Err(format!(
                "brain part {index} size mismatch: {} != {}",
                bytes.len(),
                expected
            ));
        }
        out.extend_from_slice(&bytes);
        eprintln!(
            "brain chunk {}/{} · {:.1}/{:.1} MB",
            index + 1,
            parts.len(),
            out.len() as f64 / 1_000_000.0,
            total as f64 / 1_000_000.0
        );
    }

    if out.len() != total {
        return Err(format!(
            "reconstructed brain size mismatch: {} != {}",
            out.len(),
            total
        ));
    }
    if out.len() < HEADER_BYTES || &out[0..8] != MAGIC {
        return Err("reconstructed brain.bin has invalid magic/header".into());
    }

    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&cache_path, &out)
        .map_err(|e| format!("cache reconstructed brain at {}: {e}", cache_path.display()))?;
    eprintln!(
        "cached reconstructed full FlyWire brain at {}",
        cache_path.display()
    );
    Ok(out)
}

async fn health(State(app): State<AppState>) -> Json<Value> {
    Json(serde_json::json!({
        "ok": true,
        "mode": "full-flywire-civilization-cpu",
        "brain_neurons": app.brain.num_neurons,
        "brain_edges": app.brain.num_edges
    }))
}

async fn civilization_brain_sync(
    State(app): State<AppState>,
    Json(batch): Json<multi_brain::CivilizationBrainBatch>,
) -> Json<multi_brain::CivilizationBrainBatchResponse> {
    let mut registry = app.multi_brains.lock().await;
    Json(registry.sync(batch))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let brain_bytes = ensure_brain_file().await.map_err(|e| {
        eprintln!("{e}");
        std::io::Error::new(std::io::ErrorKind::Other, e)
    })?;
    let brain = Arc::new(parse_brain(&brain_bytes).map_err(|e| {
        eprintln!("{e}");
        std::io::Error::new(std::io::ErrorKind::Other, e)
    })?);
    eprintln!(
        "FULL FlyWire loaded: {} neurons · {} edges",
        brain.num_neurons, brain.num_edges
    );

    let partitions = Arc::new(partition(&brain));
    let multi_steps = env::var("MULTI_BRAIN_STEPS_PER_SYNC")
        .ok()
        .and_then(|x| x.parse::<usize>().ok())
        .unwrap_or(1)
        .clamp(1, 8);
    let multi_budget = env::var("MULTI_BRAIN_MAX_PER_SYNC")
        .ok()
        .and_then(|x| x.parse::<usize>().ok())
        .unwrap_or(2)
        .max(1);
    let multi_brains = Arc::new(Mutex::new(multi_brain::MultiBrainRegistry::new(
        brain.clone(),
        partitions.clone(),
        multi_steps,
        multi_budget,
    )));
    eprintln!(
        "Full-Life multi-brain registry ready · full topology shared · {} independent brains stepped/sync max · {} neural steps/brain",
        multi_budget,
        multi_steps
    );

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app_state = AppState {
        brain,
        multi_brains,
    };
    let app = Router::new()
        .route("/", get(health))
        .route("/health", get(health))
        .route("/civilization/brains/sync", post(civilization_brain_sync))
        .layer(cors)
        .with_state(app_state);

    let port = env::var("PORT")
        .ok()
        .and_then(|x| x.parse::<u16>().ok())
        .unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    eprintln!("24/7 FlyBrain worker listening on :{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
