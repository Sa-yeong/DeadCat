import './Tab3.css'
import { ListTab } from '../../common/ListTab';
import { SearchBar } from '../../common/SearchBar';
import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../../api/axios';

interface Post{
    post_id: string,
    title: string,
    comment_count: number,
    like_count: number,
    author_nickname: string,
    created_at: string
}
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

export function Tab3(){
    const [writtenPosts, setWrittenPosts] = useState<Post[]>([]);
    const [writtenComments, setWrittenComments] = useState<Comment[]>([]);
    const [likedPosts, setLikedPosts] = useState<Post[]>([]);

    useEffect(() => {
        const fetchWrittenPosts = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/posts',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setWrittenPosts(response.data.data);
                console.log('작성한 게시물 리스트 조회 성공', response.data.data);
            }catch(e){console.error('작성한 게시물 리스트 조회 실패!', e);}
        }

        const fetchWrittenComments = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/comments',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setWrittenComments(response.data.data);
                console.log('작성한 댓글 리스트 조회 성공', response.data.data);
            }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
        }

        const fetchLikePosts = async () => {
            try{
                const token = localStorage.getItem('token');
                const response = await api.get('/users/me/liked-posts',{
                    headers:{Authorization: `Bearer ${token}`}
                });

                setLikedPosts(response.data.data);
                console.log('좋아요한 게시글 리스트 조회 성공');
            }catch(e){console.error('좋아요한 게시글 리스트 조회 실패: ', e);}
        }

        fetchWrittenPosts();
        fetchWrittenComments();
        fetchLikePosts();
    }, []);

    return <div className="tab3">
        <div className='header'>
            <ListTab list={[[<div>
                작성 글
                <span>{writtenPosts.length}</span>
            </div>, '/mypage/community/myPosts'],
            [<div>
                작성 댓글
                <span>{writtenComments.length}</span>
            </div>, '/mypage/community/myComments'], 
            [<div>
                좋아요 한 글
                <span>{likedPosts.length}</span>
            </div>, '/mypage/community/likes']]}/>
            <SearchBar placeholder='내 글에서 검색' />
        </div>
        <Outlet context={{writtenPosts, writtenComments, likedPosts}} />
    </div>;
}
