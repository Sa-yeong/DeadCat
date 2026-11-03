import { Module } from '@nestjs/common';
import { RelationController } from './relation.controller';
import { RelationService } from './relation.service';
import { RelationRepository } from './relation.repository';

@Module({
    controllers: [RelationController],
    providers: [RelationService, RelationRepository],
})
export class RelationModule {}
