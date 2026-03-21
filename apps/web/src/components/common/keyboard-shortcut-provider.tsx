import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

/**
 * Wrapper that registers global keyboard shortcuts.
 * Must be rendered inside a <BrowserRouter> so that
 * useNavigate() works inside the hook.
 */
export function KeyboardShortcutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useKeyboardShortcuts();
  return <>{children}</>;
}
