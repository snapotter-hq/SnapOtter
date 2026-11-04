---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: ab555c73c895
i18n_hash_version: 2
---
# Atualizando da 1.x para a 2.0 {#upgrading-from-1-x-to-2-0}

O SnapOtter 1.x armazenava tudo em um único arquivo SQLite e rodava como um único contêiner. O SnapOtter 2.0 usa PostgreSQL e Redis. Este guia mostra como mover uma instalação 1.x para a 2.0 sem perder dados.

Em resumo: reutilize o seu volume `/data` existente, e a 2.0 importa automaticamente o seu banco de dados 1.x na primeira inicialização. Seus usuários, arquivos salvos, configurações, chaves de API e pipelines são transferidos. O banco de dados antigo nunca é modificado, então você sempre pode voltar atrás.

::: tip Um recado para os nossos usuários da 1.x
Muitos de vocês confiam no SnapOtter desde o primeiro dia, e o feedback de vocês moldou este release. A 2.0 muda muita coisa por baixo dos panos, e este guia existe para que a migração não custe nada do que importa para você. Suas contas, arquivos, configurações, chaves de API e pipelines são transferidos, e o seu banco de dados antigo nunca é tocado. Obrigado por atualizar com a gente.
:::

## Antes de começar: faça backup do volume `/data` inteiro {#before-you-start-back-up-the-whole-data-volume}

Faça isto primeiro, sempre. Faça backup do volume `/data` **inteiro**, não apenas do arquivo `snapotter.db`.

Veja por que isso importa. A 1.x executa o SQLite em modo WAL, então um contêiner 1.x parado costuma deixar a maior parte dos dados confirmados em `snapotter.db-wal`, ao lado de um `snapotter.db` quase vazio. Copiar apenas `snapotter.db` captura um banco de dados vazio e perde tudo em silêncio. O volume reúne `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` e o seu diretório `files/`, e eles precisam ser movidos juntos, como um conjunto.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Atualize primeiro para a 1.17.2 {#upgrade-to-1-17-2-first}

Atualize a sua instalação 1.x para o release 1.x mais recente (1.17.2) antes de migrar para a 2.0. Isso permite que a 1.x execute as próprias migrações finais de esquema, de modo que a 2.0 importe a partir de um esquema conhecido e completo. Atualizar de uma 1.x mais antiga diretamente para a 2.0 não é compatível.

## Confira o nome do seu volume {#check-your-volume-name}

O importador só enxerga seus dados se a stack 2.0 montar o mesmo volume usado pela sua instalação 1.x. Os nomes de volumes do Docker diferenciam maiúsculas de minúsculas, e trechos mais antigos do README usavam `snapotter-data` em minúsculas, enquanto os arquivos Compose usam `SnapOtter-data`. Confirme qual você tem:

```bash
docker volume ls | grep -i snapotter
```

Use exatamente esse nome na sua configuração da 2.0.

## Caminho A: contêiner único (mais rápido) {#path-a-single-container-quickest}

Se você executa o SnapOtter com um único `docker run`, continue assim. A 2.0 inicia um PostgreSQL e um Redis embutidos dentro do contêiner quando você não define `DATABASE_URL` nem `REDIS_URL`, e detecta e importa `/data/snapotter.db` automaticamente na primeira inicialização.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Observe nos logs uma linha como:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Pronto. Faça login com as suas credenciais existentes.

## Caminho B: Compose (recomendado para produção) {#path-b-compose-recommended-for-production}

A stack Compose da 2.0 executa três serviços (app, Postgres, Redis). Reutilize o seu volume `/data` da 1.x no serviço do app. O app detecta `/data/snapotter.db` automaticamente e o importa para o Postgres na primeira inicialização.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Se preferir apontar explicitamente para o banco de dados antigo, defina `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Um caminho explícito sempre prevalece sobre a detecção automática.

## Visualize a importação primeiro (opcional) {#preview-the-import-first-optional}

Para ver exatamente o que seria importado sem gravar nada, execute uma simulação (dry run) no arquivo do seu banco de dados:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Ela imprime a contagem de linhas por tabela, quantos arquivos da biblioteca salva ela encontrou no disco e quaisquer status de tarefas que ela vai normalizar. Não precisa de um Postgres em execução.

## O que é transferido e o que não é {#what-carries-over-and-what-does-not}

Transferido:

- Usuários e a capacidade de fazer login. Os hashes de senha permanecem inalterados, então o mesmo nome de usuário e a mesma senha funcionam.
- Equipes, configurações (incluindo a identidade da sua instância), papéis, chaves de API (continuam funcionando) e pipelines salvos.
- Registros do histórico de tarefas.
- Sua biblioteca de arquivos salvos, tanto os registros quanto os arquivos em si, porque `/data/files` é preservado no volume.

Não transferido:

- Sessões de login. Todos entram uma vez após a atualização. As credenciais não mudam, então é um único novo login, nada além disso.
- Os arquivos de entrada e de saída de tarefas de processamento antigas. Eles ficavam em um workspace temporário e se foram por design. Os registros do histórico de tarefas permanecem.
- Os indicadores de consentimento de analytics por usuário da 1.x, que não têm equivalente na 2.0 (o analytics da 2.0 é uma configuração no nível da instância).

## Desativando a importação {#turning-the-import-off}

Se você quiser deliberadamente um banco de dados novo, mesmo havendo um `snapotter.db` presente no volume, defina `SQLITE_MIGRATE_PATH=off`.

## Se você já tem dados na instância 2.0 {#if-you-already-have-data-in-the-2-0-instance}

O importador só executa em um banco de dados vazio. Se você iniciou a 2.0 do zero (criando dados) e depois montou um `snapotter.db` antigo, a 2.0 vai detectá-lo, mas não importará, porque mesclar dois conjuntos de dados pode gerar colisões de IDs. Você verá um aviso nos logs. Para importar os dados da 1.x, você precisa de uma instância vazia:

- Se a instância 2.0 contém apenas o administrador padrão (você ainda não a usou de fato), pare a stack, remova o volume do Postgres (`SnapOtter-pgdata`) e inicie novamente com o `/data` antigo presente. Ele será importado sem problemas. Isso apaga apenas os dados descartáveis do Postgres, não o seu banco de dados 1.x.
- Se a instância 2.0 contém dados reais que você quer manter, os dois conjuntos de dados não podem ser mesclados automaticamente. Exporte o que precisar e importe os dados da 1.x em uma implantação nova e separada.

## Revertendo {#rolling-back}

A atualização nunca modifica nem exclui o seu `snapotter.db` da 1.x. Se precisar voltar para a 1.x, reimplante a imagem 1.x usando o mesmo volume. Tudo o que você criou na 2.0 após a atualização fica no Postgres e não estaria no banco de dados da 1.x, então faça a reversão logo, se for fazê-la.
