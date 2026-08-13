import './LoginModal.css'
import { IoClose } from "react-icons/io5";
import Login from '../common/Login';

// interface LoginModalProps {
//     isOpen: boolean;
//     onClose: () => void;
//     current_page
// }

export function LoginModal({isOpen, onClose, current_page}:any){
    if(!isOpen){
        return null;
    }

    return <div className="modal-overlay" onClick={onClose}>
        <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={onClose}>
                <IoClose />
            </button>
            <Login current_page={current_page} onClose={onClose} />
        </div>
    </div>;
}