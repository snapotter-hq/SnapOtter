---
description: "Helligkeit, Kontrast, Sättigung, Temperatur, Farbton und Kanäle anpassen sowie Farbeffekte anwenden."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 3e38e2150286
---

# Farben anpassen {#adjust-colors}

Umfassendes Werkzeug zur Farbanpassung, das Helligkeit, Kontrast, Belichtung, Sättigung, Temperatur, Tönung, Farbtonrotation, kanalweise Pegel und Ein-Klick-Effekte (Graustufen, Sepia, Invertieren) in einem einzigen Endpunkt vereint.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| brightness | number | Nein | `0` | Helligkeitsanpassung (-100 bis 100) |
| contrast | number | Nein | `0` | Kontrastanpassung (-100 bis 100) |
| exposure | number | Nein | `0` | Belichtung / Mittelton-Gamma (-100 bis 100) |
| saturation | number | Nein | `0` | Farbsättigung (-100 bis 100) |
| temperature | number | Nein | `0` | Weißabgleich: kühl/blau bis warm/orange (-100 bis 100) |
| tint | number | Nein | `0` | Tönungsverschiebung: grün bis magenta (-100 bis 100) |
| hue | number | Nein | `0` | Farbtonrotation in Grad (-180 bis 180) |
| sharpness | number | Nein | `0` | Schärfungsstärke (0 bis 100) |
| red | number | Nein | `100` | Pegel des Rotkanals (0 bis 200, 100 = unverändert) |
| green | number | Nein | `100` | Pegel des Grünkanals (0 bis 200, 100 = unverändert) |
| blue | number | Nein | `100` | Pegel des Blaukanals (0 bis 200, 100 = unverändert) |
| effect | string | Nein | `"none"` | Farbeffekt: `none`, `grayscale`, `sepia`, `invert` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Einen warmen Vintage-Look anwenden:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Hinweise {#notes}

- Alle Parameter haben neutrale Standardwerte, sodass Sie nur das anpassen können, was Sie benötigen.
- Die Anpassungen werden in dieser Reihenfolge angewendet: Helligkeit, Kontrast, Belichtung, Sättigung/Farbton, Temperatur/Tönung, Schärfe, Kanäle, Effekte.
- Die Temperatur verwendet eine 3x3-Farbrekombinationsmatrix auf den Achsen Blau-Orange und Grün-Magenta.
- Die Belichtung wird auf die Gamma-Funktion von Sharp abgebildet (positive Werte hellen Mitteltöne auf, negative verdunkeln sie).
- Dieser Endpunkt antwortet auch unter den Alt-Pfaden `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` und `/api/v1/tools/image/color-effects`. Alle verwenden dasselbe Schema.
- Das Ausgabeformat entspricht dem Eingabeformat. Eingaben in HEIC, RAW, PSD und SVG werden vor der Verarbeitung automatisch dekodiert.
