import {
  ENTERPRISE_FEATURES,
  type EnterpriseFeature,
  type LicensePayload,
  validateLicense,
} from "./license.js";

let activeLicense: LicensePayload | null = null;

export function initEnterprise(licenseKey: string | undefined): {
  valid: boolean;
  license: LicensePayload | null;
} {
  if (!licenseKey) {
    return { valid: false, license: null };
  }
  activeLicense = validateLicense(licenseKey);
  return { valid: activeLicense !== null, license: activeLicense };
}

export function isFeatureEnabled(feature: EnterpriseFeature): boolean {
  if (!activeLicense) return false;
  return activeLicense.features.includes(feature);
}

export function getActiveLicense(): LicensePayload | null {
  return activeLicense;
}

export type S3StorageModule = typeof import("./storage-s3.js");
export async function loadS3Storage(): Promise<S3StorageModule> {
  return import("./storage-s3.js");
}
export { ENTERPRISE_FEATURES, type EnterpriseFeature, type LicensePayload };
