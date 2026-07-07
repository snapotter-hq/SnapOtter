// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderNav(onSettingsClick?: () => void) {
  return render(
    <MemoryRouter>
      <MobileBottomNav onSettingsClick={onSettingsClick} />
    </MemoryRouter>,
  );
}

describe("MobileBottomNav", () => {
  it("renders all navigation items", () => {
    renderNav(() => {});

    // Navigation links (i18n keys render their English values)
    expect(screen.getByText("Tools")).toBeDefined();
    expect(screen.getByText("Automate")).toBeDefined();
    expect(screen.getByText("Editor")).toBeDefined();
    expect(screen.getByText("Files")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("renders as a nav element with fixed positioning", () => {
    renderNav(() => {});

    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav!.className).toContain("fixed");
    expect(nav!.className).toContain("bottom-0");
  });

  it("navigation links have correct href targets", () => {
    renderNav(() => {});

    const links = document.querySelectorAll("a");
    const hrefs = Array.from(links).map((a) => a.getAttribute("href"));

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/automate");
    expect(hrefs).toContain("/editor");
    expect(hrefs).toContain("/files");
  });

  it("settings button calls onSettingsClick when clicked", () => {
    const onClick = vi.fn();
    renderNav(onClick);

    const settingsBtn = screen.getByText("Settings");
    fireEvent.click(settingsBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("settings button is hidden when onSettingsClick is not provided", () => {
    renderNav();

    // Without onSettingsClick, the settings button should not render
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("renders an svg icon for each navigation item", () => {
    renderNav(() => {});

    // All five items (Tools, Automate, Editor, Files, Settings) render inline
    // SVG icons. The Editor icon used to be a CSS-masked <span> that rendered
    // as nothing when its mask asset failed to load; it is now an inline SVG
    // like the rest, so it always draws.
    const svgs = document.querySelectorAll("nav svg");
    expect(svgs.length).toBe(5);

    const editorLink = Array.from(document.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/editor",
    );
    expect(editorLink?.querySelector("svg")).not.toBeNull();
  });

  it("nav has backdrop blur and border-top styling", () => {
    renderNav(() => {});

    const nav = document.querySelector("nav") as HTMLElement;
    expect(nav).not.toBeNull();
    // The component applies bg-background/95 backdrop-blur-sm border-t
    expect(nav.className).toContain("backdrop-blur");
    expect(nav.className).toContain("border-t");
    expect(nav.className).toContain("z-30");
  });
});
