---
description: "Generera QR-koder med egna färger och nivåer för felkorrigering."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 5e88ce0b834f
---

# QR-kodgenerator {#qr-code-generator}

Generera QR-kodbilder från text eller URL:er med konfigurerbar storlek, felkorrigeringsnivå och egna för- och bakgrundsfärger.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Tar emot en **JSON-kropp** (inte multipart). Ingen filuppladdning behövs.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Innehåll att koda i QR-koden (1 till 2000 tecken) |
| size | number | Nej | `400` | Utdatabildens bredd/höjd i pixlar (100 till 10000) |
| errorCorrection | string | Nej | `"M"` | Felkorrigeringsnivå: `L` (7 %), `M` (15 %), `Q` (25 %), `H` (30 %) |
| foreground | string | Nej | `"#000000"` | QR-kodens för-/modulfärg i hex (`#RRGGBB`) |
| background | string | Nej | `"#FFFFFF"` | QR-kodens bakgrundsfärg i hex (`#RRGGBB`) |
| logoDataUri | string | Nej | - | Logotypbild som en data-URI (`data:image/png;base64,...` eller `data:image/jpeg;base64,...`, max 700 KB). Centreras på QR-koden vid 22 % av QR-storleken. Tvingar felkorrigering till `H` |

### Felkorrigeringsnivåer {#error-correction-levels}

| Nivå | Återställning | Användningsfall |
|-------|----------|----------|
| `L` | ~7 % | Maximal datatäthet |
| `M` | ~15 % | Balanserad (standard) |
| `Q` | ~25 % | Bra för utskrivna koder |
| `H` | ~30 % | Bäst för koder med logotypöverlägg |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Varumärkt QR-kod med egna färger:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Anteckningar {#notes}

- Denna slutpunkt tar emot JSON, inte multipart-formulärdata, eftersom ingen bilduppladdning behövs.
- Utdata är alltid en PNG-bild.
- Utdatafilnamnet är alltid `qrcode.png`.
- `originalSize` är alltid 0 eftersom detta verktyg genererar bilder från grunden.
- En tyst zon (marginal) på 2 moduler inkluderas runt QR-koden.
- Maximal textlängd är 2000 tecken. Faktisk kapacitet beror på felkorrigeringsnivå och teckenkodning.
- Högre felkorrigeringsnivåer gör att QR-koden förblir skanningsbar även om den är delvis skymd, men minskar datakapaciteten.
- När en `logoDataUri` anges tvingas felkorrigeringen automatiskt till `H` (30 %) så att QR-koden förblir skanningsbar trots att logotypen skymmer mitten.
