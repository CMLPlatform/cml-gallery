---
name: r9cam
summary: Device-side software for automated image capture on Raspberry Pi that pairs the camera with the R9lab platform.
authors:
  - Simon van Lierde
department: Industrial Ecology
type: software
tags:
  - raspberry-pi
  - image-capture
  - research-software
  - circular-economy
  - industrial-ecology
license: AGPL-3.0-or-later
links:
  repo: https://github.com/CMLPlatform/r9cam
  docs: https://docs.r9lab.io/user-guides/r9cam/
---

r9cam runs a lightweight FastAPI server on a Raspberry Pi 5/4 with Camera Module 3/v2. It captures still images with per-capture camera metadata, serves a live preview, pairs to the [R9lab](https://r9lab.io) platform over an outbound WebSocket relay with device-signed tokens, and uploads captures with a disk-backed retry queue.

It also exposes local REST endpoints for setup, diagnostics and direct integrations. The plugin software is AGPL-3.0-or-later; the published API specification and the `r9cam-models` package are Apache-2.0.
