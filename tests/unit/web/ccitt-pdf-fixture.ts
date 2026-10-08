import { Buffer } from "node:buffer";

// A one-page PDF holding a 64x64 CCITT Group 4 image (the usual compression
// for B&W scans). Every row is the "V0" code, a single 1-bit, so the stream is
// 64 bits of 0xFF. Built by hand to keep a binary fixture out of the repo.
export function buildCcittPdf(): Uint8Array {
  const g4 = Buffer.alloc(8, 0xff);
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Buffer | string) => {
    const buf = typeof data === "string" ? Buffer.from(data, "latin1") : data;
    parts.push(buf);
    length += buf.length;
  };
  const object = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.5\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 64 64] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>",
  );
  const content = "q 64 0 0 64 0 0 cm /Im0 Do Q";
  object(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  offsets[5] = length;
  push("5 0 obj\n");
  push(
    `<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 64 >> /Length ${g4.length} >>\nstream\n`,
  );
  push(g4);
  push("\nendstream\nendobj\n");

  const xref = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(parts));
}

// Decodes the page's image through pdf.js and returns its size, or null when
// pdf.js could not decode it (the blank-preview symptom of #2082).
export async function decodeFirstImage(
  pdfjs: {
    getDocument: (src: object) => { promise: Promise<unknown> };
    OPS: { paintImageXObject: number };
  },
  options: object,
): Promise<{ width: number; height: number } | null> {
  type Page = {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (name: string, cb: (img: unknown) => void) => void };
  };
  const doc = (await pdfjs.getDocument({ data: buildCcittPdf(), verbosity: 0, ...options })
    .promise) as { getPage: (n: number) => Promise<Page> };
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const at = ops.fnArray.indexOf(pdfjs.OPS.paintImageXObject);
  const name = ops.argsArray[at][0] as string;
  const img = await new Promise<{ width: number; height: number } | null>((resolve) =>
    page.objs.get(name, resolve as (img: unknown) => void),
  );
  return img ? { width: img.width, height: img.height } : null;
}
