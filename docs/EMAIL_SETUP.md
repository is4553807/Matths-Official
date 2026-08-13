# Gmail 단일 발신 설정

Matths의 비밀번호 재설정, 문의 알림·답변, 제재 안내, 페이백·환불 완료를 포함한 모든 메일은 `lsbproduction00@gmail.com` 한 계정에서 발송합니다. 로그인한 관리자의 이메일을 발신 주소로 사용하지 않습니다.

관리자가 수행한 작업은 이메일 발신 주소가 아니라 `AdminActionLog`의 관리자 ID, 실명, 로그인 이메일과 로그인 시각 스냅샷으로 추적합니다.

## 환경변수

```env
ADMIN_EMAIL=admin@lsbproduction.com
PUBLIC_CONTACT_EMAIL=admin@lsbproduction.com
SUPPORT_SMTP_HOST=smtp.gmail.com
SUPPORT_SMTP_PORT=465
SUPPORT_SMTP_SECURE=true
SUPPORT_SMTP_USER=lsbproduction00@gmail.com
GMAIL_APP_PASSWORD=Gmail_앱_비밀번호
SUPPORT_EMAIL_FROM_NAME=Matths
```

`ADMIN_EMAIL`은 문의 알림을 받는 주소이고, `SUPPORT_SMTP_USER`는 SMTP 로그인 계정이자 모든 메일의 실제 발신 주소입니다. Google 계정에서 2단계 인증을 활성화한 뒤 앱 비밀번호를 발급해 `GMAIL_APP_PASSWORD`에 저장합니다. Cafe24 SMTP와 운영자별 SMTP 설정은 사용하지 않습니다.

## 확인

```bash
npm run email-routing:verify
npm run support-email-routing:verify
npm run email:verify
```

첫 두 명령은 실제 이메일을 보내지 않고 라우팅을 검증합니다. 마지막 명령은 운영 Gmail SMTP 연결을 확인합니다.
