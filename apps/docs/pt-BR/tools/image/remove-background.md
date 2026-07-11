---
description: "Remoção de fundo com IA e efeitos opcionais (desfoque, sombra, gradiente, fundo personalizado)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 998b4b037b62
---

# Remover Fundo {#remove-background}

Remoção de fundo com IA e efeitos opcionais (desfoque, sombra, gradiente, fundo personalizado).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processamento:** Assíncrono (retorna 202, consulte `/api/v1/jobs/{jobId}/progress` para status via SSE)

**Pacote de modelo:** `background-removal` (4-5 GB)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo de imagem (multipart) |
| model | string | Não | - | Variante do modelo de IA a usar |
| backgroundType | string | Não | `"transparent"` | Um de: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Não | - | Cor hexadecimal para fundo sólido |
| gradientColor1 | string | Não | - | Primeira cor do gradiente |
| gradientColor2 | string | Não | - | Segunda cor do gradiente |
| gradientAngle | number | Não | - | Ângulo do gradiente em graus |
| blurEnabled | boolean | Não | - | Ativar efeito de desfoque no fundo |
| blurIntensity | number | Não | - | Intensidade do desfoque (0-100) |
| shadowEnabled | boolean | Não | - | Ativar sombra projetada no assunto |
| shadowOpacity | number | Não | - | Opacidade da sombra (0-100) |
| outputFormat | string | Não | - | Formato de saída: `png`, `webp` ou `avif` |
| edgeRefine | integer | Não | - | Nível de refinamento de bordas (0-3) |
| decontaminate | boolean | Não | - | Remove o sangramento de cor das bordas |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Resultado Final (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Endpoint de Efeitos (Fase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Reaplica os efeitos de fundo sem reexecutar o modelo de IA. Usa a máscara e o original em cache da Fase 1.

### Parâmetros {#parameters-1}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| settings | JSON | Sim | - | JSON com as configurações de efeito (veja abaixo) |
| backgroundImage | file | Não | - | Imagem de fundo personalizada (quando backgroundType é `image`) |

#### Campos do JSON de configurações {#settings-json-fields}

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|----------|-------------|
| jobId | string | Sim | ID do job da Fase 1 |
| filename | string | Sim | Nome do arquivo original da Fase 1 |
| backgroundType | string | Não | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Não | Cor hexadecimal para fundo sólido |
| gradientColor1 | string | Não | Primeira cor do gradiente |
| gradientColor2 | string | Não | Segunda cor do gradiente |
| gradientAngle | number | Não | Ângulo do gradiente em graus |
| blurEnabled | boolean | Não | Ativar desfoque de fundo |
| blurIntensity | number | Não | Intensidade do desfoque (0-100) |
| shadowEnabled | boolean | Não | Ativar sombra projetada |
| shadowOpacity | number | Não | Opacidade da sombra (0-100) |
| outputFormat | string | Não | `png`, `webp` ou `avif` |

### Exemplo de Requisição {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Resposta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notas {#notes}

- Requer que o pacote de modelo `background-removal` esteja instalado (4-5 GB).
- A Fase 1 armazena em cache a máscara transparente e a imagem original para que a Fase 2 (efeitos) possa reaplicar diferentes fundos instantaneamente, sem reexecutar o modelo de IA.
- Suporta os formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR e HDR via decodificação automática.
- A rotação EXIF é corrigida automaticamente antes do processamento.
