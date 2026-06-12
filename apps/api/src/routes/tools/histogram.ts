import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerHistogram(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "histogram",
    settingsSchema,
    process: async () => {
      throw new Error("histogram is v2-only");
    },
    processV2: async (ctx) => {
      const inputBuffer = ctx.inputs[0].buffer;
      const filename = ctx.inputs[0].filename;

      // Extract raw RGB pixel data (no alpha)
      const { data } = await sharp(inputBuffer)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Build 256-bin histograms per channel in a single pass
      const rBins = new Uint32Array(256);
      const gBins = new Uint32Array(256);
      const bBins = new Uint32Array(256);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      const pixelCount = data.length / 3;

      for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        rBins[r]++;
        gBins[g]++;
        bBins[b]++;
        rSum += r;
        gSum += g;
        bSum += b;
      }

      // Find max bin value for normalization
      let maxBin = 0;
      let rMax = 0;
      let gMax = 0;
      let bMax = 0;
      for (let i = 0; i < 256; i++) {
        if (rBins[i] > maxBin) maxBin = rBins[i];
        if (gBins[i] > maxBin) maxBin = gBins[i];
        if (bBins[i] > maxBin) maxBin = bBins[i];
        if (rBins[i] > rMax) rMax = rBins[i];
        if (gBins[i] > gMax) gMax = gBins[i];
        if (bBins[i] > bMax) bMax = bBins[i];
      }

      // Render a 512x320 SVG with three semi-transparent polylines
      const svgW = 512;
      const svgH = 320;
      const scaleX = svgW / 255;
      const scaleY = maxBin > 0 ? svgH / maxBin : 1;

      const buildPoints = (bins: Uint32Array): string => {
        const pts: string[] = [];
        for (let i = 0; i < 256; i++) {
          const x = Math.round(i * scaleX);
          const y = Math.round(svgH - bins[i] * scaleY);
          pts.push(`${x},${y}`);
        }
        return pts.join(" ");
      };

      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">` +
          `<rect width="100%" height="100%" fill="#1a1a2e"/>` +
          `<polyline points="${buildPoints(rBins)}" fill="none" stroke="rgba(255,0,0,0.6)" stroke-width="1.5"/>` +
          `<polyline points="${buildPoints(gBins)}" fill="none" stroke="rgba(0,255,0,0.6)" stroke-width="1.5"/>` +
          `<polyline points="${buildPoints(bBins)}" fill="none" stroke="rgba(0,128,255,0.6)" stroke-width="1.5"/>` +
          `</svg>`,
      );

      // Rasterize to PNG
      const buffer = await sharp(svg).png().toBuffer();

      const base = filename.replace(/\.[^.]+$/, "");
      return {
        buffer,
        filename: `${base}_histogram.png`,
        contentType: "image/png",
        resultPayload: {
          mean: {
            r: Math.round(rSum / pixelCount),
            g: Math.round(gSum / pixelCount),
            b: Math.round(bSum / pixelCount),
          },
          max: {
            r: rMax,
            g: gMax,
            b: bMax,
          },
        },
      };
    },
  });
}
