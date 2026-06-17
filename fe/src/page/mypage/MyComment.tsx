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


export function MyComment(){
    const [writtenComments, setWrittenComments] = useState<Post[]>([]);

    useEffect(() => {
        const fetchWrittenComments = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/comments',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setWrittenComments(response.data.data);
                console.log('작성한 댓글 리스트 조회 성공');
            }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
        }

        fetchWrittenComments();
    }, [])

    return <>
        <MyRecordsLayout title="작성한 댓글" posts={writtenComments} />
    </>;
}