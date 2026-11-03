---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: bf9a277a8d60
i18n_hash_version: 2
---
# 從 1.x 升級到 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x 將所有資料儲存在單一 SQLite 檔案中，並以單一容器執行。SnapOtter 2.0 改用 PostgreSQL 與 Redis。本指南會引導您在不遺失資料的情況下，將 1.x 安裝遷移到 2.0。

簡短版本：重複使用既有的 `/data` 磁碟區，2.0 會在首次啟動時自動匯入您的 1.x 資料庫。您的使用者、已儲存的檔案、設定、API 金鑰與管線都會一併轉移。舊資料庫絕不會被修改，因此您隨時可以回復。

::: tip 給 1.x 使用者的話
你們當中有許多人從第一天起就信賴 SnapOtter，您的回饋也形塑了這個版本。2.0 在底層做了大量變更，而本指南的目的，就是讓這次遷移不會讓您失去任何重視的東西。您的帳號、檔案、設定、API 金鑰與管線都會沿用，舊資料庫也不會被動到。感謝您與我們一起升級。
:::

## 開始之前：備份整個 `/data` 磁碟區 {#before-you-start-back-up-the-whole-data-volume}

每次都請先做這件事。請備份**整個** `/data` 磁碟區，而不只是 `snapotter.db` 檔案。

原因如下。1.x 以 WAL 模式執行 SQLite，因此已停止的 1.x 容器通常會把大部分已提交的資料留在 `snapotter.db-wal` 中，而旁邊的 `snapotter.db` 幾乎是空的。只複製 `snapotter.db` 只會得到一個空的資料庫，並在不知不覺中遺失所有資料。該磁碟區同時包含 `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm` 以及您的 `files/` 目錄，它們必須作為一組一起搬移。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 請先升級到 1.17.2 {#upgrade-to-1-17-2-first}

在遷移到 2.0 之前，請先將您的 1.x 安裝升級到最新的 1.x 版本（1.17.2）。這讓 1.x 能先執行自己最後的結構描述遷移，使 2.0 從已知且完整的結構描述匯入。不支援從更舊的 1.x 直接升級到 2.0。

## 確認您的磁碟區名稱 {#check-your-volume-name}

只有在 2.0 堆疊掛載的磁碟區與 1.x 安裝所用的相同時，匯入程式才看得到您的資料。Docker 磁碟區名稱區分大小寫，而較舊的 README 片段使用小寫的 `snapotter-data`，Compose 檔案則使用 `SnapOtter-data`。請確認您使用的是哪一個：

```bash
docker volume ls | grep -i snapotter
```

請在 2.0 設定中使用完全相同的名稱。

## 路徑 A：單一容器（最快） {#path-a-single-container-quickest}

如果您以單一 `docker run` 執行 SnapOtter，請繼續這麼做。當您未設定 `DATABASE_URL` 或 `REDIS_URL` 時，2.0 會在容器內啟動內嵌的 PostgreSQL 與 Redis，並在首次啟動時自動偵測並匯入 `/data/snapotter.db`。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

請留意日誌中是否出現類似下面的一行：

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

這樣就完成了。請使用您原有的憑證登入。

## 路徑 B：Compose（建議用於正式環境） {#path-b-compose-recommended-for-production}

2.0 的 Compose 堆疊會執行三個服務（app、Postgres、Redis）。請為 app 服務重複使用您的 1.x `/data` 磁碟區。應用程式會自動偵測 `/data/snapotter.db`，並在首次啟動時將它匯入 Postgres。

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

如果您希望明確指向舊資料庫，請設定 `SQLITE_MIGRATE_PATH=/data/snapotter.db`。明確指定的路徑一律優先於自動偵測。

## 先預覽匯入（選用） {#preview-the-import-first-optional}

若要在不寫入任何資料的情況下，確切查看將會匯入什麼，請對您的資料庫檔案執行試跑：

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

它會列出每個資料表的資料列數、在磁碟上找到多少個已儲存的檔案庫檔案，以及它將正規化的任何工作狀態。它不需要執行中的 Postgres。

## 哪些會轉移，哪些不會 {#what-carries-over-and-what-does-not}

會轉移的項目：

- 使用者，以及登入的能力。密碼雜湊保持不變，因此相同的使用者名稱與密碼仍可使用。
- 團隊、設定（包括您的執行個體身分識別）、角色、API 金鑰（仍可繼續使用）與已儲存的管線。
- 工作歷史記錄。
- 您已儲存的檔案庫，包括記錄與實際檔案，因為 `/data/files` 保留在磁碟區上。

不會轉移的項目：

- 登入工作階段。升級後每個人都需要登入一次。憑證不變，所以只需重新登入一次，僅此而已。
- 舊處理工作的輸入與輸出檔案。它們存放在暫時性的工作區，依設計已不存在。工作歷史記錄仍會保留。
- 1.x 中每位使用者的分析同意旗標，在 2.0 中沒有對應的項目（2.0 的分析是執行個體層級的設定）。

## 關閉匯入 {#turning-the-import-off}

如果磁碟區上有 `snapotter.db`，但您刻意想要使用全新的資料庫，請設定 `SQLITE_MIGRATE_PATH=off`。

## 如果 2.0 執行個體中已有資料 {#if-you-already-have-data-in-the-2-0-instance}

匯入程式只會匯入到空的資料庫中。如果您先以全新方式啟動 2.0（並建立了資料），之後才掛載舊的 `snapotter.db`，2.0 會偵測到它但不會匯入，因為合併兩份資料集可能造成 ID 衝突。您會在日誌中看到警告。若要匯入 1.x 資料，您需要一個空的執行個體：

- 如果 2.0 執行個體只有預設的管理員（您並未真正使用過），請停止堆疊，移除 Postgres 磁碟區（`SnapOtter-pgdata`），並在舊的 `/data` 存在的情況下再次啟動。它會乾淨地匯入。這只會清除用完即棄的 Postgres 資料，不會動到您的 1.x 資料庫。
- 如果 2.0 執行個體中有您想保留的實際資料，這兩份資料集就無法自動合併。請匯出您需要的內容，並將 1.x 資料匯入另一個全新的部署。

## 回復 {#rolling-back}

升級過程絕不會修改或刪除您的 1.x `snapotter.db`。如果您需要回到 1.x，請針對同一個磁碟區重新部署 1.x 映像檔。您在升級後於 2.0 中建立的任何內容都存放在 Postgres 中，不會出現在 1.x 資料庫裡，所以如果要回復，請盡快進行。
