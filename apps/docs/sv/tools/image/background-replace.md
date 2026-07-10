---
description: "Ersätt en bilds bakgrund med en enfärgad färg eller gradient med hjälp av AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 75ab367fd65d
---

# Ersätt bakgrund {#background-replace}

Ersätt bakgrunden i en bild med en enfärgad färg eller gradient. AI-modellen identifierar motivet, tar bort den ursprungliga bakgrunden och komponerar motivet på den bakgrund du valt.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Tar emot multipart-formulärdata med en bildfil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| backgroundType | sträng | Nej | `"color"` | Bakgrundsläge: `color` eller `gradient` |
| color | sträng | Nej | `"#ffffff"` | Bakgrundsfärg i hex (när backgroundType är `color`) |
| gradientColor1 | sträng | Nej | - | Första gradientfärgen i hex |
| gradientColor2 | sträng | Nej | - | Andra gradientfärgen i hex |
| gradientAngle | heltal | Nej | `180` | Gradientvinkel i grader (0-360) |
| feather | heltal | Nej | `0` | Radie för kantutjämning (0-20) |
| format | sträng | Nej | `"png"` | Utdataformat: `png` eller `webp` |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Följ förloppet via SSE på `GET /api/v1/jobs/{jobId}/progress`. När jobbet är klart avger SSE-strömmen en `completed`-händelse med nedladdnings-URL:en.

## Anteckningar {#notes}

- Detta är ett AI-drivet verktyg som returnerar `202 Accepted` och bearbetar asynkront. Anslut till SSE-slutpunkten för att ta emot förloppsuppdateringar och slutresultatet.
- Kräver att funktionspaketet **background-removal** är installerat. Returnerar `501` om paketet inte är tillgängligt.
- HEIC-, RAW-, PSD- och SVG-indata avkodas automatiskt före bearbetning.
- Utdata är som standard PNG för att bevara transparens runt motivet.
