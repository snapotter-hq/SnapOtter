---
description: "Aplique imagens de assinatura enviadas a um PDF usando posicionamentos de página normalizados."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: d0a7937e97db
---

# Sign PDF {#sign-pdf}

Aplique uma ou mais imagens de assinatura PNG enviadas a qualquer página de um PDF. Esta rota usa um contrato multipart personalizado porque precisa do PDF, de uma ou mais imagens de assinatura e das coordenadas de posicionamento.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Aceita dados de formulário multipart. O PDF é enviado como `file`; as assinaturas são enviadas como `sig0`, `sig1` e assim por diante; os posicionamentos são enviados em um campo JSON `placements`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| file | file | Sim | - | Arquivo PDF a assinar |
| sig0 | file | Sim | - | Primeira imagem de assinatura. Imagens adicionais usam `sig1`, `sig2` e assim por diante |
| placements | JSON string | Sim | - | Array de objetos de posicionamento: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | Não | - | UUID opcional para acompanhamento do progresso via SSE |
| fileId | string | Não | - | ID opcional da biblioteca de arquivos para salvar o resultado assinado como uma nova versão |

## Placement Coordinates {#placement-coordinates}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| sig | integer | Índice da imagem de assinatura. `0` mapeia para `sig0` |
| page | integer | Índice de página do PDF baseado em zero |
| x | number | Posição à esquerda como fração da página |
| y | number | Posição superior como fração da página |
| w | number | Largura da assinatura como fração da página |
| h | number | Altura da assinatura como fração da página |

As coordenadas usam origem no canto superior esquerdo. Os valores podem ultrapassar ligeiramente a borda da página; o renderizador de PDF recorta o carimbo final para caber na página.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Se a requisição não puder ser concluída dentro da janela de espera síncrona, a API retorna:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Conecte-se a `/api/v1/jobs/<jobId>/progress` e baixe o resultado quando o job for concluído.

## Notes {#notes}

- Formato de entrada PDF aceito: `.pdf`.
- As imagens de assinatura devem ser arquivos de imagem válidos, normalmente PNG com transparência.
- São aceitas até 100 imagens de assinatura e 100 posicionamentos.
- `sign-pdf` é uma rota personalizada e não usa o campo JSON `settings` padrão da ferramenta.
