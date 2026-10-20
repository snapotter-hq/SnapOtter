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

  it("keeps a headerless first row whose value uses a comma decimal (#2971)", () => {
    expect(parse('Apples,"1,5"\nBananas,"2,5"\nCherries,"3,5"\n')).toEqual([
      { label: "Apples", value: 1.5 },
      { label: "Bananas", value: 2.5 },
      { label: "Cherries", value: 3.5 },
    ]);
    expect(values("Apples;1,5\nBananas;2\nCherries;3,5\n")).toEqual([1.5, 2, 3.5]);
    expect(values('Apples,"1.234,5"\nBananas,"4.400"\n')).toEqual([1234.5, 4400]);
    expect(values('Apples,"1,5"\nBananas,2\n')).toEqual([1.5, 2]);
    expect(values('"1,5"\n"2,5"\n')).toEqual([1.5, 2.5]);
    expect(values('EMEA,"2.025,5"\nAPAC,n/a\nAMER,"1.800,5"\n')).toEqual([2025.5, 1800.5]);
    expect(parse('EMEA,"4.400,5","-2,1"\nAPAC,"3.600,5","1,4"\nAMER,"2.800,5","0,8"\n')).toEqual([
      { label: "EMEA", value: 4400.5 },
      { label: "APAC", value: 3600.5 },
      { label: "AMER", value: 2800.5 },
    ]);
    expect(parse('EMEA,2024,2025,"1,5"\nAPAC,2024,2025,"2,5"\n')).toEqual([
      { label: "EMEA", value: 1.5 },
      { label: "APAC", value: 2.5 },
    ]);
    expect(parse('"1,5",2024,2025\n"2,5",2024,2025\n')).toEqual([
      { label: "1,5", value: 2025 },
      { label: "2,5", value: 2025 },
    ]);

    const skippedHeader = { unreadable: 0 };
    expect(
      parseInput(Buffer.from('item,price\nApples,"1,5"\nBananas,"2,5"\n'), skippedHeader).map(
        (p) => p.value,
      ),
    ).toEqual([1.5, 2.5]);
    expect(skippedHeader.unreadable).toBe(0);

    const skippedFirstRow = { unreadable: 0 };
    expect(
      parseInput(Buffer.from('Apples,n/a\nBananas,"2,5"\nCherries,"3,5"\n'), skippedFirstRow).map(
        (p) => p.value,
      ),
    ).toEqual([2.5, 3.5]);
    expect(skippedFirstRow.unreadable).toBe(1);
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

describe("chart-maker counts the rows it leaves out (#2060)", () => {
  it("counts a value cell with text but no number, not a blank one", () => {
    const skipped = { unreadable: 0 };
    const points = parseInput(Buffer.from("k,v\na,10\nb,\nc,n/a\nd,20\ne,30\n"), skipped);

    expect(points.map((p) => p.value)).toEqual([10, 20, 30]);
    expect(skipped.unreadable).toBe(1);
  });

  it("counts them in a JSON array of objects too", () => {
    const skipped = { unreadable: 0 };
    const json = JSON.stringify([
      { name: "a", total: "1" },
      { name: "b", total: "lots" },
      { name: "c", total: "3" },
    ]);

    expect(parseInput(Buffer.from(json), skipped)).toHaveLength(2);
    expect(skipped.unreadable).toBe(1);
  });

  it("leaves the count at zero for a clean file", () => {
    const skipped = { unreadable: 0 };
    parseInput(Buffer.from("k,v\na,1\nb,2\n"), skipped);
    expect(skipped.unreadable).toBe(0);
  });

  it("counts a headerless first row whose value is unreadable instead of taking it as the header (#2260)", () => {
    for (const csv of [
      "Jan,n/a\nFeb,10\nMar,20\n",
      "Jan,lots\nFeb,10\nMar,20\n",
      "January,unreadable\nFebruary,10\nMarch,20\n",
      "2026-01,pending\n2026-02,10\n2026-03,20\n",
      "2026-01,EMEA,n/a\n2026-02,EMEA,10\n2026-03,APAC,20\n",
      "Q1,TBD\nQ2,10\nQ3,20\n",
      "Mon,closed\nTue,10\nWed,20\n",
      "Monday,closed\nTuesday,10\nWednesday,20\n",
      "Item 1,err\nItem 2,10\nItem 3,20\n",
      "Apples,n/a\nBananas,10\nCherries,20\n",
      "Apples,#DIV/0!\nBananas,10\nCherries,20\n",
      "EMEA,-\nAPAC,10\nAMER,20\n",
      "n/a\n10\n20\n",
    ]) {
      const skipped = { unreadable: 0 };
      const points = parseInput(Buffer.from(csv, "utf8"), skipped);
      expect(
        points.map((p) => p.value),
        csv,
      ).toEqual([10, 20]);
      expect(skipped.unreadable, csv).toBe(1);
    }

    const partialSkipped = { unreadable: 0 };
    const partialPoints = parseInput(
      Buffer.from("Jan,pending\nFeb,10\nMar,20\nTotal,30\n", "utf8"),
      partialSkipped,
    );
    expect(partialPoints.map((p) => p.value)).toEqual([10, 20, 30]);
    expect(partialSkipped.unreadable).toBe(1);
  });

  it("still treats genuine headers above temporal or coded rows as headers (#2260)", () => {
    for (const csv of [
      "month,sales\nJan,10\nFeb,20\n",
      "date,revenue\n2026-01,10\n2026-02,20\n",
      "quarter,sales\nQ1,10\nQ2,20\n",
      "day,visits\nMon,10\nTue,20\n",
      "item,count\nItem 1,10\nItem 2,20\n",
      "Item #,sales\nItem 1,10\nItem 2,20\n",
      "service,error\napi,10\nweb,20\n",
      "category,Assigned,TBD\nEngineering,40,10\nSales,20,20\n",
      "GEO,sales\nEMEA,10\nAPAC,20\n",
      "sales\n10\n20\n",
      "Sales 2026\n10\n20\n",
    ]) {
      const skipped = { unreadable: 0 };
      const points = parseInput(Buffer.from(csv, "utf8"), skipped);
      expect(
        points.map((p) => p.value),
        csv,
      ).toEqual([10, 20]);
      expect(skipped.unreadable, csv).toBe(0);
    }
  });
});

describe("chart-maker year column headers (#1199)", () => {
  it("treats a first row of text and four-digit years as the header", () => {
    expect(parse("region,2023,2024,2025\nEMEA,10,20,30\nAPAC,5,6,7\n")).toEqual([
      { label: "EMEA", value: 30 },
      { label: "APAC", value: 7 },
    ]);
    expect(parse("region, 2023, 2024, 2025\nEMEA, 10, 20, 30\nAPAC, 5, 6, 7\n")).toEqual([
      { label: "EMEA", value: 30 },
      { label: "APAC", value: 7 },
    ]);
    expect(parse(",2023,2024,2025\nEMEA,10,20,30\nAPAC,5,6,7\n")).toEqual([
      { label: "EMEA", value: 30 },
      { label: "APAC", value: 7 },
    ]);
    expect(parse("region,country,2024,2025\nEMEA,DE,20,30\nAPAC,SG,6,7\n")).toEqual([
      { label: "EMEA", value: 30 },
      { label: "APAC", value: 7 },
    ]);
  });

  it("keeps year headers out of the numeric column vote and error message", () => {
    // Column 2025 has only 1 of 2 data rows numeric, so 2024 wins once the
    // header row stops voting as a third numeric row.
    expect(parse("region,2023,2024,2025\nEMEA,10,20,n/a\nAPAC,5,6,7\n")).toEqual([
      { label: "EMEA", value: 20 },
      { label: "APAC", value: 6 },
    ]);
    expect(() => parse("region,2023,2024,2025\nEMEA,n/a,n/a,n/a\n")).toThrow(
      /region, 2023, 2024, 2025/,
    );
    expect(() => parse(",2023,2024,2025\nEMEA,n/a,n/a,n/a\n")).toThrow(
      /none of these have numbers: 2023, 2024, 2025\./,
    );
  });

  it("still charts a headerless first row whose numbers are not year headers", () => {
    expect(parse("2020,5,100\n2021,7,150\n")).toEqual([
      { label: "2020", value: 100 },
      { label: "2021", value: 150 },
    ]);
    expect(parse("2020,2021\n2022,2023\n")).toEqual([
      { label: "2020", value: 2021 },
      { label: "2022", value: 2023 },
    ]);
    expect(values("2020,2021,\n2022,2023,\n")).toEqual([2021, 2023]);
    expect(values("2023\n2024\n2025\n")).toEqual([2023, 2024, 2025]);
    expect(values("EMEA,4400\nAPAC,3610\n")).toEqual([4400, 3610]);
    expect(values("EMEA,1800\nAPAC,1500\n")).toEqual([1800, 1500]);
    expect(values("EMEA,2025\nAPAC,1800\n")).toEqual([2025, 1800]);
    expect(values("EMEA,2025\nAPAC,n/a\nAMER,1800\n")).toEqual([2025, 1800]);
    expect(() => parse("EMEA,2025\nAPAC,n/a\n")).toThrow(/none of the 2 columns/);
    expect(values("EMEA,$2025\nAPAC,$1800\n")).toEqual([2025, 1800]);
    expect(values('EMEA,"2,025"\nAPAC,"1,800"\n')).toEqual([2025, 1800]);
    expect(parse("2023,EMEA,30\n2024,APAC,7\n")).toEqual([
      { label: "EMEA", value: 30 },
      { label: "APAC", value: 7 },
    ]);
    expect(parse("2023,EMEA,1950\n2024,APAC,1800\n")).toEqual([
      { label: "EMEA", value: 1950 },
      { label: "APAC", value: 1800 },
    ]);
  });
});
