# FlyBrain 24/7 Worker

Persistent paper-trading state service for the stock experiment.

- BTCUSDT is sampled continuously from Binance.
- Account/trade/stress state is persisted in Redis.
- When a browser with the real WebGPU FlyWire simulation is connected, its decisions and telemetry take precedence.
- When no full-brain client is online, the service clearly switches to `AUTONOMOUS_SERVER` mode.
- The Railway CPU worker does **not** claim to run the full WebGPU FlyWire LIF simulation.
