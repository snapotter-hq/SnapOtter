---
i18n_source_hash: 377cf113e7d8
i18n_provenance: machine
i18n_output_hash: 96131c79dc11
i18n_hash_version: 2
---
# 帳號復原 {#account-recovery}

如果你被 SnapOtter 鎖在門外（最常見的原因是無法再滿足的 MFA 政策），你可以在容器內部進行復原，無需資料庫用戶端。復原指令為離線操作，需要有容器的 shell 存取權，而這本身就代表對該執行個體有完整控制權。

## 我遇到的是哪一道牆？ {#which-wall-am-i-hitting}

SnapOtter 的登入會套用兩道各自獨立的 MFA 關卡。請先診斷：

```bash
docker exec -it snapotter snapotter-admin status
```

這會印出目前的 MFA 政策以及哪些使用者已註冊 TOTP。

- **「登入前必須先註冊 MFA」（而你從未設定過驗證應用程式）：**
  政策要求 MFA，但你沒有任何註冊。請放寬政策。
- **系統提示你輸入你無法產生的驗證碼**（手機和
  復原碼都遺失了）：你的帳號已註冊。請清除該註冊。

## 放寬 MFA 政策 {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

這會將政策設回 `optional`。它會在你下次登入時生效，無需
重新啟動。它只會設定 `optional`，因此無法重新開啟強制執行。

## 清除單一使用者的 TOTP 註冊 {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

如果政策仍然要求該使用者使用 MFA，他們接下來會撞上註冊那道
牆，因此也請執行 `reset-mfa-policy`、登入，然後從「設定」重新註冊。

## 較舊的映像檔與備援方案 {#older-images-and-fallbacks}

在 `snapotter-admin` 包裝程式存在之前建置的映像檔上，請直接呼叫該
指令碼：

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/mfa-recover.ts reset-mfa-policy
```

在任何版本上，最後的手段是在資料庫中設定政策。在
多合一映像檔上，Postgres 於容器內部執行：

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

在多容器的設定中，請改將 `psql` 指向你自己的 `DATABASE_URL`。

## 被 SSO 鎖在門外，而不是 MFA？ {#locked-out-of-sso-not-mfa}

如果強制執行的 SSO 登入失敗，請改用緊急備援的本機帳號：
在強制執行 SSO 之前，於「設定 > 安全性」下將 `ssoBreakGlassUsername` 設定為本機管理員，
然後以該帳號的密碼登入。
