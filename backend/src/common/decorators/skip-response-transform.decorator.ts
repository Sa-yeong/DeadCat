import { SetMetadata } from '@nestjs/common';

// 응답 인터셉터의 공통 래핑을 제외하기 위한 메타데이터 키
export const SKIP_RESPONSE_TRANSFORM = 'skipResponseTransform';

// 컨트롤러 또는 메서드에 적용하는 데코레이터
export const SkipResponseTransform = () =>
    SetMetadata(SKIP_RESPONSE_TRANSFORM, true);
