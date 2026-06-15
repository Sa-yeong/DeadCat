import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TransactionRepository } from './transaction.repository';

@Module({
    controllers: [TransactionController],
    providers: [TransactionService, TransactionRepository],
    exports: [TransactionService],
})
export class TransactionModule {}
