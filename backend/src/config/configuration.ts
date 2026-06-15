// 환경변수(.env)를 읽어 정리하는 단일 창구. 시작 단계엔 파일 하나로 단순하게.
// 도메인 전용 설정(외부 API 키 등)은 각자 구현 시 여기에 추가한다.
export default () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    },
});
