import './MyRecordsLayout.css'
import { Link } from "react-router-dom";
import { GrPrevious } from "react-icons/gr";
import { ActivityListLayout } from './ActivityListLayout';

interface Post{
    post_id: string,
    title: string,
    comment_amount: number,
    like_amount: number,
    writer: string,
    date: string
}

export function MyRecordsLayout({title, posts}:{title:string, posts:Post[]}){

    return <div className="myRecord-layout">
        <div className="header">
            <Link to='/mypage/community'><GrPrevious /></Link>
        <div>{title}</div>
        </div>
        <div className='list'>
            {/* <ActivityListLayout /> */}
            {
                (!posts || posts.length === 0)? (
                     <>존재하는 게시글이 없습니다.</>
                ):(
                    posts.map((post) => 
                    <ActivityListLayout title={post.title} comments={post.comment_amount}
                    likes={post.like_amount} writer={post.writer}
                    date={post.date} />
                    )
                )
            }
        </div>
    </div>;
}