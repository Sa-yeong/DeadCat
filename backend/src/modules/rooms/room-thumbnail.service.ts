import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/providers/database/prisma.service';

// 거실 썸네일 (거실썸네일 지시서 S1-2)
// 브라우저 → 백엔드 → Supabase Storage. 로그인이 자체 JWT라 Storage에 바로 올리지 않고 백엔드가 확인한 뒤 올린다

export const ROOM_THUMBNAIL_MAX_BYTES = 500 * 1024;

const EXT_BY_MIME: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
};

/** multer 메모리 저장 파일 중 쓰는 칸만 */
export interface UploadedImage {
    mimetype: string;
    size: number;
    buffer: Buffer;
}

export interface RoomThumbnailResult {
    room_thumbnail_url: string | null;
    room_thumbnail_is_auto: boolean;
    skipped: boolean;
}

@Injectable()
export class RoomThumbnailService {
    private readonly logger = new Logger(RoomThumbnailService.name);

    constructor(private readonly prisma: PrismaService) {}

    async upload(
        userId: bigint,
        file: UploadedImage | undefined,
        isAutoRaw: string | undefined,
    ): Promise<RoomThumbnailResult> {
        if (!file) throw new BadRequestException('image 파일이 없습니다.');
        const ext = EXT_BY_MIME[file.mimetype];
        if (!ext) {
            throw new BadRequestException(
                '이미지 형식은 image/webp 또는 image/jpeg만 됩니다.',
            );
        }
        if (file.size > ROOM_THUMBNAIL_MAX_BYTES) {
            throw new BadRequestException('이미지는 500KB 이하만 됩니다.');
        }
        if (isAutoRaw !== 'true' && isAutoRaw !== 'false') {
            throw new BadRequestException(
                'is_auto는 "true" 또는 "false"입니다.',
            );
        }
        const isAuto = isAutoRaw === 'true';

        const user = await this.prisma.users.findUnique({
            where: { id: userId },
            select: { room_thumbnail_url: true, room_thumbnail_is_auto: true },
        });
        if (!user) throw new NotFoundException('존재하지 않는 사용자입니다.');

        // 자동 촬영이 직접 찍은 사진을 덮어쓰지 않게 — 에러가 아니라 지금 상태 그대로
        if (isAuto && user.room_thumbnail_url && !user.room_thumbnail_is_auto) {
            return {
                room_thumbnail_url: user.room_thumbnail_url,
                room_thumbnail_is_auto: false,
                skipped: true,
            };
        }

        const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const bucket = process.env.ROOM_THUMBNAIL_BUCKET;
        if (!supabaseUrl || !serviceKey || !bucket) {
            this.logger.error(
                '썸네일 업로드 불가 — SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · ROOM_THUMBNAIL_BUCKET 환경 변수가 없습니다.',
            );
            throw new InternalServerErrorException(
                '썸네일 저장소 설정이 없습니다.',
            );
        }

        const fileName = `${userId.toString()}.${ext}`;
        let res: Response;
        try {
            res = await fetch(
                `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`,
                {
                    method: 'POST',
                    headers: {
                        // 새 형식 키(sb_secret_…)·옛 형식(eyJ…) 모두 되게 둘 다 보낸다
                        apikey: serviceKey,
                        Authorization: `Bearer ${serviceKey}`,
                        'x-upsert': 'true',
                        'Content-Type': file.mimetype,
                        'cache-control': '31536000',
                    },
                    body: new Uint8Array(file.buffer),
                },
            );
        } catch (error) {
            this.logger.error(
                `썸네일 업로드 요청 실패: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw new InternalServerErrorException(
                '썸네일 업로드에 실패했습니다.',
            );
        }
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            this.logger.error(
                `썸네일 업로드 실패 (${res.status}): ${detail.slice(0, 300)}`,
            );
            throw new InternalServerErrorException(
                '썸네일 업로드에 실패했습니다.',
            );
        }

        // ?v= 업로드 시각 — 다시 찍으면 주소가 바뀌어 남에게도 바로 새 사진
        const url = `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}?v=${Date.now()}`;
        const updated = await this.prisma.users.update({
            where: { id: userId },
            data: { room_thumbnail_url: url, room_thumbnail_is_auto: isAuto },
            select: { room_thumbnail_url: true, room_thumbnail_is_auto: true },
        });
        return {
            room_thumbnail_url: updated.room_thumbnail_url,
            room_thumbnail_is_auto: updated.room_thumbnail_is_auto,
            skipped: false,
        };
    }
}
