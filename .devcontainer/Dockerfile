FROM node:20-slim

# System tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Non-root user (important)
RUN useradd -ms /bin/bash dev
USER dev

WORKDIR /workspace

