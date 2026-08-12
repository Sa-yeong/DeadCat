import './WritePosts.css'
import { MyRecordsLayout } from "../../layout/MyRecordsLayout";
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';

interface WrittenPosts {
    post_id: string;
    content: string;
    author_nickname: string;
    comment_count: number;
    like_count: number;
    created_at: string;
    source_type: string;
}

export function WritePosts(){
    const [writtenPosts, setWrittenPosts] = useState<WrittenPosts[]>([]);

    useEffect(() => {
        const fetchWrittenPosts = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/posts', {
                    headers: {Authorization: `Bearer ${token}`}
                })

                setWrittenPosts(response.data.data);
                console.log('작성 글 조회 성공', response.data.data);
            }catch(e){console.error('작성 글 조회 실패', e);}
        }

        fetchWrittenPosts();
    }, [])

    return <div className='post-list'>
        {
            writtenPosts.map((writtenPost:WrittenPosts) => (
                <MyRecordsLayout type={writtenPost.source_type} content={writtenPost.content}
                like_count={writtenPost.like_count} comment_count={writtenPost.comment_count}
                date={writtenPost.created_at} />
            ))
        }
    </div>;
}