import { MyRecordsLayout_C } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
import { api } from "../../api/axios";

interface Comment{
    comment_id: string;
    contnet: string;
    create_at: string;
    post_id: string;
    post_title: string;
    post_author_nickname: string;
    post_created_at: string;
    post_like_count: number;
    post_comment_count:number;
}


export function MyComment(){
    const [writtenComments, setWrittenComments] = useState<Comment[]>([]);

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
        <MyRecordsLayout_C title="작성한 댓글" comments={writtenComments} />
    </>;
}