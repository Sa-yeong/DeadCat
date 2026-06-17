import './MyRecordsLayout.css'
import { Link } from "react-router-dom";
import { GrPrevious } from "react-icons/gr";
import { ActivityListLayout } from './ActivityListLayout';

interface Post{
    post_id: string,
    title: string,
    author_nickname: string,
    comment_count: number,
    like_count: number,
    created_at: string
}
interface Comment{
    comment_id: string;
    contnet: string;
    create_at: string;
    post_id: string;
    post_title: string;
    post_author_nickname: string;
    post_created_at: string;
    post_like_count: number;
    post_comment_count:number;
}

export function MyRecordsLayout_P({title, posts}:{title:string, posts:Post[]}){

    console.log(posts);

    return <div className="myRecord-layout">
        <div className="header">
            <Link to='/mypage/community'><GrPrevious /></Link>
            <div className='title'>{title}</div>
        </div>
        <div className='list'>
            {
                (!posts || posts.length === 0)? (
                     <div className='none-noti'>존재하는 게시글이 없습니다.</div>
                ):(
                    posts.map((post) => 
                    <ActivityListLayout key={post.post_id}
                    title={post.title} comments={post.comment_count}
                    likes={post.like_count} writer={post.author_nickname}
                    date={post.created_at} />
                    )
                )
            }
        </div>
    </div>;
}

export function MyRecordsLayout_C({title, comments}:{title:string, comments:Comment[]}){

    console.log(comments);

    return <div className="myRecord-layout">
        <div className="header">
            <Link to='/mypage/community'><GrPrevious /></Link>
            <div className='title'>{title}</div>
        </div>
        <div className='list'>
            {
                (!comments || comments.length === 0)? (
                     <div className='none-noti'>존재하는 게시글이 없습니다.</div>
                ):(
                    comments.map((comment) => 
                    <ActivityListLayout key={comment.post_id}
                    title={comment.post_title} comments={comment.post_comment_count}
                    likes={comment.post_like_count} writer={comment.post_author_nickname}
                    date={comment.post_created_at} />
                    )
                )
            }
        </div>
    </div>;
}