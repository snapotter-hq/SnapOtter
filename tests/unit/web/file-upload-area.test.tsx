// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiUploadUserFiles = vi.hoisted(() => vi.fn());
const apiListFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiUploadUserFiles, apiListFiles };
});

import { FileUploadArea } from "@/components/files/file-upload-area";
import { useFilesPageStore } from "@/stores/files-page-store";

const initialState = useFilesPageStore.getInitialState();

beforeEach(() => {
  apiUploadUserFiles.mockReset();
  apiListFiles.mockReset();
  useFilesPageStore.setState(
    {
      ...initialState,
      files: [],
      knownFiles: new Map(),
      checkedIds: new Set(),
      activeTab: "upload",
      loading: false,
      uploading: false,
      uploadProgress: null,
      error: null,
    },
    true,
  );
});

afterEach(() => {
  cleanup();
  useFilesPageStore.setState(
    {
      ...initialState,
      files: [],
      knownFiles: new Map(),
      checkedIds: new Set(),
    },
    true,
  );
  vi.restoreAllMocks();
});

describe("FileUploadArea (#3310)", () => {
  it("renders upload error with role='alert' when uploadFiles fails", async () => {
    apiUploadUserFiles.mockRejectedValueOnce(new Error("File exceeds maximum upload size (413)"));

    const { container } = render(<FileUploadArea />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "huge.png", { type: "image/png" });

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("File exceeds maximum upload size (413)");
    expect(input.value).toBe("");
    expect(useFilesPageStore.getState().activeTab).toBe("upload");
  });

  it("hides the error alert and 0% progress badge when a new upload starts", () => {
    useFilesPageStore.setState({
      loading: false,
      uploading: true,
      uploadProgress: 0,
      error: "Stale error",
    });

    render(<FileUploadArea />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("does not disable the upload dropzone or show a spinner while list fetchFiles is loading", () => {
    useFilesPageStore.setState({ loading: true, uploading: false, uploadProgress: null });

    const { container } = render(<FileUploadArea />);
    const label = container.querySelector("label");

    expect(label).not.toHaveClass("pointer-events-none");
    expect(label).not.toHaveClass("opacity-50");
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
    expect(screen.getByText("or click to select files")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("disables the dropzone and displays progress while uploading is true", () => {
    useFilesPageStore.setState({ loading: false, uploading: true, uploadProgress: 65 });

    const { container } = render(<FileUploadArea />);
    const label = container.querySelector("label");

    expect(label).toHaveClass("pointer-events-none");
    expect(label).toHaveClass("opacity-50");
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.queryByText("Drop files here")).not.toBeInTheDocument();
  });

  it("uploads dropped files and shows role='alert' when a drop upload fails", async () => {
    apiUploadUserFiles.mockRejectedValueOnce(new Error("Server storage error (500)"));

    const { container } = render(<FileUploadArea />);
    const label = container.querySelector("label") as HTMLLabelElement;
    const file = new File(["data"], "dropped.png", { type: "image/png" });

    fireEvent.dragOver(label);
    expect(label).toHaveClass("border-primary");

    fireEvent.dragLeave(label);
    expect(label).not.toHaveClass("border-primary");

    await act(async () => {
      fireEvent.drop(label, { dataTransfer: { files: [file] } });
    });

    expect(apiUploadUserFiles).toHaveBeenCalledWith([file], expect.any(Function));
    expect(screen.getByRole("alert")).toHaveTextContent("Server storage error (500)");
  });
});
