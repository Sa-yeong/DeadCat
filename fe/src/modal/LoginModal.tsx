import './LoginModal.css'
import { IoClose } from "react-icons/io5";
import Login from '../common/Login';

export function LoginModal({isOpen, onClose}:any){
    if(!isOpen){
        return null;
    }

    return <div className="modal-overlay" onClick={onClose}>
        <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <IoClose onClick={onClose} />
            <Login />
        </div>
    </div>;
}