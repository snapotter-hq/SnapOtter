// Paths where AuthGuard (App.tsx) renders its children without applying
// auth checks. Anything mounted globally inside AuthGuard's children (e.g.
// UsageSurveyOverlay) must treat these routes as ineligible for logic that
// assumes normal auth state, since sessions here may be mid-login,
// mid-password-change, or otherwise restricted.
export const AUTH_GUARD_UNGATED_PATHS = new Set(["/login", "/change-password", "/privacy"]);
