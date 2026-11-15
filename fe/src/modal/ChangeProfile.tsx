import './ChangeProfile.css'
import { api } from '../api/axios';
import { IoClose } from 'react-icons/io5';

const defaultProfiles = [
    'default_1.png',
    'default_2.png',
    'default_3.png',
    'default_4.png',
    'default_5.png',
]

export function ChangeProfileModal({isOpen, onClose, token, setImgUrl}: any){

    const sendProfileImg = async (file: File) => {
        try{
            const formData = new FormData();
            formData.append('file', file);

            await api.patch('/users/me/profile-image', formData,{
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
        }catch(e){console.error('사용자 프로필 이미지 저장 실패: ', e)}
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if(file){
            setImgUrl(URL.createObjectURL(file));
            
            sendProfileImg(file);
        }
    }

    const handleDefaultProfile = async (filename: string) => {
        try{
            const imgPath = `/profile/${filename}`;
            setImgUrl(imgPath);

            const response = await fetch(imgPath);
            const blob = await response.blob();
            const file = new File([blob], filename, {type: blob.type});

            sendProfileImg(file);
        }catch(e){console.error('기본 이미지 변경 실패: ', e)}
    }

    if(!isOpen)
        return null;
    return <div className='modal-overlay' onClick={onClose}>
        <div className='profile-container' onClick={(e) => e.stopPropagation()}>
            <span className='label'>프로필 사진 변경</span>
            <IoClose onClick={onClose} />
            <div className='content'>
                <label htmlFor="profile-upload">
                    +
                </label>
                <input id='profile-upload' type='file' 
                accept='image/*' style={{display: 'none'}}
                onChange={handleFileChange} />
                {
                    defaultProfiles.map((filename, index) => (
                        <img key={index}
                        src={`/profile/${filename}`} 
                        alt={`기본 프로필 ${index+1}`}
                        onClick={() => handleDefaultProfile(filename)} />
                    ))
                }
            </div>
        </div>
    </div>
}