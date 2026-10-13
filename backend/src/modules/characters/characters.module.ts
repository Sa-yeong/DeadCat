import { Module } from '@nestjs/common';
import { CharactersController } from './characters.controller';
import { CharactersService } from './characters.service';
import { CharactersRepository } from './characters.repository';
import { PrismaModule } from 'src/providers/database/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CharactersController],
    providers: [CharactersService, CharactersRepository],
    exports: [CharactersService],
})
export class CharactersModule {}
