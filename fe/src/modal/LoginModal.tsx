import './LoginModal.css'
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { IoClose } from "react-icons/io5";
import Login from '../common/Login';
import { useAuthToken } from '../common/authToken';

/**
 * 공용 로그인 창. children 을 주면 그걸, 안 주면 기본 Login 을 띄운다.
 * 기본 Login 은 로그인하면 지금 주소로 돌아오고, 로그인되면 창은 스스로 닫힌다.
 */
export function LoginModal({isOpen, onClose, children}:any){
    const { pathname, search } = useLocation();
    const token = useAuthToken();

    useEffect(() => {
        if (isOpen && token) onClose();
    }, [isOpen, token, onClose]);

    if(!isOpen){
        return null;
    }

    return <div className="modal-overlay" onClick={onClose}>
        <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <IoClose onClick={onClose} />
            {children ?? <Login redirectTo={pathname + search} />}
        </div>
    </div>;
}
