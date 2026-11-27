---
description: "Leg webpagina's of HTML-fragmenten vast als hoogwaardige afbeeldingen met apparaatemulatie."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 1c40c7c7346c
i18n_hash_version: 2
---

# HTML naar afbeelding {#html-to-image}

Leg een webpagina-URL of ruwe HTML-inhoud vast als een schermafbeelding. Ondersteunt apparaatemulatie (desktop, tablet, mobiel), vastlegging van de volledige pagina en meerdere uitvoerformaten.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Accepteert een **JSON-body** (geen multipart). Er is geen bestandsupload nodig.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| url | string | Voorwaardelijk | - | URL om vast te leggen (moet een geldige URL zijn) |
| html | string | Voorwaardelijk | - | Ruwe HTML-inhoud om te renderen (1 tot 5.000.000 tekens) |
| format | string | Nee | `"png"` | Uitvoerformaat: `jpg`, `png`, `webp` |
| quality | number | Nee | `90` | Uitvoerkwaliteit voor lossy formaten (1 tot 100) |
| fullPage | boolean | Nee | `false` | Leg de volledige scrollbare pagina vast, niet alleen de viewport |
| devicePreset | string | Nee | `"desktop"` | Apparaatemulatie: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Nee | `1280` | Aangepaste viewport-breedte in pixels (320 tot 3840, gebruikt wanneer devicePreset `custom` is) |
| viewportHeight | number | Nee | `720` | Aangepaste viewport-hoogte in pixels (320 tot 2160, gebruikt wanneer devicePreset `custom` is) |
| clientJobId | string | Nee | - | Je eigen job-ID, zodat je de voortgangsstream kunt openen voordat het antwoord binnenkomt |

Ofwel `url` ofwel `html` moet worden opgegeven, maar niet beide.

### Apparaat-presets {#device-presets}

| Preset | Breedte | Hoogte | Mobiele UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Nee |
| `tablet` | 768 | 1024 | Nee |
| `mobile` | 375 | 812 | Ja |
| `custom` | (door gebruiker opgegeven) | (door gebruiker opgegeven) | Nee |

## Voorbeeldverzoek {#example-request}

Een webpagina vastleggen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML-inhoud renderen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Voorbeeldantwoord {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Trage pagina's {#slow-pages}

De vastlegging draait als een job in de wachtrij. Een vastlegging die binnen het synchrone wachtvenster klaar is, antwoordt met `200` en het resultaat hierboven. Een tragere antwoordt met `202` en een job-ID:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Volg `progressUrl` (Server-Sent Events) tot de job klaar is. Het voltooide event bevat hetzelfde resultaatobject als het `200`-antwoord. Je kunt de job annuleren met `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Gewijzigd na 2.3.0
Tot en met 2.3.0 hield dit endpoint het verzoek altijd open tot de vastlegging klaar was en antwoordde `200`. Scripts die alleen `200` afhandelen, moeten ook `202` afhandelen.
:::

## Opmerkingen {#notes}

- Vereist dat Chromium op de server is geïnstalleerd. Retourneert HTTP 503 als de browserservice niet beschikbaar is.
- URL's worden gevalideerd tegen SSRF-aanvallen (privé/interne netwerkadressen worden geblokkeerd).
- Dit endpoint is beperkt tot 120 verzoeken per uur.
- `originalSize` is altijd 0, aangezien dit hulpmiddel afbeeldingen genereert vanuit URL's/HTML.
- De uitvoerbestandsnaam is `screenshot.<format>`.
- Als de pagina te lang duurt om te laden, mislukt de vastlegging met HTTP 504 (gateway timeout).
- Als de browserservice herhaaldelijk crasht, wordt deze tijdelijk uitgeschakeld en mislukt de vastlegging met HTTP 503 en code `BROWSER_CRASHED`.
- Een browsercrash (HTTP 503) wordt eenmaal opnieuw geprobeerd voordat de mislukking wordt gemeld, net als bij andere afbeeldingsjobs in de wachtrij. Een time-out bij het laden van de pagina wordt niet opnieuw geprobeerd.
- Een vastlegging die al `202` heeft geantwoord, meldt een mislukking op de voortgangsstream in plaats van in de HTTP-status.
