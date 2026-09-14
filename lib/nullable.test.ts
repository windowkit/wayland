'use strict';
import { expect } from "chai";
import EventEmitter from "events";
import ts from "typescript";

import { format_args, get_args, readUInt } from "./args.js";
import { ArgumentDefinition, isNullable } from "./definitions.js";
import Display from "./display.js";
import makeTypes from "./makeTypes.js";


/** `wl_pointer.set_cursor`'s surface, as the vendored JSON spells it. */
const nullableObject :ArgumentDefinition = { name: "surface", type: "object", interface: "wl_surface", "allow-null": "true" };
/** `wl_data_offer.accept`'s mime_type. */
const nullableString :ArgumentDefinition = { name: "mime_type", type: "string", "allow-null": "true" };

describe("allow-null arguments", function(){

  describe("isNullable()", function(){
    it("reads the attribute as the XML spells it, or as a boolean", function(){
      expect(isNullable(nullableObject)).to.equal(true);
      expect(isNullable({ ...nullableObject, "allow-null": true })).to.equal(true);
      expect(isNullable({ ...nullableObject, "allow-null": "false" })).to.equal(false);
      expect(isNullable({ name: "surface", type: "object" })).to.equal(false);
    });
  });

  describe("format_args()", function(){
    it("encodes a null object as the id 0 where the protocol allows it", function(){
      const b = format_args([null], [nullableObject]);
      expect(b.length).to.equal(4);
      expect(readUInt(b, 0)).to.equal(0);
    });

    it("takes null as the one spelling of none: 0 and undefined are refused", function(){
      expect(()=>format_args([0], [nullableObject])).to.throw("Invalid object value: 0 (expect a positive integer, or null for none)");
      expect(()=>format_args([undefined], [nullableObject])).to.throw("Invalid type: undefined for surface");
      expect(()=>format_args([undefined], [nullableString])).to.throw("Invalid type: undefined for mime_type");
    });

    it("still encodes a nullable object's id when there is one", function(){
      expect(readUInt(format_args([{ id: 5 }], [nullableObject]), 0)).to.equal(5);
      expect(readUInt(format_args([6], [nullableObject]), 0)).to.equal(6);
    });

    it("refuses null where the protocol does not allow it", function(){
      const plainObject :ArgumentDefinition = { name: "surface", type: "object" };
      const plainString :ArgumentDefinition = { name: "title", type: "string" };
      expect(()=>format_args([null], [plainObject])).to.throw("for surface");
      expect(()=>format_args([0], [plainObject])).to.throw("Invalid object value: 0");
      expect(()=>format_args([null], [plainString])).to.throw("Invalid type: object for title. Expected a string");
    });

    it("encodes a null string as a bare length of 0", function(){
      const b = format_args([null], [nullableString]);
      expect(b.length).to.equal(4);
      expect(readUInt(b, 0)).to.equal(0);
    });

    it("keeps an empty string distinct from a null one", function(){
      const b = format_args([""], [nullableString]);
      expect(b.length).to.equal(8);
      expect(readUInt(b, 0)).to.equal(1);
    });
  });

  describe("get_args()", function(){
    it("reads a nullable string of length 0 as null", function(){
      expect(get_args(format_args([null], [nullableString]), [nullableString])).to.deep.equal([null]);
    });

    it("reads an empty nullable string as an empty string", function(){
      expect(get_args(format_args([""], [nullableString]), [nullableString])).to.deep.equal([""]);
    });

    it("reads a length of 0 as an empty string where null is not allowed", function(){
      expect(get_args(Buffer.alloc(4), [{ name: "title", type: "string" }])).to.deep.equal([""]);
    });

    it("keeps the arguments around a null string in place", function(){
      const defs :ArgumentDefinition[] = [{ name: "serial", type: "uint" }, nullableString, { name: "tail", type: "string" }];
      const b = format_args([7, null, "end"], defs);
      expect(get_args(b, defs)).to.deep.equal([7, null, "end"]);
    });
  });

  describe("requests through an interface", function(){
    /** A Display over a fake socket that keeps every message written to it. */
    async function capture(){
      const written :Buffer[] = [];
      const socket = Object.assign(new EventEmitter(), {
        destroy(){},
        write(b :Buffer){ written.push(Buffer.from(b)); return true; },
      });
      const display = new Display(socket as any);
      await display.load("wayland");
      return { display, written };
    }

    it("sends wl_pointer.set_cursor with a null surface", async function(){
      const { display, written } = await capture();
      const pointer = display.createInterface("wl_pointer") as any;
      pointer.$.set_cursor(7, null, 0, 0);
      expect(written).to.have.length(1);
      const [msg] = written;
      expect(readUInt(msg, 0)).to.equal(pointer.id);
      expect(readUInt(msg, 4) & 0xffff).to.equal(pointer.opcode("set_cursor"));
      expect(readUInt(msg, 4) >>> 16).to.equal(8 + 16);
      expect([8, 12, 16, 20].map((o)=>readUInt(msg, o))).to.deep.equal([7, 0, 0, 0]);
    });

    it("sends wl_data_offer.accept with a null mime type", async function(){
      const { display, written } = await capture();
      const offer = display.createInterface("wl_data_offer") as any;
      offer.$.accept(9, null);
      const [msg] = written;
      expect(readUInt(msg, 4) >>> 16).to.equal(8 + 8);
      expect([8, 12].map((o)=>readUInt(msg, o))).to.deep.equal([9, 0]);
    });
  });

  describe("makeTypes()", function(){
    it("types a nullable request argument, and an event's nullable string, as possibly null", function(){
      const out = makeTypes([{
        name: "wl_test", version: 1, description: "", summary: "", enums: {},
        requests: [{ name: "req", description: "", summary: "", args: [nullableObject, nullableString, { name: "n", type: "uint" }] }],
        events: [{ name: "evt", description: "", summary: "", args: [nullableObject, nullableString] }],
      }]);
      expect(out).to.include("req (surface: wl_object | null, mime_type: wl_string | null, n: wl_uint)");
      expect(out).to.include("(surface: wl_object, mime_type: wl_string | null)=>void");
      const sf = ts.createSourceFile("generated.d.ts", out, ts.ScriptTarget.Latest, true);
      expect((sf as any).parseDiagnostics).to.have.length(0);
    });
  });
});
