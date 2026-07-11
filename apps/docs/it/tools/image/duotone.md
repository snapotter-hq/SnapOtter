---
description: "Applica un effetto duotone a due colori con colori personalizzati per ombre e luci."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 6461bdb15907
---

# Duotone {#duotone}

Applica un effetto duotone a due colori a un'immagine. L'immagine viene convertita in scala di grigi, quindi mappata su un gradiente tra il colore delle ombre (toni scuri) e il colore delle luci (toni chiari).

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | Colore esadecimale delle ombre (applicato ai toni scuri) |
| highlight | string | No | `"#fbbf24"` | Colore esadecimale delle luci (applicato ai toni chiari) |
| intensity | integer | No | `100` | Intensità dell'effetto (0-100); 0 restituisce l'originale, 100 applica il duotone completo |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Note {#notes}

- Il formato di output corrisponde al formato di input. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
- Un valore di `intensity` inferiore a 100 miscela il risultato duotone con l'immagine originale, consentendo effetti più tenui.
- Combinazioni duotone popolari includono blu navy/oro, verde acqua/corallo e viola/rosa.
