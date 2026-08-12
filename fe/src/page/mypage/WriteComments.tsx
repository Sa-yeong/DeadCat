import './WriteComments.css'
import { MyRecordsLayout } from '../../layout/MyRecordsLayout';
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';

interface WrittenComments {
    post_source_type: string;
    post_id: string;
    content: string;
    created_at: string;
}

export function WriteComments(){
    const [writtenComments, setWrittenComments] = useState<WrittenComments[]>([]);

    useEffect(() => {
        const fetchWrittenComments = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/comments', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setWrittenComments(response.data.data);
                console.log('작성한 댓글 목록 조회 성공: ', response.data.data);
            }catch(e){console.error('작성한 댓글 목록 조회 실패: ', e)}
        }

        fetchWrittenComments();
    },[])

    return <div className="comments-list">
        {
            writtenComments.map((writtenComment) => (
                <MyRecordsLayout type={writtenComment.post_source_type}
                content={writtenComment.content} date={writtenComment.created_at} />
            ))
        }
    </div>;
}