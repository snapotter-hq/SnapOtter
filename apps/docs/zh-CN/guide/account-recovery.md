---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: d14b1dfe08e8
i18n_hash_version: 2
---
# 账户恢复 {#account-recovery}

如果你被锁定在 SnapOtter 之外（最常见的原因是遇到了一项你已
无法再满足的 MFA 策略），无需数据库客户端即可从容器内部
完成恢复。恢复命令均可离线运行，并且需要对容器拥有 shell 访问权限，
而这本身就已经意味着对该实例拥有完全控制权。

## 我遇到的是哪一道关卡？ {#which-wall-am-i-hitting}

SnapOtter 的登录会施加两道相互独立的 MFA 关卡。请先做诊断：

```bash
docker exec -it snapotter snapotter-admin status
```

这会打印出当前的 MFA 策略以及哪些用户已注册 TOTP。

- **“登录前必须完成 MFA 注册”（而你从未设置过验证器应用）：**
  策略要求 MFA，但你并无注册记录。请放宽该策略。
- **系统提示你输入一个你无法生成的验证码**（丢失了手机以及你的
  恢复码）：你的账户已注册。请清除该注册。

## 放宽 MFA 策略 {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

这会把策略重新设为 `optional`。它会在你下次登录时生效，无需
重启。它只会设置 `optional`，因此无法重新开启强制要求。

## 清除某个用户的 TOTP 注册 {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

如果策略仍要求该用户使用 MFA，那么他们接下来会撞上注册
关卡，所以还需运行 `reset-mfa-policy`，登录后从“设置”中重新注册。

## 重置忘记的密码 {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

如果省略 `[password]`，CLI 会打印出一个生成的临时密码。无论哪种方式，该用户的活动会话、API 密钥和登录失败限流窗口都会被清除，并且 SnapOtter 会要求其在下次登录时修改密码。

## 引导创建管理员账户 {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

当没有任何现有管理员账户能够登录时，请使用此命令。`[username]` 默认为 `DEFAULT_USERNAME`（`admin`），省略 `[password]` 会打印出一个首次登录时必须修改的临时密码。

## 解锁被限流或已禁用的用户 {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

这会清除 Redis 中的 `LOGIN_THROTTLED` 窗口，并在用户被禁用时恢复该账户的角色。

## 较旧的镜像与回退方案 {#older-images-and-fallbacks}

在 `snapotter-admin` 包装器出现之前构建的镜像上，请直接调用该
脚本：

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

作为任何版本上的最后手段，可在数据库中设置该策略。在
一体化镜像中，Postgres 运行在容器内部：

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

在多容器部署中，请改为将 `psql` 指向你自己的 `DATABASE_URL`。

## 被锁在 SSO 之外，而不是 MFA？ {#locked-out-of-sso-not-mfa}

如果强制的 SSO 登录失败，请改用应急本地账户：在强制启用 SSO 之前，
先在“设置 > 安全”下将 `ssoBreakGlassUsername` 设为一个本地管理员，
然后使用该账户的密码登录。
