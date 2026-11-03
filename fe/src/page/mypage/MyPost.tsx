// import { MyRecordsLayout_P } from "../../layout/MyRecordsLayout";
import { ActivityPostLayout } from "../../layout/ActivityListLayout";
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
                    <ActivityPostLayout key={`post-${post.post_id}`}
                    type={post.source_type}
                    content={post.content} comments={post.comment_count}
                    likes={post.like_count} writer={post.author_nickname}
                    date={post.created_at} />
                )
            }
        </div>
    </div>
}

// export function MyPost(){
//      const [writtenPosts, setWrittenPosts] = useState<Post[]>([]);
    
//     useEffect(() => {
//         const fetchWrittenPosts = async () => {
//             try{
//                 const token = localStorage.getItem('token');
//                 const response = await api.get('/users/me/posts',{
//                     headers:{Authorization: `Bearer ${token}`}
//                 });

//                 setWrittenPosts(response.data.data);
//                 console.log('작성한 게시물 리스트 조회 성공');
//             }catch(e){console.error('작성한 게시물 리스트 조회 실패!', e);}
//         }

//         fetchWrittenPosts();
//     }, [])
//     return <>
//         <MyRecordsLayout_P title="작성한 게시글" posts={writtenPosts} />
//     </>;
// }