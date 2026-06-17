import './Tab3.css'
import { ActivityListLayout } from '../../layout/ActivityListLayout';
import { RxDotsHorizontal } from 'react-icons/rx';
import { Link } from 'react-router-dom';
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
        <div className='list-box'>
            <div className='label'>
                작성한 게시글 리스트
                <Link to='/mypage/community/myPosts'>
                    <RxDotsHorizontal />
                </Link>
            </div>
            <div className='rows'>
                {
                    writtenPosts.map((post) => 
                        <ActivityListLayout key={`post-${post.post_id}`}
                        title={post.title} comments={post.comment_count}
                        likes={post.like_count} writer={post.author_nickname}
                        date={post.created_at} />
                    )
                }
            </div>
        </div>
        <div className='list-box'>
            <div className='label'>
                작성한 댓글 리스트 
                <Link to='/mypage/community/myComments'>
                    <RxDotsHorizontal />
                </Link>
            </div>
            <div className='rows'>
                {
                    writtenComments.map((comment) => 
                        <ActivityListLayout key={`comment-${comment.post_id}`}
                        title={comment.post_title} 
                        writer={comment.post_author_nickname}
                        comments={comment.post_comment_count}
                        likes={comment.post_like_count} 
                        date={comment.post_created_at} />
                    )
                }
            </div>
        </div>
        <div className='list-box'>
            <div className='label'>
                좋아요한 게시글 리스트
                <Link to='/mypage/community/likes'>
                    <RxDotsHorizontal />
                </Link>
            </div>
            <div className='rows'>
                {
                    likedPosts.map((post) => 
                        <ActivityListLayout key={`liked-${post.post_id}`}
                        title={post.title} comments={post.comment_count}
                        likes={post.like_count} writer={post.author_nickname}
                        date={post.created_at} />
                    )
                }
            </div>
        </div>
    </div>;
}
