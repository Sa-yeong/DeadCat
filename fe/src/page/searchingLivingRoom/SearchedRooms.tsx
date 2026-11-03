import './SearchedRooms.css'
import { Room } from './Room';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { IoClose } from 'react-icons/io5';

export function SearchedRooms(){
    const {cancelAll, deleteTag, deleteKeyword} = useOutletContext<any>();
    const [searchParams] = useSearchParams();

    const tagsParams = searchParams.get('tags');
    const displayTags = tagsParams ? tagsParams.split(',') : [];
    const keywordsParams = searchParams.get('keyword');
    const displayKeyword = keywordsParams ? keywordsParams.split(',') : [];

    return <div className='searched-container'>
        <div className='searched-tag-list'>
            {
                displayTags.map((tag:string) => (
                    <span>{tag} <IoClose onClick={() => deleteTag(tag)} /></span>
                ))
            }
            {
                displayKeyword.map((keyword: string) => (
                    <span>{keyword} <IoClose onClick={() => deleteKeyword(keyword)} /></span>
                ))
            }
            {/* <span>태그 리스트 <IoClose /></span> */}
            <button onClick={cancelAll}>전체 해제</button>
        </div>
        <div>
            <div className='searched-label'>
                필터 결과
                <span>갯수</span>
            </div>
            <div className='searchedRooms'>
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
                <Room />
            </div>
        </div>
    </div>;
}