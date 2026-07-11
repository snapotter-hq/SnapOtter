---
description: "Aggiungi bordi a un'immagine per raggiungere le proporzioni target con uno sfondo a tinta unita, trasparente o sfocato."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 0840d4fa95db
---

# Riempimento Immagine {#image-pad}

Aggiungi bordi a un'immagine per raggiungere le proporzioni target aggiungendo attorno ad essa uno sfondo a tinta unita, trasparente o sfocato. Utile per adattare le immagini a proporzioni fisse per i social media o la stampa senza ritagliarle.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Accetta dati di form multipart con un file immagine e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| target | string | No | `"1:1"` | Proporzioni target: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` o `custom` |
| ratioW | integer | No | `1` | Larghezza del rapporto personalizzato (1-100, usata quando target è `custom`) |
| ratioH | integer | No | `1` | Altezza del rapporto personalizzato (1-100, usata quando target è `custom`) |
| background | string | No | `"color"` | Modalità di sfondo: `color`, `transparent` o `blur` |
| color | string | No | `"#ffffff"` | Colore di sfondo esadecimale (quando background è `color`) |
| padding | integer | No | `0` | Padding aggiuntivo come percentuale del canvas (0-50) |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Note {#notes}

- La modalità di sfondo `blur` crea una copia sfocata dell'immagine originale come riempimento, producendo un risultato visivamente coerente.
- Quando si usa lo sfondo `transparent`, l'output viene convertito in PNG per preservare il canale alpha.
- Il formato di output corrisponde al formato di input a meno che non sia coinvolta la trasparenza. Gli input HEIC, RAW, PSD e SVG vengono decodificati automaticamente prima dell'elaborazione.
- Imposta `target` su `custom` e fornisci `ratioW` e `ratioH` per proporzioni arbitrarie (es. `ratioW: 3, ratioH: 2` per 3:2).
