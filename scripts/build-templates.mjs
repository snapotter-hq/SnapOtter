import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = dirname(fileURLToPath(import.meta.url));
const FULL_DIR = join(__dirname, "../apps/api/static/meme-templates/full");
const THUMBS_DIR = join(__dirname, "../apps/api/static/meme-templates/thumbs");
const MANIFEST_PATH = join(__dirname, "../apps/api/static/meme-templates/meme-templates.json");

mkdirSync(FULL_DIR, { recursive: true });
mkdirSync(THUMBS_DIR, { recursive: true });

const CURATED_BOXES = {
  "drake-hotline-bling": [
    { id: "reject", x: 52, y: 0, width: 48, height: 50, defaultText: "Thing I reject" },
    { id: "approve", x: 52, y: 50, width: 48, height: 50, defaultText: "Thing I approve" },
  ],
  "distracted-boyfriend": [
    { id: "girl-behind", x: 58, y: 15, width: 30, height: 30, defaultText: "Current thing" },
    { id: "guy", x: 32, y: 5, width: 25, height: 30, defaultText: "Me" },
    { id: "girl-front", x: 2, y: 15, width: 28, height: 30, defaultText: "New shiny thing" },
  ],
  "expanding-brain": [
    { id: "panel-1", x: 0, y: 0, width: 50, height: 25, defaultText: "Normal idea" },
    { id: "panel-2", x: 0, y: 25, width: 50, height: 25, defaultText: "Smarter idea" },
    { id: "panel-3", x: 0, y: 50, width: 50, height: 25, defaultText: "Big brain idea" },
    { id: "panel-4", x: 0, y: 75, width: 50, height: 25, defaultText: "Galaxy brain idea" },
  ],
  "change-my-mind": [
    { id: "sign", x: 24, y: 55, width: 50, height: 30, defaultText: "Your hot take here" },
  ],
  "two-buttons": [
    { id: "left-button", x: 5, y: 2, width: 38, height: 22, defaultText: "Option A" },
    { id: "right-button", x: 45, y: 2, width: 38, height: 22, defaultText: "Option B" },
  ],
  "gru-s-plan": [
    { id: "step-1", x: 52, y: 0, width: 46, height: 25, defaultText: "Step 1" },
    { id: "step-2", x: 52, y: 25, width: 46, height: 25, defaultText: "Step 2" },
    { id: "step-3", x: 52, y: 50, width: 46, height: 25, defaultText: "Unexpected result" },
    { id: "realization", x: 52, y: 75, width: 46, height: 25, defaultText: "Wait..." },
  ],
  "buff-doge-vs-cheems": [
    { id: "buff-label", x: 2, y: 2, width: 45, height: 15, defaultText: "Strong version" },
    { id: "buff-text", x: 2, y: 75, width: 45, height: 23, defaultText: "Chad description" },
    { id: "cheems-label", x: 52, y: 2, width: 45, height: 15, defaultText: "Weak version" },
    { id: "cheems-text", x: 52, y: 75, width: 45, height: 23, defaultText: "Sad description" },
  ],
  "trade-offer": [
    { id: "i-receive", x: 5, y: 32, width: 42, height: 32, defaultText: "I receive" },
    { id: "you-receive", x: 53, y: 32, width: 42, height: 32, defaultText: "You receive" },
  ],
  "tuxedo-winnie-the-pooh": [
    { id: "regular", x: 52, y: 2, width: 46, height: 48, defaultText: "Regular way" },
    { id: "fancy", x: 52, y: 52, width: 46, height: 46, defaultText: "Fancy way" },
  ],
  "epic-handshake": [
    { id: "left", x: 2, y: 2, width: 30, height: 20, defaultText: "Group A" },
    { id: "center", x: 25, y: 70, width: 50, height: 25, defaultText: "Shared thing" },
    { id: "right", x: 68, y: 2, width: 30, height: 20, defaultText: "Group B" },
  ],
  "sad-pablo-escobar": [
    { id: "top", x: 5, y: 2, width: 90, height: 20, defaultText: "When you..." },
    { id: "middle", x: 5, y: 40, width: 90, height: 20 },
    { id: "bottom", x: 5, y: 78, width: 90, height: 20, defaultText: "...sad" },
  ],
  "bike-fall": [
    { id: "stick", x: 50, y: 0, width: 48, height: 33, defaultText: "My plan" },
    { id: "wheel", x: 5, y: 33, width: 48, height: 33, defaultText: "What went wrong" },
    { id: "ground", x: 50, y: 66, width: 48, height: 33, defaultText: "The consequence" },
  ],
  "they-re-the-same-picture": [
    { id: "left-image", x: 10, y: 8, width: 35, height: 25, defaultText: "Thing A" },
    { id: "right-image", x: 55, y: 8, width: 35, height: 25, defaultText: "Thing B" },
    { id: "caption", x: 10, y: 72, width: 80, height: 15, defaultText: "They're the same picture" },
  ],
  "running-away-balloon": [
    { id: "person", x: 50, y: 55, width: 25, height: 15, defaultText: "Me" },
    { id: "balloon", x: 55, y: 5, width: 30, height: 15, defaultText: "Responsibilities" },
    { id: "distraction", x: 2, y: 55, width: 25, height: 15, defaultText: "Distraction" },
  ],
  "anakin-padme-4-panel": [
    { id: "anakin-1", x: 0, y: 0, width: 50, height: 15, defaultText: "Statement" },
    { id: "padme-1", x: 50, y: 0, width: 50, height: 50, defaultText: "Right...?" },
    { id: "anakin-2", x: 0, y: 50, width: 50, height: 50, defaultText: "..." },
  ],
  "left-exit-12-off-ramp": [
    { id: "straight", x: 35, y: 2, width: 30, height: 15, defaultText: "Good choice" },
    { id: "exit", x: 65, y: 2, width: 30, height: 15, defaultText: "Bad choice" },
    { id: "car", x: 35, y: 65, width: 40, height: 20, defaultText: "Me" },
  ],
  "clown-applying-makeup": [
    { id: "panel-1", x: 52, y: 0, width: 46, height: 25, defaultText: "Step 1" },
    { id: "panel-2", x: 52, y: 25, width: 46, height: 25, defaultText: "Step 2" },
    { id: "panel-3", x: 52, y: 50, width: 46, height: 25, defaultText: "Step 3" },
    { id: "panel-4", x: 52, y: 75, width: 46, height: 25, defaultText: "Full clown" },
  ],
  "panik-kalm-panik": [
    { id: "panik-1", x: 0, y: 0, width: 50, height: 33, defaultText: "Scary thing" },
    { id: "kalm", x: 0, y: 33, width: 50, height: 33, defaultText: "Resolution" },
    { id: "panik-2", x: 0, y: 66, width: 50, height: 33, defaultText: "Even scarier" },
  ],
};

function classifyCategory(name) {
  const n = name.toLowerCase();
  if (
    /brain|boyfriend|buff|vs|tuxedo|pooh|handshake|same picture|gru|clown|bike|exit|draw 25|horse|scroll|virgin|bell curve/i.test(
      n,
    )
  )
    return "comparison";
  if (
    /change my mind|pills|lisa|hannibal|boardroom|balloon|salesman|getting paid|everywhere|megamind|presentation|bernie|roof/i.test(
      n,
    )
  )
    return "opinion";
  if (
    /doge|cat|dog|skeleton|kermit|monkey|penguin|cheems|pigeon|spongebob|bird|frog|seal|bear/i.test(
      n,
    )
  )
    return "animals";
  if (
    /simply|y u no|bad luck|success|aliens|batman|first time|well yes|flex|x everywhere|ancient|futurama|matrix|chuck/i.test(
      n,
    )
  )
    return "classic";
  return "reaction";
}

function generateTags(name) {
  return [
    ...new Set(
      name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    ),
  ];
}

async function downloadImage(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function main() {
  const res = await fetch("https://api.imgflip.com/get_memes");
  const data = await res.json();
  const memes = data.data.memes;
  console.log(`Fetching ${memes.length} Imgflip templates...`);

  const templates = [];
  let downloaded = 0;

  for (const meme of memes) {
    const slug = meme.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${slug}.jpg`;
    const destPath = join(FULL_DIR, filename);

    if (!existsSync(destPath)) {
      try {
        await downloadImage(meme.url, destPath);
        downloaded++;
        process.stdout.write(".");
      } catch (e) {
        console.log(`\n  FAIL ${slug}: ${e.message}`);
        continue;
      }
    }

    const textBoxes = CURATED_BOXES[slug] || [
      { id: "top", x: 5, y: 2, width: 90, height: 20, defaultText: "Top text" },
      { id: "bottom", x: 5, y: 78, width: 90, height: 20, defaultText: "Bottom text" },
    ];

    templates.push({
      id: slug,
      name: meme.name,
      aliases: [],
      tags: generateTags(meme.name),
      category: classifyCategory(meme.name),
      filename,
      width: meme.width,
      height: meme.height,
      popularity: templates.length + 1,
      textBoxes,
    });
  }

  console.log(`\nDownloaded ${downloaded} new images`);

  const manifest = {
    version: 1,
    categories: ["reaction", "comparison", "opinion", "animals", "classic"],
    templates,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Manifest: ${templates.length} templates`);

  console.log("Generating thumbnails...");
  const files = readdirSync(FULL_DIR).filter((f) => f.endsWith(".jpg"));
  for (const file of files) {
    const thumbPath = join(THUMBS_DIR, file.replace(".jpg", ".webp"));
    if (!existsSync(thumbPath)) {
      await sharp(join(FULL_DIR, file))
        .resize({ width: 200 })
        .webp({ quality: 80 })
        .toFile(thumbPath);
    }
  }
  console.log(`Thumbnails: ${readdirSync(THUMBS_DIR).length}`);
}

main().catch(console.error);
