import { Module } from '@nestjs/common';

import { StockHistoryRepository } from './stock-history.repository';

@Module({
    providers: [StockHistoryRepository],
    exports: [StockHistoryRepository],
})
export class StockHistoryModule {}
