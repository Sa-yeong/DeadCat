// import { MyRecordsLayout_C } from "../../layout/MyRecordsLayout";
import { ActivityCommentLayout } from "../../layout/ActivityListLayout";
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
                    <ActivityCommentLayout key={`comment-${comment.comment_id}`}
                    type={comment.source_type}
                    content={comment.content}
                    date={comment.created_at} />
                )
            }
        </div>
    </div>;
}

// export function MyComment(){
//     const [writtenComments, setWrittenComments] = useState<Comment[]>([]);

//     useEffect(() => {
//         const fetchWrittenComments = async () => {
//             try{
//                 const token = localStorage.getItem('token');
//                 const response = await api.get('/users/me/comments',{
//                     headers:{Authorization: `Bearer ${token}`}
//                 });

//                 setWrittenComments(response.data.data);
//                 console.log('작성한 댓글 리스트 조회 성공');
//             }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
//         }

//         fetchWrittenComments();
//     }, [])

//     return <>
//         <MyRecordsLayout_C title="작성한 댓글" comments={writtenComments} />
//     </>;
// }