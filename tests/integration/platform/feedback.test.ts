import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import {
  __resetGateForTests,
  refreshAnalyticsGate,
} from "../../../apps/api/src/lib/analytics-gate.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const captureFeedback = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../apps/api/src/lib/analytics.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    captureFeedback,
  };
});

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.cleanup();
});

afterEach(async () => {
  await db.delete(schema.settings).where(eq(schema.settings.key, "analyticsEnabled"));
  delete process.env.ANALYTICS_BAKED_OVERRIDE;
  captureFeedback.mockClear();
  __resetGateForTests();
});

describe("POST /api/v1/feedback", () => {
  it("requires authentication", async () => {
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      payload: { source: "global", sentiment: "great" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects empty feedback payloads", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: { source: "global" },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("declines capture when analytics is disabled", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "tool_result",
        surveyId: "tool-result-v1",
        promptVariant: "inline-v1",
        sentiment: "great",
        toolId: "resize",
        jobStatus: "completed",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: false });
    expect(captureFeedback).not.toHaveBeenCalled();
  });

  it("accepts explicit feedback with survey, prompt, friction, and safe error fields", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: {
        authorization: `Bearer ${token}`,
        "x-posthog-distinct-id": "distinct-test",
      },
      payload: {
        source: "admin_installer",
        surveyId: "admin-install-v1",
        promptVariant: "settings-card-v1",
        sentiment: "issue",
        feedbackType: "bug",
        message: "S3 setup took guessing.",
        contactOk: true,
        contactEmail: "user@example.com",
        contactName: "Pat",
        company: "Example Co",
        installMethod: "docker_compose",
        usageType: "team_internal",
        frictionArea: "environment_variables",
        importantAreas: ["pdf_docs", "batch_workflows"],
        errorCategory: "processing_error",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
    expect(captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "admin_installer",
        survey_id: "admin-install-v1",
        prompt_variant: "settings-card-v1",
        feedback_type: "bug",
        contact_ok: true,
        contact_email: "user@example.com",
        contact_name: "Pat",
        company: "Example Co",
        install_method: "docker_compose",
        usage_type: "team_internal",
        friction_area: "environment_variables",
        important_areas: ["pdf_docs", "batch_workflows"],
        error_category: "processing_error",
      }),
      "distinct-test",
    );
  });

  it("accepts an onboarding usage-survey submission", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-overlay-v1",
        usageType: "team_internal",
        importantAreas: ["images", "pdf_docs"],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
    expect(captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "onboarding",
        survey_id: "onboarding-usage-v1",
        prompt_variant: "onboarding-overlay-v1",
        usage_type: "team_internal",
        important_areas: ["images", "pdf_docs"],
      }),
      undefined,
    );
  });

  it("accepts a persona-only onboarding submission with no important areas selected", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-overlay-v1",
        usageType: "personal",
        importantAreas: [],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
    expect(captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "onboarding",
        survey_id: "onboarding-usage-v1",
        prompt_variant: "onboarding-overlay-v1",
        usage_type: "personal",
      }),
      undefined,
    );
    // captureFeedback is mocked, so it receives the route's raw properties: the
    // empty importantAreas array is forwarded as-is. Dropping an empty
    // important_areas before it reaches PostHog happens inside the real,
    // unmocked cleanFeedbackProperties (analytics.ts), which this test bypasses.
    const lastCall = captureFeedback.mock.calls.at(-1);
    expect(lastCall?.[0].important_areas).toEqual([]);
  });

  it("drops identifying contact fields when contact consent is not checked", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "global",
        surveyId: "global-feedback-v1",
        sentiment: "okay",
        message: "Trying this with the team.",
        contactOk: false,
        contactEmail: "user@example.com",
        contactName: "Pat",
        company: "Example Co",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
    expect(captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_ok: false,
        contact_email: undefined,
        contact_name: undefined,
        company: undefined,
      }),
      undefined,
    );
  });

  it("rejects invalid survey ids", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "global",
        surveyId: "not-real",
        sentiment: "great",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).details).toContainEqual(
      expect.objectContaining({ path: "surveyId" }),
    );
  });

  it("rejects invalid prompt variants", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "global",
        surveyId: "global-feedback-v1",
        promptVariant: "Inline V1!",
        sentiment: "great",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).details).toContainEqual(
      expect.objectContaining({ path: "promptVariant" }),
    );
  });

  it("rejects invalid friction areas", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "admin_installer",
        surveyId: "admin-install-v1",
        installMethod: "docker",
        frictionArea: "leaky_file_path",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).details).toContainEqual(
      expect.objectContaining({ path: "frictionArea" }),
    );
  });

  it("accepts a search_miss tool request and forwards the search query", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "search_miss",
        surveyId: "search-miss-v1",
        promptVariant: "search-empty-v1",
        feedbackType: "feature_request",
        searchQuery: "convert to dicom",
        message: "Radiology workflow.",
        contactOk: false,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
    expect(captureFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "search_miss",
        survey_id: "search-miss-v1",
        prompt_variant: "search-empty-v1",
        feedback_type: "feature_request",
        search_query: "convert to dicom",
      }),
      undefined,
    );
  });

  it("accepts a bare search_miss query with no message or rating", async () => {
    process.env.ANALYTICS_BAKED_OVERRIDE = "on";
    await refreshAnalyticsGate();
    const token = await loginAsAdmin(testApp.app);

    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "search_miss",
        surveyId: "search-miss-v1",
        searchQuery: "make animated gif",
        contactOk: false,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: true });
  });

  it("declines search_miss capture when analytics is disabled", async () => {
    const token = await loginAsAdmin(testApp.app);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        source: "search_miss",
        surveyId: "search-miss-v1",
        searchQuery: "convert to dicom",
        contactOk: false,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, accepted: false });
    expect(captureFeedback).not.toHaveBeenCalled();
  });
});
