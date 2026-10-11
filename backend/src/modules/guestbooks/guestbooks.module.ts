import { Module } from '@nestjs/common';
import { GuestbooksController } from './guestbooks.controller';
import { GuestbooksService } from './guestbooks.service';
import { GuestbooksRepository } from './guestbooks.repository';
import { PrismaModule } from 'src/providers/database/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [GuestbooksController],
    providers: [GuestbooksService, GuestbooksRepository],
    exports: [GuestbooksService],
})
export class GuestbooksModule {}
