---
description: "Aggiunge bordi, spaziatura, angoli arrotondati e ombre esterne alle immagini in un ordine prevedibile e controllabile."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 89bef5dab03b
---

# Bordo e cornice {#border-frame}

Aggiunge bordi, spaziatura, angoli arrotondati e ombre esterne alle immagini. Lo strumento applica gli effetti in quest'ordine: spaziatura, bordo, raggio degli angoli, poi ombra.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | Spessore del bordo in pixel (da 0 a 2000) |
| borderColor | string | No | `"#000000"` | Colore del bordo in esadecimale (ad es. `#FF0000`) |
| padding | number | No | 0 | Spaziatura interna tra immagine e bordo in pixel (da 0 a 200) |
| paddingColor | string | No | `"#FFFFFF"` | Colore di riempimento della spaziatura in esadecimale |
| cornerRadius | number | No | 0 | Raggio degli angoli in pixel (da 0 a 2000) |
| shadow | boolean | No | `false` | Se aggiungere un'ombra esterna |
| shadowBlur | number | No | 15 | Raggio di sfocatura dell'ombra (da 1 a 200) |
| shadowOffsetX | number | No | 0 | Offset orizzontale dell'ombra (da -50 a 50) |
| shadowOffsetY | number | No | 5 | Offset verticale dell'ombra (da -50 a 50) |
| shadowColor | string | No | `"#000000"` | Colore dell'ombra in esadecimale |
| shadowOpacity | number | No | 40 | Percentuale di opacità dell'ombra (da 0 a 100) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Note {#notes}

- Usa la factory standard `createToolRoute`. Accetta un singolo file immagine tramite caricamento multipart.
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente).
- Ordine di elaborazione: viene aggiunta prima la spaziatura, poi il bordo la avvolge, poi viene applicato il raggio degli angoli, poi viene composta l'ombra.
- Quando `cornerRadius` o `shadow` è abilitato, l'output viene forzato a PNG (indipendentemente dal formato di input) per preservare la trasparenza. I formati che supportano l'alfa (PNG, WebP, AVIF) mantengono il loro formato originale.
- L'ombra tiene conto della forma: segue gli angoli arrotondati anziché creare un'ombra rettangolare.
- Impostando `borderWidth` a 0 e usando solo `cornerRadius` + `shadow` si crea un effetto di ombra arrotondata senza cornice.
