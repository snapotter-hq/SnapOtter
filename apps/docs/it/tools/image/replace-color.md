---
description: "Sostituisci un colore specifico in un'immagine con un altro colore o rendilo trasparente."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 79e69513b3f6
---

# Replace & Invert Color {#replace-invert-color}

Sostituisci i pixel che corrispondono a un colore di origine con un colore di destinazione, oppure rendili trasparenti. Usa la distanza euclidea nello spazio RGB con tolleranza configurabile per una fusione fluida ai confini dei colori.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Accetta dati form multipart con un file immagine e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | Colore esadecimale da cercare (formato: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | Colore esadecimale con cui sostituire (formato: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | Rendi trasparenti i pixel corrispondenti invece di sostituirli con il colore di destinazione |
| tolerance | number | No | `30` | Tolleranza di corrispondenza dei colori (da 0 a 255). Valori più alti fanno corrispondere una gamma più ampia di colori simili |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Rendi trasparente uno sfondo verde:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- La corrispondenza dei colori usa la distanza euclidea nello spazio RGB, scalata da `tolerance * sqrt(3)`.
- La fusione della sostituzione è proporzionale alla distanza dei colori: i pixel più vicini al colore di origine ricevono più colore di destinazione, creando transizioni fluide.
- Quando `makeTransparent` è `true`, l'output viene forzato a PNG (o WebP/AVIF) se il formato di input non supporta i canali alfa (ad es. JPEG).
- Una tolleranza di 0 fa corrispondere solo il colore di origine esatto. Valori più alti (50+) faranno corrispondere una gamma più ampia di tonalità simili.
- Il formato di output corrisponde al formato di input a meno che non sia necessaria la trasparenza e il formato di input non supporti il canale alfa.
