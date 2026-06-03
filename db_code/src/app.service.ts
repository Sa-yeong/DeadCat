import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class AppService {
    constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

    getHello(): string {
        return 'Hello World';
    }
}
