use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};

use super::{clamp64, neural_unit, Brain, Partitions, Sim, SUPER_CLASS_LABELS};

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct CivilizationBrainSense {
    pub brain_id: String,
    #[serde(default)]
    pub parent_brain_ids: Vec<String>,
    #[serde(default)]
    pub hunger: f64,
    #[serde(default)]
    pub energy: f64,
    #[serde(default)]
    pub stress: f64,
    #[serde(default)]
    pub happiness: f64,
    #[serde(default)]
    pub excitement: f64,
    #[serde(default)]
    pub loneliness: f64,
    #[serde(default = "default_health")]
    pub health: f64,
    #[serde(default)]
    pub target_dx: f64,
    #[serde(default)]
    pub target_dz: f64,
    #[serde(default)]
    pub social_signal: f64,
    #[serde(default)]
    pub reward: f64,
    #[serde(default)]
    pub weather_danger: f64,
    #[serde(default)]
    pub precipitation: f64,
    #[serde(default)]
    pub wind: f64,
    #[serde(default)]
    pub sunset_quality: f64,
    #[serde(default)]
    pub sleeping: bool,
}

fn default_health() -> f64 {
    100.0
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct CivilizationBrainBatch {
    #[serde(default)]
    pub agents: Vec<CivilizationBrainSense>,
    #[serde(default)]
    pub steps_per_brain: Option<usize>,
    #[serde(default)]
    pub max_brains_per_sync: Option<usize>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct CivilizationBrainOutput {
    pub brain_id: String,
    pub parent_brain_ids: Vec<String>,
    pub full_connectome: bool,
    pub stepped_this_sync: bool,
    pub neurons: usize,
    pub edges: usize,
    pub neural_steps_total: u64,
    pub active_neurons: usize,
    pub activity: f64,
    pub locomotion_x: f64,
    pub locomotion_z: f64,
    pub approach_drive: f64,
    pub avoid_drive: f64,
    pub social_drive: f64,
    pub rest_drive: f64,
    pub explore_drive: f64,
    pub consume_drive: f64,
    pub motor_drive: f64,
    pub confidence: f64,
    pub region_activity: Vec<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct CivilizationBrainBatchResponse {
    pub topology_shared: bool,
    pub independent_dynamic_state: bool,
    pub registered_brains: usize,
    pub stepped_brains: usize,
    pub scheduler_cursor: usize,
    pub outputs: Vec<CivilizationBrainOutput>,
}

struct AgentBrain {
    brain_id: String,
    parent_brain_ids: Vec<String>,
    sim: Sim,
    neural_steps_total: u64,
    last_output: CivilizationBrainOutput,
}

pub(crate) struct MultiBrainRegistry {
    brain: Arc<Brain>,
    partitions: Arc<Partitions>,
    agents: HashMap<String, AgentBrain>,
    order: Vec<String>,
    cursor: usize,
    default_steps_per_brain: usize,
    default_max_brains_per_sync: usize,
}

impl MultiBrainRegistry {
    pub(crate) fn new(
        brain: Arc<Brain>,
        partitions: Arc<Partitions>,
        default_steps_per_brain: usize,
        default_max_brains_per_sync: usize,
    ) -> Self {
        Self {
            brain,
            partitions,
            agents: HashMap::new(),
            order: Vec::new(),
            cursor: 0,
            default_steps_per_brain: default_steps_per_brain.max(1),
            default_max_brains_per_sync: default_max_brains_per_sync.max(1),
        }
    }

    fn blank_output(&self, sense: &CivilizationBrainSense) -> CivilizationBrainOutput {
        CivilizationBrainOutput {
            brain_id: sense.brain_id.clone(),
            parent_brain_ids: sense.parent_brain_ids.clone(),
            full_connectome: true,
            stepped_this_sync: false,
            neurons: self.brain.num_neurons,
            edges: self.brain.num_edges,
            neural_steps_total: 0,
            active_neurons: 0,
            activity: 0.0,
            locomotion_x: 0.0,
            locomotion_z: 0.0,
            approach_drive: 0.0,
            avoid_drive: 0.0,
            social_drive: 0.0,
            rest_drive: 0.0,
            explore_drive: 0.0,
            consume_drive: 0.0,
            motor_drive: 0.0,
            confidence: 0.0,
            region_activity: vec![0.0; SUPER_CLASS_LABELS.len()],
        }
    }

    fn ensure_agent(&mut self, sense: &CivilizationBrainSense) {
        if self.agents.contains_key(&sense.brain_id) {
            return;
        }
        let output = self.blank_output(sense);
        let agent = AgentBrain {
            brain_id: sense.brain_id.clone(),
            parent_brain_ids: sense.parent_brain_ids.clone(),
            sim: Sim::new(self.brain.clone()),
            neural_steps_total: 0,
            last_output: output,
        };
        self.order.push(sense.brain_id.clone());
        self.agents.insert(sense.brain_id.clone(), agent);
    }

    fn build_input(&self, sense: &CivilizationBrainSense) -> Vec<f32> {
        let mut ext = vec![0.0f32; self.brain.num_neurons];
        let p = &self.partitions;

        // Synthetic sensory encoder for Full Life. It maps raw body/world state
        // into existing sensory populations without injecting semantic actions.
        let dx = clamp64(sense.target_dx / 80.0, -1.0, 1.0);
        let dz = clamp64(sense.target_dz / 80.0, -1.0, 1.0);
        let left_visual = clamp64(0.22 + (-dx).max(0.0) * 0.75 + dz.abs() * 0.10, 0.0, 1.5);
        let right_visual = clamp64(0.22 + dx.max(0.0) * 0.75 + dz.abs() * 0.10, 0.0, 1.5);
        let sleep_gain = if sense.sleeping { 0.22 } else { 1.0 };

        for (k, &i) in p.optic_left.iter().enumerate() {
            let texture = ((k % 17) as f64 / 17.0) * 0.08;
            ext[i] = ((left_visual + texture) * sleep_gain) as f32;
        }
        for (k, &i) in p.optic_right.iter().enumerate() {
            let texture = (((k * 7) % 19) as f64 / 19.0) * 0.08;
            ext[i] = ((right_visual + texture) * sleep_gain) as f32;
        }

        let hunger = clamp64(sense.hunger / 100.0, 0.0, 1.0);
        let fatigue = clamp64((100.0 - sense.energy) / 100.0, 0.0, 1.0);
        let stress = clamp64(sense.stress / 100.0, 0.0, 1.0);
        let excitement = clamp64(sense.excitement / 100.0, 0.0, 1.0);
        let loneliness = clamp64(sense.loneliness / 100.0, 0.0, 1.0);
        let health_pressure = clamp64((100.0 - sense.health) / 100.0, 0.0, 1.0);
        let social = clamp64(sense.social_signal, 0.0, 1.0);
        let reward = clamp64((sense.reward + 1.0) * 0.5, 0.0, 1.0);
        let weather_danger = clamp64(sense.weather_danger, 0.0, 1.0);
        let precipitation = clamp64(sense.precipitation, 0.0, 1.0);
        let wind = clamp64(sense.wind, 0.0, 1.0);
        let sunset = clamp64(sense.sunset_quality, 0.0, 1.0);

        let body_drive = 0.08
            + hunger * 0.42
            + fatigue * 0.34
            + stress * 0.38
            + excitement * 0.20
            + loneliness * 0.18
            + health_pressure * 0.30
            + social * 0.18
            + reward * 0.12
            + weather_danger * 0.20
            + precipitation * 0.10
            + wind * 0.08;

        for (k, &i) in p.sensory.iter().enumerate() {
            let lane = k % 8;
            let channel = match lane {
                0 => hunger,
                1 => fatigue,
                2 => stress,
                3 => excitement,
                4 => loneliness,
                5 => health_pressure,
                6 => social,
                7 => reward,
                8 => weather_danger,
                9 => precipitation,
                10 => wind,
                _ => sunset,
            };
            ext[i] = ((body_drive * 0.35 + channel * 1.15) * sleep_gain) as f32;
        }

        ext
    }

    fn step_agent(
        brain: &Brain,
        partitions: &Partitions,
        agent: &mut AgentBrain,
        sense: &CivilizationBrainSense,
        steps: usize,
    ) {
        let ext = {
            let mut input = vec![0.0f32; brain.num_neurons];
            let dx = clamp64(sense.target_dx / 80.0, -1.0, 1.0);
            let dz = clamp64(sense.target_dz / 80.0, -1.0, 1.0);
            let left_visual = clamp64(0.22 + (-dx).max(0.0) * 0.75 + dz.abs() * 0.10, 0.0, 1.5);
            let right_visual = clamp64(0.22 + dx.max(0.0) * 0.75 + dz.abs() * 0.10, 0.0, 1.5);
            let sleep_gain = if sense.sleeping { 0.22 } else { 1.0 };
            let visibility = clamp64(1.0 - sense.precipitation * 0.55 - sense.weather_danger * 0.18, 0.2, 1.0);
            let sunset_glow = clamp64(sense.sunset_quality, 0.0, 1.0) * 0.18;

            for (k, &i) in partitions.optic_left.iter().enumerate() {
                input[i] = (((left_visual + ((k % 17) as f64 / 17.0) * 0.08) * visibility + sunset_glow) * sleep_gain) as f32;
            }
            for (k, &i) in partitions.optic_right.iter().enumerate() {
                input[i] = (((right_visual + (((k * 7) % 19) as f64 / 19.0) * 0.08) * visibility + sunset_glow) * sleep_gain) as f32;
            }

            let channels = [
                clamp64(sense.hunger / 100.0, 0.0, 1.0),
                clamp64((100.0 - sense.energy) / 100.0, 0.0, 1.0),
                clamp64(sense.stress / 100.0, 0.0, 1.0),
                clamp64(sense.excitement / 100.0, 0.0, 1.0),
                clamp64(sense.loneliness / 100.0, 0.0, 1.0),
                clamp64((100.0 - sense.health) / 100.0, 0.0, 1.0),
                clamp64(sense.social_signal, 0.0, 1.0),
                clamp64((sense.reward + 1.0) * 0.5, 0.0, 1.0),
                clamp64(sense.weather_danger, 0.0, 1.0),
                clamp64(sense.precipitation, 0.0, 1.0),
                clamp64(sense.wind, 0.0, 1.0),
                clamp64(sense.sunset_quality, 0.0, 1.0),
            ];
            for (k, &i) in partitions.sensory.iter().enumerate() {
                input[i] = ((0.08 + channels[k % channels.len()] * 1.35) * sleep_gain) as f32;
            }
            input
        };

        agent.sim.set_input(&ext);

        let mut dn_l = 0u64;
        let mut dn_r = 0u64;
        let mut mbon = 0u64;
        let mut active = 0usize;
        let mut region_spikes = vec![0u64; SUPER_CLASS_LABELS.len()];

        for _ in 0..steps.max(1) {
            agent.sim.step();
            agent.neural_steps_total += 1;

            for &i in &partitions.dn_left {
                if agent.sim.fired(i) {
                    dn_l += 1;
                }
            }
            for &i in &partitions.dn_right {
                if agent.sim.fired(i) {
                    dn_r += 1;
                }
            }
            for &i in &partitions.mbon {
                if agent.sim.fired(i) {
                    mbon += 1;
                }
            }

            for i in 0..brain.num_neurons {
                if agent.sim.fired(i) {
                    active += 1;
                    let r = brain.super_class[i] as usize;
                    if r < region_spikes.len() {
                        region_spikes[r] += 1;
                    }
                }
            }
        }

        let steps_f = steps.max(1) as f64;
        let l = dn_l as f64 / (partitions.dn_left.len().max(1) as f64 * steps_f);
        let r = dn_r as f64 / (partitions.dn_right.len().max(1) as f64 * steps_f);
        let motor_mean = if partitions.region_counts[6] > 0 {
            region_spikes[6] as f64 / (partitions.region_counts[6] as f64 * steps_f)
        } else { 0.0 };
        let central_mean = if partitions.region_counts[4] > 0 {
            region_spikes[4] as f64 / (partitions.region_counts[4] as f64 * steps_f)
        } else { 0.0 };
        let intrinsic_mean = if partitions.region_counts[3] > 0 {
            region_spikes[3] as f64 / (partitions.region_counts[3] as f64 * steps_f)
        } else { 0.0 };
        let endocrine_mean = if partitions.region_counts[7] > 0 {
            region_spikes[7] as f64 / (partitions.region_counts[7] as f64 * steps_f)
        } else { 0.0 };
        let sensory_mean = if partitions.region_counts[1] > 0 {
            region_spikes[1] as f64 / (partitions.region_counts[1] as f64 * steps_f)
        } else { 0.0 };
        let mbon_mean = mbon as f64 / (partitions.mbon.len().max(1) as f64 * steps_f);

        let lr = neural_unit(l, 115.0);
        let rr = neural_unit(r, 115.0);
        let motor = neural_unit(motor_mean, 110.0);
        let central = neural_unit(central_mean, 95.0);
        let intrinsic = neural_unit(intrinsic_mean, 95.0);
        let endocrine = neural_unit(endocrine_mean, 110.0);
        let sensory = neural_unit(sensory_mean, 105.0);
        let mushroom = neural_unit(mbon_mean, 120.0);

        let horizontal = clamp64((rr - lr) * 2.2, -1.0, 1.0);
        let forward = clamp64((rr + lr) * 0.9 + motor * 0.55, 0.0, 1.0);
        let approach = clamp64(central * 0.38 + mushroom * 0.34 + motor * 0.28, 0.0, 1.0);
        let avoid = clamp64(endocrine * 0.42 + sensory * 0.36 + (1.0 - mushroom) * 0.22, 0.0, 1.0);
        let social = clamp64(mushroom * 0.38 + central * 0.32 + sensory * 0.18 + motor * 0.12, 0.0, 1.0);
        let rest = clamp64(intrinsic * 0.44 + endocrine * 0.28 + (1.0 - motor) * 0.28, 0.0, 1.0);
        let explore = clamp64(motor * 0.34 + central * 0.28 + sensory * 0.22 + (rr - lr).abs() * 0.16, 0.0, 1.0);
        let consume = clamp64(mushroom * 0.32 + intrinsic * 0.24 + sensory * 0.24 + central * 0.20, 0.0, 1.0);
        let confidence = clamp64(
            [approach, avoid, social, rest, explore, consume]
                .iter()
                .copied()
                .fold(0.0f64, f64::max),
            0.0,
            1.0,
        );

        let region_activity = region_spikes
            .iter()
            .enumerate()
            .map(|(i, &count)| {
                if partitions.region_counts[i] == 0 {
                    0.0
                } else {
                    count as f64 / (partitions.region_counts[i] as f64 * steps_f)
                }
            })
            .collect::<Vec<_>>();

        agent.last_output = CivilizationBrainOutput {
            brain_id: agent.brain_id.clone(),
            parent_brain_ids: agent.parent_brain_ids.clone(),
            full_connectome: true,
            stepped_this_sync: true,
            neurons: brain.num_neurons,
            edges: brain.num_edges,
            neural_steps_total: agent.neural_steps_total,
            active_neurons: active,
            activity: (active as f64 / (brain.num_neurons.max(1) as f64 * steps_f)).min(1.0),
            locomotion_x: horizontal,
            locomotion_z: forward,
            approach_drive: approach,
            avoid_drive: avoid,
            social_drive: social,
            rest_drive: rest,
            explore_drive: explore,
            consume_drive: consume,
            motor_drive: motor,
            confidence,
            region_activity,
        };
    }

    pub(crate) fn sync(&mut self, batch: CivilizationBrainBatch) -> CivilizationBrainBatchResponse {
        for sense in &batch.agents {
            self.ensure_agent(sense);
        }

        if self.order.is_empty() {
            return CivilizationBrainBatchResponse {
                topology_shared: true,
                independent_dynamic_state: true,
                registered_brains: 0,
                stepped_brains: 0,
                scheduler_cursor: 0,
                outputs: Vec::new(),
            };
        }

        let steps = batch.steps_per_brain
            .unwrap_or(self.default_steps_per_brain)
            .clamp(1, 8);
        let budget = batch.max_brains_per_sync
            .unwrap_or(self.default_max_brains_per_sync)
            .clamp(1, self.order.len().max(1));

        let senses = batch.agents
            .iter()
            .map(|x| (x.brain_id.clone(), x.clone()))
            .collect::<HashMap<_, _>>();

        for agent in self.agents.values_mut() {
            agent.last_output.stepped_this_sync = false;
        }

        let mut stepped = 0usize;
        let mut scanned = 0usize;
        while stepped < budget && scanned < self.order.len() {
            let idx = self.cursor % self.order.len();
            self.cursor = (self.cursor + 1) % self.order.len();
            scanned += 1;
            let id = self.order[idx].clone();
            let Some(sense) = senses.get(&id) else {
                continue;
            };
            let Some(agent) = self.agents.get_mut(&id) else {
                continue;
            };
            Self::step_agent(&self.brain, &self.partitions, agent, sense, steps);
            stepped += 1;
        }

        let outputs = batch.agents
            .iter()
            .filter_map(|sense| self.agents.get(&sense.brain_id).map(|x| x.last_output.clone()))
            .collect::<Vec<_>>();

        CivilizationBrainBatchResponse {
            topology_shared: true,
            independent_dynamic_state: true,
            registered_brains: self.agents.len(),
            stepped_brains: stepped,
            scheduler_cursor: self.cursor,
            outputs,
        }
    }
}
