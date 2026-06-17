import './IndicesCarouselLayout.css'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface IndicesGraph{
    write_date: string;
    open_price: number;
    close_price: number;
    low_price: number;
    high_price: number;
}

interface IndexGraphProps {
  graphData: IndicesGraph[];
  isPositive: boolean; // 등락률이 플러스(+)인지 마이너스(-)인지에 따라 그래프 색상 변경
}

export function IndicesCarouselLayout({i_name, price, up_down, rate, graphData, isPositive}:any){

    return <div className='indices-layout'>
        <span className='name'>{i_name}</span>
        <span className='up-down' >
            <span>{price}</span>
            <span style={{color: (isPositive===0)?'black':(isPositive ?'red':'blue')}}>{up_down}</span>
            <span style={{color: (isPositive===0)?'black':(isPositive ?'red':'blue')}}>{rate}%</span>
        </span>
        <span className='graph'><IndexGraph graphData={graphData} isPositive={isPositive} /></span>
    </div>;
}

// 인덱스 그래프
function IndexGraph({ graphData, isPositive }: IndexGraphProps) {
  // 등락에 따른 색상 테마 선언 (플러스면 빨강/주황 계열, 마이너스면 파랑 계열)
  const chartColor = isPositive ? '#ff4d4f' : '#1890ff';

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
      {/* ResponsiveContainer가 부모 그리드/박스 크기에 맞게 그래프를 자동으로 채워줍니다 */}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={graphData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        >
          {/* 하단 X축: 일별 날짜 매핑 (너무 촘촘하면 tick={false}로 숨기거나 조절 가능) */}
          <XAxis 
            dataKey="write_date" 
            hide={true} // 슬라이드 요약용이면 축을 숨기는 게 디자인상 깔끔합니다
          />
          
          {/* 좌측 YAxis: 주가 범위 자동 조절 */}
          <YAxis 
            hide={true} 
            domain={['dataMin - padding', 'dataMax + padding']} // 데이터 최솟값/최댓값 주변에 여백 부여
          />
          
          {/* 마우스 올렸을 때 보여주는 툴팁 */}
          <Tooltip
            labelFormatter={(label) => `날짜: ${label}`}
            formatter={(value: any) => [`${Number(value).toLocaleString()} p`, '종가']}
          />
          
          {/* 그라데이션 효과 설정 */}
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* 실질적인 선과 채우기 영역 (기준선: 종가) */}
          <Area
            type="monotone"
            dataKey="close_price" // 💡 핵심: 백엔드에서 준 close_price 매핑
            stroke={chartColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPrice)" // 위에서 정의한 그라데이션 적용
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}