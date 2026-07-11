import { describe, expect, it } from "vitest";
import { isStaticAssetRequest } from "../../../apps/api/src/plugins/auth.js";

describe("isStaticAssetRequest", () => {
  it("matches GET/HEAD under /assets/ only", () => {
    expect(isStaticAssetRequest("GET", "/assets/react-D3OgQKsK.js")).toBe(true);
    expect(isStaticAssetRequest("HEAD", "/assets/x.css")).toBe(true);
    expect(isStaticAssetRequest("GET", "/api/v1/settings")).toBe(false);
    expect(isStaticAssetRequest("POST", "/assets/x.js")).toBe(false);
    expect(isStaticAssetRequest("GET", "/assetsish")).toBe(false);
    expect(isStaticAssetRequest("GET", "/assets/../api/v1/settings")).toBe(false);
    expect(isStaticAssetRequest("GET", "/assets/x.js?v=abc")).toBe(true);
    expect(isStaticAssetRequest("GET", "/assets")).toBe(false);
  });
});
