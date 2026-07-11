---
description: "Capture páginas web ou trechos de HTML como imagens de alta qualidade com emulação de dispositivo."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 05bcd9eb4a3c
---

# HTML para Imagem {#html-to-image}

Capture uma URL de página web ou conteúdo HTML bruto como uma imagem de captura de tela. Suporta emulação de dispositivo (desktop, tablet, mobile), captura de página inteira e vários formatos de saída.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Aceita um **corpo JSON** (não multipart). Não é necessário envio de arquivo.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| url | string | Condicional | - | URL a capturar (deve ser uma URL válida) |
| html | string | Condicional | - | Conteúdo HTML bruto a renderizar (1 a 5.000.000 caracteres) |
| format | string | Não | `"png"` | Formato de saída: `jpg`, `png`, `webp` |
| quality | number | Não | `90` | Qualidade de saída para formatos com perdas (1 a 100) |
| fullPage | boolean | Não | `false` | Captura a página inteira rolável, não apenas a viewport |
| devicePreset | string | Não | `"desktop"` | Emulação de dispositivo: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | Não | `1280` | Largura personalizada da viewport em pixels (320 a 3840, usada quando devicePreset é `custom`) |
| viewportHeight | number | Não | `720` | Altura personalizada da viewport em pixels (320 a 2160, usada quando devicePreset é `custom`) |

É preciso fornecer `url` ou `html`, mas não ambos.

### Predefinições de Dispositivo {#device-presets}

| Predefinição | Largura | Altura | UA Mobile |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | Não |
| `tablet` | 768 | 1024 | Não |
| `mobile` | 375 | 812 | Sim |
| `custom` | (especificado pelo usuário) | (especificado pelo usuário) | Não |

## Exemplo de Requisição {#example-request}

Capturar uma página web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Renderizar conteúdo HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Observações {#notes}

- Requer que o Chromium esteja instalado no servidor. Retorna HTTP 503 se o serviço de navegador não estiver disponível.
- As URLs são validadas contra ataques SSRF (endereços de rede privados/internos são bloqueados).
- Este endpoint tem limite de taxa de 120 requisições por hora.
- `originalSize` é sempre 0, pois esta ferramenta gera imagens a partir de URLs/HTML.
- O nome do arquivo de saída é `screenshot.<format>`.
- Se a página demorar demais para carregar, a requisição retorna HTTP 504 (tempo limite de gateway).
- Se o serviço de navegador travar repetidamente, ele é desativado temporariamente e retorna HTTP 503 com o código `BROWSER_CRASHED`.
