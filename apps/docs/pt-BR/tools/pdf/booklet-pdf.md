---
description: "Organiza páginas de PDF para dobra em formato de livreto."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 5bcb3392d46a
---

# PDF em Livreto (Booklet) {#booklet-pdf}

Impõe páginas para impressão duplex, de modo que as folhas impressas possam ser dobradas em um livreto.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Não | `2` | Páginas por folha: `2`, `4`, `6` ou `8` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notas {#notes}

- O padrão `perSheet: 2` posiciona duas páginas lado a lado em cada folha, que é o layout padrão de livreto para impressão duplex.
- Páginas em branco são adicionadas automaticamente se a contagem total de páginas não for um múltiplo do tamanho da folha.
- Imprima a saída em frente e verso com encadernação pela borda curta, depois dobre e grampeie.
