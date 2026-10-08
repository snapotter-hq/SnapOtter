import { ToolInputError } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { parseInput } from "../../../apps/api/src/routes/tools/chart-maker.js";

const parse = (csv: string) => parseInput(Buffer.from(csv, "utf8"));
const values = (csv: string) => parse(csv).map((point) => point.value);

describe("chart-maker numbers written the way a spreadsheet shows them (#1198)", () => {
  it("keeps the rows whose value has a thousands separator", () => {
    const points = parse(
      'month,sales\nJan,900\nFeb,"1,200"\nMar,"2,400"\nApr,850\nMay,700\nJun,650\n',
    );
    expect(points.map((p) => p.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
    expect(points.map((p) => p.value)).toEqual([900, 1200, 2400, 850, 700, 650]);
  });

  it("reads currency symbols, percent signs and accounting negatives", () => {
    expect(values("item,price\na,$40\nb,€1.5\nc,R$ 7\nd,40€\n")).toEqual([40, 1.5, 7, 40]);
    expect(values("k,rate\na,85%\nb,12.5%\n")).toEqual([85, 12.5]);
    expect(values("k,delta\na,(500)\nb,-20\nc,−3\n")).toEqual([-500, -20, -3]);
  });

  it("charts the revenue column instead of the id when revenue is $-prefixed", () => {
    const points = parse("id,region,revenue\n1,EMEA,$4400\n2,APAC,$3610\n");
    expect(points).toEqual([
      { label: "EMEA", value: 4400 },
      { label: "APAC", value: 3610 },
    ]);
  });

  it("settles the separator once per column, not per cell", () => {
    // 1.234,5 only reads as de-DE, so "4.400" in the same column is 4400.
    expect(values('k,v\na,"1.234,5"\nb,"4.400"\nc,"0,25"\n')).toEqual([1234.5, 4400, 0.25]);
    // Same shape, en-US evidence: "4.400" is four-point-four.
    expect(values('k,v\na,"1,234.5"\nb,"4.400"\n')).toEqual([1234.5, 4.4]);
  });

  it("reads a column of three-digit groups as thousands", () => {
    expect(values('k,v\na,"1,200"\nb,"2,400"\n')).toEqual([1200, 2400]);
    expect(values("k,v\na,1 200\nb,2 400\nc,1'000'000\n")).toEqual([1200, 2400, 1000000]);
  });

  it("still reads plain numbers, decimals and exponents", () => {
    expect(values("k,v\na,5\nb,.5\nc,1e3\nd,2.5E+2\ne,+7\n")).toEqual([5, 0.5, 1000, 250, 7]);
  });

  it("does not read JS literal syntax, infinities or dates as numbers", () => {
    expect(() => parse("part,code\nbolt,0x1F\nnut,0b101\n")).toThrow(ToolInputError);
    expect(() => parse("k,v\na,Infinity\nb,-Infinity\n")).toThrow(ToolInputError);
    expect(() => parse("k,v\na,2026-01\nb,2026-02\n")).toThrow(ToolInputError);
  });

  it("keeps blanks and overflowing digits out of the numbers", () => {
    expect(values("k,v\na,10\nb,\nc, \nd,20\ne,30\n")).toEqual([10, 20, 30]);
    expect(() => parse(`k,v\na,${"9".repeat(400)}\nb,${"9".repeat(400)}\n`)).toThrow(
      ToolInputError,
    );
  });

  it("still reads a trailing dot the way Number() does", () => {
    expect(values("k,v\na,5.\nb,6.\n")).toEqual([5, 6]);
  });

  it("only groups thousands after a group of one to three digits", () => {
    expect(() => parse("k,v\na,12345 678\nb,2026 100\n")).toThrow(ToolInputError);
    expect(() => parse("k,v\na,abc$5\nb,foo$6\n")).toThrow(ToolInputError);
  });

  it("rejects a long whitespace cell without backtracking", () => {
    const hostile = `k,v\na,1${" ".repeat(100_000)}x\nb,2${" ".repeat(100_000)}x\n`;
    const started = performance.now();
    expect(() => parse(hostile)).toThrow(ToolInputError);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("applies the same reading to JSON string values", () => {
    const json = JSON.stringify([
      { name: "A", total: "$1,200" },
      { name: "B", total: "$2,400" },
    ]);
    expect(parseInput(Buffer.from(json)).map((p) => p.value)).toEqual([1200, 2400]);
  });
});
