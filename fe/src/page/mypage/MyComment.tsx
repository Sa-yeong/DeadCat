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

export function MyComment(){
    const [writtenComments, setWrittenComments] = useState<Post[]>([
            // {
            //     post_id:'1',
            //     title:'제목1',
            //     comment_amount: 3,
            //     like_amount:10,
            //     writer:'익명',
            //     date: '2026.10.05'
            // }
    ]);

    useEffect(() => {
        // const fetchWrittenComments = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/users/me/comments',{
        //             headers:{Authorization: `Bearer ${token}`}
        //         });

        //         setWrittenComments(response.data);
        //         console.log('작성한 댓글 리스트 조회 성공');
        //     }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
        // }

        // fetchWrittenComments();
    }, [])

    return <>
        <MyRecordsLayout title="작성한 댓글" posts={writtenComments} />
    </>;
}