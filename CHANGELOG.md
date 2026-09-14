# Changelog

## [3.1.2](https://github.com/windowkit/wayland/compare/v3.1.1...v3.1.2) (2026-09-14)


### Bug Fixes

* resolve the imports in generated protocol typings ([#6](https://github.com/windowkit/wayland/issues/6)) ([3a62543](https://github.com/windowkit/wayland/commit/3a625434040680d6be9d6575ab44ec27b40cd981))

## [3.1.1](https://github.com/windowkit/wayland/compare/v3.1.0...v3.1.1) (2026-09-14)


### Bug Fixes

* accept null for allow-null object and string arguments ([#4](https://github.com/windowkit/wayland/issues/4)) ([cdf0d53](https://github.com/windowkit/wayland/commit/cdf0d53c45131993c9fcda50f4ea068548b0171c))

## 3.1.0 (2026-09-14)

The first release as `@windowkit/wayland`: a fork of
[`wayland-client`](https://github.com/sdumetz/node-wayland-client) 3.0.0 by
Sebastien Dumetz. Everything below is on top of that release; the API it had
is unchanged.

### Features

- **File descriptors, both directions.** A request with an `fd` argument goes
  out as one `sendmsg(2)` with SCM_RIGHTS through a socket that has
  `sendFds()`, and an `fd` event argument takes the next descriptor the
  socket received, in parse order, through `takeFds()`. On a plain
  `net.Socket` nothing changes: such a request throws, and `fd` event
  arguments read as -1.
  ([#1](https://github.com/windowkit/wayland/pull/1))
- **`Wl_interface.$`, every request synchronously.** The same requests,
  returning the object they create instead of a promise for it, and writing
  without waiting for backpressure — for callers that cannot await, such as
  code inside React's commit phase.
  ([#1](https://github.com/windowkit/wayland/pull/1))
- **Callback requests resolve with their payload.** `wl_display.sync()`
  resolves with the serial and `wl_surface.frame()` with the frame's
  timestamp, where both used to resolve `undefined`.
  ([#1](https://github.com/windowkit/wayland/pull/1))
