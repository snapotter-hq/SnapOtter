---
description: "Expanda a tela de uma imagem com outpainting por IA, estendendo-a em qualquer direção e preenchendo as novas áreas para combinar com a original."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 245af4b1c739
---

# Expandir Tela com IA {#ai-canvas-expand}

Expanda a tela de uma imagem com preenchimento por IA (outpainting). Estende a imagem em qualquer direção e preenche as novas áreas com conteúdo gerado por IA que combina com a imagem existente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para o status via SSE)

**Pacote de modelo:** `object-eraser-colorize` (1-2 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| extendTop | integer | Não | `0` | Pixels a estender no topo |
| extendRight | integer | Não | `0` | Pixels a estender à direita |
| extendBottom | integer | Não | `0` | Pixels a estender na parte inferior |
| extendLeft | integer | Não | `0` | Pixels a estender à esquerda |
| tier | string | Não | `"balanced"` | Nível de qualidade: `fast`, `balanced`, `high` |
| format | string | Não | `"auto"` | Formato de saída: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Não | `95` | Qualidade de saída (1-100) |

Pelo menos uma direção de extensão deve ser maior que 0.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Observações {#notes}

- Requer que o pacote de modelo `object-eraser-colorize` esteja instalado (1-2 GB).
- Usa outpainting baseado em LaMa para gerar conteúdo nas regiões expandidas.
- O parâmetro `tier` troca velocidade por qualidade: `fast` produz resultados rapidamente com possíveis artefatos, `high` demora mais, mas produz preenchimentos mais suaves e coerentes.
- Os valores de extensão são em pixels. As dimensões finais da imagem serão: largura original + extendLeft + extendRight por altura original + extendTop + extendBottom.
- Para formatos de saída não pré-visualizáveis no navegador (HEIC, JXL, TIFF), uma pré-visualização WebP é gerada junto com a saída principal.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR por meio de decodificação automática.
