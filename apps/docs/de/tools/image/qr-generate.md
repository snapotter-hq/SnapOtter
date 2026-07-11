---
description: "Generiere QR-Codes mit eigenen Farben und Fehlerkorrekturstufen."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 1a4049bb6caa
---

# QR-Code-Generator {#qr-code-generator}

Generiere QR-Code-Bilder aus Text oder URLs mit konfigurierbarer Größe, Fehlerkorrekturstufe und eigenen Vorder- und Hintergrundfarben.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Akzeptiert einen **JSON-Body** (nicht multipart). Kein Datei-Upload nötig.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Im QR-Code zu kodierender Inhalt (1 bis 2000 Zeichen) |
| size | number | Nein | `400` | Breite/Höhe des Ausgabebildes in Pixeln (100 bis 10000) |
| errorCorrection | string | Nein | `"M"` | Fehlerkorrekturstufe: `L` (7 %), `M` (15 %), `Q` (25 %), `H` (30 %) |
| foreground | string | Nein | `"#000000"` | Vordergrund-/Modulfarbe des QR-Codes als Hex (`#RRGGBB`) |
| background | string | Nein | `"#FFFFFF"` | Hintergrundfarbe des QR-Codes als Hex (`#RRGGBB`) |
| logoDataUri | string | Nein | - | Logo-Bild als Data-URI (`data:image/png;base64,...` oder `data:image/jpeg;base64,...`, maximal 700 KB). Zentriert auf dem QR-Code bei 22 % der QR-Größe. Erzwingt die Fehlerkorrektur `H` |

### Fehlerkorrekturstufen {#error-correction-levels}

| Stufe | Wiederherstellung | Anwendungsfall |
|-------|----------|----------|
| `L` | ~7 % | Maximale Datendichte |
| `M` | ~15 % | Ausgewogen (Standard) |
| `Q` | ~25 % | Gut für gedruckte Codes |
| `H` | ~30 % | Am besten für Codes mit überlagertem Logo |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Gebrandeter QR-Code mit eigenen Farben:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Hinweise {#notes}

- Dieser Endpunkt akzeptiert JSON, nicht Multipart-Formulardaten, da kein Bild-Upload nötig ist.
- Die Ausgabe ist immer ein PNG-Bild.
- Der Ausgabedateiname ist immer `qrcode.png`.
- `originalSize` ist immer 0, da dieses Werkzeug Bilder von Grund auf generiert.
- Um den QR-Code herum ist eine 2 Module breite Ruhezone (Rand) enthalten.
- Die maximale Textlänge beträgt 2000 Zeichen. Die tatsächliche Kapazität hängt von der Fehlerkorrekturstufe und der Zeichenkodierung ab.
- Höhere Fehlerkorrekturstufen ermöglichen, dass der QR-Code auch bei teilweiser Verdeckung scanbar bleibt, verringern jedoch die Datenkapazität.
- Wenn ein `logoDataUri` angegeben ist, wird die Fehlerkorrektur automatisch auf `H` (30 %) erzwungen, damit der QR-Code trotz des mittig verdeckenden Logos scanbar bleibt.
