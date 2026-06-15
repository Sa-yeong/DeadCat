import { MyRecordsLayout } from "../../layout/MyRecordsLayout";
import { useState, useEffect } from "react";
// import axios from "axios";

interface Post{
    post_id: string,
    title: string,
    comment_amount: number,
    like_amount: number,
    writer: string,
    date: string
}

export function MyPost(){
     const [writtenPosts, setWrittenPosts] = useState<Post[]>([
            {
                post_id:'1',
                title:'제목1',
                comment_amount: 3,
                like_amount:10,
                writer:'익명',
                date: '2026.10.05'
            },
            {
                post_id:'4',
                title:'제목4',
                comment_amount: 10,
                like_amount:56,
                writer:'익명',
                date: '2021.10.05'
            }
    ]);
    
    useEffect(() => {
        // const fetchWrittenPosts = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/users/me/posts',{
        //             headers:{Authorization: `Bearer ${token}`}
        //         });

        //         setWrittenPosts(response.data);
        //         console.log('작성한 게시물 리스트 조회 성공');
        //     }catch(e){console.error('작성한 게시물 리스트 조회 실패!', e);}
        // }

        // fetchWrittenPosts();
    }, [])
    return <>
        <MyRecordsLayout title="작성한 게시글" posts={writtenPosts} />
    </>;
}