---
description: "Restaure e nitidez rostos borrados ou de baixa qualidade em imagens com os modelos de IA GFPGAN e CodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 9784e733a3f3
---

# Aprimoramento de Rostos {#face-enhancement}

Restaure e aprimore rostos em imagens usando modelos de IA (GFPGAN/CodeFormer).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para o status via SSE)

**Pacotes de modelo:** `upscale-enhance` (5-6 GB) e `face-detection` (200-300 MB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| model | string | Não | `"auto"` | Modelo a usar: `auto`, `gfpgan`, `codeformer` |
| strength | number | Não | `0.8` | Intensidade do aprimoramento (0-1). Valores maiores produzem um aprimoramento mais forte |
| onlyCenterFace | boolean | Não | `false` | Aprimora apenas o rosto mais central/proeminente |
| sensitivity | number | Não | `0.5` | Sensibilidade da detecção de rostos (0-1) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notas {#notes}

- Requer tanto o pacote do modelo `upscale-enhance` (5-6 GB) quanto o pacote do modelo `face-detection` (200-300 MB).
- O GFPGAN produz um aprimoramento mais agressivo; o CodeFormer preserva melhor a identidade. `auto` seleciona o melhor modelo para a entrada.
- A saída é sempre no formato PNG para a máxima qualidade.
- Uma pré-visualização WebP é gerada junto com a saída em resolução completa para uma exibição mais rápida no frontend.
- O parâmetro `strength` mescla o rosto aprimorado com o original. Use valores menores (0.3-0.5) para melhorias sutis, valores maiores (0.7-1.0) para uma restauração mais forte.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
