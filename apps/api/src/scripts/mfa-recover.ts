import { pathToFileURL } from "node:url";
import { runRecoveryMain } from "./admin-recovery.js";

export {
  type CreateAdminResult,
  createAdminUser,
  type DisableMfaResult,
  disableUserMfa,
  generateRecoveryPassword,
  mfaStatus,
  type ResetPasswordResult,
  resetMfaPolicy,
  resetUserPassword,
  runRecoveryCli,
  runRecoveryMain,
  type UnlockUserResult,
  unlockUser,
} from "./admin-recovery.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runRecoveryMain(process.argv.slice(2));
}
