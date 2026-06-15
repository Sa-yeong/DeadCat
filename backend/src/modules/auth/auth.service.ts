import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const SALT_ROUNDS = 10;

// 인증 비즈니스 로직: 회원가입(해시), 로그인(검증+토큰 발급), 로그아웃.
@Injectable()
export class AuthService {
    constructor(
        private readonly repo: AuthRepository,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    async signup(dto: SignupDto) {
        // 중복 사전 검사(친절한 메시지). DB @unique가 최종 방어선.
        const dup = await this.repo.findDuplicate(dto.login_id, dto.nickname);
        if (dup) {
            const field = dup.login_id === dto.login_id ? '아이디' : '닉네임';
            throw new ConflictException(`이미 사용 중인 ${field}입니다.`);
        }
        const hashed = await bcrypt.hash(dto.login_pw, SALT_ROUNDS);
        const user = await this.repo.createUser(
            dto.login_id,
            hashed,
            dto.nickname,
        );
        return { user_id: user.id, nickname: user.nickname };
    }

    async login(dto: LoginDto) {
        const user = await this.repo.findByLoginId(dto.login_id);
        // 아이디 없음/비번 불일치 모두 동일 메시지(정보 노출 방지).
        if (!user || !(await bcrypt.compare(dto.login_pw, user.login_pw))) {
            throw new UnauthorizedException(
                '아이디 또는 비밀번호가 올바르지 않습니다.',
            );
        }
        // expiresIn: @nestjs/jwt는 ms StringValue 타입을 요구 → config의 string을 캐스팅.
        const expiresIn = (this.config.get<string>('jwt.expiresIn') ??
            '1d') as JwtSignOptions['expiresIn'];
        const access_token = this.jwt.sign(
            { sub: user.id.toString() },
            { expiresIn },
        );
        return {
            access_token,
            token_type: 'Bearer',
            user_id: user.id,
            nickname: user.nickname,
        };
    }

    logout() {
        // JWT는 무상태 → 서버는 성공만 반환, 클라이언트가 토큰 폐기.
        return { message: '로그아웃 되었습니다' };
    }
}
