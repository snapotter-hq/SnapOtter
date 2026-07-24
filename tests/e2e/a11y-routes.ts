export interface A11yAuditPage {
  key: string;
  path: string;
  needsAuth: boolean;
  locale?: "ar";
  openSettings?: boolean;
}

export const DESKTOP_A11Y_PAGES: Record<"en" | "ar", A11yAuditPage[]> = {
  en: [
    { key: "home-en", path: "/", needsAuth: true },
    { key: "settings-en", path: "/", needsAuth: true, openSettings: true },
    { key: "automate-en", path: "/automate", needsAuth: true },
    { key: "files-en", path: "/files", needsAuth: true },
    { key: "privacy-en", path: "/privacy", needsAuth: true },
    { key: "change-password-en", path: "/change-password", needsAuth: true },
    { key: "not-found-en", path: "/__a11y-not-found", needsAuth: true },
    { key: "image-resize-en", path: "/image/resize", needsAuth: true },
    { key: "video-convert-en", path: "/video/convert-video", needsAuth: true },
    { key: "audio-convert-en", path: "/audio/convert-audio", needsAuth: true },
    { key: "pdf-pdf-to-image-en", path: "/pdf/pdf-to-image", needsAuth: true },
    { key: "files-csv-excel-en", path: "/files/csv-excel", needsAuth: true },
    { key: "editor-en", path: "/editor", needsAuth: true },
    { key: "login-en", path: "/login", needsAuth: false },
  ],
  ar: [
    { key: "home-ar", path: "/", needsAuth: true, locale: "ar" },
    { key: "settings-ar", path: "/", needsAuth: true, locale: "ar", openSettings: true },
    { key: "automate-ar", path: "/automate", needsAuth: true, locale: "ar" },
    { key: "files-ar", path: "/files", needsAuth: true, locale: "ar" },
    { key: "privacy-ar", path: "/privacy", needsAuth: true, locale: "ar" },
    { key: "change-password-ar", path: "/change-password", needsAuth: true, locale: "ar" },
    { key: "not-found-ar", path: "/__a11y-not-found", needsAuth: true, locale: "ar" },
    { key: "image-resize-ar", path: "/image/resize", needsAuth: true, locale: "ar" },
    { key: "editor-ar", path: "/editor", needsAuth: true, locale: "ar" },
    { key: "login-ar", path: "/login", needsAuth: false, locale: "ar" },
  ],
};

export const MOBILE_A11Y_PAGES: Record<"en" | "ar", A11yAuditPage[]> = {
  en: [
    { key: "mobile-home-en", path: "/", needsAuth: true },
    { key: "mobile-settings-en", path: "/", needsAuth: true, openSettings: true },
    { key: "mobile-automate-en", path: "/automate", needsAuth: true },
    { key: "mobile-files-en", path: "/files", needsAuth: true },
    { key: "mobile-privacy-en", path: "/privacy", needsAuth: true },
    { key: "mobile-change-password-en", path: "/change-password", needsAuth: true },
    { key: "mobile-not-found-en", path: "/__a11y-not-found", needsAuth: true },
    { key: "mobile-image-resize-en", path: "/image/resize", needsAuth: true },
    { key: "mobile-video-convert-en", path: "/video/convert-video", needsAuth: true },
    { key: "mobile-audio-convert-en", path: "/audio/convert-audio", needsAuth: true },
    { key: "mobile-pdf-pdf-to-image-en", path: "/pdf/pdf-to-image", needsAuth: true },
    { key: "mobile-files-csv-excel-en", path: "/files/csv-excel", needsAuth: true },
    { key: "mobile-editor-en", path: "/editor", needsAuth: true },
    { key: "mobile-login-en", path: "/login", needsAuth: false },
  ],
  ar: [
    { key: "mobile-home-ar", path: "/", needsAuth: true, locale: "ar" },
    {
      key: "mobile-settings-ar",
      path: "/",
      needsAuth: true,
      locale: "ar",
      openSettings: true,
    },
    { key: "mobile-automate-ar", path: "/automate", needsAuth: true, locale: "ar" },
    { key: "mobile-files-ar", path: "/files", needsAuth: true, locale: "ar" },
    { key: "mobile-privacy-ar", path: "/privacy", needsAuth: true, locale: "ar" },
    {
      key: "mobile-change-password-ar",
      path: "/change-password",
      needsAuth: true,
      locale: "ar",
    },
    {
      key: "mobile-not-found-ar",
      path: "/__a11y-not-found",
      needsAuth: true,
      locale: "ar",
    },
    { key: "mobile-image-resize-ar", path: "/image/resize", needsAuth: true, locale: "ar" },
    { key: "mobile-login-ar", path: "/login", needsAuth: false, locale: "ar" },
  ],
};
