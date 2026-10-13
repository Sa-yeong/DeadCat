import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import WebSocket from 'ws';

import { PriceService } from '../price.service';
import { PrismaService } from 'src/providers/database/prisma.service';

@Injectable()
export class KisWebSocketService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(KisWebSocketService.name);

    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    private socket: WebSocket | null = null;

    private connected = false;

    private reconnectTimer?: NodeJS.Timeout;

    private subscribedCodes = new Set<string>();

    constructor(
        private readonly priceService: PriceService,
        private readonly prisma: PrismaService,
    ) {}

    async onModuleInit(): Promise<void> {
        await this.connect();
    }

    onModuleDestroy(): void {
        this.disconnect();
    }

    async connect(): Promise<void> {
        if (this.connected || this.socket) {
            return;
        }

        const appKey = process.env.KIS_APP_KEY;
        const appSecret = process.env.KIS_APP_SECRET;

        if (!appKey || !appSecret) {
            this.logger.warn('KIS WebSocket 인증 정보가 없습니다.');
            return;
        }

        // 여기서 KIS WebSocket 접속키 발급
        const approvalKey = await this.getApprovalKey(appKey, appSecret);

        const websocketUrl =
            process.env.KIS_WEBSOCKET_URL ??
            'ws://ops.koreainvestment.com:21000';

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        this.socket = new WebSocket(websocketUrl);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises
        this.socket.on('open', async () => {
            this.connected = true;

            this.logger.log('KIS WebSocket connected');

            await this.subscribeInitialStocks(approvalKey);
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.socket.on('message', async (data) => {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            await this.handleMessage(data.toString());
        });

        this.socket.on('close', () => {
            this.connected = false;
            this.socket = null;

            this.logger.warn('KIS WebSocket disconnected');

            this.scheduleReconnect();
        });

        this.socket.on('error', (error) => {
            this.logger.error(`KIS WebSocket error: ${error.message}`);
        });
    }

    disconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.connected = false;
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;

            this.connect().catch((error) => {
                this.logger.error(
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    `KIS WebSocket reconnect failed: ${error.message}`,
                );
            });
        }, 5000);
    }

    private async getApprovalKey(
        appKey: string,
        appSecret: string,
    ): Promise<string> {
        const response = await fetch(
            'https://openapi.koreainvestment.com:9443/oauth2/Approval',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    grant_type: 'client_credentials',
                    appkey: appKey,
                    secretkey: appSecret,
                }),
            },
        );

        if (!response.ok) {
            throw new Error(
                `KIS WebSocket approval key 발급 실패: ${response.status}`,
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = await response.json();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!data.approval_key) {
            throw new Error(`KIS WebSocket approval key가 응답에 없습니다.`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return data.approval_key;
    }

    //
    private async subscribeInitialStocks(approvalKey: string): Promise<void> {
        const stocks = await this.prisma.stocks.findMany({
            select: {
                code: true,
                stock_type: true,
            },
        });

        for (const stock of stocks) {
            await this.subscribe(approvalKey, stock.code, stock.stock_type);

            // KIS 동시 호출 권장 간격
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }

    /*private async subscribeInitialStocks(approvalKey: string): Promise<void> {
        const stocks = await this.prisma.stocks.findMany({
            select: {
                code: true,
                stock_type: true,
            },
        });

        for (const stock of stocks) {
            await this.subscribe(approvalKey, stock.code, stock.stock_type);
        }
    }*/

    private async subscribe(
        approvalKey: string,
        stockCode: string,
        stockType: string,
    ): Promise<void> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }

        if (stockType === 'DOMESTIC') {
            await this.subscribeDomestic(approvalKey, stockCode);
            return;
        }

        if (stockType === 'FOREIGN') {
            await this.subscribeOverseas(approvalKey, stockCode);
        }
    }

    //국내구독
    // eslint-disable-next-line @typescript-eslint/require-await
    private async subscribeDomestic(
        approvalKey: string,
        stockCode: string,
    ): Promise<void> {
        if (!this.socket) return;

        const message = {
            header: {
                approval_key: approvalKey,
                custtype: 'P',
                tr_type: '1',
                'content-type': 'utf-8',
            },
            body: {
                input: {
                    tr_id: 'H0STCNT0',
                    tr_key: stockCode,
                },
            },
        };

        this.socket.send(JSON.stringify(message));

        this.subscribedCodes.add(stockCode);

        this.logger.log(`KIS WS 국내주식 subscribe: ${stockCode}`);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    private async subscribeOverseas(
        approvalKey: string,
        stockCode: string,
    ): Promise<void> {
        if (!this.socket) return;

        const marketCode = this.getOverseasMarketCode(stockCode);

        if (!marketCode) {
            this.logger.warn(
                `해외주식 시장코드를 찾을 수 없습니다: ${stockCode}`,
            );
            return;
        }

        const message = {
            header: {
                approval_key: approvalKey,
                custtype: 'P',
                tr_type: '1',
                'content-type': 'utf-8',
            },
            body: {
                input: {
                    tr_id: 'HDFSCNT0',
                    tr_key: `D${marketCode}${stockCode}`,
                },
            },
        };

        this.socket.send(JSON.stringify(message));

        this.subscribedCodes.add(stockCode);

        this.logger.log(
            `KIS WS 해외주식 subscribe: ${stockCode} (${marketCode})`,
        );
    }

    private getOverseasMarketCode(stockCode: string): string | null {
        const marketMap: Record<string, string> = {
            AAPL: 'NAS',
            TSLA: 'NAS',
            NVDA: 'NAS',
            NOK: 'NAS',
            INTC: 'NAS',
            MSFT: 'NAS',
            AMD: 'NAS',
            'BRK.B': 'NYS',
            V: 'NYS',
            KO: 'NYS',
        };

        return marketMap[stockCode] ?? null;
    }

    /*private async handleMessage(rawMessage: string): Promise<void> {
        const parts = rawMessage.split('|');

        if (parts.length < 4) {
            return;
        }

        const trId = parts[1];

        if (trId === 'HDFSCNT0') {
            await this.handleOverseasPriceMessage(parts[3]);
            return;
        }

        if (trId === 'H0STCNT0') {
            await this.handleDomesticPriceMessage(parts[3]);
            return;
        }
    }*/

    private async handleMessage(rawMessage: string): Promise<void> {
        const parts = rawMessage.split('|');

        if (parts.length < 4) {
            return;
        }

        const trId = parts[1];
        // 체결이 몰리면 한 메시지에 여러 건이 묶여 온다(parts[2] = 건수).
        // 현재가에는 마지막 체결만 의미가 있으므로 마지막 한 건만 쓴다
        // (예전엔 첫 건만 읽어 묶음 안의 최신 체결을 놓쳤다).
        const record = lastRecord(parts[3], parts[2]);

        if (trId === 'HDFSCNT0') {
            await this.handleOverseasPriceMessage(record);
            return;
        }

        if (trId === 'H0STCNT0') {
            await this.handleDomesticPriceMessage(record);
            return;
        }
    }

    private async handleDomesticPriceMessage(rawData: string): Promise<void> {
        const fields = rawData.split('^');

        if (fields.length < 3) {
            return;
        }

        const stockCode = fields[0];
        const currentPrice = Number(fields[2]);
        const changeRate = Number(fields[5]);

        if (
            !stockCode ||
            !Number.isFinite(currentPrice) ||
            !Number.isFinite(changeRate)
        ) {
            this.logger.warn(`[KIS WS] 국내주식 가격 데이터 이상: ${rawData}`);
            return;
        }

        await this.priceService.writeSinglePrice(stockCode, {
            current_price: currentPrice,
            change_rate: changeRate,
        });
    }

    private async handleOverseasPriceMessage(rawData: string): Promise<void> {
        const fields = rawData.split('^');

        if (fields.length < 15) {
            return;
        }

        const stockCode = fields[1];
        const currentPrice = Number(fields[11]);
        const changeRate = Number(fields[14]);

        if (
            !stockCode ||
            !Number.isFinite(currentPrice) ||
            !Number.isFinite(changeRate)
        ) {
            return;
        }

        await this.priceService.writeSinglePrice(stockCode, {
            current_price: currentPrice,
            change_rate: changeRate,
        });
    }

    //websocket 연결 확인용 로그
    /*private async handleMessage(rawMessage: string): Promise<void> {
        this.logger.log(`[KIS WS] message: ${rawMessage}`);
    }*/
}

/** '^'로 이어진 n건짜리 체결 데이터에서 마지막 한 건만 꺼낸다. 건수를 못 읽으면 그대로 */
export function lastRecord(data: string, countField: string): string {
    const count = Number(countField);
    if (!Number.isInteger(count) || count <= 1) return data;
    const fields = data.split('^');
    if (fields.length % count !== 0) return data; // 모양이 예상과 다르면 손대지 않는다
    const per = fields.length / count;
    return fields.slice(per * (count - 1)).join('^');
}
