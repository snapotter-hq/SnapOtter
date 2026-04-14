import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { detectFaceLandmarks, removeBackground } from "@ashim/ai";
import { PASSPORT_SPECS, PRINT_LAYOUTS } from "@ashim/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace, getWorkspacePath } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const landmarkPointSchema = z.object({ x: z.number(), y: z.number() });

const landmarksSchema = z.object({
  leftEye: landmarkPointSchema,
  rightEye: landmarkPointSchema,
  eyeCenter: landmarkPointSchema,
  chin: landmarkPointSchema,
  forehead: landmarkPointSchema,
  crown: landmarkPointSchema,
  nose: landmarkPointSchema,
  faceCenterX: z.number(),
});

const generateSettingsSchema = z.object({
  jobId: z.string(),
  filename: z.string(),
  countryCode: z.string(),
  documentType: z.string().default("passport"),
  bgColor: z.string().default("#FFFFFF"),
  printLayout: z.string().default("none"),
  maxFileSizeKb: z.number().default(0),
  dpi: z.number().min(72).max(600).default(300),
  customWidthMm: z.number().optional(),
  customHeightMm: z.number().optional(),
  zoom: z.number().min(0.5).max(3).default(1),
  adjustX: z.number().default(0),
  adjustY: z.number().default(0),
  landmarks: landmarksSchema,
  imageWidth: z.number(),
  imageHeight: z.number(),
});

/**
 * Generate a print sheet that tiles passport photos onto standard paper.
 * Returns JPEG buffer or null if layout is "none".
 */
async function generatePrintSheet(
  photoBuffer: Buffer,
  photoWidthMm: number,
  photoHeightMm: number,
  layoutId: string,
): Promise<Buffer | null> {
  const layout = PRINT_LAYOUTS.find((l) => l.id === layoutId);
  if (!layout || layout.id === "none") return null;

  const DPI = 300;
  const MM_PER_INCH = 25.4;
  const GUTTER_MM = 2;

  const paperWidthPx = Math.round((layout.width / MM_PER_INCH) * DPI);
  const paperHeightPx = Math.round((layout.height / MM_PER_INCH) * DPI);
  const photoWidthPx = Math.round((photoWidthMm / MM_PER_INCH) * DPI);
  const photoHeightPx = Math.round((photoHeightMm / MM_PER_INCH) * DPI);
  const gutterPx = Math.round((GUTTER_MM / MM_PER_INCH) * DPI);

  const cols = Math.floor((paperWidthPx + gutterPx) / (photoWidthPx + gutterPx));
  const rows = Math.floor((paperHeightPx + gutterPx) / (photoHeightPx + gutterPx));

  if (cols < 1 || rows < 1) return null;

  // Center the grid on the paper
  const gridWidth = cols * photoWidthPx + (cols - 1) * gutterPx;
  const gridHeight = rows * photoHeightPx + (rows - 1) * gutterPx;
  const offsetX = Math.round((paperWidthPx - gridWidth) / 2);
  const offsetY = Math.round((paperHeightPx - gridHeight) / 2);

  // Resize photo to exact pixel dimensions
  const resizedPhoto = await sharp(photoBuffer)
    .resize(photoWidthPx, photoHeightPx, { fit: "fill" })
    .toBuffer();

  // Build composite inputs
  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      composites.push({
        input: resizedPhoto,
        left: offsetX + col * (photoWidthPx + gutterPx),
        top: offsetY + row * (photoHeightPx + gutterPx),
      });
    }
  }

  return sharp({
    create: {
      width: paperWidthPx,
      height: paperHeightPx,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Passport photo tool with two-phase flow:
 *
 * Phase 1 (POST /passport-photo/analyze): AI face detection + bg removal.
 *   Returns landmarks, preview, and caches images for generate phase.
 *
 * Phase 2 (POST /passport-photo/generate): Sharp crop/resize/tile.
 *   Uses cached images. No AI re-run. Fast response.
 */
export function registerPassportPhoto(app: FastifyInstance) {
  // ── Phase 1: Analyze (face landmarks + bg removal) ────────────────
  app.post(
    "/api/v1/tools/passport-photo/analyze",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let clientJobId: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            fileBuffer = Buffer.concat(chunks);
            filename = basename(part.filename ?? "image");
          } else if (part.fieldname === "clientJobId") {
            clientJobId = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      try {
        // Decode HEIC/HEIF before processing
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        // Auto-orient to fix EXIF rotation
        fileBuffer = await autoOrient(fileBuffer);

        request.log.info(
          { toolId: "passport-photo", imageSize: fileBuffer.length },
          "Starting passport photo analysis",
        );

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);

        // Save original to workspace for generate phase
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);

        // Progress callback
        const jobIdForProgress = clientJobId;
        const onProgress = jobIdForProgress
          ? (percent: number, stage: string) => {
              updateSingleFileProgress({
                jobId: jobIdForProgress,
                phase: "processing",
                stage,
                percent: Math.min(percent, 95),
              });
            }
          : undefined;

        // Step 1: Detect face landmarks (0-30% of progress)
        const landmarkProgress = onProgress
          ? (percent: number, stage: string) => {
              onProgress(Math.round(percent * 0.3), stage);
            }
          : undefined;

        const landmarksResult = await detectFaceLandmarks(fileBuffer, landmarkProgress);

        if (!landmarksResult.faceDetected || !landmarksResult.landmarks) {
          if (clientJobId) {
            updateSingleFileProgress({
              jobId: clientJobId,
              phase: "complete",
              percent: 100,
            });
          }
          return reply.status(422).send({
            error: "No face detected",
            details:
              "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting.",
          });
        }

        // Step 2: Remove background with birefnet-portrait (30-95%)
        const bgProgress = onProgress
          ? (percent: number, stage: string) => {
              onProgress(30 + Math.round(percent * 0.65), stage);
            }
          : undefined;

        const bgRemovedBuffer = await removeBackground(
          fileBuffer,
          join(workspacePath, "output"),
          { model: "birefnet-portrait" },
          bgProgress,
        );

        // Save bg-removed image to workspace
        const bgRemovedFilename = `${filename.replace(/\.[^.]+$/, "")}_nobg.png`;
        await writeFile(join(workspacePath, "output", bgRemovedFilename), bgRemovedBuffer);

        // Create a smaller preview for fast transfer (max 800px wide)
        const meta = await sharp(bgRemovedBuffer).metadata();
        const previewWidth = Math.min(meta.width ?? 800, 800);
        const previewBuffer = await sharp(bgRemovedBuffer)
          .resize({ width: previewWidth, withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true });

        const preview = previewBuffer.data.toString("base64");

        if (clientJobId) {
          updateSingleFileProgress({
            jobId: clientJobId,
            phase: "complete",
            percent: 100,
          });
        }

        return reply.send({
          jobId,
          filename,
          preview,
          previewWidth: previewBuffer.info.width,
          previewHeight: previewBuffer.info.height,
          landmarks: landmarksResult.landmarks,
          imageWidth: landmarksResult.imageWidth,
          imageHeight: landmarksResult.imageHeight,
        });
      } catch (err) {
        request.log.error({ err, toolId: "passport-photo" }, "Passport photo analysis failed");
        return reply.status(422).send({
          error: "Passport photo analysis failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // ── Phase 2: Generate (crop + resize + tile) ─────────────────────
  app.post(
    "/api/v1/tools/passport-photo/generate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let parsed: z.infer<typeof generateSettingsSchema>;
      try {
        parsed = generateSettingsSchema.parse(request.body);
      } catch (err) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      const {
        jobId,
        filename,
        countryCode,
        documentType,
        bgColor,
        printLayout,
        maxFileSizeKb,
        dpi: userDpi,
        customWidthMm,
        customHeightMm,
        zoom: userZoom,
        adjustX,
        adjustY,
        landmarks: rawLandmarks,
        imageWidth: imgW,
        imageHeight: imgH,
      } = parsed;

      // Look up country spec
      const countrySpec = PASSPORT_SPECS.find((s) => s.code === countryCode);
      if (!countrySpec && !customWidthMm) {
        return reply.status(400).send({ error: `Unknown country code: ${countryCode}` });
      }

      const baseDoc =
        countrySpec?.documents.find((d) => d.type === documentType) ?? countrySpec?.documents[0];
      // Build effective doc spec: custom dimensions/DPI override country defaults
      const docSpec = {
        ...(baseDoc ?? {
          headHeightMin: 0.7,
          headHeightMax: 0.8,
          eyeLineFromBottom: 0.63,
          bgColor: "#FFFFFF",
          bgColors: ["#FFFFFF"],
          label: "Custom",
          type: "passport" as const,
          dpi: 300,
          width: 35,
          height: 45,
        }),
        width: customWidthMm ?? baseDoc?.width ?? 35,
        height: customHeightMm ?? baseDoc?.height ?? 45,
        dpi: userDpi,
      };

      try {
        const workspacePath = getWorkspacePath(jobId);
        const bgRemovedFilename = `${filename.replace(/\.[^.]+$/, "")}_nobg.png`;

        const bgRemovedBuffer = await readFile(join(workspacePath, "output", bgRemovedFilename));

        // Use actual bg-removed image dimensions for crop (may differ from
        // the original image dimensions reported by the analyze endpoint).
        const bgMeta = await sharp(bgRemovedBuffer).metadata();
        const actualW = bgMeta.width ?? imgW;
        const actualH = bgMeta.height ?? imgH;

        // Convert normalized landmarks (0-1) to pixel coordinates in the
        // bg-removed image space (scale if dimensions differ from original).
        const scaleX = actualW / imgW;
        const scaleY = actualH / imgH;
        const crownYPx = (rawLandmarks.crown.y + adjustY) * imgH * scaleY;
        const chinYPx = (rawLandmarks.chin.y + adjustY) * imgH * scaleY;
        const eyeYPx = (rawLandmarks.eyeCenter.y + adjustY) * imgH * scaleY;
        const faceCenterXPx = (rawLandmarks.faceCenterX + adjustX) * imgW * scaleX;

        // Compute crop region from landmarks
        const targetHeadRatio = (docSpec.headHeightMin + docSpec.headHeightMax) / 2;
        const headHeightPx = chinYPx - crownYPx;
        const photoHeightPx = headHeightPx / targetHeadRatio;
        const aspectRatio = docSpec.width / docSpec.height;
        const photoWidthPx = photoHeightPx * aspectRatio;

        // Position: eye line should be at eyeLineFromBottom from photo bottom
        const baseTopY = eyeYPx - photoHeightPx * (1 - docSpec.eyeLineFromBottom);
        const baseLeftX = faceCenterXPx - photoWidthPx / 2;

        // Apply zoom: zoom > 1 = tighter crop (less body), zoom < 1 = wider (more body)
        // The zoomed region is centered on the base crop
        const zoomedW = photoWidthPx / userZoom;
        const zoomedH = photoHeightPx / userZoom;
        const leftX = baseLeftX + (photoWidthPx - zoomedW) / 2;
        const topY = baseTopY + (photoHeightPx - zoomedH) / 2;

        // Parse background color
        const hex = bgColor.replace("#", "");
        const bgR = Number.parseInt(hex.slice(0, 2), 16);
        const bgG = Number.parseInt(hex.slice(2, 4), 16);
        const bgB = Number.parseInt(hex.slice(4, 6), 16);
        const bgRgb = { r: bgR, g: bgG, b: bgB, alpha: 1 };

        // Composite bg-removed subject onto colored background
        const bgLayer = await sharp({
          create: { width: actualW, height: actualH, channels: 4, background: bgRgb },
        })
          .composite([{ input: bgRemovedBuffer, blend: "over" }])
          .png()
          .toBuffer();

        // The crop region may extend beyond the image (e.g. top of head above
        // the photo). Instead of clamping (which cuts off the head), pad the
        // image with background color so the full intended region is available.
        const rawLeft = Math.round(leftX);
        const rawTop = Math.round(topY);
        const rawW = Math.round(zoomedW);
        const rawH = Math.round(zoomedH);

        const padLeft = Math.max(0, -rawLeft);
        const padTop = Math.max(0, -rawTop);
        const padRight = Math.max(0, rawLeft + rawW - actualW);
        const padBottom = Math.max(0, rawTop + rawH - actualH);

        let sourceForCrop = bgLayer;
        if (padLeft > 0 || padTop > 0 || padRight > 0 || padBottom > 0) {
          sourceForCrop = await sharp(bgLayer)
            .extend({
              top: padTop,
              bottom: padBottom,
              left: padLeft,
              right: padRight,
              background: bgRgb,
            })
            .toBuffer();
        }

        // Crop coordinates adjusted for padding
        const cropLeft = rawLeft + padLeft;
        const cropTop = rawTop + padTop;

        // Target pixel dimensions at 300 DPI
        const MM_PER_INCH = 25.4;
        const targetWidthPx = Math.round((docSpec.width / MM_PER_INCH) * docSpec.dpi);
        const targetHeightPx = Math.round((docSpec.height / MM_PER_INCH) * docSpec.dpi);

        // Extract crop region and resize to target dimensions
        let cropped = await sharp(sourceForCrop)
          .extract({ left: cropLeft, top: cropTop, width: rawW, height: rawH })
          .resize(targetWidthPx, targetHeightPx, { fit: "fill" })
          .jpeg({ quality: 95 })
          .toBuffer();

        // Compress to fit within max file size if specified
        if (maxFileSizeKb > 0) {
          const targetBytes = maxFileSizeKb * 1024;
          let quality = 90;
          while (cropped.length > targetBytes && quality > 10) {
            quality -= 5;
            cropped = await sharp(sourceForCrop)
              .extract({ left: cropLeft, top: cropTop, width: rawW, height: rawH })
              .resize(targetWidthPx, targetHeightPx, { fit: "fill" })
              .jpeg({ quality })
              .toBuffer();
          }
        }

        // Save output
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_passport.jpg`;
        const outputPath = join(workspacePath, "output", outputFilename);
        await writeFile(outputPath, cropped);

        const response: Record<string, unknown> = {
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`,
          dimensions: {
            widthMm: docSpec.width,
            heightMm: docSpec.height,
            widthPx: targetWidthPx,
            heightPx: targetHeightPx,
            dpi: docSpec.dpi,
          },
          spec: {
            country: countrySpec?.name ?? "Custom",
            countryCode: countrySpec?.code ?? "CUSTOM",
            documentType: docSpec.type,
            documentLabel: docSpec.label,
          },
        };

        // Generate print sheet if requested
        if (printLayout !== "none") {
          const printBuffer = await generatePrintSheet(
            cropped,
            docSpec.width,
            docSpec.height,
            printLayout,
          );

          if (printBuffer) {
            const printFilename = `${filename.replace(/\.[^.]+$/, "")}_passport_print_${printLayout}.jpg`;
            await writeFile(join(workspacePath, "output", printFilename), printBuffer);
            response.printDownloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(printFilename)}`;
          }
        }

        return reply.send(response);
      } catch (err) {
        request.log.error({ err, toolId: "passport-photo" }, "Passport photo generation failed");
        return reply.status(422).send({
          error: "Passport photo generation failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );

  // ── Pipeline/batch registry ──────────────────────────────────────
  const pipelineSettingsSchema = z.object({
    countryCode: z.string(),
    documentType: z.string().default("passport"),
    bgColor: z.string().default("#FFFFFF"),
    printLayout: z.string().default("none"),
    adjustX: z.number().default(0),
    adjustY: z.number().default(0),
  });

  registerToolProcessFn({
    toolId: "passport-photo",
    settingsSchema: pipelineSettingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof pipelineSettingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);

      // Step 1: Detect face landmarks
      const landmarksResult = await detectFaceLandmarks(orientedBuffer);
      if (!landmarksResult.faceDetected || !landmarksResult.landmarks) {
        throw new Error(
          "No face detected. Please upload a clear, front-facing photo with good lighting.",
        );
      }

      const landmarks = landmarksResult.landmarks;
      const imgW = landmarksResult.imageWidth;
      const imgH = landmarksResult.imageHeight;

      // Step 2: Remove background
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      const bgRemovedBuffer = await removeBackground(
        orientedBuffer,
        join(workspacePath, "output"),
        {
          model: "birefnet-portrait",
        },
      );

      // Step 3: Look up spec and compute crop
      const countrySpec = PASSPORT_SPECS.find((sp) => sp.code === s.countryCode);
      if (!countrySpec) throw new Error(`Unknown country code: ${s.countryCode}`);

      const docSpec = countrySpec.documents.find((d) => d.type === s.documentType);
      if (!docSpec) throw new Error(`No ${s.documentType} spec for ${s.countryCode}`);

      // Convert normalized landmarks (0-1) to pixel coordinates
      const crownYPx = (landmarks.crown.y + s.adjustY) * imgH;
      const chinYPx = (landmarks.chin.y + s.adjustY) * imgH;
      const eyeYPx = (landmarks.eyeCenter.y + s.adjustY) * imgH;
      const faceCenterXPx = (landmarks.faceCenterX + s.adjustX) * imgW;

      const targetHeadRatio = (docSpec.headHeightMin + docSpec.headHeightMax) / 2;
      const headHeightPx = chinYPx - crownYPx;
      const photoHeightPx = headHeightPx / targetHeadRatio;
      const aspectRatio = docSpec.width / docSpec.height;
      const photoWidthPx = photoHeightPx * aspectRatio;

      const topY = eyeYPx - photoHeightPx * (1 - docSpec.eyeLineFromBottom);
      const leftX = faceCenterXPx - photoWidthPx / 2;

      const cropW = Math.min(Math.round(photoWidthPx), imgW);
      const cropH = Math.min(Math.round(photoHeightPx), imgH);
      let cropLeft = Math.max(0, Math.round(leftX));
      let cropTop = Math.max(0, Math.round(topY));
      if (cropLeft + cropW > imgW) cropLeft = imgW - cropW;
      if (cropTop + cropH > imgH) cropTop = imgH - cropH;
      cropLeft = Math.max(0, cropLeft);
      cropTop = Math.max(0, cropTop);

      // Composite onto background
      const hex = s.bgColor.replace("#", "");
      const bgR = Number.parseInt(hex.slice(0, 2), 16);
      const bgG = Number.parseInt(hex.slice(2, 4), 16);
      const bgB = Number.parseInt(hex.slice(4, 6), 16);

      const bgRemovedMeta = await sharp(bgRemovedBuffer).metadata();
      const bgLayer = await sharp({
        create: {
          width: bgRemovedMeta.width ?? imgW,
          height: bgRemovedMeta.height ?? imgH,
          channels: 4,
          background: { r: bgR, g: bgG, b: bgB, alpha: 1 },
        },
      })
        .composite([{ input: bgRemovedBuffer, blend: "over" }])
        .png()
        .toBuffer();

      const MM_PER_INCH = 25.4;
      const targetWidthPx = Math.round((docSpec.width / MM_PER_INCH) * docSpec.dpi);
      const targetHeightPx = Math.round((docSpec.height / MM_PER_INCH) * docSpec.dpi);

      const result = await sharp(bgLayer)
        .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
        .resize(targetWidthPx, targetHeightPx, { fit: "fill" })
        .jpeg({ quality: 95 })
        .toBuffer();

      const stem = filename.replace(/\.[^.]+$/, "");
      return { buffer: result, filename: `${stem}_passport.jpg`, contentType: "image/jpeg" };
    },
  });
}
