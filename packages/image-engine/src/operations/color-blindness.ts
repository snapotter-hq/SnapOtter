import type { ColorBlindnessOptions, ColorBlindnessType, Sharp } from "../types.js";
import { applyRecombMatrix, type Matrix3x3 } from "../utils/recomb.js";

export const COLOR_BLINDNESS_MATRICES: Record<ColorBlindnessType, Matrix3x3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
  protanomaly: [
    [0.458064, 0.679578, -0.137642],
    [0.092785, 0.846313, 0.060902],
    [-0.007494, -0.016807, 1.024301],
  ],
  deuteranomaly: [
    [0.547494, 0.607765, -0.155259],
    [0.181692, 0.781742, 0.036566],
    [-0.01041, 0.027275, 0.983136],
  ],
  tritanomaly: [
    [1.017277, 0.027029, -0.044306],
    [-0.006113, 0.958479, 0.047634],
    [0.006379, 0.248708, 0.744913],
  ],
  achromatopsia: [
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
    [0.2126, 0.7152, 0.0722],
  ],
  blueConeMonochromacy: [
    [0.01775, 0.10945, 0.87262],
    [0.01775, 0.10945, 0.87262],
    [0.01775, 0.10945, 0.87262],
  ],
};

export async function colorBlindness(image: Sharp, options: ColorBlindnessOptions): Promise<Sharp> {
  return applyRecombMatrix(image, COLOR_BLINDNESS_MATRICES[options.type]);
}
