// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A genuine pdf.js load failure (corrupt or password-protected file). The
// teardown-path rejection (loadingTask.destroy() mid-flight) is a separate,
// expected path and must stay silent; see #478.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error("Invalid PDF structure")) }),
}));

import { SignCanvas } from "@/components/tools/sign-canvas";

afterEach(cleanup);

describe("SignCanvas load failure", () => {
  it("shows a visible error instead of a blank canvas when the PDF cannot load", async () => {
    render(<SignCanvas fileUrl="blob:bad-pdf" />);

    expect(await screen.findByText(/couldn't display this pdf/i)).toBeInTheDocument();
    // The dead canvas and page controls are gone; the user is not left staring
    // at an empty page that looks like it is still loading.
    expect(screen.queryByTestId("sign-pdf-canvas")).not.toBeInTheDocument();
  });
});
