---
description: "Converta imagens entre formatos, incluindo formatos modernos como AVIF, JXL e HEIC."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: 5acd51548a45
---

# Converter {#convert}

Converta imagens entre formatos. Suporta formatos web comuns, bem como formatos especializados como HEIC, JXL, BMP, ICO, JP2, QOI e PSD.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/convert`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Sim | - | Formato alvo: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Não | - | Qualidade de saída (1-100). Aplica-se a formatos com perdas como jpg, webp, avif, heic. |

## Formatos de Saída Suportados {#supported-output-formats}

| Formato | Tipo | Notas |
|--------|------|-------|
| jpg | Com perdas | JPEG, melhor compatibilidade |
| png | Sem perdas | Suporta transparência |
| webp | Ambos | Formato web moderno, boa compressão |
| avif | Com perdas | Formato de nova geração, excelente compressão |
| tiff | Ambos | Fluxos de trabalho de impressão/publicação |
| gif | Sem perdas | Limitado a 256 cores |
| heic / heif | Com perdas | Formato do ecossistema Apple |
| jxl | Ambos | JPEG XL, formato de nova geração |
| bmp | Sem perdas | Bitmap não comprimido |
| ico | Sem perdas | Formato de ícone do Windows |
| jp2 | Com perdas | JPEG 2000 |
| qoi | Sem perdas | Formato Quite OK Image |
| psd | Em camadas | Adobe Photoshop (requer ImageMagick) |
| ppm | Sem perdas | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vetor | Encapsulated PostScript |
| tga | Sem perdas | Formato de imagem Targa |

## Exemplo de Requisição {#example-request}

Converter para WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Converter para PNG (sem perdas):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notas {#notes}

- A extensão do nome do arquivo de saída é atualizada automaticamente para corresponder ao formato alvo.
- Entradas SVG são rasterizadas a 300 DPI antes da conversão.
- A conversão para PSD requer que o ImageMagick esteja instalado no servidor.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI e TGA usam codificadores de CLI especializados e contornam o processamento do Sharp.
- A codificação HEIC/HEIF usa a biblioteca codificadora HEIC do sistema.
- Os formatos de entrada são amplos: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, etc.), PSD, SVG, BMP e mais.
