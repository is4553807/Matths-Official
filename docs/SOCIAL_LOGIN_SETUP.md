# Matths 소셜 로그인 설정

Matths는 Google OAuth 2.0의 서버 인증 코드 흐름을 사용한다. Google이 검증한 이메일은 회원가입 화면에 고정되며 사용자가 수정할 수 없다.

## 공통 동작

1. 이용자가 로그인 화면에서 공급자를 선택한다.
2. 서버가 일회용 `state`를 세션에 저장하고 공급자 동의 화면으로 이동한다.
3. 콜백에서 `state`, 인증 코드, 검증된 이메일을 확인한다.
4. 같은 공급자 계정 또는 같은 검증 이메일의 Matths 계정이 있으면 로그인한다.
5. 신규 이용자라면 30분 동안만 유효한 가입 세션을 만들고, 고정 이메일 외의 필수 정보 입력 화면으로 이동한다.

## Google Cloud Console

- 애플리케이션 유형: 웹 애플리케이션
- 로컬 승인된 리디렉션 URI: `http://localhost:8000/auth/google/callback`
- 운영 승인된 리디렉션 URI: `https://운영도메인/auth/google/callback`
- 범위: `openid`, `email`, `profile`

`config.env`에 다음 값을 입력한다.

```ini
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/auth/google/callback
```

## 운영 전 확인

- 운영 도메인의 HTTPS 콜백 URI와 `config.env` 값이 글자 단위로 일치해야 한다.
- 비밀 키는 Git에 커밋하지 않는다.
- Google에서 신규 가입, 기존 이메일 연결, 로그인 취소, 이메일 제공 거부를 확인한다.
- 같은 이메일의 학부모 계정은 학생 계정으로 자동 합치지 않는다.
