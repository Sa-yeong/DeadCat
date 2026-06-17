import './CategoryModal.css'
import { StockRow } from '../page/stockListPage/StockRow';
import { IoClose } from "react-icons/io5";

export function CategoryModal({isOpen, onClose, category, stocks}:any){
    if(!isOpen) return null;

    return <div className="modal-overlay" onClick={onClose}>
        <div className="cate-modal" onClick={(e) => e.stopPropagation()}>
            <div className='header'>
                <div className='left'>
                    <span className='name'>{category.sector_name}</span>
                    <span className='num'>
                        <div>
                            총 종목 수: {category.stock_count} 
                        </div>
                        <div>
                            상승하는 종목 수: {category.num_of_incre_stocks}
                        </div>
                    </span>
                </div>
                <IoClose className='right' onClick={onClose} />
            </div>
            <div className='stockList'>
                {stocks?.map((stock: any) => 
                    <StockRow order={stock.rank}
                        s_name={stock.stock_name}
                        s_code={stock.stock_code}
                        c_price={stock.current_price}
                        rise_rate={stock.change_rate}
                        t_value={stock.trading_value}
                        isLike={stock.is_favorite}
                        market={stock.market}
                        key={stock.stock_code} />
                )}
            </div>
        </div>;
    </div>;
}
