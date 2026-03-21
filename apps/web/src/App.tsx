import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/home-page";
import { LoginPage } from "./pages/login-page";
import { ToolPage } from "./pages/tool-page";
import { AutomatePage } from "./pages/automate-page";
import { FullscreenGridPage } from "./pages/fullscreen-grid-page";
import { KeyboardShortcutProvider } from "./components/common/keyboard-shortcut-provider";

export function App() {
  return (
    <BrowserRouter>
      <KeyboardShortcutProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/automate" element={<AutomatePage />} />
          <Route path="/fullscreen" element={<FullscreenGridPage />} />
          <Route path="/:toolId" element={<ToolPage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </KeyboardShortcutProvider>
    </BrowserRouter>
  );
}
