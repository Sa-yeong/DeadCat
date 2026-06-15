import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// BigInt를 JSON 응답에 문자열로 직렬화 (Prisma의 id 등이 응답에 섞여도 안전).
// 기본 JSON.stringify는 BigInt를 만나면 예외를 던지므로 전역에서 한 번 처리.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
    this: bigint,
) {
    return this.toString();
};

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors(); // 프론트(React)에서 호출 허용
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
