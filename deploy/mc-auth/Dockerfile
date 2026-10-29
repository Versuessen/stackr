# Verification server: builds mc-oauth-rs (MIT, https://github.com/Andcool-Systems/mc-oauth-rs)
# from a pinned, reviewed commit and runs it as an unprivileged user.
FROM rust:1-slim-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends git pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
ARG MC_OAUTH_COMMIT=55d129668f5ced3df089ad7d1e3dc663f64edf87
RUN git clone https://github.com/Andcool-Systems/mc-oauth-rs /src && git -C /src checkout --detach "$MC_OAUTH_COMMIT"
WORKDIR /src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home mcauth
WORKDIR /app
COPY --from=build /src/target/release/mc-oauth /app/mc-oauth
COPY config.toml /app/config.toml
USER 10001
EXPOSE 25565
CMD ["/app/mc-oauth"]
