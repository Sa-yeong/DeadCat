// 앱 전체 공통 응답 래퍼. 2개 이상 모듈이 공유 → common/dto.
export class ApiResponseDto<T> {
    success: boolean;
    data: T;
    message?: string;
}
