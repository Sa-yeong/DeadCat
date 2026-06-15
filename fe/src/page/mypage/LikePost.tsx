import { MyRecordsLayout } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
import axios from "axios";

interface Post{
    post_id: string,
    title: string,
    comment_amount: number,
    like_amount: number,
    writer: string,
    date: string
}

export function LikePost(){
    const [likedPosts, setLikedPosts] = useState<Post[]>([
        {
            post_id:'1',
            title:'제목1',
            comment_amount: 3,
            like_amount:10,
            writer:'익명',
            date: '2026.10.05'
        }
    ]);

    useEffect(() => {
        // const fetchLikePosts = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/users/me/likes',{
        //             headers:{Authorization: `Bearer ${token}`}
        //         });

        //         setLikedPosts(response.data);
        //         console.log('작성한 댓글 리스트 조회 성공');
        //     }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
        // }

        // fetchLikePosts();
    },[])

    return <>
        <MyRecordsLayout title="좋아요한 게시글" posts={likedPosts} />
    </>;
}