# Matths 파일 저장소 설정

파일 저장의 권위 문서는 [`docs/logic/13_STORAGE.md`](logic/13_STORAGE.md)다. 운영자 아카이브·주간 공식 모의고사는 서버 영구 디스크를 사용하고, 게시판 첨부·GOAT Arena 풀이 증거·사용자 소명자료는 Cloudinary 비공개 저장소를 사용한다.

## 운영 환경

Cloudinary 대시보드의 API Environment variable 값을 서버 환경 변수에 등록한다.

```text
FILE_STORAGE_PROVIDER=cloudinary
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

`CLOUDINARY_URL` 대신 `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` 세 값을 각각 등록해도 된다. API Secret은 브라우저 코드나 저장소에 넣지 않는다.

업로드 자산은 `authenticated` 전달 방식으로 저장한다. 사용자가 다운로드하거나 운영자가 풀이 증거를 열 때 기존 Matths 권한 검사를 먼저 통과하고 서버가 서명된 주소를 발급한다.

## 로컬 개발

사용자 파일은 Cloudinary 환경 변수가 없으면 업로드를 거절한다. 운영자 파일은 `storage/archive/`에 저장하며 운영 환경에서는 `LOCAL_STORAGE_PERSISTENT=1`과 영구 디스크가 필요하다. 사용자 파일을 운영 서버 디스크에 자동 대체 저장하지 않는다.

## 무료 사용 범위

Cloudinary 무료 플랜은 카드 등록 없이 사용할 수 있고 월 25크레딧 범위에서 저장공간, 전송량과 변환을 함께 사용한다. 파일이 많아지면 Cloudinary 대시보드의 Storage와 Bandwidth 사용량을 운영 지표에서 함께 확인한다.
