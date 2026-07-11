---
description: "Quais dados de uso anônimos o SnapOtter coleta, quando são enviados e como desativar as análises de produto em toda a instância."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: fa937f73ee74
---

# O que o SnapOtter coleta {#what-snapotter-collects}

As Análises de Produto Anônimas estão ativadas por padrão e são definidas para toda a instância por um administrador. Desative-as em Configurações > Sistema > Privacidade.

## Eventos que enviamos (quando ativado) {#events-we-send-when-enabled}

- tool_used: id da ferramenta, status, duração, categoria, se é uma ferramenta de IA e um código de erro em caso de falha.
- pipeline_executed: contagem de etapas, ids das ferramentas, flag de lote, contagem de arquivos, duração, status.
- ai_bundle_action: id do pacote, ação, duração.
- Uso do frontend: quais páginas de ferramentas são abertas, arquivos adicionados (apenas contagens), ferramenta iniciada, downloads, salvamentos, busca (apenas contagem de resultados), processamento em lote.
- Relatórios de falhas: tipo de erro e um stack de origem apenas com os nomes-base dos arquivos.

## O que nunca coletamos {#what-we-never-collect}

- Nomes ou caminhos de arquivos
- Conteúdos de arquivos
- Texto de saída de OCR
- Metadados de imagem (EXIF)
- Texto extraído de documentos
- Seu endereço IP ou identidade da conta

## Como desativar {#turning-it-off}

Administradores: Configurações > Sistema > Privacidade, desative "Análises de Produto Anônimas". A coleta para imediatamente, em toda a instância. Para criar uma imagem que nunca possa emitir dados, defina o build arg `SNAPOTTER_ANALYTICS=off`.
