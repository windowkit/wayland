# Changelog

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
