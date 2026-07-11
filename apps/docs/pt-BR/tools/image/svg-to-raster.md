---
description: "Converte arquivos SVG para PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF ou JXL em resolução e DPI personalizados, com suporte a lote."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: e5637cc20071
---

# SVG para Raster {#svg-to-raster}

Converte arquivos SVG para formatos de imagem raster (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF ou JXL) em resolução e DPI personalizados. Também suporta conversão em lote de vários SVGs.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | - | Largura alvo em pixels (1 a 65536). Mantém a proporção se apenas uma dimensão for definida. |
| height | integer | Não | - | Altura alvo em pixels (1 a 65536). Mantém a proporção se apenas uma dimensão for definida. |
| dpi | integer | Não | 300 | DPI de renderização, controla a densidade base de rasterização (36 a 2400) |
| quality | number | Não | 90 | Qualidade de saída para formatos com perdas (1 a 100) |
| backgroundColor | string | Não | `"#00000000"` | Cor de fundo em hexadecimal (6 ou 8 caracteres; 8 caracteres inclui alfa) |
| outputFormat | string | Não | `"png"` | Formato de saída: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Endpoint em Lote {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Converte vários arquivos SVG em uma única requisição. Retorna um arquivo ZIP.

### Parâmetros Adicionais de Lote {#additional-batch-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Não | - | ID de job opcional fornecido pelo cliente para acompanhamento de progresso (máx. 128 caracteres) |

### Exemplo de Requisição em Lote {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Resposta em Lote {#batch-response}

O endpoint em lote transmite um arquivo ZIP diretamente com os cabeçalhos:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notas {#notes}

- Aceita apenas arquivos SVG e SVGZ (valida o conteúdo, não apenas a extensão). SVGZ é descompactado automaticamente.
- O conteúdo SVG é sanitizado antes da renderização para evitar XSS e o carregamento de recursos externos.
- A configuração `dpi` controla a densidade na qual o SVG é rasterizado. Um DPI maior produz dimensões em pixels maiores a partir do mesmo viewport do SVG.
- Quando `width` e `height` são fornecidos, a imagem é redimensionada usando `fit: inside` (mantém a proporção dentro dos limites).
- Um(a) `previewUrl` é incluído(a) na resposta para formatos que os navegadores não conseguem exibir nativamente (TIFF, HEIF). A pré-visualização é uma miniatura WebP de 1200px.
- O fundo padrão `#00000000` é totalmente transparente. Defina como `#FFFFFF` para um fundo branco (útil com saída JPEG, que não suporta transparência).
- O processamento em lote respeita a configuração de servidor `MAX_BATCH_SIZE` e usa workers concorrentes para desempenho.
- O progresso das operações em lote pode ser acompanhado via SSE em `/api/v1/jobs/:jobId/progress`.
