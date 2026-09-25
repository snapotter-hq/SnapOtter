import { beforeEach, describe, expect, it } from "vitest";
import { useOrganizeStore } from "@/stores/organize-store";

const pdf = (name: string) => new File([new ArrayBuffer(8)], name, { type: "application/pdf" });

describe("organize-store", () => {
  beforeEach(() => {
    useOrganizeStore.getState().clear();
  });

  it("loads a document in natural order", () => {
    const file = pdf("a.pdf");
    useOrganizeStore.getState().setDocument(file, 4);
    expect(useOrganizeStore.getState()).toMatchObject({
      file,
      pageCount: 4,
      pageOrder: [1, 2, 3, 4],
    });
  });

  it("moves a page forward and backward", () => {
    const { setDocument, movePage } = useOrganizeStore.getState();
    setDocument(pdf("a.pdf"), 4);
    movePage(0, 2);
    expect(useOrganizeStore.getState().pageOrder).toEqual([2, 3, 1, 4]);
    movePage(3, 0);
    expect(useOrganizeStore.getState().pageOrder).toEqual([4, 2, 3, 1]);
  });

  it("ignores out-of-range and no-op moves", () => {
    const { setDocument, movePage } = useOrganizeStore.getState();
    setDocument(pdf("a.pdf"), 4);
    movePage(-1, 2);
    movePage(0, 4);
    movePage(1, 1);
    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3, 4]);
  });

  it("keeps the arranged order when the same file is loaded again", () => {
    // The grid unmounts while a result is on screen and reloads the file when
    // it comes back; the user's arrangement has to survive that round trip.
    const file = pdf("a.pdf");
    const { setDocument, movePage } = useOrganizeStore.getState();
    setDocument(file, 4);
    movePage(3, 0);
    setDocument(file, 4);
    expect(useOrganizeStore.getState().pageOrder).toEqual([4, 1, 2, 3]);
  });

  it("starts over for a different file", () => {
    const { setDocument, movePage } = useOrganizeStore.getState();
    setDocument(pdf("a.pdf"), 4);
    movePage(3, 0);
    const other = pdf("b.pdf");
    setDocument(other, 3);
    expect(useOrganizeStore.getState()).toMatchObject({ file: other, pageOrder: [1, 2, 3] });
  });

  it("reset restores natural order and clear drops the document", () => {
    const { setDocument, movePage, reset, clear } = useOrganizeStore.getState();
    setDocument(pdf("a.pdf"), 3);
    movePage(2, 0);
    reset();
    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3]);
    clear();
    expect(useOrganizeStore.getState()).toMatchObject({ file: null, pageCount: 0, pageOrder: [] });
  });
});
