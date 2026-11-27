---
description: "Recorte todas as páginas de um PDF por margens ou para uma região."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: de7f77c24a72
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Recorte todas as páginas de um PDF com uma margem única em todas as bordas, uma margem separada por borda ou até uma região, como uma etiqueta de envio impressa em um canto da folha.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `uniform` | `uniform`, `sides`, ou `region` |
| margin | number | Não | `20` | Modo `uniform`: margem de recorte para todas as bordas em pontos (0-2000) |
| top, right, bottom, left | number | Não | `0` | Modo `sides`: margem de recorte para cada borda em pontos (0-2000) |
| x, y | number | Não | `0` | Modo `region`: deslocamento da região a partir das bordas esquerda e superior da página em pontos |
| width, height | number | Não | `288`, `432` | Modo `region`: tamanho da região em pontos (uma etiqueta de 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Mantenha apenas a etiqueta de 4x6 in no canto superior esquerdo de cada página:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Todos os valores estão em pontos PDF (1 ponto = 1/72 polegada). Uma página US Letter tem 612 x 792 pontos.
- Cada modo lê apenas os próprios campos, então uma requisição que envia somente `margin` continua funcionando.
- Uma região é medida a partir do canto superior esquerdo de cada página e precisa caber dentro de todas as páginas. As margens precisam deixar uma parte de cada página. Caso contrário, a requisição falha com `400`.
- Em uma página configurada para ser exibida girada, as posições e as bordas se referem à página como ela é exibida, então o canto superior esquerdo de uma região é o canto superior esquerdo da página girada.
- Todos os modos medem a partir da media box completa, então recortar uma página que já foi recortada recomeça da página inteira. Uma margem uniforme de `0` mostra a media box inteira.
