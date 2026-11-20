---
description: "Quais dados de uso anônimos o SnapOtter coleta, quando são enviados, como funciona a escolha da primeira execução e como desativar as análises de produto de toda a instância."
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: b26fe3ff7032
i18n_hash_version: 2
---

# O que o SnapOtter coleta {#what-snapotter-collects}

Anonymous Product Analytics é definido para toda a instância por um administrador. Uma instância nova pergunta na primeira execução e não envia nada até que alguém responda. Você pode alterá-lo a qualquer momento em Settings > System > Privacy.

Quando as análises estão ativadas, o SnapOtter envia ao PostHog quais ferramentas e pipelines são executados, quanto tempo levam, se têm sucesso, os códigos de erro e a contagem de arquivos, junto com o ID anônimo da instância, a versão, a arquitetura da CPU, o sistema operacional, o tipo de instalação e se há uma GPU. Os relatórios de falhas vão para o Sentry sem nomes de arquivos, caminhos, e-mails e valores entre aspas. Ele nunca envia seus arquivos, os nomes ou caminhos deles, o conteúdo, a saída do OCR ou o texto extraído, os metadados das imagens nem a identidade da sua conta. PostHog e Sentry são os únicos dois destinos para os quais ele envia algo, e com as análises desativadas não envia nada a nenhum dos dois.

## Escolha da primeira execução {#first-run-choice}

Na primeira vez que um administrador abre uma instância nova, o SnapOtter pergunta: "Enviar estatísticas de uso anônimas e relatórios de falhas? Seus arquivos nunca são enviados." As duas respostas têm o mesmo peso e nenhuma vem pré-selecionada. Fechar a janela sem responder mantém as análises desativadas e a pergunta volta na próxima visita. Somente um administrador a vê. Com `AUTH_ENABLED=false` não há contas e o usuário local atua como administrador, então quem abrir o app responde. O app para desktop pergunta da mesma forma.

Uma instância que já estava em execução antes de essa pergunta existir não é consultada. Ela mantém a configuração de análises que tinha: ativada, a menos que um administrador ou `SNAPOTTER_ANALYTICS_DEFAULT=off` a tenha desativado.

## Eventos que enviamos (quando ativado) {#events-we-send-when-enabled}

- tool_used: id da ferramenta, status, duração, categoria, se é uma ferramenta de IA, um código de erro em caso de falha e o nome da etapa quando uma ferramenta relata uma fase separadamente (a etapa de análise do Passport Photo).
- pipeline_executed: contagem de etapas, ids das ferramentas, flag de lote, contagem de arquivos, duração, status.
- ai_bundle_action: id do pacote, ação (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), duração e, quando a instalação falha, uma categoria de falha de uma lista fixa (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). A saída do instalador, caminhos e mensagens de erro nunca são enviados.
- Uso do frontend: quais páginas de ferramentas são abertas, arquivos adicionados (apenas contagens), ferramenta iniciada, downloads, salvamentos, busca (apenas contagem de resultados), processamento em lote.
- Relatórios de falhas: tipo de erro, uma mensagem de erro higienizada (sem nomes de arquivos, caminhos, e-mails e valores entre aspas), um stack de origem com os nomes-base dos arquivos e, para ferramentas de IA, um traceback do Python apenas com os nomes-base dos arquivos.

## O que nunca coletamos {#what-we-never-collect}

- Nomes ou caminhos de arquivos
- Conteúdo dos arquivos
- Texto de saída do OCR
- Metadados de imagem (EXIF)
- Texto extraído de documentos
- A identidade da sua conta

O PostHog vê o endereço IP de onde vem cada requisição, como qualquer servidor. Nosso projeto do PostHog o descarta em vez de armazená-lo, e os eventos do próprio servidor do SnapOtter enviam um espaço reservado no lugar.

## Avisos de atualização {#update-notices}

Enquanto as análises estão ativadas, o servidor pergunta ao PostHog a cada poucas horas qual é a versão mais recente do SnapOtter, usando o ID anônimo da instância e a versão dela. Quando existe uma versão mais nova, os administradores veem um aviso com um link para as notas de versão. Se você o dispensar, ele fica oculto até a próxima versão. Nada é instalado nem baixado para você e, com as análises desativadas, o servidor nunca pergunta.

## Como desativar {#turning-it-off}

Administradores: Settings > System > Privacy, desative "Anonymous Product Analytics". O envio para imediatamente, em toda a instância. Para criar uma imagem que nunca possa emitir dados, defina o argumento de build `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` no ambiente do servidor faz o mesmo em tempo de execução e prevalece sobre qualquer resposta salva no app.

Para responder de antemão à pergunta da primeira execução, adicione `SNAPOTTER_ANALYTICS_DEFAULT=off` (ou `on`) ao ambiente do servidor antes da primeira inicialização, e ninguém será consultado. Com Docker Compose, coloque-o em `environment:` do serviço do app, porque defini-lo apenas em `.env` não chega ao contêiner.
