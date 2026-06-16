import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';

// 인증 모듈. JwtModule은 전역 등록(@Global)이라 JwtService 주입 가능, PrismaService도 전역.
@Module({
    controllers: [AuthController],
    providers: [AuthService, AuthRepository],
})
export class AuthModule {}
