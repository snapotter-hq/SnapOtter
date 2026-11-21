import { TOOLS } from "@snapotter/shared";
import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import { FUSE_OPTIONS, searchToolList } from "@/hooks/use-fuse-search";

const fuse = new Fuse(TOOLS, FUSE_OPTIONS);

function search(q: string) {
  return searchToolList(fuse, TOOLS, q).map((tool) => tool.id);
}

describe("app fuzzy search finds converters by variation", () => {
  it.each([
    ["jpeg to png", "jpg-to-png"],
    ["jpg2png", "jpg-to-png"],
    ["heic jpg", "heic-to-jpg"],
    ["mov mp4", "mov-to-mp4"],
    ["convert mp4 to mp3", "mp4-to-mp3"],
    ["ico", "favicon"],
    ["jpg to ico", "favicon"],
    ["jpg2ico", "favicon"],
    ["png to ico", "favicon"],
    ["png2ico", "favicon"],
  ])("%s finds %s", (q, id) => {
    expect(search(q).slice(0, 5)).toContain(id);
  });
});

describe("the normalizer keeps the words that name a tool (#1327)", () => {
  // "convert image" used to normalize to "image", which ranked the five
  // compress-image-to-N-kb presets first and Convert Image sixth.
  it.each([
    ["convert image", "convert"],
    ["Convert Image", "convert"],
    ["vectorize", "vectorize"],
    ["jpgtopng", "jpg-to-png"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });
});

describe("a base tool outranks its presets on its own name (#1322)", () => {
  // The five compress-image-to-N-kb presets carry many "compress ..."
  // keywords; the base tool had none, so a bare "compress" ranked every
  // preset first and the pipeline picker's first match was the 20 KB preset.
  it.each([
    ["compress", "compress"],
    ["Compress", "compress"],
    ["compress image", "compress"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it.each([
    ["compress image to 50kb", "compress-image-to-50kb"],
    ["compress to 20 kb", "compress-image-to-20kb"],
    ["20kb", "compress-image-to-20kb"],
  ])("a sized query %s still leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });
});

describe("compress-pdf outranks its size presets (#1070)", () => {
  it.each([
    ["compress pdf", "compress-pdf"],
    ["shrink pdf", "compress-pdf"],
    ["reduce pdf size", "compress-pdf"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it.each([
    ["compress pdf to 100kb", "compress-pdf-to-100kb"],
    ["compress pdf to 1 mb", "compress-pdf-to-1mb"],
    ["pdf under 2mb", "compress-pdf-to-2mb"],
  ])("a sized query %s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });
});

describe("a format we accept finds a tool that takes it (#4818)", () => {
  it.each([
    ["opus", "convert-audio"],
    ["wma", "convert-audio"],
    ["nef", "convert"],
    ["arw", "convert"],
    ["cr2", "convert"],
    ["dng", "convert"],
    ["orf", "convert"],
    ["raf", "convert"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  // The fixed list above can't catch the next format someone adds to
  // acceptedInputs, so every accepted extension is checked as a bare query.
  const extensions = [...new Set(TOOLS.flatMap((tool) => tool.acceptedInputs))].map((ext) =>
    ext.slice(1),
  );
  const handles = (tool: (typeof TOOLS)[number], ext: string) =>
    tool.acceptedInputs.includes(`.${ext}`) ||
    [tool.id, ...(tool.keywords ?? [])].some((text) => text.split(/[^a-z0-9]+/).includes(ext));
  it.each(extensions)("%s finds a tool that takes or produces it", (ext) => {
    const top = searchToolList(fuse, TOOLS, ext).slice(0, 5);
    expect(top.some((tool) => handles(tool, ext))).toBe(true);
  });
});

describe("an x-to-y query no preset handles leads with the converter (#4818)", () => {
  it.each([
    ["mp3 to ogg", "convert-audio"],
    ["mp3 to opus", "convert-audio"],
    ["jpg to bmp", "convert"],
    ["nef to jpg", "convert"],
  ])("%s leads with %s", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it.each([
    ["hif to jpg", "heic-to-jpg"],
    ["hif2png", "heic-to-png"],
  ])("Sony's hif finds the HEIC converter: %s leads with %s (#4825)", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it("never offers a converter the caller filtered out (a disabled tool)", () => {
    const visible = TOOLS.filter((tool) => tool.id !== "convert-audio");
    const results = searchToolList(new Fuse(visible, FUSE_OPTIONS), visible, "mp3 to ogg");
    expect(results.map((tool) => tool.id)).not.toContain("convert-audio");
  });

  it("leaves a pair with its own preset alone", () => {
    expect(search("mp4 to mp3")[0]).toBe("mp4-to-mp3");
    expect(search("jpg to png")[0]).toBe("jpg-to-png");
  });
});

describe("a remove query doesn't rank the tools that add the thing (#4818)", () => {
  it("remove watermark leads with the object eraser and shows no add-watermark tool", () => {
    const results = search("remove watermark");
    expect(results[0]).toBe("erase-object");
    expect(results.filter((id) => id.startsWith("watermark-"))).toEqual([]);
  });

  it("redact image surfaces pixelate and blur-faces, not the compress presets", () => {
    const top = search("redact image").slice(0, 2);
    expect(top).toEqual(expect.arrayContaining(["pixelate", "blur-faces"]));
  });
});

describe("a query with no real match reaches the empty state (#4818)", () => {
  // Tools we don't have: the empty state's feedback prompt is how we hear about them.
  it.each(["email", "discord", "youtube", "curve text", "text to audio"])(
    "%s finds nothing",
    (q) => {
      expect(search(q)).toEqual([]);
    },
  );

  it.each([
    ["crp image", "crop"],
    ["blr pad", "blur-pad"],
    ["wep to png", "webp-to-png"],
    ["compres", "compress"],
    ["combine pdf", "merge-pdf"],
    ["unzip", "extract-zip"],
    ["slow motion", "video-speed"],
    ["voice to text", "transcribe-audio"],
    ["change format", "convert"],
    ["png till ico", "favicon"],
    ["make image smaller", "compress"],
    ["make pdf smaller", "compress-pdf"],
    ["make video smaller", "compress-video"],
    ["jpg naar png", "jpg-to-png"],
    ["otf to ttf", "convert-font"],
    ["base64 decode", "base64"],
  ])("a typo or synonym like %s still finds %s", (q, id) => {
    expect(search(q).slice(0, 3)).toContain(id);
  });
});

describe("joining stills into an animation finds images-to-video (#4826)", () => {
  // These used to land on png-to-gif and jpg-to-gif, which turn one still
  // into one still GIF.
  it.each(["images to gif", "multiple png to gif", "animated gif", "animated webp", "gif maker"])(
    "%s finds images-to-video",
    (q) => {
      expect(search(q).slice(0, 5)).toContain("images-to-video");
    },
  );
});
