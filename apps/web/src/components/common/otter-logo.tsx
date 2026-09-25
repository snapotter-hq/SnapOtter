import { appUrl } from "@/lib/app-url";
export function OtterLogo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <img
      src={appUrl("/logo.png")}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ imageRendering: "auto" }}
    />
  );
}
