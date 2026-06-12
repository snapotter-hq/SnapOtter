import { create } from "zustand";

export type ContentType = "url" | "text" | "wifi" | "vcard" | "email" | "phone" | "sms";

export type DotType = "square" | "rounded" | "dots" | "classy" | "classy-rounded" | "extra-rounded";
export type CornerSquareType = "square" | "rounded" | "dot" | "extra-rounded";
export type CornerDotType = "square" | "rounded" | "dot";
export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
export type DownloadFormat = "png" | "svg" | "jpeg" | "webp";

export interface WifiData {
  ssid: string;
  password: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}

export interface VCardData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  organization: string;
  title: string;
  url: string;
}

export interface EmailData {
  to: string;
  subject: string;
  body: string;
}

export interface SmsData {
  phone: string;
  message: string;
}

interface QrState {
  // Content
  contentType: ContentType;
  textData: string;
  wifiData: WifiData;
  vcardData: VCardData;
  emailData: EmailData;
  phoneData: string;
  smsData: SmsData;

  // Style
  dotType: DotType;
  cornerSquareType: CornerSquareType;
  cornerDotType: CornerDotType;

  // Colors
  dotColor: string;
  dotGradientEnabled: boolean;
  dotGradientType: "linear" | "radial";
  dotGradientColor1: string;
  dotGradientColor2: string;
  dotGradientRotation: number;
  bgColor: string;
  bgTransparent: boolean;
  cornerSquareColor: string;
  cornerDotColor: string;
  useCustomCornerColors: boolean;

  // Logo
  logoFile: File | null;
  logoDataUrl: string | null;
  logoError: string | null;
  logoSize: number;
  logoMargin: number;
  hideBackgroundDots: boolean;

  // Output
  size: number;
  errorCorrection: ErrorCorrectionLevel;
  downloadFormat: DownloadFormat;

  // Actions
  setContentType: (t: ContentType) => void;
  setTextData: (v: string) => void;
  setWifiData: (v: Partial<WifiData>) => void;
  setVcardData: (v: Partial<VCardData>) => void;
  setEmailData: (v: Partial<EmailData>) => void;
  setPhoneData: (v: string) => void;
  setSmsData: (v: Partial<SmsData>) => void;
  setDotType: (v: DotType) => void;
  setCornerSquareType: (v: CornerSquareType) => void;
  setCornerDotType: (v: CornerDotType) => void;
  setDotColor: (v: string) => void;
  setDotGradientEnabled: (v: boolean) => void;
  setDotGradientType: (v: "linear" | "radial") => void;
  setDotGradientColor1: (v: string) => void;
  setDotGradientColor2: (v: string) => void;
  setDotGradientRotation: (v: number) => void;
  setBgColor: (v: string) => void;
  setBgTransparent: (v: boolean) => void;
  setCornerSquareColor: (v: string) => void;
  setCornerDotColor: (v: string) => void;
  setUseCustomCornerColors: (v: boolean) => void;
  setLogoFile: (f: File | null) => void;
  setLogoSize: (v: number) => void;
  setLogoMargin: (v: number) => void;
  setHideBackgroundDots: (v: boolean) => void;
  setSize: (v: number) => void;
  setErrorCorrection: (v: ErrorCorrectionLevel) => void;
  setDownloadFormat: (v: DownloadFormat) => void;
  reset: () => void;
}

const initialWifi: WifiData = {
  ssid: "",
  password: "",
  encryption: "WPA",
  hidden: false,
};
const initialVcard: VCardData = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  organization: "",
  title: "",
  url: "",
};
const initialEmail: EmailData = { to: "", subject: "", body: "" };
const initialSms: SmsData = { phone: "", message: "" };

const DEFAULTS = {
  contentType: "url" as ContentType,
  textData: "",
  wifiData: { ...initialWifi },
  vcardData: { ...initialVcard },
  emailData: { ...initialEmail },
  phoneData: "",
  smsData: { ...initialSms },
  dotType: "rounded" as DotType,
  cornerSquareType: "rounded" as CornerSquareType,
  cornerDotType: "rounded" as CornerDotType,
  dotColor: "#000000",
  dotGradientEnabled: false,
  dotGradientType: "linear" as const,
  dotGradientColor1: "#000000",
  dotGradientColor2: "#4338ca",
  dotGradientRotation: 0,
  bgColor: "#FFFFFF",
  bgTransparent: false,
  cornerSquareColor: "#000000",
  cornerDotColor: "#000000",
  useCustomCornerColors: false,
  logoFile: null as File | null,
  logoDataUrl: null as string | null,
  logoError: null as string | null,
  logoSize: 0.4,
  logoMargin: 5,
  hideBackgroundDots: true,
  size: 1000,
  errorCorrection: "Q" as ErrorCorrectionLevel,
  downloadFormat: "png" as DownloadFormat,
};

export const useQrStore = create<QrState>((set) => ({
  ...DEFAULTS,

  setContentType: (t) => set({ contentType: t }),
  setTextData: (v) => set({ textData: v }),
  setWifiData: (v) => set((s) => ({ wifiData: { ...s.wifiData, ...v } })),
  setVcardData: (v) => set((s) => ({ vcardData: { ...s.vcardData, ...v } })),
  setEmailData: (v) => set((s) => ({ emailData: { ...s.emailData, ...v } })),
  setPhoneData: (v) => set({ phoneData: v }),
  setSmsData: (v) => set((s) => ({ smsData: { ...s.smsData, ...v } })),
  setDotType: (v) => set({ dotType: v }),
  setCornerSquareType: (v) => set({ cornerSquareType: v }),
  setCornerDotType: (v) => set({ cornerDotType: v }),
  setDotColor: (v) => set({ dotColor: v }),
  setDotGradientEnabled: (v) => set({ dotGradientEnabled: v }),
  setDotGradientType: (v) => set({ dotGradientType: v }),
  setDotGradientColor1: (v) => set({ dotGradientColor1: v }),
  setDotGradientColor2: (v) => set({ dotGradientColor2: v }),
  setDotGradientRotation: (v) => set({ dotGradientRotation: v }),
  setBgColor: (v) => set({ bgColor: v }),
  setBgTransparent: (v) => set({ bgTransparent: v }),
  setCornerSquareColor: (v) => set({ cornerSquareColor: v }),
  setCornerDotColor: (v) => set({ cornerDotColor: v }),
  setUseCustomCornerColors: (v) => set({ useCustomCornerColors: v }),
  setLogoFile: (f) => {
    if (!f) {
      set({ logoFile: null, logoDataUrl: null, logoError: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      if (dataUri.length > 700000) {
        set({
          logoFile: null,
          logoDataUrl: null,
          logoError: "Logo image is too large (max ~500 KB). Please use a smaller image.",
        });
        return;
      }
      set({ logoFile: f, logoDataUrl: dataUri, logoError: null });
    };
    reader.readAsDataURL(f);
  },
  setLogoSize: (v) => set({ logoSize: v }),
  setLogoMargin: (v) => set({ logoMargin: v }),
  setHideBackgroundDots: (v) => set({ hideBackgroundDots: v }),
  setSize: (v) => set({ size: v }),
  setErrorCorrection: (v) => set({ errorCorrection: v }),
  setDownloadFormat: (v) => set({ downloadFormat: v }),
  reset: () =>
    set({
      ...DEFAULTS,
      wifiData: { ...initialWifi },
      vcardData: { ...initialVcard },
      emailData: { ...initialEmail },
      smsData: { ...initialSms },
    }),
}));

/**
 * Encodes the current store state into the string payload for the QR code.
 */
export function encodeQrData(state: QrState): string {
  switch (state.contentType) {
    case "url":
    case "text":
      return state.textData;
    case "wifi": {
      const w = state.wifiData;
      return `WIFI:T:${w.encryption};S:${w.ssid};P:${w.password};H:${w.hidden};;`;
    }
    case "vcard": {
      const v = state.vcardData;
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${v.lastName};${v.firstName}`,
        `FN:${[v.firstName, v.lastName].filter(Boolean).join(" ")}`,
      ];
      if (v.phone) lines.push(`TEL:${v.phone}`);
      if (v.email) lines.push(`EMAIL:${v.email}`);
      if (v.organization) lines.push(`ORG:${v.organization}`);
      if (v.title) lines.push(`TITLE:${v.title}`);
      if (v.url) lines.push(`URL:${v.url}`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
    case "email": {
      const e = state.emailData;
      const params = [];
      if (e.subject) params.push(`subject=${encodeURIComponent(e.subject)}`);
      if (e.body) params.push(`body=${encodeURIComponent(e.body)}`);
      return `mailto:${e.to}${params.length ? `?${params.join("&")}` : ""}`;
    }
    case "phone":
      return `tel:${state.phoneData}`;
    case "sms": {
      const s = state.smsData;
      return `smsto:${s.phone}:${s.message}`;
    }
  }
}
