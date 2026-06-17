import { describe, it, expect } from "vitest";
import { normalizeWsUrl } from "./wsUrl";

describe("normalizeWsUrl", () => {
  it("bare IP -> ws:// with default reader port", () => {
    expect(normalizeWsUrl("192.168.1.104")).toBe("ws://192.168.1.104:8080");
  });
  it("host:port -> ws:// preserving port", () => {
    expect(normalizeWsUrl("192.168.1.104:9000")).toBe("ws://192.168.1.104:9000");
  });
  it("ws:// url passes through", () => {
    expect(normalizeWsUrl("ws://10.0.0.5:8080")).toBe("ws://10.0.0.5:8080");
  });
  it("wss:// (ngrok) passes through unchanged", () => {
    expect(normalizeWsUrl("wss://abc123.ngrok-free.app")).toBe("wss://abc123.ngrok-free.app");
  });
  it("https:// convenience -> wss://", () => {
    expect(normalizeWsUrl("https://abc.ngrok-free.app")).toBe("wss://abc.ngrok-free.app");
  });
  it("http:// -> ws://", () => {
    expect(normalizeWsUrl("http://abc.example.com")).toBe("ws://abc.example.com");
  });
  it("trims + handles empty", () => {
    expect(normalizeWsUrl("  192.168.1.9  ")).toBe("ws://192.168.1.9:8080");
    expect(normalizeWsUrl("")).toBe("");
    expect(normalizeWsUrl("   ")).toBe("");
  });
});
