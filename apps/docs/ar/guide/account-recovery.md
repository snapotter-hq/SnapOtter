---
i18n_source_hash: f75ca08bcb71
i18n_provenance: machine
i18n_output_hash: ca1569b6566f
i18n_hash_version: 2
---
# استعادة الحساب {#account-recovery}

إذا مُنعت من الدخول إلى SnapOtter (غالبًا بسبب سياسة MFA لم تعد
تستطيع تلبيتها)، يمكنك الاستعادة من داخل الحاوية بدون عميل قاعدة
بيانات. أوامر الاستعادة تعمل دون اتصال وتتطلب وصولًا إلى صدفة الحاوية،
وهو ما يعني بالفعل التحكم الكامل في المثيل.

## أيّ حاجز أواجه؟ {#which-wall-am-i-hitting}

يطبّق تسجيل الدخول في SnapOtter بوابتَي MFA مستقلتين. شخّص أولًا:

```bash
docker exec -it snapotter snapotter-admin status
```

يطبع هذا سياسة MFA الحالية وأي المستخدمين قد سجّلوا TOTP.

- **"يجب التسجيل في MFA قبل تسجيل الدخول" (ولم تُعدّ أبدًا تطبيقًا):**
  السياسة تتطلب MFA لكن ليس لديك تسجيل. خفّف السياسة.
- **يُطلب منك رمز لا يمكنك إنتاجه** (فقدت هاتفك ورموز
  الاستعادة الخاصة بك): حسابك مسجَّل. امسح ذلك التسجيل.

## تخفيف سياسة MFA {#relax-the-mfa-policy}

```bash
docker exec -it snapotter snapotter-admin reset-mfa-policy
```

يعيد هذا السياسة إلى `optional`. يُطبَّق عند تسجيل دخولك التالي دون
إعادة تشغيل. لا يضبط سوى `optional` على الإطلاق، لذا لا يمكنه إعادة تفعيل الإلزام.

## مسح تسجيل TOTP لمستخدم واحد {#clear-one-user-s-totp-enrollment}

```bash
docker exec -it snapotter snapotter-admin disable-mfa <username>
```

إذا كانت السياسة لا تزال تتطلب MFA لذلك المستخدم، فسيصطدم بحاجز
التسجيل بعد ذلك، لذا شغّل أيضًا `reset-mfa-policy`، وسجّل الدخول، وأعد التسجيل من الإعدادات.

## إعادة تعيين كلمة مرور منسية {#reset-a-forgotten-password}

```bash
docker exec -it snapotter snapotter-admin reset-password <username> [password]
```

احذف `[password]` وسيطبع CLI كلمة مرور مؤقتة مُولَّدة. وفي كلتا الحالتين، تُمسح الجلسات النشطة للمستخدم ومفاتيح API ونافذة تقييد محاولات الدخول الفاشلة، ويطلب SnapOtter تغيير كلمة المرور عند تسجيل الدخول التالي.

## إنشاء حساب مسؤول جديد {#bootstrap-an-admin-account}

```bash
docker exec -it snapotter snapotter-admin create-admin [username] [password]
```

استخدم هذا عندما يتعذر على أي حساب مسؤول حالي تسجيل الدخول. القيمة الافتراضية لـ `[username]` هي `DEFAULT_USERNAME` (`admin`)، وعند حذف `[password]` تُطبع كلمة مرور مؤقتة يجب تغييرها عند أول تسجيل دخول.

## إلغاء قفل مستخدم مقيّد أو معطّل {#unlock-a-throttled-or-disabled-user}

```bash
docker exec -it snapotter snapotter-admin unlock-user <username>
```

يمسح هذا نافذة `LOGIN_THROTTLED` في Redis ويستعيد دور الحساب إذا كان المستخدم معطّلًا.

## الصور الأقدم والبدائل الاحتياطية {#older-images-and-fallbacks}

على صورة بُنيت قبل وجود غلاف `snapotter-admin`، استدعِ السكربت
مباشرة:

```bash
docker exec -w /app/apps/api snapotter ./node_modules/.bin/tsx \
  src/scripts/admin-recovery.ts reset-mfa-policy
```

كملاذ أخير على أي إصدار، اضبط السياسة في قاعدة البيانات. على
الصورة الشاملة يعمل Postgres داخل الحاوية:

```bash
docker exec -it snapotter psql -h 127.0.0.1 -U snapotter -d snapotter \
  -c "UPDATE settings SET value = 'optional' WHERE key = 'mfaPolicy';"
```

على الإعداد متعدد الحاويات، وجّه `psql` إلى `DATABASE_URL` الخاص بك بدلًا من ذلك.

## مُنعت من SSO وليس MFA؟ {#locked-out-of-sso-not-mfa}

إذا كان تسجيل دخول SSO الملزَم يفشل، فاستخدم حساب الطوارئ المحلي بدلًا من ذلك:
اضبط `ssoBreakGlassUsername` إلى مسؤول محلي ضمن الإعدادات > الأمان قبل أن
تفرض SSO، وسجّل الدخول بكلمة مرور ذلك الحساب.
