---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 7ff2310f6283
---
# Atualizando da 1.x para a 2.0 {#upgrading-from-1-x-to-2-0}

O SnapOtter 1.x armazenava tudo em um único arquivo SQLite e rodava como um contêiner. O SnapOtter 2.0 usa PostgreSQL e Redis. Este guia orienta a migração de uma instalação 1.x para a 2.0 sem perder dados.

Em resumo: reutilize seu volume `/data` existente, e a 2.0 importa seu banco de dados 1.x automaticamente na primeira inicialização. Seus usuários, arquivos salvos, configurações, chaves de API e pipelines são transferidos. O banco de dados antigo nunca é modificado, então você sempre pode reverter.

::: tip Um recado para nossos usuários da 1.x
Muitos de vocês confiaram no SnapOtter desde o primeiro dia, e seu feedback moldou esta versão. A 2.0 muda bastante coisa nos bastidores, e este guia existe para que a migração não custe nada do que importa para você. Suas contas, arquivos, configurações, chaves de API e pipelines são transferidos, e seu banco de dados antigo nunca é tocado. Obrigado por atualizar conosco.
:::

## Antes de começar: faça backup de todo o volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Faça isso primeiro, sempre. Faça backup do volume `/data` **inteiro**, não apenas do arquivo `snapotter.db`.

Eis por que isso importa. A 1.x roda o SQLite em modo WAL, então um contêiner 1.x parado costuma deixar a maior parte dos seus dados confirmados em `snapotter.db-wal` ao lado de um `snapotter.db` quase vazio. Copiar apenas `snapotter.db` captura um banco de dados vazio e perde tudo silenciosamente. O volume carrega `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` e seu diretório `files/` juntos, e eles precisam viajar como um conjunto.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Atualize primeiro para a 1.17.2 {#upgrade-to-1-17-2-first}

Atualize sua instalação 1.x para a última versão 1.x (1.17.2) antes de migrar para a 2.0. Isso permite que a 1.x execute suas próprias migrações finais de esquema, de forma que a 2.0 importe a partir de um esquema conhecido e completo. Atualizar de uma 1.x mais antiga direto para a 2.0 não é suportado.

## Verifique o nome do seu volume {#check-your-volume-name}

O importador só enxerga seus dados se a stack 2.0 montar o mesmo volume que sua instalação 1.x usava. Os nomes de volume do Docker diferenciam maiúsculas de minúsculas, e trechos antigos do README usavam um `snapotter-data` em minúsculas enquanto os arquivos do Compose usam `SnapOtter-data`. Confirme qual você tem:

```bash
docker volume ls | grep -i snapotter
```

Use esse nome exato na sua configuração da 2.0.

## Caminho A: contêiner único (mais rápido) {#path-a-single-container-quickest}

Se você roda o SnapOtter com um único `docker run`, continue fazendo isso. A 2.0 inicializa um PostgreSQL e um Redis embutidos dentro do contêiner quando você não define `DATABASE_URL` nem `REDIS_URL`, e detecta e importa `/data/snapotter.db` automaticamente na primeira inicialização.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Acompanhe os logs em busca de uma linha como:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

É isso. Faça login com suas credenciais existentes.

## Caminho B: Compose (recomendado para produção) {#path-b-compose-recommended-for-production}

A stack Compose da 2.0 roda três serviços (app, Postgres, Redis). Reutilize seu volume `/data` da 1.x para o serviço do app. O app detecta `/data/snapotter.db` automaticamente e o importa para o Postgres na primeira inicialização.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Se você preferir apontar para o banco de dados antigo explicitamente, defina `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Um caminho explícito sempre prevalece sobre a detecção automática.

## Visualize a importação antes (opcional) {#preview-the-import-first-optional}

Para ver exatamente o que seria importado sem gravar nada, execute uma simulação (dry run) contra seu arquivo de banco de dados:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Ela imprime a contagem de linhas por tabela, quantos arquivos da biblioteca salva foram encontrados em disco e quaisquer status de job que serão normalizados. Não precisa de um Postgres em execução.

## O que é transferido e o que não é {#what-carries-over-and-what-does-not}

Transferido:

- Usuários e a capacidade de fazer login. Os hashes de senha permanecem inalterados, então o mesmo nome de usuário e senha funcionam.
- Times, configurações (incluindo a identidade da sua instância), papéis, chaves de API (que continuam funcionando) e pipelines salvos.
- Registros de histórico de jobs.
- Sua biblioteca de arquivos salvos, tanto os registros quanto os arquivos em si, porque `/data/files` é preservado no volume.

Não transferido:

- Sessões de login. Todos entram uma vez após a atualização. As credenciais permanecem inalteradas, então é um único novo login, nada mais.
- Os arquivos de entrada e saída de jobs de processamento antigos. Eles ficavam em um espaço de trabalho temporário e não existem mais, por design. Os registros de histórico de jobs permanecem.
- Sinalizadores de consentimento de análise por usuário da 1.x, que não têm equivalente na 2.0 (a análise da 2.0 é uma configuração no nível da instância).

## Desligando a importação {#turning-the-import-off}

Se você deliberadamente quiser um banco de dados novo mesmo com um `snapotter.db` presente no volume, defina `SQLITE_MIGRATE_PATH=off`.

## Se você já tem dados na instância 2.0 {#if-you-already-have-data-in-the-2-0-instance}

O importador só roda em um banco de dados vazio. Se você iniciou a 2.0 do zero (criando dados) e depois montou um `snapotter.db` antigo, a 2.0 vai detectá-lo mas não vai importar, porque mesclar dois conjuntos de dados pode gerar colisões de IDs. Você verá um aviso nos logs. Para importar os dados da 1.x, você precisa de uma instância vazia:

- Se a instância 2.0 contém apenas o admin padrão (você praticamente não a usou), pare a stack, remova o volume do Postgres (`SnapOtter-pgdata`) e inicialize novamente com o `/data` antigo presente. Ele importará sem problemas. Isso apaga apenas os dados descartáveis do Postgres, não o seu banco de dados 1.x.
- Se a instância 2.0 contém dados reais que você quer manter, os dois conjuntos de dados não podem ser mesclados automaticamente. Exporte o que você precisa e importe os dados da 1.x em uma implantação nova e separada.

## Revertendo {#rolling-back}

A atualização nunca modifica nem exclui seu `snapotter.db` da 1.x. Se você precisar voltar para a 1.x, reimplante a imagem 1.x contra o mesmo volume. Qualquer coisa criada na 2.0 após a atualização fica no Postgres e não estaria no banco de dados 1.x, então reverta logo se for fazer isso.
