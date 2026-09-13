import { create } from "zustand";

export interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  eyeCenter: { x: number; y: number };
  chin: { x: number; y: number };
  forehead: { x: number; y: number };
  crown: { x: number; y: number };
  nose: { x: number; y: number };
  faceCenterX: number;
}

export interface AnalyzeResult {
  preview: string; // base64 PNG
  landmarks: FaceLandmarks;
  imageWidth: number;
  imageHeight: number;
  jobId: string;
  filename: string;
}

export interface GenerateResult {
  downloadUrl: string;
  dimensions: { width: number; height: number };
  spec: { country: string; document: string };
}

interface PassportPhotoStore {
  analyzeResult: AnalyzeResult | null;
  setAnalyzeResult: (r: AnalyzeResult | null) => void;
  countryCode: string;
  setCountryCode: (c: string) => void;
  documentType: string;
  setDocumentType: (t: string) => void;
  bgColor: string;
  setBgColor: (c: string) => void;
  maxFileSizeKb: number;
  setMaxFileSizeKb: (s: number) => void;
  dpi: number;
  setDpi: (d: number) => void;
  customWidthMm: number | null;
  customHeightMm: number | null;
  setCustomDimensions: (w: number | null, h: number | null) => void;
  adjustX: number;
  adjustY: number;
  setAdjustX: (x: number) => void;
  setAdjustY: (y: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
  generateResult: GenerateResult | null;
  setGenerateResult: (r: GenerateResult | null) => void;
  analyzing: boolean;
  setAnalyzing: (a: boolean) => void;
  generating: boolean;
  setGenerating: (g: boolean) => void;
}

/**
 * passport-photo hand-rolls both of its requests, so nothing it does reaches
 * the file store: the analysis, the generated photo and the two in-flight flags
 * all live here.
 *
 * A store of its own rather than component state, and in this directory rather
 * than beside the panel, because the navigation guard reads it
 * (useWorkInFlight): importing it out of the settings component would pull that
 * lazily loaded chunk into the app's first load.
 */
export const usePassportPhotoStore = create<PassportPhotoStore>((set) => ({
  analyzeResult: null,
  setAnalyzeResult: (analyzeResult) => set({ analyzeResult, generateResult: null }),
  countryCode: "US",
  setCountryCode: (countryCode) =>
    set({ countryCode, generateResult: null, customWidthMm: null, customHeightMm: null }),
  documentType: "passport",
  setDocumentType: (documentType) => set({ documentType, generateResult: null }),
  bgColor: "#FFFFFF",
  setBgColor: (bgColor) => set({ bgColor, generateResult: null }),
  maxFileSizeKb: 0,
  setMaxFileSizeKb: (maxFileSizeKb) => set({ maxFileSizeKb }),
  dpi: 300,
  setDpi: (dpi) => set({ dpi, generateResult: null }),
  customWidthMm: null,
  customHeightMm: null,
  setCustomDimensions: (customWidthMm, customHeightMm) =>
    set({ customWidthMm, customHeightMm, countryCode: "CUSTOM", generateResult: null }),
  adjustX: 0,
  adjustY: 0,
  setAdjustX: (adjustX) => set({ adjustX, generateResult: null }),
  setAdjustY: (adjustY) => set({ adjustY, generateResult: null }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  generateResult: null,
  setGenerateResult: (generateResult) => set({ generateResult }),
  analyzing: false,
  setAnalyzing: (analyzing) => set({ analyzing }),
  generating: false,
  setGenerating: (generating) => set({ generating }),
}));
