import { Module } from '@nestjs/common';
import { RepresentativeCharacterController } from './representative-character.controller';
import { RepresentativeCharacterService } from './representative-character.service';
import { RepresentativeCharacterRepository } from './representative-character.repository';

@Module({
    controllers: [RepresentativeCharacterController],
    providers: [
        RepresentativeCharacterService,
        RepresentativeCharacterRepository,
    ],
})
export class RepresentativeCharacterModule {}
