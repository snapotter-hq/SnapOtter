---
description: "Remova objetos indesejados de imagens com inpainting por IA (LaMa), guiado por uma máscara da região a apagar."
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: a824a6655c39
---

# Apagador de Objetos {#object-eraser}

Remova objetos indesejados de imagens usando inpainting por IA (modelo LaMa). Aceita uma imagem e uma máscara indicando a região a apagar.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para o status via SSE)

**Pacote do modelo:** `object-eraser-colorize` (1-2 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem de origem (multipart) |
| mask | file | Sim | - | Imagem de máscara (branco = área a apagar, preto = manter). Deve ser enviada com o fieldname `mask` |
| format | string | Não | `"auto"` | Formato de saída: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Não | `95` | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
```

## Resposta {#response}

### Resposta Inicial (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progresso (SSE em `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notas {#notes}

- Requer que o pacote do modelo `object-eraser-colorize` esteja instalado (1-2 GB).
- A máscara deve ter as mesmas dimensões da imagem de origem. Pixels brancos indicam áreas a apagar; a IA as preenche com conteúdo plausível.
- Usa o LaMa (Large Mask Inpainting) para remoção de objetos de alta qualidade.
- Para formatos de saída não pré-visualizáveis no navegador, uma pré-visualização WebP é gerada junto com a saída principal.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
