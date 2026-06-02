# 백엔드 공용 골격 (NestJS)

팀이 공유하는 백엔드 폴더 구조. 각자 담당 도메인을 `modules/` 아래 한 폴더씩 추가해 작업한다.

스택: NestJS 11 / Prisma 7 (PostgreSQL) / Redis(ioredis).

---

## 받고 나서 할 일

```bash
npm install
cp .env.example .env        # 1. 비밀값 채우기 (DB/Redis/JWT)
npx prisma generate         # 2. schema.prisma → generated/prisma 클라이언트 생성
npm run start:dev           # 3. 실행 → GET /example/ping 으로 부팅 확인
```

`.env`와 `generated/prisma`는 git에 올라가지 않으므로(아래 .gitignore) 각자 로컬에서 준비한다.

---

## 폴더 구조

최상위는 4분할. **무엇으로 나누느냐의 기준이 폴더마다 다르다.**

```
src/
├── main.ts            진입점
├── app.module.ts      루트 모듈 (모든 모듈을 여기 imports에 등록)
│
├── providers/         외부 시스템 "연결"만 (how). 비즈니스 로직 없음.
├── modules/           비즈니스 도메인 (각 폴더 = controller-service-repository)
├── common/            여러 모듈을 가로지르는 공통 처리 (인증·응답·예외)
└── config/            환경변수 정리 단일 창구
```

### providers/ — 외부 연결 (how)

외부 시스템에 **어떻게 붙는지**만 담는다. 비즈니스 로직 없음. 여러 모듈이 공유.

```
providers/
├── database/   prisma.service.ts   런타임 DB 연결 (PrismaClient 확장)
│               prisma.module.ts    @Global, 전역 주입
└── redis/      redis.service.ts    범용 get/set 등
                redis.module.ts     @Global, REDIS_CLIENT 팩토리
```

루트의 `prisma/`(schema.prisma)와 다름: 저쪽은 빌드 타임 **설계도**, 이쪽은 런타임 **연결 코드**.

### modules/ — 비즈니스 도메인

도메인 한 개 = 폴더 한 개. 내부는 3-Layer(Controller-Service-Repository) + dto. **작업 분배 단위.**

```
modules/
└── example/                        [예시] 새 도메인을 만들 때 이 폴더를 복사해 이름만 바꾼다.
    ├── example.controller.ts       HTTP 입구
    ├── example.service.ts          비즈니스 로직(두뇌)
    ├── example.repository.ts       DB 접근
    ├── example.module.ts           위 셋을 묶어 app.module에 등록
    └── dto/example.response.dto.ts 이 모듈 전용 응답 형식
```

- 각 모듈의 `dto/`는 그 모듈 **전용** 데이터 모양. (2개 이상 모듈이 공유하면 common/dto)
- `example` 모듈은 골격이 살아있는지 확인하는 용도(`GET /example/ping`). 실제 도메인 추가 시 제거해도 됨.
- ⚠️ 계층별(`controllers/` `services/`)이 아니라 **기능별**(`modules/<도메인>/` 안에 C-S-R)로 나눈다. 한 도메인을 고칠 때 한 폴더만 건드리기 위함.

### common/ — 횡단 공통 처리

도메인과 무관하게 모든 모듈에 똑같이 걸리는 처리. 요청 파이프라인 단계별로 나뉜다.

```
common/
├── guards/         jwt-auth.guard.ts          인증 문지기
├── decorators/     user.decorator.ts          요청에서 userId 추출
├── filters/        prisma-exception.filter.ts DB 에러 → 깔끔한 메시지
├── interceptors/   response.interceptor.ts    응답 형식 통일 래퍼
└── dto/            api-response.dto.ts         2개 이상 모듈이 공유하는 DTO만
```

### config/ — 환경변수 정리

`.env` 값을 읽어 구조화하는 단일 창구. 시작 단계엔 파일 하나로 단순하게.

---

## 루트 파일

| 파일 | 의미 | 출처 |
|---|---|---|
| `package.json` | 의존성 목록 + 실행 명령 | NestJS CLI |
| `tsconfig*.json` | TypeScript 컴파일 설정 | NestJS CLI |
| `nest-cli.json` | NestJS CLI 설정 | NestJS CLI |
| `eslint.config.mjs` / `.prettierrc` | 린트 / 포맷 규칙 | NestJS CLI |
| `.gitignore` | git 제외 목록 (node_modules·dist·.env·generated 등) | NestJS CLI |
| `.env.example` | 환경변수 견본 (값은 비움 — 각자 .env 작성) | 직접 작성 |
| `prisma/schema.prisma` | DB 테이블 설계도 | 팀 ERD |
| `prisma.config.ts` | Prisma CLI 설정 | Prisma |

---

## 규칙 요약

1. 최상위 4폴더: `modules / common / config / providers`
2. 도메인은 `modules/` 아래 한 도메인 = 한 폴더, 내부는 C-S-R + dto
3. 파일 네이밍: `<도메인>.controller.ts` / `.service.ts` / `.repository.ts`
4. 공통 처리(인증·응답형식)는 `common/`, 외부 연결은 `providers/`
5. ORM = Prisma
