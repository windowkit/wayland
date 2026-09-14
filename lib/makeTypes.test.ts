'use strict';
// Modified for @windowkit/wayland (2026): generated typings are type-checked
// against the built package, and protocol/wayland.d.ts against the generator.
// See NOTICE.
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { expect } from "chai";
import ts from "typescript";

import makeTypes from "./makeTypes.js";
import { ArgumentDefinition, ArgumentType, InterfaceDefinition } from "./definitions.js";

/** The repository root: this file runs as dist/makeTypes.test.js. */
const root = fileURLToPath(new URL("..", import.meta.url));


/** Parse generated source as a .d.ts and return any *syntax* errors. */
function parseErrors(src: string): readonly ts.Diagnostic[] {
  const sf = ts.createSourceFile("generated.d.ts", src, ts.ScriptTarget.Latest, true);
  return (sf as any).parseDiagnostics as ts.Diagnostic[];
}

function def(overrides: Partial<InterfaceDefinition>): InterfaceDefinition {
  return {
    name: "wl_test", version: 1, description: "", summary: "",
    requests: [], events: [], enums: {}, ...overrides,
  };
}

describe("makeTypes()", function () {
  it("produces syntactically valid TypeScript for benign input", function () {
    const out = makeTypes([def({
      summary: "a test interface",
      description: "line one\nline two",
      events: [{ name: "evt", description: "an event", summary: "fired", args: [] }],
      requests: [{ name: "req", description: "a request", summary: "do it", args: [] }],
      enums: { mode: { entries: [{ name: "fast", value: 1, summary: "go fast" }] } },
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes '*/' in a description so the JSDoc block is not closed early", function () {
    const out = makeTypes([def({ description: "contains */ a comment closer" })]);
    expect(out).to.not.include("contains */");      // raw closer is gone
    expect(out).to.include("contains *\\/");         // escaped form present
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes '*/' in a summary", function () {
    const out = makeTypes([def({ summary: "danger */ here" })]);
    expect(out).to.not.include("danger */");
    expect(parseErrors(out)).to.have.length(0);
  });

  it("emits enum summaries as valid string literals (quotes + newlines escaped)", function () {
    const summary = 'has "quotes" and\na newline';
    const out = makeTypes([def({
      enums: { mode: { entries: [{ name: "a", value: 1, summary }] } },
    })]);
    expect(out).to.include(JSON.stringify(summary)); // properly escaped literal
    expect(parseErrors(out)).to.have.length(0);
  });

  it("survives '*/' inside an enum entry summary", function () {
    const out = makeTypes([def({
      enums: { mode: { entries: [{ name: "a", value: 1, summary: "danger */ here" }] } },
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });

  it("escapes a request argument summary containing '*/'", function () {
    const out = makeTypes([def({
      requests: [{
        name: "req", description: "", summary: "",
        args: [{ name: "x", type: "uint", summary: "weird */ summary" }],
      }],
    })]);
    expect(parseErrors(out)).to.have.length(0);
  });
});

/**
 * Type-check generated typings as an installed package sees them: in a
 * temporary project whose node_modules/@windowkit/wayland holds package.json
 * and dist/, as the tarball does (it has no lib/). The project itself is a
 * `"type": "module"` package, where a user keeps their own typings.
 */
describe("makeTypes() against the built package", function () {
  this.timeout(30000);
  let project: string;
  let pkg: string;

  before(function () {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "wayland-typings-"));
    pkg = path.join(project, "node_modules", "@windowkit", "wayland");
    fs.mkdirSync(path.join(pkg, "protocol"), { recursive: true });
    fs.copyFileSync(path.join(root, "package.json"), path.join(pkg, "package.json"));
    fs.cpSync(path.join(root, "dist"), path.join(pkg, "dist"), { recursive: true });
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ type: "module" }));
  });

  after(function () {
    fs.rmSync(project, { recursive: true, force: true });
  });

  /**
   * Write `internal` typings into the package's protocol/ and anyone else's
   * into the project, and return their syntax and type errors.
   */
  function typeErrors(src: string, internal: boolean): string[] {
    const file = path.join(internal ? path.join(pkg, "protocol") : project, "generated.d.ts");
    fs.writeFileSync(file, src);
    const program = ts.createProgram([file], {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      target: ts.ScriptTarget.ES2022,
      lib: ["lib.es2023.d.ts", "lib.esnext.disposable.d.ts"],
      strict: true,
      noEmit: true,
      // skipLibCheck would skip the generated file too: it is a .d.ts.
      skipLibCheck: false,
      typeRoots: [path.join(root, "node_modules", "@types")],
      types: ["node"],
    });
    const sf = program.getSourceFile(file)!;
    return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map(d => {
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
      return `${line + 1}:${character + 1} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
    });
  }

  const wayland: InterfaceDefinition[] = JSON.parse(
    fs.readFileSync(path.join(root, "protocol", "wayland.json"), "utf-8"),
  );

  // Every argument type, led by a uint: a leading new_id is the created object.
  const types: ArgumentType[] = ["uint", "new_id", "int", "fixed", "object", "enum", "string", "array", "fd"];
  const args: ArgumentDefinition[] = types.map(type => ({ name: `a_${type}`, type, summary: "" }));
  const everyType = def({
    events: [{ name: "evt", description: "", summary: "", args }],
    requests: [{ name: "req", description: "", summary: "", args }],
  });

  it("matches protocol/wayland.d.ts, which lib/ builds against and the package ships", function () {
    const committed = fs.readFileSync(path.join(root, "protocol", "wayland.d.ts"), "utf-8");
    expect(makeTypes(wayland, true) === committed,
      "protocol/wayland.d.ts is stale: run `npm run build && node convert.js --types protocol`").to.be.true;
  });

  for (const [who, internal] of [["the package's own", true], ["a user's", false]] as const) {
    it(`type-checks ${who} typings for wayland.xml`, function () {
      expect(typeErrors(makeTypes(wayland, internal), internal)).to.deep.equal([]);
    });

    it(`imports the wl_ type of every argument type in ${who} typings`, function () {
      expect(typeErrors(makeTypes([everyType], internal), internal)).to.deep.equal([]);
    });
  }
});
