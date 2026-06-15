import './IndicesCarouselLayout.css'

export function IndicesCarouselLayout({i_name, price, up_down, rate}){
    return <div className='indices-layout'>
        <span className='name'>{i_name}</span>
        <span className='up-down'>
            <span>{price}</span>
            <span>{up_down}</span>
            <span>{rate}</span>
        </span>
        <span className='graph'>그래프</span>
    </div>;
}