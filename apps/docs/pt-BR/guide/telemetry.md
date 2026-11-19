---
description: "Quais dados de uso anônimos o SnapOtter coleta, quando são enviados e como desativar as análises de produto em toda a instância."
i18n_source_hash: b82b4638cd21
i18n_provenance: machine
i18n_output_hash: ab97861c657e
i18n_hash_version: 2
---

# O que o SnapOtter coleta {#what-snapotter-collects}

As Análises de Produto Anônimas estão ativadas por padrão e são definidas para toda a instância por um administrador. Desative-as em Configurações > Sistema > Privacidade.

## Eventos que enviamos (quando ativado) {#events-we-send-when-enabled}

- tool_used: id da ferramenta, status, duração, categoria, se é uma ferramenta de IA, um código de erro em caso de falha e o nome da etapa quando uma ferramenta relata uma fase separadamente (a etapa de análise do Passport Photo).
- pipeline_executed: contagem de etapas, ids das ferramentas, flag de lote, contagem de arquivos, duração, status.
- ai_bundle_action: id do pacote, ação (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), duração e, quando a instalação falha, uma categoria de falha de uma lista fixa (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). A saída do instalador, caminhos e mensagens de erro nunca são enviados.
- Uso do frontend: quais páginas de ferramentas são abertas, arquivos adicionados (apenas contagens), ferramenta iniciada, downloads, salvamentos, busca (apenas contagem de resultados), processamento em lote.
- Relatórios de falhas: tipo de erro, uma mensagem de erro higienizada (sem nomes de arquivos, caminhos, e-mails e valores entre aspas), um stack de origem com os nomes-base dos arquivos e, para ferramentas de IA, um traceback do Python apenas com os nomes-base dos arquivos.

## O que nunca coletamos {#what-we-never-collect}

- Nomes ou caminhos de arquivos
- Conteúdos de arquivos
- Texto de saída de OCR
- Metadados de imagem (EXIF)
- Texto extraído de documentos
- A identidade da sua conta

O PostHog vê o endereço IP de onde vem cada requisição, como qualquer servidor. Nosso projeto no PostHog descarta esse endereço em vez de armazená-lo, e os eventos do próprio servidor do SnapOtter enviam um valor fictício no lugar dele.

## Avisos de atualização {#update-notices}

Enquanto a análise estiver ativada, o servidor pergunta ao PostHog a cada poucas horas qual é a versão mais recente do SnapOtter, usando o ID anônimo da instância e a versão dela. Quando existe uma versão mais nova, os administradores veem um aviso com um link para as notas da versão. Se você fechar o aviso, ele fica oculto até a próxima versão. Nada é instalado nem baixado por você, e com a análise desativada o servidor nunca pergunta.

## Como desativar {#turning-it-off}

Administradores: Configurações > Sistema > Privacidade, desative "Análises de Produto Anônimas". A coleta para imediatamente, em toda a instância. Para criar uma imagem que nunca possa emitir dados, defina o build arg `SNAPOTTER_ANALYTICS=off`.

Para iniciar uma nova instância com a análise já desativada, adicione `SNAPOTTER_ANALYTICS_DEFAULT=off` ao ambiente do servidor antes da primeira inicialização. Com Docker Compose, coloque-a em `environment:` do serviço do app, porque defini-la apenas no `.env` não faz com que ela chegue ao contêiner.
