import { describe, it, expect } from "vitest";
import { parseRfidMessage } from "./rfidMessage";

describe("parseRfidMessage", () => {
  it("parses a standard SCANNING tag (Speedway/MR20 shape)", () => {
    const e = parseRfidMessage(
      JSON.stringify({ status: "SCANNING", epc: "E2801130200020B9B37E", rssi: -65, count: 1, battery: 94 })
    );
    expect(e).toEqual({ type: "tag", epc: "E2801130200020B9B37E", rssi: -65, count: 1, battery: 94 });
  });

  it("parses a tag with no explicit status but an epc field", () => {
    const e = parseRfidMessage(JSON.stringify({ epc: "ABC123XYZ", rssi: -72, count: 3 }));
    expect(e).toEqual({ type: "tag", epc: "ABC123XYZ", rssi: -72, count: 3 });
  });

  it("handles Fix Reader RSSI of 0.0 without breaking", () => {
    const e = parseRfidMessage(JSON.stringify({ status: "SCANNING", epc: "TAG", rssi: 0.0, count: 28 }));
    expect(e).toMatchObject({ type: "tag", epc: "TAG", rssi: 0, count: 28 });
  });

  it("parses the handheld mac_address as deviceId (MPT: sent every message)", () => {
    const e = parseRfidMessage(JSON.stringify({ status: "SCANNING", epc: "TAG", rssi: -60, count: 1, mac_address: "AA:BB:CC:DD:EE:FF" }));
    expect(e).toMatchObject({ type: "tag", epc: "TAG", deviceId: "AA:BB:CC:DD:EE:FF" });
  });

  it("parses the Speedway serial_number as deviceId", () => {
    const e = parseRfidMessage(JSON.stringify({ status: "SCANNING", epc: "TAG", rssi: -60, count: 1, serial_number: "37020A1234" }));
    expect(e).toMatchObject({ type: "tag", epc: "TAG", deviceId: "37020A1234" });
  });

  it("omits deviceId when the message has none (current builds)", () => {
    const e = parseRfidMessage(JSON.stringify({ status: "SCANNING", epc: "TAG", rssi: -60, count: 1 }));
    expect(e).not.toHaveProperty("deviceId");
  });

  it("defaults rssi/count when missing", () => {
    const e = parseRfidMessage(JSON.stringify({ epc: "TAG" }));
    expect(e).toMatchObject({ type: "tag", epc: "TAG", rssi: -70, count: 1 });
  });

  it.each(["START", "STOP", "CLEAR"])("parses session control %s", (status) => {
    expect(parseRfidMessage(JSON.stringify({ status }))).toEqual({ type: "status", status });
  });

  it("parses a dedicated BATTERY message", () => {
    expect(parseRfidMessage(JSON.stringify({ type: "BATTERY", battery: 85 }))).toEqual({
      type: "battery",
      battery: 85,
    });
  });

  it("parses a battery-only message (battery present, no epc)", () => {
    expect(parseRfidMessage(JSON.stringify({ battery: 40 }))).toEqual({ type: "battery", battery: 40 });
  });

  it("falls back to raw EPC string when not JSON", () => {
    expect(parseRfidMessage("E2801130200020B9B37E")).toEqual({
      type: "tag",
      epc: "E2801130200020B9B37E",
      rssi: -70,
      count: 1,
    });
  });

  it("ignores short / empty non-JSON noise", () => {
    expect(parseRfidMessage("ok")).toEqual({ type: "unknown" });
    expect(parseRfidMessage("")).toEqual({ type: "unknown" });
  });

  it("ignores malformed objects", () => {
    expect(parseRfidMessage(JSON.stringify({ foo: "bar" }))).toEqual({ type: "unknown" });
  });

  it("does not throw on garbage input", () => {
    expect(() => parseRfidMessage("{not json")).not.toThrow();
    expect(parseRfidMessage("{not json")).toEqual({ type: "tag", epc: "{not json", rssi: -70, count: 1 });
  });
});
