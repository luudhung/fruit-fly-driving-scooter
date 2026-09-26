FROM rust:1.98-bookworm AS build
WORKDIR /app
COPY worker24/Cargo.toml ./Cargo.toml
COPY worker24/src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/flybrain-worker /usr/local/bin/flybrain-worker

ENV PORT=3000
ENV STATE_PATH=/data/flybrain-state.json
ENV BRAIN_URL=https://fruit-fly-driving-scooter.vercel.app/brain.bin
ENV BRAIN_STEPS_PER_CYCLE=4
ENV SIM_INTERVAL_MS=1000

EXPOSE 3000
CMD ["/usr/local/bin/flybrain-worker"]
