import { WrittenPostLayout } from "../../layout/ActivityListLayout";
import { useOutletContext } from "react-router-dom";

interface Post{
    post_id: string,
    content: string,
    comment_count: number,
    like_count: number,
    author_nickname: string,
    created_at: string;
    source_type: string
}

export function MyPosts(){
    const {writtenPosts} = useOutletContext<any>();

    return <div className='list-box'>
        <div className='rows'>
            {
                writtenPosts.map((post: Post) => 
                    <WrittenPostLayout key={`post-${post.post_id}`}
                    type={post.source_type}
                    content={post.content} comments={post.comment_count}
                    likes={post.like_count}date={post.created_at} />
                )
            }
        </div>
    </div>
}