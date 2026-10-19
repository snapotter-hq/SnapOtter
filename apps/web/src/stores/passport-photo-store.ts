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
  reset: () => void;
}

const INITIAL_STATE = {
  analyzeResult: null as AnalyzeResult | null,
  countryCode: "US",
  documentType: "passport",
  bgColor: "#FFFFFF",
  maxFileSizeKb: 0,
  dpi: 300,
  customWidthMm: null as number | null,
  customHeightMm: null as number | null,
  adjustX: 0,
  adjustY: 0,
  zoom: 1,
  generateResult: null as GenerateResult | null,
  analyzing: false,
  generating: false,
};

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
  ...INITIAL_STATE,
  setAnalyzeResult: (analyzeResult) => set({ analyzeResult, generateResult: null }),
  setCountryCode: (countryCode) =>
    set({ countryCode, generateResult: null, customWidthMm: null, customHeightMm: null }),
  setDocumentType: (documentType) => set({ documentType, generateResult: null }),
  setBgColor: (bgColor) => set({ bgColor, generateResult: null }),
  setMaxFileSizeKb: (maxFileSizeKb) => set({ maxFileSizeKb }),
  setDpi: (dpi) => set({ dpi, generateResult: null }),
  setCustomDimensions: (customWidthMm, customHeightMm) =>
    set({ customWidthMm, customHeightMm, countryCode: "CUSTOM", generateResult: null }),
  setAdjustX: (adjustX) => set({ adjustX, generateResult: null }),
  setAdjustY: (adjustY) => set({ adjustY, generateResult: null }),
  setZoom: (zoom) => set({ zoom }),
  setGenerateResult: (generateResult) => set({ generateResult }),
  setAnalyzing: (analyzing) => set({ analyzing }),
  setGenerating: (generating) => set({ generating }),
  reset: () => set({ ...INITIAL_STATE }),
}));
