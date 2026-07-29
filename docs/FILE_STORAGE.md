# Matths 업로드 파일 저장소

현재 아카이브, 사설 모의고사 PDF, 소명 자료는 MongoDB GridFS가 아니라
서버의 로컬 디스크에 저장됩니다.

- 기본 경로: `storage/archive`
- 실제 파일: 위 디렉터리
- MongoDB: 파일명, 원본명, MIME 형식, 크기, 폴더 등의 메타데이터

## 배포 환경 설정

일반 VM처럼 디스크가 영구 보존되는 서버에서는 기본 경로를 사용할 수
있습니다. Docker, Render, Railway, Heroku, 서버리스처럼 재배포 시 로컬
파일시스템이 초기화될 수 있는 환경에서는 영구 볼륨을 마운트하고
다음 환경변수를 그 절대 경로로 지정해야 합니다.

```env
ARCHIVE_STORAGE_DIR=/var/lib/matths/archive
```

해당 디렉터리는 Node.js 프로세스가 읽고 쓸 수 있어야 합니다.

여러 서버 인스턴스를 동시에 실행하면 각 인스턴스의 로컬 파일은 서로
공유되지 않습니다. 수평 확장이 필요할 때는 S3, Cloudflare R2, Google
Cloud Storage 같은 공용 객체 저장소용 저장 어댑터로 이전해야 합니다.
데이터베이스 백업만으로는 업로드 파일이 복구되지 않으므로
`ARCHIVE_STORAGE_DIR`도 별도로 백업해야 합니다.
