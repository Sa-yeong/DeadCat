import { MyRecordsLayout_P } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
import { api } from "../../api/axios";

interface Post{
    post_id: string,
    title: string,
    author_nickname: string,
    comment_count: number,
    like_count: number,
    created_at: string
}

export function MyPost(){
     const [writtenPosts, setWrittenPosts] = useState<Post[]>([]);
    
    useEffect(() => {
        const fetchWrittenPosts = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/posts',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setWrittenPosts(response.data.data);
                console.log('작성한 게시물 리스트 조회 성공');
            }catch(e){console.error('작성한 게시물 리스트 조회 실패!', e);}
        }

        fetchWrittenPosts();
    }, [])
    return <>
        <MyRecordsLayout_P title="작성한 게시글" posts={writtenPosts} />
    </>;
}