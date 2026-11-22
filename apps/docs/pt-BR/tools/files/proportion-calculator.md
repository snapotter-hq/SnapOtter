---
description: "Resolve a regra de três, encontra X a partir de três valores conhecidos."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 8a6aa13daa08
i18n_hash_version: 2
---

# Calculadora de Proporção {#proportion-calculator}

Resolva a regra de três (multiplicação cruzada). Digite três valores, escolha direta ou inversa e obtenha o quarto. Os valores permanecem no formulário após cada resposta, então você pode alterar um número e pressionar Enter para tentar o próximo.

Este é o solucionador de proporção matemática, não a grade de composição fotográfica da regra dos terços.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Aceita um corpo JSON, não dados de formulário multipart, e responde com um número em vez de um arquivo para download.

## Parâmetros {#parameters}

| Nome | Tipo | Padrão | Descrição |
|------|------|---------|-------------|
| `a` | number | (obrigatório) | Primeiro valor conhecido. |
| `b` | number | (obrigatório) | O valor que corresponde a `a`. |
| `c` | number | (obrigatório) | Terceiro valor conhecido. X é o valor que corresponde a ele. |
| `mode` | string | `direct` | `direct` ou `inverse`. |

| Modo | Lê-se como | Fórmula | Exemplo |
|------|----------|---------|---------|
| `direct` | A está para B assim como C está para X | X = B × C ÷ A | 3 maçãs custam 6, então 10 maçãs custam 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 operários levam 6 dias, então 8 operários levam 3 dias |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notas {#notes}

- A resposta é arredondada para 15 algarismos significativos, então `0.1 × 3 ÷ 3` volta como `0.1` em vez de `0.10000000000000002`.
- `a` não pode ser `0` em uma proporção direta e `c` não pode ser `0` em uma inversa, porque cada um é o divisor. Ambos retornam um 400.
- Uma resposta fora do intervalo que um double comporta (acima de cerca de `1.8e308`, ou perto demais de zero para manter a precisão) retorna um 400.
- No aplicativo web você pode digitar `1,5` ou `1.5`, e dígitos indo-arábicos ou devanágari também funcionam. Separadores de milhar não são aceitos.
