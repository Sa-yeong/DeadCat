import './Community.css'
import user_img from '../../assets/user1.png'
import { useEffect, useState } from 'react';
import { api } from '../../api/axios';
import { useParams } from 'react-router-dom';

interface Post{
    post_id: number;
    writer_id: number;
    writer_nickname: string;
    writer_profile: string;
    content: string;
    write_date: Date;
    like_count: number;
    comment_count: number;
    is_liked: boolean;
}

export function Community(){
    const [posts, setPosts] = useState<Post[]>([]);
    const stock_code = useParams();

    useEffect(() => {
        const fetchPosts = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/feed`, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/feed`);
                }

                setPosts(response.data.data);
                console.log('커뮤니티 게시글 리스트 조회 성공: ', response.data.data);
            }catch(e){console.error('커뮤니티 게시글 리스트 조회 실패: ', e);}
            

        }
        
        fetchPosts();
    }, [])

    return <div className='community-container'>
        <button className='writing-button'>글쓰기</button>
        <div className='posts'>
            {
                posts.map((post) => (
                    <Post img={post.writer_profile} name={post.writer_nickname}
                    date={post.write_date} content={post.content}
                    is_liked={post.is_liked}
                    like_count={post.like_count} comment_count={post.comment_count} />
                ))
            }
        </div>
    </div>;
}

function Post({img, name, date, content, is_liked, like_count, comment_count}){
    return <div className='post'>
        <div className='post-header'>
            <img src={img} alt="사용자 프로필 이미지"/>
            <span className='name'>{name}</span>
            <span>{date}</span>
        </div>
        <div className='content'>
            {content}
        </div>
        <div className='footer'>
            <button>하트 {like_count}</button>
            <button>댓글 {comment_count}</button>
        </div>
    </div>;
}