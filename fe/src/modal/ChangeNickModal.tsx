import './ChangeNickModal.css'
import { useState } from 'react';
import { api } from '../api/axios';
import { IoCloseOutline} from "react-icons/io5";

export function ChangeNickModal({isOpen, onClose, c_nickname}:any){
    const [nickname, setNickname] = useState<string>(c_nickname)
    const [newName, setNewName] = useState<string|null>('');
    const [isNameChecked, setIsNameChecked] = useState(false);

    const duplicate_name = async () => { // 중복 확인 기능
        try{
            if(!newName) return alert('새로운 닉네임을 입력하세요.'); // 새로 입력한 닉네임이 비어있는 경우

            const token = localStorage.getItem('token');
            const response = await api.get('/nicknames/check',{
                headers: {Authorization: `Bearer ${token}`},
                params: {nickname: newName}
            });

            if(response.data.data.is_available){ // 중복되지 않은 닉네임일 경우
                setIsNameChecked(true);
            } else{ // 중복된 닉네임일 경우
                alert('이미 존재하는 닉네임입니다.');
            }
            
            console.log('닉네임 중복 확인 성공!', response.data);
        } catch(e){console.error('닉네임 중복 확인 실패: ', e);}
    }
    const changeNickname = async () => {
        try{
            if(!newName) return alert('새로운 닉네임을 입력하세요.');
            if(!isNameChecked) {
                alert('닉네임 중복 확인 필수');
                return null;
            }

            const token = localStorage.getItem('token');
            const response = await api.patch('/users/me/nickname', {nickname: newName}, {
                headers: {Authorization: `Bearer ${token}`}
            });

            console.log('닉네임 변경 성공!: ', response.data);
            setNickname(newName);
            setIsNameChecked(false);
            onClose(); // 모달창 닫기
        } catch(e){ 
            console.log('닉네임 변경 실패 : ', e);
            alert('닉네임 변경에 실패했습니다. \n 잠시후 다시 시도해주세요.');
        }
    }

    if(!isOpen) {return null;}

    return <div className='modal-overlay' onClick={onClose}>
        <div className='nick-change-modal' onClick={(e) => e.stopPropagation()}>
            <div className='header'>
                닉네임을 입력해주세요!
                <span className="modal-close" onClick={onClose}>
                    <IoCloseOutline />
                </span>
            </div>
            <div className='middle'>
                <input type="text" placeholder={nickname} onChange={(e) => {
                    setNewName(e.target.value)
                    setIsNameChecked(false);
                    }}  />
            <button onClick={duplicate_name}>중복 확인</button>
            </div>
            <button className={'footer'} disabled={!isNameChecked} onClick={changeNickname}>입력 완료</button>
        </div>
    </div>;
}