import { MyRecordsLayout } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
import { api } from "../../api/axios";

interface Post{
    post_id: string,
    title: string,
    author_nickname: string,
    comment_amount: number,
    like_count: number,
    created_at: string
}


export function LikePost(){
    const [likedPosts, setLikedPosts] = useState<Post[]>([]);

    useEffect(() => {
        const fetchLikePosts = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/liked-posts',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setLikedPosts(response.data.data);
                console.log('좋아요한 게시물 리스트 조회 성공');
            }catch(e){console.error('좋아요한 게시물 리스트 조회 실패: ', e);}
        }

        fetchLikePosts();
    },[])

    return <>
        <MyRecordsLayout title="좋아요한 게시글" posts={likedPosts} />
    </>;
}