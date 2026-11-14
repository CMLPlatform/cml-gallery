# Enable browser telemetry

The shared layout loads RUM only when `PUBLIC_RUM_ENDPOINT` is set at build time.
An unset value produces no telemetry script or requests.

The script captures LCP, nonzero accumulated layout shifts, uncaught JavaScript
errors and unhandled promise rejections. It sends OTLP logs labelled
`project=cml-gallery`, `service.name=cml-gallery` and `env=prod`.
Its source is adapted from CMLPlatform/monitoring's `templates/web/rum.html` at v0.5.0.

## Before enabling it

Agree the rollout and data collection with the gallery maintainers first.
Exports include the user agent, page origin and path, error messages and stacks.
Page URLs exclude query strings and fragments; error text and stacks may contain
values from application code, so review them before enabling collection.

GitHub Pages cannot keep collector credentials secret. Provision an HTTPS proxy
that accepts `POST /v1/logs` and injects the collector bearer token on the server.
Restrict browser origins to `https://cmlplatform.github.io`, bound request sizes
and rates, and validate or overwrite the project, service and environment labels.
CORS alone does not stop scripts outside a browser from submitting fabricated logs.
Do not expose an unrestricted relay to the collector.

`PUBLIC_RUM_ENDPOINT` is the proxy base URL, without `/v1/logs`, credentials,
query parameters or a fragment. It is public configuration, never a token.
The gallery does not send an Authorization header.

## Build and verify

1. After the proxy is ready, set the GitHub repository variable
   `PUBLIC_RUM_ENDPOINT` to its HTTPS base URL. The Pages build reads that value.
   For a local build, use `PUBLIC_RUM_ENDPOINT=https://rum.example.org node_modules/.bin/astro build`
   with your real proxy URL.
2. Open the deployed gallery. In the browser Network panel, confirm a request to
   `/v1/logs` succeeds and has no Authorization header. Check that an LCP log arrives.
   CLS is sent when the page becomes hidden and its accumulated score is nonzero.
3. Trigger a controlled error in the browser console:
   `setTimeout(() => { throw new Error('Controlled RUM check'); }, 0)`.
   In Grafana Explore, select Loki and query
   `{project="cml-gallery", env="prod"}`. Confirm the controlled error and
   `WebVital: LCP` appear with `service_name=cml-gallery`.
4. Verify the monitoring hub's existing blackbox target
   `https://cmlplatform.github.io/cml-gallery/` has `probe_success=1`.
   Browser logs do not supply the HTTP request metrics used by Service Health.
   Use the probe for uptime and Loki for browser vitals and errors.

Visitor traffic is intermittent. Do not apply the backend telemetry silence alert
to RUM without a continuous heartbeat source.

To disable collection, unset `PUBLIC_RUM_ENDPOINT` and rebuild the site.
