import './LikePost.css'
import { LikedPostsLayout } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
import { api } from "../../api/axios";

interface Post{
    source_type: string;
    post_id: string;
    content: string;
    author_nickname: string;
    comment_count: number;
    like_count: number;
    created_at: string;
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
                console.log('좋아요한 게시물 리스트 조회 성공',response.data.data);
            }catch(e){console.error('좋아요한 게시물 리스트 조회 실패: ', e);}
        }

        fetchLikePosts();
    },[])

    return <div className="liked-post-list">
        {
            likedPosts.map((likedPost) => (
                <LikedPostsLayout type={likedPost.source_type} nickname={likedPost.author_nickname}
                content={likedPost.content} like_count={likedPost.like_count}
                comment_count={likedPost.comment_count} date={likedPost.created_at} />
            ))
        }
    </div>;
}