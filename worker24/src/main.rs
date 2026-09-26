use axum::{
    extract::State,
    http::Method,
    routing::get,
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::VecDeque,
    env,
    fs,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    sync::{watch, RwLock},
    time::sleep,
};
use tokio_tungstenite::connect_async;
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

const STARTING_CASH: f64 = 100_000.0;
const MAX_LEVERAGE: f64 = 4.0;
const MAX_BRAIN_HOLD_TICKS: u64 = 180;
const SMOKE_ENTER_STRESS: f64 = 62.0;
const SMOKE_CLEAR_STRESS: f64 = 54.0;
const BREAK_ENTER_STRESS: f64 = 78.0;
const BREAK_EXIT_STRESS: f64 = 28.0;
const MIN_DESK_SMOKE_MS: u64 = 7_000;

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

#[derive(Clone, Serialize, Deserialize)]
struct Position {
    side: String,
    entry: f64,
    qty: f64,
    opened_tick: u64,
    notional: f64,
    margin: f64,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct RegionActivity {
    id: usize,
    label: String,
    count: usize,
    active: usize,
    mean: f64,
}

#[derive(Clone, Serialize, Deserialize)]
struct PersistedState {
    mode: String,
    started_at_ms: u64,
    updated_at_ms: u64,
    last_market_at_ms: u64,
    symbol: String,
    price: f64,
    prices: Vec<f64>,
    tick: u64,

    cash: f64,
    margin_locked: f64,
    total_cash_in: f64,
    total_cash_out: f64,
    realized_pnl: f64,
    stress: f64,
    wins: u64,
    losses: u64,
    peak_equity: f64,
    position: Option<Position>,

    break_mode: bool,
    desk_smoke_since_ms: Option<u64>,
    decision: String,
    confidence: f64,
    signal: f64,
    activity: f64,
    #[serde(default)]
    brain_size_signal: f64,
    #[serde(default)]
    brain_risk_fraction: f64,
    #[serde(default)]
    brain_notional: f64,
    #[serde(default)]
    brain_patience_signal: f64,
    #[serde(default)]
    brain_hold_ticks: u64,
    pending_side: Option<String>,
    pending_confirmations: u32,

    brain_neurons: usize,
    brain_edges: usize,
    brain_steps_total: u64,
    brain_steps_per_cycle: usize,
    brain_regions: Vec<RegionActivity>,

    recent_events: VecDeque<String>,
}

impl PersistedState {
    fn fresh() -> Self {
        let now = now_ms();
        Self {
            mode: "full-flywire-cpu-24x7".into(),
            started_at_ms: now,
            updated_at_ms: now,
            last_market_at_ms: 0,
            symbol: "BTCUSDT".into(),
            price: 0.0,
            prices: Vec::new(),
            tick: 0,
            cash: STARTING_CASH,
            margin_locked: 0.0,
            total_cash_in: STARTING_CASH,
            total_cash_out: 0.0,
            realized_pnl: 0.0,
            stress: 18.0,
            wins: 0,
            losses: 0,
            peak_equity: STARTING_CASH,
            position: None,
            break_mode: false,
            desk_smoke_since_ms: None,
            decision: "WAIT".into(),
            confidence: 0.0,
            signal: 0.0,
            activity: 0.0,
            brain_size_signal: 0.0,
            brain_risk_fraction: 0.0,
            brain_notional: 0.0,
            brain_patience_signal: 0.0,
            brain_hold_ticks: 1,
            pending_side: None,
            pending_confirmations: 0,
            brain_neurons: 0,
            brain_edges: 0,
            brain_steps_total: 0,
            brain_steps_per_cycle: 0,
            brain_regions: Vec::new(),
            recent_events: VecDeque::new(),
        }
    }

    fn add_event(&mut self, line: impl Into<String>) {
        self.recent_events.push_front(line.into());
        while self.recent_events.len() > 16 {
            self.recent_events.pop_back();
        }
    }

    fn unrealized_pnl(&self) -> f64 {
        match (&self.position, self.price) {
            (Some(p), price) if price > 0.0 => {
                let dir = if p.side == "LONG" { 1.0 } else { -1.0 };
                (price - p.entry) * p.qty * dir
            }
            _ => 0.0,
        }
    }

    fn equity(&self) -> f64 {
        self.cash + self.unrealized_pnl()
    }

    fn free_cash(&self) -> f64 {
        self.cash - self.margin_locked
    }

    fn buying_power(&mut self) -> f64 {
        self.update_peak();
        (self.equity().abs() * MAX_LEVERAGE).max(10_000.0)
    }

    fn update_peak(&mut self) {
        self.peak_equity = self.peak_equity.max(self.equity());
    }

    fn drawdown_pct(&mut self) -> f64 {
        self.update_peak();
        if self.peak_equity > 0.0 {
            ((self.peak_equity - self.equity()) / self.peak_equity).max(0.0)
        } else {
            0.0
        }
    }

    fn required_confirmations(&mut self) -> u32 {
        let dd = self.drawdown_pct();
        if dd >= 0.30 {
            4
        } else if dd >= 0.15 {
            3
        } else if dd >= 0.05 {
            2
        } else {
            1
        }
    }

    fn required_confidence(&mut self) -> f64 {
        let dd = self.drawdown_pct();
        clamp64(0.52 + (dd * 0.9).min(0.28), 0.52, 0.80)
    }

    fn close_position(&mut self, reason: &str) {
        if self.price <= 0.0 {
            return;
        }
        let Some(closed) = self.position.clone() else {
            return;
        };
        let dir = if closed.side == "LONG" { 1.0 } else { -1.0 };
        let pnl = (self.price - closed.entry) * closed.qty * dir;

        self.realized_pnl += pnl;
        self.cash += pnl;
        self.margin_locked = (self.margin_locked - closed.margin).max(0.0);

        if pnl >= 0.0 {
            self.wins += 1;
            self.total_cash_in += closed.margin + pnl;
            self.stress = (self.stress - (5.0 + (pnl / 500.0).min(9.0))).max(0.0);
        } else {
            self.losses += 1;
            self.total_cash_in += closed.margin;
            self.total_cash_out += pnl.abs();
            self.stress = (self.stress + 14.0 + (pnl.abs() / 250.0).min(30.0)).min(100.0);
        }

        self.add_event(format!(
            "{} {} closed {:+.2} · {}",
            if pnl >= 0.0 { "✓" } else { "✕" },
            closed.side,
            pnl,
            reason
        ));
        self.position = None;
    }

    fn open_position(&mut self, side: &str, confidence: f64, requested_notional: f64) {
        if self.price <= 0.0 {
            return;
        }

        // The connectome chooses the exact stake. The account only enforces
        // its available buying-power boundary.
        let max_notional = self.buying_power();
        let notional = clamp64(requested_notional, 0.0, max_notional);
        if notional < 0.01 {
            self.add_event(format!(
                "· BRAIN SKIP {} · chose only USD {:.4} notional",
                side, notional
            ));
            return;
        }

        let qty = notional / self.price;
        let margin = notional / MAX_LEVERAGE;

        self.margin_locked += margin;
        self.total_cash_out += margin;
        self.position = Some(Position {
            side: side.into(),
            entry: self.price,
            qty,
            opened_tick: self.tick,
            notional,
            margin,
        });
        self.stress = (self.stress + 5.0 + confidence * 9.0).min(100.0);
        self.add_event(format!(
            "→ {} BTCUSDT @ {:.2} · BRAIN CHOSE USD {:.2} notional · margin {:.2} · hold {} ticks · {:.0}%",
            side,
            self.price,
            notional,
            margin,
            self.brain_hold_ticks,
            confidence * 100.0
        ));
    }

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
    state: Arc<RwLock<PersistedState>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
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

fn momentum(prices: &[f64]) -> f64 {
    if prices.len() < 8 {
        return 0.0;
    }
    let a = prices[prices.len() - 1];
    let b = prices[prices.len() - 8];
    if b != 0.0 { (a - b) / b } else { 0.0 }
}

fn volatility(prices: &[f64]) -> f64 {
    if prices.len() < 3 {
        return 0.0;
    }
    let start = prices.len().saturating_sub(19);
    let mut xs = Vec::new();
    for w in prices[start..].windows(2) {
        if w[0] != 0.0 {
            xs.push((w[1] - w[0]) / w[0]);
        }
    }
    if xs.is_empty() {
        return 0.0;
    }
    let mean = xs.iter().sum::<f64>() / xs.len() as f64;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / xs.len() as f64;
    var.sqrt()
}

fn build_input(
    brain: &Brain,
    p: &Partitions,
    prices: &[f64],
    stress: f64,
    resting: bool,
) -> Vec<f32> {
    let mut ext = vec![0.0f32; brain.num_neurons];
    if resting {
        for &i in &p.sensory {
            ext[i] = 0.035;
        }
        return ext;
    }

    let mom = momentum(prices);
    let vol = volatility(prices);
    let trend = clamp64(mom.abs() * 8.0, 0.0, 1.0);
    let calm = 1.0 - clamp64(vol * 12.0, 0.0, 1.0);
    let base = 0.22 + calm * 0.08;
    let up = mom >= 0.0;
    let left_amp = base + if up { trend * 0.45 } else { trend * 3.8 };
    let right_amp = base + if up { trend * 3.8 } else { trend * 0.45 };

    for &i in &p.optic_left {
        ext[i] = left_amp as f32;
    }
    for &i in &p.optic_right {
        ext[i] = right_amp as f32;
    }

    let arousal = 0.06
        + clamp64(vol * 9.0, 0.0, 1.0) * 1.5
        + clamp64(stress / 100.0, 0.0, 1.0) * 0.9;

    for &i in &p.sensory {
        if ext[i] == 0.0 {
            ext[i] = arousal as f32;
        }
    }

    ext
}

async fn ensure_brain_file() -> Result<Vec<u8>, String> {
    if let Ok(path) = env::var("BRAIN_PATH") {
        if Path::new(&path).exists() {
            return fs::read(&path).map_err(|e| format!("read BRAIN_PATH: {e}"));
        }
    }

    let url = env::var("BRAIN_URL")
        .unwrap_or_else(|_| "https://fruit-fly-driving-scooter.vercel.app/brain.bin".into());
    eprintln!("downloading full FlyWire brain from {url}");
    let res = reqwest::get(&url)
        .await
        .map_err(|e| format!("brain download: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("brain download HTTP {}", res.status()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("brain bytes: {e}"))?;
    Ok(bytes.to_vec())
}

fn load_state(path: &Path) -> PersistedState {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<PersistedState>(&raw).unwrap_or_else(|e| {
            eprintln!("state parse failed, starting fresh: {e}");
            PersistedState::fresh()
        }),
        Err(_) => PersistedState::fresh(),
    }
}

fn save_state(path: &Path, state: &PersistedState) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_vec_pretty(state) {
        let tmp = path.with_extension("tmp");
        if fs::write(&tmp, raw).is_ok() {
            let _ = fs::rename(tmp, path);
        }
    }
}

async fn market_loop(tx: watch::Sender<(f64, u64)>) {
    loop {
        match connect_async("wss://stream.binance.com:9443/ws/btcusdt@trade").await {
            Ok((mut ws, _)) => {
                eprintln!("BTCUSDT websocket connected");
                while let Some(msg) = ws.next().await {
                    let Ok(msg) = msg else { break; };
                    if !msg.is_text() {
                        continue;
                    }
                    let Ok(v) = serde_json::from_str::<Value>(msg.to_text().unwrap_or("")) else {
                        continue;
                    };
                    let price = v
                        .get("p")
                        .and_then(|x| x.as_str())
                        .and_then(|x| x.parse::<f64>().ok())
                        .unwrap_or(0.0);
                    let t = v
                        .get("T")
                        .and_then(|x| x.as_u64())
                        .unwrap_or_else(now_ms);
                    if price > 0.0 {
                        let _ = tx.send((price, t));
                    }
                }
            }
            Err(e) => eprintln!("BTC websocket error: {e}"),
        }
        sleep(Duration::from_secs(2)).await;
    }
}

async fn simulation_loop(
    brain: Arc<Brain>,
    partitions: Partitions,
    shared: Arc<RwLock<PersistedState>>,
    mut market_rx: watch::Receiver<(f64, u64)>,
    state_path: PathBuf,
    steps_per_cycle: usize,
    interval_ms: u64,
) {
    let mut sim = Sim::new(brain.clone());
    let mut state = load_state(&state_path);
    state.brain_neurons = brain.num_neurons;
    state.brain_edges = brain.num_edges;
    state.brain_steps_per_cycle = steps_per_cycle;
    state.mode = "full-flywire-cpu-24x7".into();
    state.add_event(format!(
        "24/7 worker boot · FULL FlyWire {} neurons · {} edges",
        brain.num_neurons, brain.num_edges
    ));

    let mut last_sampled_price = state.price;
    let mut last_save = now_ms();

    loop {
        let (market_price, market_time) = *market_rx.borrow_and_update();
        if market_price > 0.0 {
            state.price = market_price;
            state.last_market_at_ms = market_time;
        }

        if state.price > 0.0
            && (last_sampled_price <= 0.0 || (state.price - last_sampled_price).abs() > f64::EPSILON)
        {
            state.prices.push(state.price);
            if state.prices.len() > 96 {
                let excess = state.prices.len() - 96;
                state.prices.drain(0..excess);
            }
            state.tick += 1;
            last_sampled_price = state.price;

            let abs_move = if state.prices.len() >= 2 {
                let a = state.prices[state.prices.len() - 2];
                if a > 0.0 { ((state.price - a) / a).abs() } else { 0.0 }
            } else {
                0.0
            };

            let mut stress_delta = (abs_move * 6000.0).min(4.0);
            if let Some(p) = &state.position {
                let floating_loss = (-state.unrealized_pnl()).max(0.0);
                let exposure = p.notional / state.equity().abs().max(1.0);
                stress_delta += (floating_loss / 800.0).min(7.0);
                stress_delta += (exposure * 0.08).min(0.8);
            }
            state.stress = (state.stress + stress_delta).min(100.0);

            if !state.break_mode {
                if let Some(p) = &state.position {
                    let brain_hold = state.brain_hold_ticks.max(1);
                    if state.tick.saturating_sub(p.opened_tick) >= brain_hold {
                        state.close_position("brain-selected hold time elapsed");
                    }
                }
            }
        }

        let now = now_ms();
        if !state.break_mode
            && state.stress >= SMOKE_ENTER_STRESS
            && state.desk_smoke_since_ms.is_none()
        {
            state.desk_smoke_since_ms = Some(now);
            state.add_event(format!("🚬 DESK SMOKE · stress {:.0}", state.stress));
        }

        if !state.break_mode
            && state.desk_smoke_since_ms.is_some()
            && state.stress < SMOKE_CLEAR_STRESS
        {
            state.desk_smoke_since_ms = None;
            state.add_event("✓ CALMER · cigarette out");
        }

        let smoke_elapsed = state
            .desk_smoke_since_ms
            .map(|t| now.saturating_sub(t))
            .unwrap_or(0);

        if !state.break_mode
            && state.stress >= BREAK_ENTER_STRESS
            && state.desk_smoke_since_ms.is_some()
            && smoke_elapsed >= MIN_DESK_SMOKE_MS
        {
            state.break_mode = true;
            state.decision = "BREAK".into();
            state.add_event("☕ CITY BREAK · position stays open");
        } else if state.break_mode && state.stress <= BREAK_EXIT_STRESS {
            state.break_mode = false;
            state.desk_smoke_since_ms = None;
            state.pending_side = None;
            state.pending_confirmations = 0;
            state.decision = "WAIT".into();
            state.add_event("↩ CALM AGAIN · resumes trading");
        }

        state.stress = (state.stress
            - if state.break_mode {
                3.6 * interval_ms as f64 / 1000.0
            } else {
                0.02 * interval_ms as f64 / 1000.0
            })
            .max(0.0);

        let ext = build_input(
            &brain,
            &partitions,
            &state.prices,
            state.stress,
            state.break_mode,
        );
        sim.set_input(&ext);

        let mut dn_l_spikes = 0u64;
        let mut dn_r_spikes = 0u64;
        let mut mbon_spikes = 0u64;
        let mut region_spikes = vec![0u64; SUPER_CLASS_LABELS.len()];
        let mut region_active = vec![false; brain.num_neurons];

        for _ in 0..steps_per_cycle {
            sim.step();
            state.brain_steps_total += 1;

            for &i in &partitions.dn_left {
                if sim.fired(i) { dn_l_spikes += 1; }
            }
            for &i in &partitions.dn_right {
                if sim.fired(i) { dn_r_spikes += 1; }
            }
            for &i in &partitions.mbon {
                if sim.fired(i) { mbon_spikes += 1; }
            }

            for i in 0..brain.num_neurons {
                if sim.fired(i) {
                    region_active[i] = true;
                    let g = brain.super_class[i] as usize;
                    if g < region_spikes.len() {
                        region_spikes[g] += 1;
                    }
                }
            }
        }

        let denom_l = (partitions.dn_left.len().max(1) * steps_per_cycle) as f64;
        let denom_r = (partitions.dn_right.len().max(1) * steps_per_cycle) as f64;
        let denom_m = (partitions.mbon.len().max(1) * steps_per_cycle) as f64;
        let l = dn_l_spikes as f64 / denom_l;
        let r = dn_r_spikes as f64 / denom_r;
        let activity = l + r;
        let mbon = mbon_spikes as f64 / denom_m;
        let asym = if activity > 0.0004 {
            (r - l) / (activity + 0.0005)
        } else {
            0.0
        };
        let signal = (asym * 2.15 + (mbon - 0.01) * 0.35).tanh();
        let vol = volatility(&state.prices);
        let threshold = 0.105 + (vol * 2.5).clamp(0.0, 0.13);
        let confidence = clamp64(signal.abs() * 0.88 + activity * 9.5, 0.0, 1.0);

        // Independent full-connectome readouts choose exact stake size and patience.
        let central_mean = if partitions.region_counts[4] > 0 && steps_per_cycle > 0 {
            region_spikes[4] as f64 / (partitions.region_counts[4] * steps_per_cycle) as f64
        } else { 0.0 };
        let motor_mean = if partitions.region_counts[6] > 0 && steps_per_cycle > 0 {
            region_spikes[6] as f64 / (partitions.region_counts[6] * steps_per_cycle) as f64
        } else { 0.0 };
        let intrinsic_mean = if partitions.region_counts[3] > 0 && steps_per_cycle > 0 {
            region_spikes[3] as f64 / (partitions.region_counts[3] * steps_per_cycle) as f64
        } else { 0.0 };
        let ascending_mean = if partitions.region_counts[2] > 0 && steps_per_cycle > 0 {
            region_spikes[2] as f64 / (partitions.region_counts[2] * steps_per_cycle) as f64
        } else { 0.0 };

        let central_drive = neural_unit(central_mean, 95.0);
        let motor_drive = neural_unit(motor_mean, 110.0);
        let intrinsic_drive = neural_unit(intrinsic_mean, 90.0);
        let ascending_drive = neural_unit(ascending_mean, 90.0);

        let brain_size_signal = clamp64(
            central_drive * 0.34
                + motor_drive * 0.26
                + neural_unit(mbon, 120.0) * 0.20
                + signal.abs() * 0.20,
            0.0,
            1.0,
        );
        let brain_patience_signal = clamp64(
            intrinsic_drive * 0.46
                + ascending_drive * 0.34
                + (1.0 - signal.abs()) * 0.20,
            0.0,
            1.0,
        );

        let max_buying_power = state.buying_power();
        state.brain_size_signal = brain_size_signal;
        state.brain_risk_fraction = brain_size_signal;
        state.brain_notional = (max_buying_power * brain_size_signal * 100.0).round() / 100.0;
        state.brain_patience_signal = brain_patience_signal;
        state.brain_hold_ticks = 1
            + (brain_patience_signal * (MAX_BRAIN_HOLD_TICKS - 1) as f64).round() as u64;

        state.signal = signal;
        state.activity = activity;
        state.confidence = confidence;

        state.brain_regions = SUPER_CLASS_LABELS
            .iter()
            .enumerate()
            .map(|(id, label)| {
                let count = partitions.region_counts[id];
                let active = region_active
                    .iter()
                    .enumerate()
                    .filter(|(i, fired)| **fired && brain.super_class[*i] as usize == id)
                    .count();
                RegionActivity {
                    id,
                    label: (*label).into(),
                    count,
                    active,
                    mean: if count > 0 && steps_per_cycle > 0 {
                        region_spikes[id] as f64 / (count * steps_per_cycle) as f64
                    } else {
                        0.0
                    },
                }
            })
            .collect();

        if !state.break_mode && state.price > 0.0 && state.prices.len() >= 8 {
            let side = if signal.abs() < threshold {
                "WAIT"
            } else if signal > 0.0 {
                "LONG"
            } else {
                "SHORT"
            };

            if side == "WAIT" {
                state.decision = "WAIT".into();
                state.pending_side = None;
                state.pending_confirmations = 0;
            } else if state.position.as_ref().map(|p| p.side.as_str()) == Some(side) {
                state.decision = side.into();
                state.pending_side = None;
                state.pending_confirmations = 0;
            } else {
                let need = state.required_confirmations();
                let min_conf = state.required_confidence();

                if confidence < min_conf {
                    state.decision = "STUDY".into();
                    state.pending_side = None;
                    state.pending_confirmations = 0;
                } else {
                    if state.pending_side.as_deref() == Some(side) {
                        state.pending_confirmations += 1;
                    } else {
                        state.pending_side = Some(side.into());
                        state.pending_confirmations = 1;
                    }

                    if state.pending_confirmations >= need {
                        state.pending_side = None;
                        state.pending_confirmations = 0;
                        if state.position.is_some() {
                            state.close_position("brain reversed after confirmation");
                        }
                        let chosen_notional = state.brain_notional;
                        state.open_position(side, confidence, chosen_notional);
                        state.decision = side.into();
                    } else {
                        state.decision = "STUDY".into();
                    }
                }
            }
        }

        state.update_peak();
        state.updated_at_ms = now_ms();

        {
            let mut guard = shared.write().await;
            *guard = state.clone();
        }

        if now_ms().saturating_sub(last_save) >= 5_000 {
            save_state(&state_path, &state);
            last_save = now_ms();
        }

        sleep(Duration::from_millis(interval_ms)).await;
    }
}

async fn health(State(app): State<AppState>) -> Json<Value> {
    let s = app.state.read().await;
    Json(serde_json::json!({
        "ok": true,
        "mode": s.mode,
        "brain_neurons": s.brain_neurons,
        "brain_edges": s.brain_edges,
        "updated_at_ms": s.updated_at_ms,
        "last_market_at_ms": s.last_market_at_ms
    }))
}

async fn state_handler(State(app): State<AppState>) -> Json<PersistedState> {
    Json(app.state.read().await.clone())
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

    let partitions = partition(&brain);
    let state_path = PathBuf::from(
        env::var("STATE_PATH").unwrap_or_else(|_| "/data/flybrain-state.json".into()),
    );
    let steps_per_cycle = env::var("BRAIN_STEPS_PER_CYCLE")
        .ok()
        .and_then(|x| x.parse::<usize>().ok())
        .unwrap_or(4)
        .max(1);
    let interval_ms = env::var("SIM_INTERVAL_MS")
        .ok()
        .and_then(|x| x.parse::<u64>().ok())
        .unwrap_or(1000)
        .max(250);

    let initial = load_state(&state_path);
    let shared = Arc::new(RwLock::new(initial));
    let (market_tx, market_rx) = watch::channel((0.0f64, 0u64));

    tokio::spawn(market_loop(market_tx));
    tokio::spawn(simulation_loop(
        brain.clone(),
        partitions,
        shared.clone(),
        market_rx,
        state_path,
        steps_per_cycle,
        interval_ms,
    ));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET])
        .allow_headers(Any);

    let app_state = AppState { state: shared };
    let app = Router::new()
        .route("/", get(state_handler))
        .route("/state", get(state_handler))
        .route("/health", get(health))
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
