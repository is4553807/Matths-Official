# Matths 파일 저장소 설정

파일 저장의 권위 문서는 [`docs/logic/13_STORAGE.md`](logic/13_STORAGE.md)다. 운영자 아카이브·주간 공식 모의고사·Matths 교재 상점은 Cloudflare R2 비공개 저장소를 사용하고, 게시판 첨부·GOAT Arena 풀이 증거·사용자 소명자료는 Cloudinary 비공개 저장소를 사용한다. 권한을 통과한 PDF 다운로드는 원본 URL을 직접 노출하지 않고 사용자별 다층 식별 사본을 발급한다. 운영자는 외부 API 없이 유출 PDF의 서명 또는 유출 스크린샷의 반복 추적 코드 OCR 결과를 발급 원장과 대조할 수 있다.

## Cloudinary 사용자 파일

```text
FILE_STORAGE_PROVIDER=cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

`CLOUDINARY_URL` 대신 `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` 세 값을 각각 등록해도 된다. 모든 사용자 자산은 `authenticated` 방식으로 저장하고 Matths 권한 검사 뒤 서명 주소를 발급한다.

## R2 운영자·상점 파일

Cloudflare 대시보드의 **Storage & databases → R2**에서 비공개 버킷을 만들고, 해당 버킷으로 범위를 제한한 `Object Read & Write` API 토큰을 발급한다.

```text
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=matths-admin-backup
```

운영자 아카이브, Matths 주간 공식 모의고사와 Matths 교재 상점의 상품 파일·썸네일·상세 이미지는 R2에 원본으로 저장한다. 서버는 로그인·폴더·상품 공개·무료 또는 구매 권한을 검사한 뒤 최대 5분짜리 서명 URL을 발급한다.

연결 검사는 다음과 같다.

```bash
npm run storage-r2:verify
R2_VERIFY_WRITE=1 npm run storage-r2:verify
```

기존 로컬 아카이브·상점 파일은 먼저 변경 없이 확인하고 실제 이전한다.

```bash
npm run storage-r2:migrate
npm run storage-r2:migrate -- --apply
```

마이그레이션은 안전을 위해 로컬 사본을 자동 삭제하지 않는다.

## 로컬 임시 파일

업로드 검증 과정에서만 `storage/archive/`, `storage/tmp/store-uploads/`, `storage/tmp/user-cloud/`을 사용한다. 원격 업로드와 DB 저장이 완료되면 임시 파일을 삭제한다. Cloudinary 또는 R2 환경 변수가 없으면 해당 신규 업로드를 거절하며 서버 디스크에 원본을 대체 보관하지 않는다.

## 운영 확인

- API Secret과 R2 Secret을 브라우저 코드·EJS·응답·로그·Git에 노출하지 않는다.
- R2 버킷은 공개하지 않는다.
- 사용자 다운로드는 저장 객체 키가 아니라 Matths 권한 검사를 거친 서명 URL로만 제공한다.
- Cloudinary와 R2 대시보드의 Storage·요청량을 정기적으로 확인한다.
- PDF 원본 분석은 서명 검증 결과를, 스크린샷 분석은 OCR 일치 신뢰도와 다른 운영 증거를 함께 확인한다.
- 유출 분석에 올린 PDF·이미지는 처리 직후 임시 디스크에서 삭제되며 분석 원본이나 OCR 전문을 DB에 남기지 않는다.
