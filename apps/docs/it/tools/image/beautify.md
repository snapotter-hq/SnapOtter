---
description: "Trasforma semplici screenshot in immagini rifinite con sfondi a gradiente, cornici del dispositivo, ombre e dimensioni per i social media."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 1a0b49bc74da
---

# Rifinisci screenshot {#beautify-screenshot}

Aggiunge sfondi a gradiente, cornici del dispositivo, ombre, filigrane e dimensioni per i social media agli screenshot. Ideale per creare immagini rifinite per il marketing di prodotto, i social media e la documentazione.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | Tipo di sfondo: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | Colore di sfondo pieno (usato quando `backgroundType` è `solid`) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Punti di colore del gradiente (min 2). Ogni punto ha `color` (esadecimale) e `position` (0-100). |
| gradientAngle | number | No | 135 | Angolo del gradiente in gradi (da 0 a 360) |
| padding | number | No | 64 | Spaziatura attorno all'immagine in pixel (da 0 a 256) |
| borderRadius | number | No | 12 | Raggio degli angoli dello screenshot (da 0 a 64) |
| shadowPreset | string | No | `"subtle"` | Preset dell'ombra: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | Raggio di sfocatura personalizzato dell'ombra (da 0 a 100, usato quando `shadowPreset` è `custom`) |
| shadowOffsetX | number | No | 0 | Offset orizzontale personalizzato dell'ombra (da -50 a 50) |
| shadowOffsetY | number | No | 10 | Offset verticale personalizzato dell'ombra (da -50 a 50) |
| shadowColor | string | No | `"#000000"` | Colore personalizzato dell'ombra in esadecimale |
| shadowOpacity | number | No | 30 | Opacità personalizzata dell'ombra (da 0 a 100) |
| frame | string | No | `"none"` | Cornice del dispositivo o della finestra: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | Testo del titolo visualizzato nelle barre del titolo delle cornici a finestra |
| socialPreset | string | No | `"none"` | Ridimensiona alle dimensioni dei social media: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | Testo opzionale della filigrana sovrapposto |
| watermarkPosition | string | No | `"bottom-right"` | Posizione della filigrana: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | Opacità della filigrana (da 0 a 100) |
| outputFormat | string | No | `"png"` | Formato di output: `png`, `jpeg`, `webp` |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Con immagine di sfondo {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Note {#notes}

- Accetta due campi file: `file` (obbligatorio, lo screenshot principale) e `backgroundImage` (opzionale, usato quando `backgroundType` è `image`).
- Supporta i formati di input HEIC, RAW, PSD e SVG (decodificati automaticamente).
- I preset dell'ombra sono mappati su valori specifici:
  - `subtle`: sfocatura 20, offsetY 4, opacità 20%
  - `medium`: sfocatura 40, offsetY 10, opacità 35%
  - `dramatic`: sfocatura 80, offsetY 20, opacità 50%
- I preset dei social media ridimensionano l'output finale per adattarsi alle dimensioni di destinazione usando la modalità `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Le cornici del dispositivo (`iphone`, `macbook`, `ipad`) applicano una cornice hardware attorno all'immagine e ignorano l'impostazione `borderRadius`.
- Quando è richiesta la trasparenza (ombra, raggio degli angoli, cornici del dispositivo o sfondo trasparente), l'output viene forzato a PNG anche se è selezionato `jpeg`.
- Gli sfondi con immagine non sono supportati in modalità pipeline/batch.
