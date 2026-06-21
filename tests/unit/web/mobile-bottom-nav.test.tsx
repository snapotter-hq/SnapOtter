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

  it("renders icons for each navigation item", () => {
    renderNav(() => {});

    // 4 items use lucide SVG icons (Tools, Automate, Files, Settings)
    // Editor uses ImageEditIcon which is a CSS-masked <span>, not SVG
    const svgs = document.querySelectorAll("nav svg");
    expect(svgs.length).toBe(4);

    // The Editor icon is a span with a mask-image
    const spans = document.querySelectorAll("nav span");
    const maskedSpan = Array.from(spans).find((s) => (s as HTMLElement).style.maskImage !== "");
    expect(maskedSpan).toBeDefined();
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
