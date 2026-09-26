// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompressControls, CompressResizeNote } from "@/components/tools/compress-settings";

afterEach(cleanup);

describe("CompressControls target size units (#1272)", () => {
  it("sends 1 MB as 1000 KB, matching the server's decimal KB", () => {
    const onChange = vi.fn();
    render(<CompressControls onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Target Size"), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MB" } });

    expect(onChange).toHaveBeenLastCalledWith({ mode: "targetSize", targetSizeKb: 2000 });
  });
});

describe("CompressResizeNote (#1272)", () => {
  it("says the image was shrunk, to what, and for which target", () => {
    render(
      <CompressResizeNote
        resultPayload={{ targetKb: 20, resizedTo: { width: 400, height: 300 } }}
      />,
    );

    expect(screen.getByText("Resized to 400 × 300 to fit 20 KB")).toBeTruthy();
  });

  it("stays silent when quality alone reached the target", () => {
    const { container } = render(<CompressResizeNote resultPayload={{ targetKb: 20 }} />);

    expect(container.textContent).toBe("");
  });

  it("stays silent without a result", () => {
    const { container } = render(<CompressResizeNote resultPayload={null} />);

    expect(container.textContent).toBe("");
  });
});
