import './ActivityListlayout.css'
import { BiLike, BiComment } from 'react-icons/bi';

export function ActivityPostLayout({type, content, comments, likes, writer, date}:any){

    return <div className="activity-post-list">
        <span className='group-left'>
            <span className='type'>{type === 'COMMUNITY'?'커뮤':'방명록'}</span>
            <span className='content'>{content}</span>
        </span>
        <span className='group-right'>
            <span><BiComment />  {comments}</span>
            <span><BiLike />  {likes}</span>
            <span>{writer}</span>
            <span>{date}</span>
        </span>
    </div>;
}

export function ActivityCommentLayout({type, content, date}: any){
    return <div className="activity-comment-list">
        <span className='group-left'>
            <span className='type'>{type === 'COMMUNITY'?'커뮤':'방명록'}</span>
            <span className='content'>{content}</span>
        </span>
        <span className='group-right'>
            <span>{date}</span>
        </span>
    </div>;
}