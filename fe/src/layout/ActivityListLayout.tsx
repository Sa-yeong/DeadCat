import './ActivityListlayout.css'
import { BiLike, BiComment } from 'react-icons/bi';

export function ActivityListLayout({title, comments, likes, writer, date}:any){
    // 제목 날짜 댓글 수 좋아요 수 작성자 +(내용 조금?)

    return <div className="activity-list-row">
        <span className='group-left'>
            <span>{title}</span>
        </span>
        <span className='group-right'>
            <span><BiComment />  {comments}</span>
            <span><BiLike />  {likes}</span>
            <span>{writer}</span>
            <span>{date}</span>
        </span>
    </div>;
}