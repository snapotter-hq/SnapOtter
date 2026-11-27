---
description: "Capture páginas web ou trechos de HTML como imagens de alta qualidade com emulação de dispositivo."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: da6edd0a1142
i18n_hash_version: 2
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
| clientJobId | string | Não | - | Seu próprio ID de job, para abrir o stream de progresso antes de a resposta chegar |

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

### Páginas lentas {#slow-pages}

A captura roda como um job em fila. Uma captura que termina dentro da janela de espera síncrona responde `200` com o resultado acima. Uma mais lenta responde `202` com um ID de job:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Acompanhe `progressUrl` (Server-Sent Events) até o job terminar. O evento de conclusão traz o mesmo objeto de resultado da resposta `200`. Você pode cancelar o job com `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Alterado após a 2.3.0
Até a 2.3.0, este endpoint sempre mantinha a requisição aberta até a captura terminar e respondia `200`. Scripts que tratam apenas `200` devem tratar também `202`.
:::

## Observações {#notes}

- Requer que o Chromium esteja instalado no servidor. Retorna HTTP 503 se o serviço de navegador não estiver disponível.
- As URLs são validadas contra ataques SSRF (endereços de rede privados/internos são bloqueados).
- Este endpoint tem limite de taxa de 120 requisições por hora.
- `originalSize` é sempre 0, pois esta ferramenta gera imagens a partir de URLs/HTML.
- O nome do arquivo de saída é `screenshot.<format>`.
- Se a página demorar demais para carregar, a captura falha com HTTP 504 (tempo limite de gateway).
- Se o serviço de navegador travar repetidamente, ele é desativado temporariamente e a captura falha com HTTP 503 e o código `BROWSER_CRASHED`.
- Uma falha de navegador (HTTP 503) é repetida uma vez antes de reportar o erro, como nos outros jobs de imagem em fila. Um tempo limite de carregamento da página não é repetido.
- Uma captura que já respondeu `202` reporta a falha no stream de progresso, não no status HTTP.
