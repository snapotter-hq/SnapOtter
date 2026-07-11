---
description: "Converta entre os formatos de apresentação PowerPoint e OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 8fd86e285452
---

# Converter Apresentação {#convert-presentation}

Converta apresentações entre os formatos PowerPoint (PPTX) e OpenDocument Presentation (ODP).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Aceita dados de formulário multipart com um arquivo PowerPoint/ODP e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Sim | - | Formato de saída: `pptx`, `odp` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Exemplo de Resposta {#example-response}

Retorna `202 Accepted`. Acompanhe o progresso via SSE em `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notas {#notes}

- Formatos de entrada aceitos: `.pptx`, `.ppt`, `.odp`.
- A conversão é realizada pelo LibreOffice executando em modo headless no servidor.
- Animações e efeitos de transição podem não ser preservados entre os formatos.
- O formato de saída deve ser diferente do formato de entrada.
