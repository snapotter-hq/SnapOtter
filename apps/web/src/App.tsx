import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/home-page";
import { LoginPage } from "./pages/login-page";
import { ToolPage } from "./pages/tool-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/:toolId" element={<ToolPage />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
