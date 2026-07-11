---
description: "Colorize fotos em preto e branco ou em tons de cinza automaticamente com o modelo de IA DDColor."
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: effab352dc37
---

# Colorização por IA {#ai-colorization}

Converta fotos em preto e branco ou em tons de cinza para cores completas usando IA (modelo DDColor com fallback para OpenCV DNN).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para o status via SSE)

**Pacote do modelo:** `object-eraser-colorize` (1-2 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| intensity | number | Não | `1.0` | Intensidade de cor (0-1). Valores menores produzem uma colorização mais sutil |
| model | string | Não | `"auto"` | Modelo a usar: `auto`, `ddcolor`, `opencv` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
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
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notas {#notes}

- Requer que o pacote do modelo `object-eraser-colorize` esteja instalado (1-2 GB).
- O DDColor produz resultados de maior qualidade, mas é mais lento; o OpenCV DNN é mais rápido com qualidade ligeiramente inferior. `auto` usa o DDColor quando disponível com fallback para OpenCV.
- O parâmetro `intensity` mescla entre o tom de cinza original e o resultado colorizado por IA. Use 1.0 para cor completa, valores menores para um visual vintage parcialmente dessaturado.
- O formato de saída corresponde automaticamente ao formato de entrada.
- Para formatos de saída não pré-visualizáveis no navegador, uma pré-visualização WebP é gerada junto com a saída principal.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
