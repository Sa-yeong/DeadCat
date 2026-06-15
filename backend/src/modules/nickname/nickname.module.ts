import { Module } from '@nestjs/common';
import { NicknameController } from './nickname.controller';
import { NicknameService } from './nickname.service';
import { NicknameRepository } from './nickname.repository';

@Module({
    controllers: [NicknameController],
    providers: [NicknameService, NicknameRepository],
})
export class NicknameModule {}
