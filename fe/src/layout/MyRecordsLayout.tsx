import './MyRecordsLayout.css'
import { Link } from "react-router-dom";
import { GrPrevious } from "react-icons/gr";
import { ActivityListLayout } from './ActivityListLayout';

interface Post{
    post_id: string,
    title: string,
    author_nickname: string,
    comment_amount: number,
    like_count: number,
    created_at: string
}

export function MyRecordsLayout({title, posts}:{title:string, posts:Post[]}){

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
                    title={post.title} comments={post.comment_amount}
                    likes={post.like_count} writer={post.author_nickname}
                    date={post.created_at} />
                    )
                )
            }
        </div>
    </div>;
}