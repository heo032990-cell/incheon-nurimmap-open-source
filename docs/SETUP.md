# 설치 및 실행

## 1. 계정 없이 예제 실행

Node.js 24 이상과 npm을 설치합니다. 저장소를 내려받아 해당 폴더에서 실행합니다.

```sh
npm ci
npm run check:public
npm test
npm run build
npm start
```

http://localhost:4173 에서 확인합니다. 기본 빌드는 별도 제작한 가상 프로그램 예제입니다. 검색·활동 분류·상세 보기만 가능하며, 운영 데이터나 API를 호출하지 않습니다.

## 2. 전체 기능을 위한 준비

본인의 Supabase 프로젝트, Google 계정 및 Drive 폴더, 정적 웹 호스팅이 필요합니다. 서비스 가입·요금·할당량은 각 공급자의 조건을 따릅니다. 실제 운영 계정이 아닌 별도 시험 프로젝트에서 먼저 설치하세요.

### 데이터베이스

1. 새 Supabase 프로젝트의 SQL Editor에서 **backend/schema.sql**을 실행합니다.
2. 이어서 **backend/storage-setup.sql**을 실행합니다.
3. **backend/retention.sql**을 실행하여 보유기간과 정기 정리 작업을 설정합니다. Supabase Cron(pg_cron)을 사용할 수 있는 환경이어야 합니다.
4. **backend/guardian-consent.sql**을 실행하여 보호자 동의 검증을 적용합니다.
5. 설치 SQL은 새 프로젝트 전용입니다. 기존 운영 프로젝트에 초기 설치 SQL을 덮어쓰지 마세요. 과거 버전의 별도 SQL은 공개판에서 제거했습니다.
6. Auth 사용자·기관·프로그램·신청 자료는 포함하지 않습니다. app_settings에는 빈 기본 설정 한 행만 만듭니다.

schema.sql은 운영 데이터가 아닌 테이블·함수·RLS 정의를 바탕으로 구성했습니다. 공개판에서는 일반 브라우저 역할의 TRUNCATE 등 불필요한 권한을 제외하고, 파일 업로드는 서버가 수행하도록 Storage 정책을 제한했습니다. 템플릿 저장소는 등록된 담당자들의 공유 저장소입니다. 기관별로 템플릿까지 격리하려면 별도 경로·정책 설계가 필요합니다.

### 최초 총괄 관리자

Supabase Dashboard의 Authentication에서 **본인 관리자 계정**을 먼저 생성합니다. 해당 계정의 UUID를 확인하고, SQL Editor에서 아래 자리표시자를 바꿔 실행합니다. 실제 비밀번호는 SQL이나 GitHub에 기록하지 않습니다.

```sql
insert into public.profiles (id, display_name, role, email)
select id, '총괄 관리자', 'super', email
from auth.users
where id = '00000000-0000-0000-0000-000000000000'::uuid;
```

UUID는 예시이므로 반드시 실제로 만든 본인 계정 UUID로 변경합니다. 등록 후 총괄 관리자 화면에서 기관과 담당자를 생성합니다. 일반 사용자의 Auth 가입만으로 관리자 권한이 생기지 않습니다.

### Google Apps Script

1. 본인 Google 계정으로 새 Apps Script 프로젝트를 만듭니다.
2. **backend/google-apps-script.gs** 내용을 넣습니다. 이 파일 하나를 사용합니다.
3. 프로젝트 설정의 Script Properties에 WEBHOOK_SECRET과 TARGET_FOLDER_ID를 설정합니다. 별도 설문 폴더를 사용하는 경우 SURVEY_FOLDER_ID도 설정합니다.
4. WEBHOOK_SECRET은 충분히 긴 새 무작위 값으로 만들고 서버의 GOOGLE_DRIVE_WEBHOOK_SECRET과 동일하게 설정합니다.
5. 스크립트 실행 계정에 본인 Drive 대상 폴더의 접근 권한을 부여합니다.
6. 웹 앱으로 배포합니다. 실행 계정은 소유자, 서버가 로그인 화면 없이 접근할 수 있는 액세스 범위를 선택합니다. 각 요청은 코드의 secret 검사를 통과해야 합니다.
7. 배포된 웹 앱 URL은 서버 설정에만 넣습니다. Workspace 관리 정책이 익명 웹 앱을 제한하면 관리자의 허용이 필요합니다.

이 단계는 중앙 서버 연계의 웹 앱 배포입니다. 기관별 Google Form의 연결 코드는 관리자 화면에서 따로 생성하며, [Form 연결 안내](../manual/google-form-connection-guide.html)를 따릅니다.

### Supabase Edge Functions

[공식 배포 안내](https://supabase.com/docs/guides/functions/deploy)에 따라 Supabase CLI를 설치하고 로그인합니다.

```sh
supabase init
npm run prepare:functions
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

supabase/config.toml에 아래 항목을 추가합니다.

```toml
[functions.swift-processor]
verify_jwt = false

[functions.nurim-survey]
verify_jwt = false
```

이 서버는 공개 신청과 Google 콜백도 받으므로 게이트웨이의 일괄 JWT 검증을 끄고, 관리자 요청은 함수 내부의 Auth·profiles 검사를 사용합니다. verify_jwt=false 자체가 관리자 인증을 대신하지 않습니다. 관련 회귀 테스트를 함께 보존하세요.

Supabase Dashboard의 Edge Function Secrets에 아래 값을 설정합니다. 서버에 저장되는 비밀 값은 프런트엔드 설정 파일에 넣지 않습니다.

| 이름 | 내용 |
| --- | --- |
| GOOGLE_APPS_SCRIPT_URL | 본인 중앙 Apps Script 웹 앱 주소 |
| GOOGLE_DRIVE_WEBHOOK_SECRET | Apps Script WEBHOOK_SECRET과 같은 값 |
| NURIM_ALLOWED_ORIGINS | 쉼표로 구분한 허용 웹 주소. 예: http://localhost:4173,https://example.org |

SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY는 Supabase 실행 환경에서 제공합니다.

```sh
supabase functions deploy swift-processor
supabase functions deploy nurim-survey
```

### 브라우저 설정

config.example.js를 config.local.js로 복사하고 본인 프로젝트 값을 입력합니다.

- supabaseUrl: 본인 Supabase 프로젝트 URL
- publishableKey: 브라우저용 publishable 키
- anonKey: 기존 설문 호출 호환에 사용하는 본인 프로젝트의 legacy anon 키. service_role 키 금지

[키 종류 설명](https://supabase.com/docs/guides/getting-started/api-keys)을 확인하세요. config.local.js는 Git에서 제외되지만 웹 배포 파일에는 포함됩니다. 브라우저 키는 공개될 수 있는 값이며 데이터 접근 보호에는 RLS가 필요합니다. 공모전 소스에는 예시 파일만 유지하세요.

config.local.js가 있으면 빌드는 전체 앱을 메인 화면으로 사용합니다. 빈 예시 파일만 복사하면 연결되지 않으므로 유효한 설정을 입력하거나 예제를 위해 파일을 제거하세요. 설정 후 npm run build, npm start를 다시 실행합니다.

## 3. 호스팅

기본 netlify.toml은 의존성 설치·검사·테스트·빌드를 수행하고 dist만 게시합니다. Git 연동으로 기본 설정을 배포하면 예제 화면이 열립니다.

전체 앱을 설치하는 경우 config.local.js를 본인 로컬에서 준비한 뒤 빌드하여 **dist 폴더만** 정적 호스팅에 업로드할 수 있습니다. 소스 폴더 전체·backend·.env·node_modules는 웹에 올리지 않습니다. 운영 사이트 자동 배포에 연결하지 말고 본인의 새 사이트를 사용하세요.

HTML의 example.org 검색·공유 주소, 기관 안내와 개인정보 정책을 본인의 실제 운영 정보로 바꾸세요. NURIM_ALLOWED_ORIGINS에도 본인 배포 주소를 지정합니다.

## 4. 확인

- 예제: 검색, 분류, 상세 보기, 좁은 화면 표시
- 설치 후: 공개 프로그램 조회, 총괄/기관 담당자 권한 분리
- 가상 정보 신청, 수정·취소, 대기 순번, 설문 제출
- Drive 파일·명단 저장, Google Form 제출 확인
- 비로그인 사용자의 관리자 기능 접근 차단
- 접수 기록·로그의 개인정보 취급 및 삭제 절차

로컬 검증은 회귀 테스트·빌드·예제 UI 및 초기 SQL 실행을 다룹니다. 본인 외부 계정을 연결한 전체 과정은 설치 기관에서 별도 시험해야 합니다.

설문 함수에는 guardian-core.mjs도 포함해야 합니다. npm run prepare:functions가 필요한 의존 파일을 함께 구성합니다. 보호자 동의 및 보유기간 SQL 적용을 완료한 뒤 실제 신청을 공개하세요. 데이터베이스 정리 일정은 매일 한국시간 03:00이며 Drive·Storage 파일은 자동 삭제하지 않습니다. [Supabase Cron 안내](https://supabase.com/docs/guides/cron)를 참고하세요.
