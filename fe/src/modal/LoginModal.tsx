import './LoginModal.css'
import { IoClose } from "react-icons/io5";

export function LoginModal({isOpen, onClose, children}:any){
    if(!isOpen){
        return null;
    }

    return <div className="modal-overlay" onClick={onClose}>
        <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={onClose}>
                <IoClose />
            </button>
            {children}
        </div>
    </div>;
}