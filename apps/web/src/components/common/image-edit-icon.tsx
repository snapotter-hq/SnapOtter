/**
 * Image-editor glyph for the mobile bottom nav: a framed photo with an editing
 * pencil. Rendered as an inline SVG (like the sibling Lucide nav icons) so it
 * has no external-asset dependency. It previously used a CSS mask over
 * /edit-image.png, which rendered as nothing whenever that asset failed to load
 * (e.g. it was missing from the demo build), leaving the icon invisible.
 */
export function ImageEditIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <circle cx="7.5" cy="8" r="1.6" />
      <path d="M3.5 15.5 6.5 12.5 9 15 12 12" />
      <g transform="translate(10.8 8.2) scale(0.62)">
        <path
          vectorEffect="non-scaling-stroke"
          d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
        />
        <path vectorEffect="non-scaling-stroke" d="m15 5 4 4" />
      </g>
    </svg>
  );
}
