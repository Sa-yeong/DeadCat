import './MyRecordsLayout.css'
import { Link } from "react-router-dom";
import { GrPrevious } from "react-icons/gr";
import { ActivityListLayout } from './ActivityListLayout';

// interface Post{
//     post_id: string,
//     title: string,
//     author_nickname: string,
//     comment_count: number,
//     like_count: number,
//     created_at: string
// }
// interface Comment{
//     comment_id: string;
//     contnet: string;
//     create_at: string;
//     post_id: string;
//     post_title: string;
//     post_author_nickname: string;
//     post_created_at: string;
//     post_like_count: number;
//     post_comment_count:number;
// }

// export function MyRecordsLayout_P({title, posts}:{title:string, posts:Post[]}){

//     console.log(posts);

//     return <div className="myRecord-layout">
//         <div className="header">
//             <Link to='/mypage/community'><GrPrevious /></Link>
//             <div className='title'>{title}</div>
//         </div>
//         <div className='list'>
//             {
//                 (!posts || posts.length === 0)? (
//                      <div className='none-noti'>존재하는 게시글이 없습니다.</div>
//                 ):(
//                     posts.map((post) => 
//                     <ActivityListLayout key={post.post_id}
//                     title={post.title} comments={post.comment_count}
//                     likes={post.like_count} writer={post.author_nickname}
//                     date={post.created_at} />
//                     )
//                 )
//             }
//         </div>
//     </div>;
// }

// export function MyRecordsLayout_C({title, comments}:{title:string, comments:Comment[]}){

//     console.log(comments);

//     return <div className="myRecord-layout">
//         <div className="header">
//             <Link to='/mypage/community'><GrPrevious /></Link>
//             <div className='title'>{title}</div>
//         </div>
//         <div className='list'>
//             {
//                 (!comments || comments.length === 0)? (
//                      <div className='none-noti'>존재하는 게시글이 없습니다.</div>
//                 ):(
//                     comments.map((comment) => 
//                     <ActivityListLayout key={comment.post_id}
//                     title={comment.post_title} comments={comment.post_comment_count}
//                     likes={comment.post_like_count} writer={comment.post_author_nickname}
//                     date={comment.post_created_at} />
//                     )
//                 )
//             }
//         </div>
//     </div>;
// }

export function MyRecordsLayout({type, content, like_count, comment_count, date}
    :{type:string, content:string, like_count?:number, comment_count?:number, date:string}){
    const truncateText = (text: string, maxLength:number) => {
        if (text.length > maxLength){
            return text.substring(0, maxLength) + "...";
        } return text;
    };

    // 커뮤니티 타입 | 작성자 | 제목 | 좋아요 수 | 댓글 수 | 작성 날짜
    return <div className='record-row'>
        <span className='left'>
            <span className='type'>
                {type=='COMMUNITY'?'커뮤':'방명록'}
            </span>
            <span>{truncateText(content, 40)}</span>
        </span>
        <span className='right'>
            {like_count != null && `좋아요 `}
            <span style={{color: 'white'}}>
                {like_count != null && like_count}
            </span>
            {comment_count != null && ` · 댓글 `}
            <span style={{color: 'white'}}>
                {comment_count != null && comment_count}
            </span>
            {comment_count != null && ' · '}
            {`${date}`}
        </span>
    </div>;
}

export function LikedPostsLayout({type, nickname, content, like_count, comment_count, date}){
    const truncateText = (text: string, maxLength:number) => {
        if (text.length > maxLength){
            return text.substring(0, maxLength) + "...";
        } return text;
    };

    return <div className='liked-posts-row'>
        <span className='left'>
            <span className='type'>
                {(type=='COMMUNITY'?'커뮤':'방명록')}
            </span>
            <span className='user-nickname'>{nickname}</span>
            <span>{truncateText(content, 40)}</span>
        </span>
        <span className='right'>
            {`좋아요 `}
            <span style={{color:'white'}}>
                {like_count}
            </span>
            {` · 댓글 `}
            <span style={{color: 'white'}}>
                {comment_count}
            </span>
            {` · ${date}`}
         </span>
    </div>
}