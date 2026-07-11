---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 0b85ef707c86
---
# 從 1.x 升級到 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x 把所有東西都存放在單一 SQLite 檔案，並以單一容器執行。SnapOtter 2.0 改用 PostgreSQL 與 Redis。本指南會逐步說明如何把 1.x 安裝移到 2.0 而不遺失資料。

簡短版本：重複使用你現有的 `/data` 磁碟區，2.0 會在首次開機時自動匯入你的 1.x 資料庫。你的使用者、已儲存的檔案、設定、API 金鑰與管線都會一併帶過來。舊資料庫從不會被修改，所以你隨時都能回復。

::: tip 給我們 1.x 使用者的話
你們許多人從第一天起就信任 SnapOtter，而你們的回饋形塑了這次的版本。2.0 在底層改動了很多，本指南的存在就是要讓這次搬遷不會讓你損失任何你在意的東西。你的帳號、檔案、設定、API 金鑰與管線都會延續下來，而你的舊資料庫永遠不會被動到。感謝你與我們一起升級。
:::

## 開始前：備份整個 `/data` 磁碟區 {#before-you-start-back-up-the-whole-data-volume}

每次都先做這件事。備份**整個** `/data` 磁碟區，而不只是 `snapotter.db` 檔案。

原因如下。1.x 以 WAL 模式執行 SQLite，因此已停止的 1.x 容器常會把大部分已提交的資料留在 `snapotter.db-wal`，旁邊只有一個幾乎為空的 `snapotter.db`。只複製 `snapotter.db` 會抓到一個空的資料庫，並悄悄地遺失一切。磁碟區同時承載 `snapotter.db`、`snapotter.db-wal`、`snapotter.db-shm` 以及你的 `files/` 目錄，它們必須作為一整組一起搬移。

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## 先升級到 1.17.2 {#upgrade-to-1-17-2-first}

在搬到 2.0 之前，先把你的 1.x 安裝升級到最新的 1.x 版本（1.17.2）。這能讓 1.x 執行它自己最後的結構描述遷移，如此 2.0 才會從一個已知且完整的結構描述進行匯入。從較舊的 1.x 直接升級到 2.0 並不受支援。

## 檢查你的磁碟區名稱 {#check-your-volume-name}

只有當 2.0 堆疊掛載的磁碟區與你 1.x 安裝所用的相同時，匯入程式才看得到你的資料。Docker 磁碟區名稱區分大小寫，較舊的 README 片段用的是小寫的 `snapotter-data`，而 Compose 檔案用的是 `SnapOtter-data`。請確認你用的是哪一個：

```bash
docker volume ls | grep -i snapotter
```

在你的 2.0 設定中使用那個確切的名稱。

## 路徑 A：單一容器（最快） {#path-a-single-container-quickest}

如果你以單一 `docker run` 執行 SnapOtter，就繼續那樣做。當你沒有設定 `DATABASE_URL` 或 `REDIS_URL` 時，2.0 會在容器內啟動一個內嵌的 PostgreSQL 與 Redis，並在首次開機時自動偵測並匯入 `/data/snapotter.db`。

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

留意日誌中類似這樣的一行：

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

就這樣。用你既有的憑證登入。

## 路徑 B：Compose（正式環境建議） {#path-b-compose-recommended-for-production}

2.0 的 Compose 堆疊會執行三個服務（app、Postgres、Redis）。將你 1.x 的 `/data` 磁碟區重複用於 app 服務。app 會自動偵測 `/data/snapotter.db`，並在首次開機時把它匯入 Postgres。

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

如果你寧可明確指向舊資料庫，請設定 `SQLITE_MIGRATE_PATH=/data/snapotter.db`。明確指定的路徑永遠優先於自動偵測。

## 先預覽匯入（選用） {#preview-the-import-first-optional}

若要在不寫入任何內容的情況下精確看到會匯入什麼，請對你的資料庫檔案執行一次 dry run：

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

它會印出每個資料表的列數、在磁碟上找到多少已儲存的資料庫檔案，以及任何它將正規化的作業狀態。它不需要執行中的 Postgres。

## 哪些會延續，哪些不會 {#what-carries-over-and-what-does-not}

會延續的：

- 使用者，以及登入的能力。密碼雜湊不變，因此相同的使用者名稱與密碼仍然有效。
- 團隊、設定（包含你的執行個體識別）、角色、API 金鑰（它們會繼續運作），以及已儲存的管線。
- 作業歷史記錄。
- 你已儲存的檔案庫，包含記錄與實際檔案，因為 `/data/files` 在磁碟區上會被保留。

不會延續的：

- 登入工作階段。所有人都要在升級後重新登入一次。憑證不變，所以只是單次重新登入，僅此而已。
- 舊處理作業的輸入與輸出檔案。那些位於暫時性的工作區，依設計已不存在。作業歷史記錄仍保留。
- 來自 1.x 的每位使用者分析同意旗標，在 2.0 沒有對應項（2.0 的分析是執行個體層級的設定）。

## 關閉匯入 {#turning-the-import-off}

如果磁碟區上存在 `snapotter.db`，而你刻意想要一個全新的資料庫，請設定 `SQLITE_MIGRATE_PATH=off`。

## 如果你的 2.0 執行個體已經有資料 {#if-you-already-have-data-in-the-2-0-instance}

匯入程式只會在空資料庫上執行。如果你以全新方式啟動了 2.0（建立了資料），之後才掛載一個舊的 `snapotter.db`，2.0 會偵測到它但不會匯入，因為合併兩個資料集可能會在 ID 上發生衝突。你會在日誌中看到一則警告。要匯入 1.x 資料，你需要一個空的執行個體：

- 如果 2.0 執行個體只有預設管理員（你其實還沒真正用過它），請停止堆疊、移除 Postgres 磁碟區（`SnapOtter-pgdata`），然後在舊的 `/data` 存在的情況下重新開機。它會乾淨地匯入。這只會清除可拋棄的 Postgres 資料，不會動到你的 1.x 資料庫。
- 如果 2.0 執行個體握有你想保留的真實資料，這兩個資料集無法自動合併。請匯出你需要的內容，並將 1.x 資料匯入到另一個全新的部署。

## 回復 {#rolling-back}

升級從不會修改或刪除你的 1.x `snapotter.db`。如果你需要退回 1.x，請對相同的磁碟區重新部署 1.x 映像。升級後你在 2.0 建立的任何內容都位於 Postgres，不會出現在 1.x 資料庫，所以若你打算回復，就要盡快進行。
