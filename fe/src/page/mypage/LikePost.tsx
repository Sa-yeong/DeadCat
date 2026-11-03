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
    source_type:string;
}

export function LikePosts(){
    const {likedPosts} = useOutletContext<any>();

    return <div className='list-box'>
        <div className='rows'>
            {
                likedPosts.map((post: Post) => 
                    <ActivityPostLayout key={`liked-${post.post_id}`}
                    type={post.source_type}
                    content={post.content} comments={post.comment_count}
                    likes={post.like_count} writer={post.author_nickname}
                    date={post.created_at} />
                )
            }
        </div>
    </div>;
}

// export function LikePost(){
//     const [likedPosts, setLikedPosts] = useState<Post[]>([]);

//     useEffect(() => {
//         const fetchLikePosts = async () => {
//             try{
//                 const token = localStorage.getItem('token');
//                 const response = await api.get('/users/me/liked-posts',{
//                     headers:{Authorization: `Bearer ${token}`}
//                 });

//                 setLikedPosts(response.data.data);
//                 console.log('좋아요한 게시물 리스트 조회 성공');
//             }catch(e){console.error('좋아요한 게시물 리스트 조회 실패: ', e);}
//         }

//         fetchLikePosts();
//     },[])

//     return <>
//         <MyRecordsLayout_P title="좋아요한 게시글" posts={likedPosts} />
//     </>;
// }