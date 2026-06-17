import { Module } from '@nestjs/common';
import { LikePostController } from './like-post.controller';
import { LikePostService } from './like-post.service';
import { LikePostRepository } from './like-post.repository';
import { PrismaService } from 'src/providers/database/prisma.service';

@Module({
    controllers: [LikePostController],
    providers: [LikePostService, LikePostRepository, PrismaService],
})
export class LikePostModule {}
