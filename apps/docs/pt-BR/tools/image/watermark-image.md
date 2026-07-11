---
description: "Sobrepõe um logotipo ou imagem como marca d'água com posição, opacidade e escala configuráveis."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 676656ccb519
---

# Marca d'Água em Imagem {#image-watermark}

Sobrepõe um logotipo ou imagem secundária como marca d'água em uma imagem base. A marca d'água é dimensionada em relação à largura da imagem base e posicionada em um canto ou no centro.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Aceita dados de formulário multipart com **dois** arquivos de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| position | string | Não | `"bottom-right"` | Posicionamento da marca d'água: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Não | `50` | Percentual de opacidade da marca d'água (0 a 100) |
| scale | number | Não | `25` | Largura da marca d'água como percentual da largura da imagem principal (1 a 100) |

### Campos de Arquivo {#file-fields}

| Nome do Campo | Obrigatório | Descrição |
|------------|----------|-------------|
| file | Sim | A imagem principal/base |
| watermark | Sim | A imagem da marca d'água/logotipo |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notas {#notes}

- Ambas as imagens são validadas e decodificadas (HEIC, RAW, PSD, SVG suportados).
- A marca d'água é redimensionada proporcionalmente para que sua largura seja igual a `scale`% da largura da imagem principal.
- A opacidade é aplicada por meio de uma máscara alfa composta com mesclagem `dest-in`.
- As posições de canto usam um preenchimento de 20px a partir da borda da imagem.
- Se a imagem da marca d'água tiver transparência (por exemplo, um logotipo PNG), ela é preservada durante a composição.
- A orientação EXIF é aplicada automaticamente em ambas as imagens antes do processamento.
