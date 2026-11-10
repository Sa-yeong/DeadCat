import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

// BigInt를 JSON 응답에 문자열로 직렬화 (Prisma의 id 등이 응답에 섞여도 안전).
// 기본 JSON.stringify는 BigInt를 만나면 예외를 던지므로 전역에서 한 번 처리.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
) {
    return this.toString();
};

async function bootstrap() {
    // NestExpressApplication 제네릭 타입 지정
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.enableCors(); // 프론트(React)에서 호출 허용
    app.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true }),
    );

    // 업로드된 프로필 이미지 정적 파일 제공 설정 추가
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
        prefix: '/uploads/',
    });
    /*app.useStaticAssets(join(__dirname, '..', 'uploads'), {
        prefix: '/uploads/',
    });*/

    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
