FROM rust:1.98-bookworm AS build
WORKDIR /app
COPY worker24/Cargo.toml worker24/Cargo.lock ./
COPY worker24/src ./src
RUN cargo build --locked --release

FROM debian:bookworm-slim
LABEL org.opencontainers.image.title="FlyBrain Civilization Neural Worker"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/flybrain-worker /usr/local/bin/flybrain-worker

ENV PORT=3000
ENV BRAIN_URL=https://fruit-fly-driving-scooter.vercel.app/brain.bin
ENV MULTI_BRAIN_STEPS_PER_SYNC=1
ENV MULTI_BRAIN_MAX_PER_SYNC=2

EXPOSE 3000
CMD ["/usr/local/bin/flybrain-worker"]
