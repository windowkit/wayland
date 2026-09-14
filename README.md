![Build Status](https://github.com/windowkit/wayland/actions/workflows/build.yml/badge.svg?branch=main&event=push)

# @windowkit/wayland

low-level wayland client implementation in modern javascript, for Node 18.18+ and Bun.

This is a fork of [node-wayland-client](https://github.com/sdumetz/node-wayland-client) (`wayland-client` on npm) by Sebastien Dumetz, under the same Apache-2.0 license — see [NOTICE](NOTICE). It adds what a client that draws needs: [file descriptors in both directions](#file-descriptors), [synchronous requests](#synchronous-requests), and [callback requests that resolve with their payload](#callback-payloads). It is the protocol layer of [react-x11](https://github.com/sidorares/react-x11)'s Wayland backend, and changes that are not specific to this fork are offered upstream.

No runtime dependencies, no high level abstractions either.

It should be able to manage any wayland protocol extension out there (see [the popular ones](https://wayland.app/protocols/)) through interface definitions parsing.


## Installation

```sh
npm install @windowkit/wayland
```

If you wish to parse XML protocol files at runtime, you will need to install the `xml-js` package or provide your own parser.

Protocol files can also be provided pre-compiled as JSON files. See `convert.js` for an example. This has the added benefit of generating static typings definitions for this protocol.

## Usage

### Bind a global

```js
import open_display from "@windowkit/wayland";
const wl_display = await open_display();
await display.load("protocol/wlr_output_management_unstable_v1.xml");
let wlr_output = await display.bind("zwlr_output_manager_v1");
```

 > See the `examples` folder.

### Error handling

Both socket-level errors and fatal Wayland protocol errors are reported on the `"error"` event of the `Display` object. Set up a handler after calling `init()` / `open_display()`:

```js
import open_display from "@windowkit/wayland";

const display = await open_display();
display.on("error", (err) => {
  if (err.name === "WaylandProtocolError") {
    // The compositor reported a protocol violation.
    // The connection is already destroyed — do not try to send further requests.
    console.error("Fatal Wayland protocol error:", err.message);
  } else {
    // Low-level socket error (e.g. ECONNRESET).
    // err.code contains the Node.js error code.
    console.error("Socket error:", err.message);
  }
});
```

`WaylandProtocolError` is a named export of the package so it can be imported to check `err instanceof WaylandProtocolError` if needed.


**`WaylandProtocolError`** is always fatal — the compositor has destroyed the connection, and calling any further requests will have no effect. No explicit cleanup is needed.

**Socket errors** (plain `Error` objects with a `.code` property) indicate a transport-level failure. Depending on the error code they may or may not be recoverable, but in practice the `"close"` event will follow shortly after.

Interface-level errors (e.g. an unknown event opcode received for a specific object) bubble up to `Display` unless the interface itself has an `"error"` listener:

```js
const surface = await display.bind("wl_surface");
surface.on("error", (err) => {
  // Intercept errors specific to this surface without affecting other objects.
});
```
This is technically a protocol violation but as it only affects the target object, implementors may choose to handle it locally without crashing the entire connection. It generally happens when the client's interface definition doesn't match the compositor's one. 

### Use the interface

What happens next depends on the protocol used. The best thing is to make use of the generated types definitions. [wayland protocols documentation](https://wayland.app/protocols/) is also a good resource to get started.

One major use case is to listen to some events until the server is done sending data. To do this, the base Wl_interface class offers an aggregation primitive:

```js
  await display.load(path.join(thisDir, "protocol", "wlr_output_management_unstable_v1.xml"));
  let wlr_output = await display.bind("zwlr_output_manager_v1");
  let {head: heads = [], done: [serial] = []} = await wlr_output.drain(() => once(wlr_output, "done"));
```

Way better than manually wiring every event recursively. The `drain()` call collects all events until the `"done"` event fires, including `"done"` itself — so `serial` and `heads` are both available in the result. Every event key is an **array** with one entry per emission (`heads` is one entry per `"head"` event, `done` is `[serial]`), so the shape is the same whether an event fired once or many times.

### compile a protocol file

```sh
npx convert-xml protocol/xdg_shell.xml
```
Will create a `protocol/xdg_shell.json` file that can be loaded faster and without the `xml-js` dependency and a `protocol/xdg_shell.d.ts` file that will provide types documentation for the `xdg_shell` interface. Interface names are capitalized in types declaration ( `xdg_shell -> Xdg_shell`).

## Performance

XML protocol parsing is slow. Using pre-compiled JSON files will substantially speed initialization.

The rest of the library uses wayland's wire protocol over a unix socket, so performance should be in line with any other wayland client implementation.

Message reading and writing uses pooled buffers so it shouldn't go too hard on the garbage collector.

## What this fork adds

### File descriptors

Wayland moves everything bulky as a file descriptor: the keymap, `wl_shm` pools, clipboard and drag-and-drop pipes, dma-buf planes. Descriptors travel as SCM_RIGHTS ancillary data, which Node's `net.Socket` can neither send nor receive ([nodejs/node#53391](https://github.com/nodejs/node/issues/53391), closed as not planned), so they need a socket that can, handed to the `Display` constructor. Two exist:

- [`x11-dri`](https://www.npmjs.com/package/x11-dri) 0.9 or later, `UnixSocket`: a native addon on the event loop, for Node.
- [`x11`](https://www.npmjs.com/package/x11) 4.2.1 or later, `lib/fdpass-bun.js` with `receiveFds: true`: `bun:ffi` to libc, for Bun.

```js
import path from "node:path";
import { once } from "node:events";
import dri from "x11-dri";
import { Display } from "@windowkit/wayland";

const socket = new dri.UnixSocket(
  path.join(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY ?? "wayland-0"),
);
await once(socket, "connect");
const display = new Display(socket);
await display.init();
```

Any socket works that is `net.Socket`-shaped and adds two methods:

- `sendFds(buffer, fds, callback?)` writes `buffer` with `fds` attached as one `sendmsg(2)`, and takes ownership of the descriptors: they are closed once they are on the wire.
- `takeFds(n)` returns the next `n` descriptors received, in arrival order.

A request's `fd` arguments go out with the message that carries them, and an event's `fd` arguments take the received descriptors in parse order: the wire pairs descriptors with arguments by their position in the stream, not by message. On a plain `net.Socket` nothing changes — a request with an `fd` argument throws, and `fd` event arguments read as `-1`.

### Synchronous requests

Every interface has a `$` namespace holding the same requests, sent synchronously: a request that creates an object returns it rather than a promise for it, and nothing waits for the socket to drain. A Wayland request is one-way and the client allocates new ids itself, so nothing on the wire needs the `await` — the default methods' promises are backpressure. `$` is for code that cannot await, such as code inside React's commit phase:

```js
const surface = compositor.$.create_surface();
const xdg_surface = wm_base.$.get_xdg_surface(surface.id);
const toplevel = xdg_surface.$.get_toplevel();
surface.$.commit();
```

It is named `$` because a protocol may itself have a request called `sync`, as `wl_display` does.

### Callback payloads

A request that creates a `wl_callback` resolves with what its `done` event carried: `await display.sync()` answers the serial, and `await surface.frame()` the frame's timestamp in milliseconds.

### Nullable arguments

Where the protocol marks an argument `allow-null`, a request takes `null` for it: a null object goes out as the id 0, and a null string as a length of 0, which is not the same message as `""`. `null` is the only spelling. `0` and `undefined` are refused, since either is more often a bug than a choice, and so is `null` anywhere the protocol does not allow it. An event's nullable string arrives as `null`; its nullable object arrives, as before, as the id `0`.

```js
pointer.$.set_cursor(serial, null, 0, 0);   // hide the cursor
offer.$.accept(serial, null);               // accept none of the offered types
surface.$.attach(null, 0, 0);               // unmap
```

## Limits

There is no `mmap`: a client that fills `wl_shm` memory needs its own way to reach it. A memfd written with `pwrite`, or read back with `pread`, works without one.


## API

**Note on types**

This module has ts declaration files. The base **Wl_interface** class has a generic signature of low-level common features.  To have robust static typings, it is best to pre-parse protocol files : This will export a `json` file that cand be loaded with lower overhead and a `d.ts` file that holds types declarations for this protocol.

`Wl_display.bind(...)` can then be caracterized with the interface name as a generic parameter.

```ts
  let wlr_output = await display.bind<Zwlr_output_manager_v1>("zwlr_output_manager_v1");
```

This interface inherits from the base `Wl_interface` class and will have all the methods and events defined from the protocol file, with proper arguments types.

It is of course possible to use the generic `Wl_interface` primitive without the benefits of typed pre-registered events and methods.

### class Wl_display()

#### async load(interface_name: string)

Load a wayland protocol specification.

Either use a path to a **XML** file, or a pre-parsed **JSON** file.

Use pre-compiled JSON files if speed is really important : parsing is ~10x faster than with raw XML.

#### async bind(interface_name: string)

Binds a global interface. It's the starting point of any interaction with the wayland server.

### listGlobals()

List all registered globals on this server. Note that this method is synchronous but one would need to wait for at least one `sync` event to have happened. Initializing through `await wl_display.init()` or `await open_display()` already waits for such an event.

See [examples/list_globals.js](https://github.com/windowkit/wayland/tree/main/examples/list_globals.js).

### class Wl_interface()

#### inspect() :string

Outputs a string describing all events and requests provided by this interface.


#### async drain(until?: (() => Promise\<any\>) | Promise\<any\>): Promise\<AggregateResult\>

Collects all events received by this interface until `until` resolves, then returns them as a plain object. Defaults to `display.sync()`.

Prefer passing a **factory function** so the `until` listener is registered *after* aggregation begins (no race window):

```js
const result = await itf.drain(() => once(itf, "done"));
// Every event key is an array with one entry per emission (only `id` is scalar):
//   no-arg event    -> [true, ...]
//   single-arg event-> [value, ...]
//   multi-arg event -> [[a, b], ...]
//   child interface -> [nestedResult, ...]
const [serial] = result.done;        // single "done" event
for (const mode of result.mode ?? []) { /* one entry per "mode" event */ }
```

Passing a bare promise also works when the promise is independent of this interface's events.

#### aggregate(): (() => AggregateResult) & Disposable

Low-level aggregation primitive. **Prefer `drain()` for most use cases.**

Returns an `end()` function that stops aggregation and returns the collected events. The return value also implements `Disposable`, enabling automatic cleanup with the `using` keyword:



```js
using end = itf.aggregate();
await once(itf, "done");
const result = end();
// if an exception escapes before end(), using cleans up the listeners anyway
```

Without `using`, wrap `end()` in a try/finally to guarantee cleanup.

## Troubleshooting

### no socket path provided and XDG_RUNTIME_DIR not set

Wayland requires `process.env["XDG_RUNTIME_DIR"]` to be set to a valid path.

Generally, it's `/run/user/$(id -u)/`.

### [ERR_MODULE_NOT_FOUND]: Cannot find package 'xml-js'

xml-js is required to import protocol extensions from XML files. Either add it along this package or import only pre-compiled JSON files instead.

### Protocol errors

Protocol errors are reported as `WaylandProtocolError` instances on the `Display` `"error"` event. They happen asynchronously and are always fatal — see [Error handling](#error-handling) for how to distinguish them from socket errors and set up the correct handler.


# Ressources

 - [wayland-book](https://wayland-book.com/introduction.html): Wayland Wire protocol manual book
 - [wayland.xml](https://gitlab.freedesktop.org/wayland/wayland/blob/master/protocol/wayland.xml) wayland protocol definition file
 - [wayland-client](https://gitlab.freedesktop.org/wayland/wayland/-/blob/main/src/wayland-client.c) wayland C client library implementation

# Contributing

Contributions are welcomed.

If you found something that definitely won't work, pelase submit an issue.

Higher-level features should generally be implemented in a separate user-facing package, but I'm open for suggestion if you think some helpers might get used across a wide range of interfaces.

Issues and pull requests are welcome at [windowkit/wayland](https://github.com/windowkit/wayland). Changes that are not specific to this fork are offered upstream to [node-wayland-client](https://github.com/sdumetz/node-wayland-client) as well.
