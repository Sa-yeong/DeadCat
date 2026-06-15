import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';

@Module({
    controllers: [UserController],
    providers: [UserService, UserRepository],
    exports: [UserService], // 타 모듈에서 유저 정보 참조가 필요할 시 주입 가능하도록 공개
})
export class UserModule {}
