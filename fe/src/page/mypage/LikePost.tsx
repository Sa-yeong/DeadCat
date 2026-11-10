import { LikedPostLayout } from "../../layout/ActivityListLayout";
import { useOutletContext } from "react-router-dom";

interface Post{
    post_id: string,
    content: string,
    comment_count: number,
    like_count: number,
    author_nickname: string,
    created_at: string;
    source_type:string;
}

export function LikePosts(){
    const {likedPosts} = useOutletContext<any>();

    return <div className='list-box'>
        <div className='rows'>
            {
                likedPosts.map((post: Post) => 
                    <LikedPostLayout key={`liked-${post.post_id}`}
                    type={post.source_type}
                    content={post.content} comments={post.comment_count}
                    likes={post.like_count} writer={post.author_nickname}
                    date={post.created_at} />
                )
            }
        </div>
    </div>;
}