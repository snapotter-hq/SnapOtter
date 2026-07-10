---
description: "Amplia imagens de 2x a 4x com super-resolução por IA Real-ESRGAN, preservando detalhes finos."
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: cb81d2ebca2f
---

# Ampliação de Imagem (Upscaling) {#image-upscaling}

Aprimoramento por super-resolução com IA usando Real-ESRGAN. Amplia imagens de 2x a 4x preservando os detalhes.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para obter o status via SSE)

**Pacote de modelo:** `upscale-enhance` (5-6 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| scale | number | Não | `2` | Fator de ampliação (por exemplo, 2, 3, 4) |
| model | string | Não | `"auto"` | Modelo a usar (por exemplo, `auto`, nomes específicos de modelos) |
| faceEnhance | boolean | Não | `false` | Aplica aprimoramento de rosto durante a ampliação |
| denoise | number | Não | `0` | Intensidade da redução de ruído (0 = desativado) |
| format | string | Não | `"auto"` | Formato de saída: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | Não | `95` | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
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
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notas {#notes}

- Requer que o pacote de modelo `upscale-enhance` esteja instalado (5-6 GB).
- Usa Real-ESRGAN quando disponível; recai para interpolação Lanczos se o modelo de IA estiver indisponível.
- A opção `faceEnhance` aplica a restauração de rosto GFPGAN durante a ampliação para melhor qualidade dos rostos.
- Para formatos de saída que não podem ser pré-visualizados no navegador (HEIC, JXL, TIFF), uma pré-visualização WebP é gerada junto com a saída principal.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
