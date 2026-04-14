import {
  Contact,
  Download,
  Globe,
  ImagePlus,
  Mail,
  MessageSquare,
  Phone,
  Type,
  Wifi,
  X,
} from "lucide-react";
import QRCodeStyling from "qr-code-styling";
import { useCallback, useRef } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import {
  type ContentType,
  type CornerDotType,
  type CornerSquareType,
  type DotType,
  type DownloadFormat,
  encodeQrData,
  useQrStore,
} from "@/stores/qr-store";

// ── Content type tab definitions ─────────────────────────────────────

const CONTENT_TYPES: {
  id: ContentType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "url", label: "URL", icon: Globe },
  { id: "text", label: "Text", icon: Type },
  { id: "wifi", label: "WiFi", icon: Wifi },
  { id: "vcard", label: "vCard", icon: Contact },
  { id: "email", label: "Email", icon: Mail },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "sms", label: "SMS", icon: MessageSquare },
];

// ── Style option definitions ─────────────────────────────────────────

const DOT_TYPES: { value: DotType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
  { value: "classy-rounded", label: "Classy Rnd" },
  { value: "extra-rounded", label: "Extra Rnd" },
];

const CORNER_SQUARE_TYPES: { value: CornerSquareType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dot", label: "Dot" },
  { value: "extra-rounded", label: "Extra Rnd" },
];

const CORNER_DOT_TYPES: { value: CornerDotType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dot", label: "Dot" },
];

const DOWNLOAD_FORMATS: { value: DownloadFormat; label: string; desc: string }[] = [
  { value: "png", label: "PNG", desc: "Best for digital" },
  { value: "svg", label: "SVG", desc: "Best for print" },
  { value: "jpeg", label: "JPEG", desc: "Smaller file" },
  { value: "webp", label: "WebP", desc: "Modern format" },
];

// ── Data entry forms per content type ────────────────────────────────

const INPUT_CLASS =
  "w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground";
const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`;

function UrlForm() {
  const { textData, setTextData } = useQrStore();
  return (
    <div>
      <label htmlFor="qr-url" className="text-xs text-muted-foreground">
        URL
      </label>
      <input
        id="qr-url"
        type="url"
        value={textData}
        onChange={(e) => setTextData(e.target.value)}
        placeholder="https://example.com"
        className={INPUT_CLASS}
        data-testid="qr-input-url"
      />
    </div>
  );
}

function TextForm() {
  const { textData, setTextData } = useQrStore();
  return (
    <div>
      <label htmlFor="qr-text" className="text-xs text-muted-foreground">
        Text
      </label>
      <textarea
        id="qr-text"
        value={textData}
        onChange={(e) => setTextData(e.target.value)}
        placeholder="Enter any text..."
        rows={3}
        className={TEXTAREA_CLASS}
        data-testid="qr-input-text"
      />
    </div>
  );
}

function WifiForm() {
  const { wifiData, setWifiData } = useQrStore();
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="qr-wifi-ssid" className="text-xs text-muted-foreground">
          Network Name (SSID)
        </label>
        <input
          id="qr-wifi-ssid"
          type="text"
          value={wifiData.ssid}
          onChange={(e) => setWifiData({ ssid: e.target.value })}
          placeholder="MyNetwork"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="qr-wifi-password" className="text-xs text-muted-foreground">
          Password
        </label>
        <input
          id="qr-wifi-password"
          type="text"
          value={wifiData.password}
          onChange={(e) => setWifiData({ password: e.target.value })}
          placeholder="Password"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="qr-wifi-encryption" className="text-xs text-muted-foreground">
          Encryption
        </label>
        <select
          id="qr-wifi-encryption"
          value={wifiData.encryption}
          onChange={(e) => setWifiData({ encryption: e.target.value as "WPA" | "WEP" | "nopass" })}
          className={INPUT_CLASS}
        >
          <option value="WPA">WPA / WPA2</option>
          <option value="WEP">WEP</option>
          <option value="nopass">None</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={wifiData.hidden}
          onChange={(e) => setWifiData({ hidden: e.target.checked })}
          className="rounded border-border"
        />
        Hidden network
      </label>
    </div>
  );
}

function VCardForm() {
  const { vcardData, setVcardData } = useQrStore();
  const field = (label: string, key: keyof typeof vcardData, placeholder: string) => (
    <div key={key}>
      <label htmlFor={`qr-vcard-${key}`} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={`qr-vcard-${key}`}
        type="text"
        value={vcardData[key]}
        onChange={(e) => setVcardData({ [key]: e.target.value })}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">{field("First Name", "firstName", "John")}</div>
        <div className="flex-1">{field("Last Name", "lastName", "Doe")}</div>
      </div>
      {field("Phone", "phone", "+1 234 567 890")}
      {field("Email", "email", "john@example.com")}
      {field("Organization", "organization", "Company")}
      {field("Job Title", "title", "Developer")}
      {field("Website", "url", "https://example.com")}
    </div>
  );
}

function EmailForm() {
  const { emailData, setEmailData } = useQrStore();
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="qr-email-to" className="text-xs text-muted-foreground">
          To
        </label>
        <input
          id="qr-email-to"
          type="email"
          value={emailData.to}
          onChange={(e) => setEmailData({ to: e.target.value })}
          placeholder="recipient@example.com"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="qr-email-subject" className="text-xs text-muted-foreground">
          Subject
        </label>
        <input
          id="qr-email-subject"
          type="text"
          value={emailData.subject}
          onChange={(e) => setEmailData({ subject: e.target.value })}
          placeholder="Subject line"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="qr-email-body" className="text-xs text-muted-foreground">
          Body
        </label>
        <textarea
          id="qr-email-body"
          value={emailData.body}
          onChange={(e) => setEmailData({ body: e.target.value })}
          placeholder="Email body..."
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  );
}

function PhoneForm() {
  const { phoneData, setPhoneData } = useQrStore();
  return (
    <div>
      <label htmlFor="qr-phone" className="text-xs text-muted-foreground">
        Phone Number
      </label>
      <input
        id="qr-phone"
        type="tel"
        value={phoneData}
        onChange={(e) => setPhoneData(e.target.value)}
        placeholder="+1 234 567 890"
        className={INPUT_CLASS}
      />
    </div>
  );
}

function SmsForm() {
  const { smsData, setSmsData } = useQrStore();
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="qr-sms-phone" className="text-xs text-muted-foreground">
          Phone Number
        </label>
        <input
          id="qr-sms-phone"
          type="tel"
          value={smsData.phone}
          onChange={(e) => setSmsData({ phone: e.target.value })}
          placeholder="+1 234 567 890"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="qr-sms-message" className="text-xs text-muted-foreground">
          Message
        </label>
        <textarea
          id="qr-sms-message"
          value={smsData.message}
          onChange={(e) => setSmsData({ message: e.target.value })}
          placeholder="Your message..."
          rows={2}
          className={TEXTAREA_CLASS}
        />
      </div>
    </div>
  );
}

const FORM_MAP: Record<ContentType, React.ComponentType> = {
  url: UrlForm,
  text: TextForm,
  wifi: WifiForm,
  vcard: VCardForm,
  email: EmailForm,
  phone: PhoneForm,
  sms: SmsForm,
};

// ── Pill button helpers ──────────────────────────────────────────────

function PillButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[10px] py-1.5 rounded transition-colors ${
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ── Main settings component ──────────────────────────────────────────

export function QrGenerateSettings() {
  const store = useQrStore();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const hasData = !!encodeQrData(store);

  const handleDownload = useCallback(() => {
    const data = encodeQrData(store);
    if (!data) return;

    const qr = new QRCodeStyling({
      width: store.size,
      height: store.size,
      data,
      margin: 8,
      qrOptions: { errorCorrectionLevel: store.errorCorrection },
      dotsOptions: {
        type: store.dotType,
        ...(store.dotGradientEnabled
          ? {
              gradient: {
                type: store.dotGradientType,
                rotation: store.dotGradientRotation * (Math.PI / 180),
                colorStops: [
                  { offset: 0, color: store.dotGradientColor1 },
                  { offset: 1, color: store.dotGradientColor2 },
                ],
              },
            }
          : { color: store.dotColor }),
      },
      cornersSquareOptions: {
        type: store.cornerSquareType,
        color: store.useCustomCornerColors ? store.cornerSquareColor : undefined,
      },
      cornersDotOptions: {
        type: store.cornerDotType,
        color: store.useCustomCornerColors ? store.cornerDotColor : undefined,
      },
      backgroundOptions: store.bgTransparent ? { color: "transparent" } : { color: store.bgColor },
      ...(store.logoDataUrl
        ? {
            image: store.logoDataUrl,
            imageOptions: {
              hideBackgroundDots: store.hideBackgroundDots,
              imageSize: store.logoSize,
              margin: store.logoMargin,
              crossOrigin: "anonymous" as const,
            },
          }
        : {}),
    } as never);

    qr.download({
      name: "qrcode",
      extension: store.downloadFormat,
    });
  }, [store]);

  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      store.setLogoFile(file ?? null);
    },
    [store],
  );

  const ContentForm = FORM_MAP[store.contentType];

  return (
    <div className="space-y-4">
      {/* ── Content type tabs ── */}
      <div className="flex flex-wrap gap-1">
        {CONTENT_TYPES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => store.setContentType(id)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              store.contentType === id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Data entry form ── */}
      <ContentForm />

      {/* ── Style section ── */}
      <CollapsibleSection title="Style" defaultOpen>
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground mb-1.5 block">Dot Pattern</span>
            <div className="grid grid-cols-3 gap-1.5">
              {DOT_TYPES.map(({ value, label }) => (
                <PillButton
                  key={value}
                  selected={store.dotType === value}
                  onClick={() => store.setDotType(value)}
                >
                  {label}
                </PillButton>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mb-1.5 block">Corner Square</span>
            <div className="grid grid-cols-2 gap-1.5">
              {CORNER_SQUARE_TYPES.map(({ value, label }) => (
                <PillButton
                  key={value}
                  selected={store.cornerSquareType === value}
                  onClick={() => store.setCornerSquareType(value)}
                >
                  {label}
                </PillButton>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mb-1.5 block">Corner Dot</span>
            <div className="grid grid-cols-3 gap-1.5">
              {CORNER_DOT_TYPES.map(({ value, label }) => (
                <PillButton
                  key={value}
                  selected={store.cornerDotType === value}
                  onClick={() => store.setCornerDotType(value)}
                >
                  {label}
                </PillButton>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Colors section ── */}
      <CollapsibleSection title="Colors">
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground">Dot Color</span>
            <div className="flex items-center gap-2 mt-0.5">
              <input
                type="color"
                value={store.dotColor}
                onChange={(e) => store.setDotColor(e.target.value)}
                className="w-8 h-8 rounded border border-border shrink-0"
                disabled={store.dotGradientEnabled}
              />
              <input
                type="text"
                value={store.dotColor}
                onChange={(e) => store.setDotColor(e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
                disabled={store.dotGradientEnabled}
              />
            </div>
          </div>

          {/* Gradient toggle */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={store.dotGradientEnabled}
              onChange={(e) => store.setDotGradientEnabled(e.target.checked)}
              className="rounded border-border"
            />
            Use gradient
          </label>

          {store.dotGradientEnabled && (
            <div className="space-y-2 pl-2 border-l-2 border-primary/20 ml-1">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="qr-gradient-from" className="text-[10px] text-muted-foreground">
                    From
                  </label>
                  <input
                    id="qr-gradient-from"
                    type="color"
                    value={store.dotGradientColor1}
                    onChange={(e) => store.setDotGradientColor1(e.target.value)}
                    className="w-full h-7 rounded border border-border"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="qr-gradient-to" className="text-[10px] text-muted-foreground">
                    To
                  </label>
                  <input
                    id="qr-gradient-to"
                    type="color"
                    value={store.dotGradientColor2}
                    onChange={(e) => store.setDotGradientColor2(e.target.value)}
                    className="w-full h-7 rounded border border-border"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <PillButton
                  selected={store.dotGradientType === "linear"}
                  onClick={() => store.setDotGradientType("linear")}
                >
                  Linear
                </PillButton>
                <PillButton
                  selected={store.dotGradientType === "radial"}
                  onClick={() => store.setDotGradientType("radial")}
                >
                  Radial
                </PillButton>
              </div>
              {store.dotGradientType === "linear" && (
                <div>
                  <div className="flex justify-between items-center">
                    <label
                      htmlFor="qr-gradient-rotation"
                      className="text-[10px] text-muted-foreground"
                    >
                      Rotation
                    </label>
                    <span className="text-[10px] font-mono text-foreground">
                      {store.dotGradientRotation}&deg;
                    </span>
                  </div>
                  <input
                    id="qr-gradient-rotation"
                    type="range"
                    min={0}
                    max={360}
                    step={15}
                    value={store.dotGradientRotation}
                    onChange={(e) => store.setDotGradientRotation(Number(e.target.value))}
                    className="w-full mt-0.5"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Background</span>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={store.bgTransparent}
                  onChange={(e) => store.setBgTransparent(e.target.checked)}
                  className="rounded border-border"
                />
                Transparent
              </label>
            </div>
            {!store.bgTransparent && (
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="color"
                  value={store.bgColor}
                  onChange={(e) => store.setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border shrink-0"
                />
                <input
                  type="text"
                  value={store.bgColor}
                  onChange={(e) => store.setBgColor(e.target.value)}
                  className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground font-mono"
                />
              </div>
            )}
          </div>

          {/* Custom corner colors */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={store.useCustomCornerColors}
              onChange={(e) => store.setUseCustomCornerColors(e.target.checked)}
              className="rounded border-border"
            />
            Custom corner colors
          </label>

          {store.useCustomCornerColors && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label
                  htmlFor="qr-corner-square-color"
                  className="text-[10px] text-muted-foreground"
                >
                  Corner Square
                </label>
                <input
                  id="qr-corner-square-color"
                  type="color"
                  value={store.cornerSquareColor}
                  onChange={(e) => store.setCornerSquareColor(e.target.value)}
                  className="w-full h-7 rounded border border-border"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="qr-corner-dot-color" className="text-[10px] text-muted-foreground">
                  Corner Dot
                </label>
                <input
                  id="qr-corner-dot-color"
                  type="color"
                  value={store.cornerDotColor}
                  onChange={(e) => store.setCornerDotColor(e.target.value)}
                  className="w-full h-7 rounded border border-border"
                />
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Logo section ── */}
      <CollapsibleSection title="Logo">
        <div className="space-y-3">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
          {store.logoDataUrl ? (
            <div className="flex items-center gap-2">
              <img
                src={store.logoDataUrl}
                alt="Logo"
                className="w-10 h-10 rounded border border-border object-contain"
              />
              <span className="flex-1 text-xs text-foreground truncate">
                {store.logoFile?.name}
              </span>
              <button
                type="button"
                onClick={() => store.setLogoFile(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="w-full py-3 rounded-lg border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center justify-center gap-2"
            >
              <ImagePlus className="h-4 w-4" />
              Add logo image
            </button>
          )}

          {store.logoDataUrl && (
            <>
              <div>
                <div className="flex justify-between items-center">
                  <label htmlFor="qr-logo-size" className="text-xs text-muted-foreground">
                    Logo Size
                  </label>
                  <span className="text-xs font-mono text-foreground">
                    {Math.round(store.logoSize * 100)}%
                  </span>
                </div>
                <input
                  id="qr-logo-size"
                  type="range"
                  min={0.1}
                  max={0.5}
                  step={0.05}
                  value={store.logoSize}
                  onChange={(e) => store.setLogoSize(Number(e.target.value))}
                  className="w-full mt-0.5"
                />
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label htmlFor="qr-logo-margin" className="text-xs text-muted-foreground">
                    Logo Margin
                  </label>
                  <span className="text-xs font-mono text-foreground">{store.logoMargin}px</span>
                </div>
                <input
                  id="qr-logo-margin"
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={store.logoMargin}
                  onChange={(e) => store.setLogoMargin(Number(e.target.value))}
                  className="w-full mt-0.5"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={store.hideBackgroundDots}
                  onChange={(e) => store.setHideBackgroundDots(e.target.checked)}
                  className="rounded border-border"
                />
                Clean area behind logo
              </label>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Download section ── */}
      <CollapsibleSection title="Download" defaultOpen>
        <div className="space-y-3">
          <div>
            <span className="text-xs text-muted-foreground mb-1.5 block">Format</span>
            <div className="grid grid-cols-2 gap-1.5">
              {DOWNLOAD_FORMATS.map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => store.setDownloadFormat(value)}
                  className={`text-left px-2 py-1.5 rounded transition-colors ${
                    store.downloadFormat === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-medium">{label}</span>
                  <span
                    className={`block text-[10px] ${
                      store.downloadFormat === value
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <label htmlFor="qr-size" className="text-xs text-muted-foreground">
                Size
              </label>
              <span className="text-xs font-mono text-foreground">{store.size}px</span>
            </div>
            <input
              id="qr-size"
              type="range"
              min={200}
              max={2000}
              step={100}
              value={store.size}
              onChange={(e) => store.setSize(Number(e.target.value))}
              className="w-full mt-0.5"
            />
          </div>

          <div>
            <label htmlFor="qr-error-correction" className="text-xs text-muted-foreground">
              Error Correction
            </label>
            <select
              id="qr-error-correction"
              value={store.errorCorrection}
              onChange={(e) => store.setErrorCorrection(e.target.value as "L" | "M" | "Q" | "H")}
              className={INPUT_CLASS}
            >
              <option value="L">Low (7%) - Max density</option>
              <option value="M">Medium (15%) - General use</option>
              <option value="Q">Quartile (25%) - With small logo</option>
              <option value="H">High (30%) - With large logo</option>
            </select>
          </div>

          <button
            type="button"
            data-testid="qr-generate-download"
            onClick={handleDownload}
            disabled={!hasData}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download QR Code
          </button>
        </div>
      </CollapsibleSection>
    </div>
  );
}
