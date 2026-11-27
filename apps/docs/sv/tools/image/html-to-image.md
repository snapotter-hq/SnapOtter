---
description: "Fånga webbsidor eller HTML-utdrag som högkvalitativa bilder med enhetsemulering."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 38ecfe192391
i18n_hash_version: 2
---

# HTML till bild {#html-to-image}

Fånga en webbsides-URL eller rått HTML-innehåll som en skärmbild. Stöder enhetsemulering (skrivbord, surfplatta, mobil), helsidefångst och flera utdataformat.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Tar emot en **JSON-kropp** (inte multipart). Ingen filuppladdning behövs.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| url | string | Villkorlig | - | URL att fånga (måste vara en giltig URL) |
| html | string | Villkorlig | - | Rått HTML-innehåll att rendera (1 till 5 000 000 tecken) |
| format | string | Nej | `"png"` | Utdataformat: `jpg`, `png`, `webp` |
| quality | number | Nej | `90` | Utdatakvalitet för förlustbehäftade format (1 till 100) |
| fullPage | boolean | Nej | `false` | Fånga hela den rullbara sidan, inte bara vyn |
| devicePreset | string | Nej | `"desktop"` | Enhetsemulering: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Nej | `1280` | Anpassad vybredd i pixlar (320 till 3840, används när devicePreset är `custom`) |
| viewportHeight | number | Nej | `720` | Anpassad vyhöjd i pixlar (320 till 2160, används när devicePreset är `custom`) |
| clientJobId | string | Nej | - | Ditt eget jobb-ID, så att du kan öppna förloppsströmmen innan svaret kommer |

Antingen `url` eller `html` måste anges, men inte båda.

### Enhetsförinställningar {#device-presets}

| Förinställning | Bredd | Höjd | Mobil UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Nej |
| `tablet` | 768 | 1024 | Nej |
| `mobile` | 375 | 812 | Ja |
| `custom` | (användarangiven) | (användarangiven) | Nej |

## Exempelbegäran {#example-request}

Fånga en webbsida:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Rendera HTML-innehåll:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Långsamma sidor {#slow-pages}

Fångsten körs som ett köat jobb. En fångst som blir klar inom det synkrona väntefönstret svarar `200` med resultatet ovan. En långsammare svarar `202` med ett jobb-ID:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Följ `progressUrl` (Server-Sent Events) tills jobbet är klart. Händelsen för slutfört jobb innehåller samma resultatobjekt som svaret `200`. Du kan avbryta jobbet med `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Ändrat efter 2.3.0
Till och med 2.3.0 höll den här slutpunkten alltid begäran öppen tills fångsten var klar och svarade `200`. Skript som bara hanterar `200` bör också hantera `202`.
:::

## Anmärkningar {#notes}

- Kräver att Chromium är installerat på servern. Returnerar HTTP 503 om webbläsartjänsten inte är tillgänglig.
- URL:er valideras mot SSRF-attacker (privata/interna nätverksadresser blockeras).
- Denna slutpunkt är hastighetsbegränsad till 120 begäranden per timme.
- `originalSize` är alltid 0 eftersom detta verktyg genererar bilder från URL:er/HTML.
- Utdatafilnamnet är `screenshot.<format>`.
- Om sidan tar för lång tid att ladda misslyckas fångsten med HTTP 504 (gateway-timeout).
- Om webbläsartjänsten kraschar upprepade gånger inaktiveras den tillfälligt och fångsten misslyckas med HTTP 503 och koden `BROWSER_CRASHED`.
- En webbläsarkrasch (HTTP 503) görs om en gång innan felet rapporteras, precis som för andra köade bildjobb. En tidsgräns vid sidladdning görs inte om.
- En fångst som redan har svarat `202` rapporterar ett fel på sin förloppsström i stället för i HTTP-statusen.
