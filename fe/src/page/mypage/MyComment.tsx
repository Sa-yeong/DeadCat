import { WrittenCommentLayout } from "../../layout/ActivityListLayout";
import { useOutletContext } from "react-router-dom";

interface Comment{
    comment_id: string;
    content: string;
    created_at: string;
    post_id: string;
    source_type: string;
}

export function MyComments(){
    const {writtenComments} = useOutletContext<any>();

    return <div className='list-box'>
        <div className='rows'>
            {
                writtenComments.map((comment: Comment) => 
                    <WrittenCommentLayout key={`comment-${comment.comment_id}`}
                    type={comment.source_type}
                    content={comment.content}
                    date={comment.created_at} />
                )
            }
        </div>
    </div>;
}