---
name: monitoring
summary: Central OpenTelemetry observability stack for CML research platforms.
authors:
  - Simon van Lierde
department: Industrial Ecology
type: software
tags:
  - observability
  - opentelemetry
  - research-infrastructure
  - grafana
license: MIT
links:
  repo: https://github.com/CMLPlatform/monitoring
---

Central monitoring for CML's research software. One host runs Grafana, Loki, Tempo, Prometheus and an OpenTelemetry Collector. Projects send logs, traces and metrics there over OTLP (the OpenTelemetry protocol), and Grafana shows them side by side.

A one-command demo (`just demo`) starts the stack plus a small instrumented FastAPI service under constant load.
