import './Tab3.css'
import { ActivityListLayout } from '../../layout/ActivityListLayout';
import { RxDotsHorizontal } from 'react-icons/rx';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
// import axios from 'axios';

interface Post{
    post_id: string,
    title: string,
    comment_amount: number,
    like_amount: number,
    writer: string,
    date: string
}

export function Tab3(){
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
    const [writtenComments, setWrittenComments] = useState<Post[]>([
        {
            post_id:'1',
            title:'제목1',
            comment_amount: 3,
            like_amount:10,
            writer:'익명',
            date: '2026.10.05'
        }
    ]);
    const [likedPosts, setLikedPosts] = useState<Post[]>([
        {
            post_id:'1',
            title:'제목1',
            comment_amount: 3,
            like_amount:10,
            writer:'익명',
            date: '2026.10.05'
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

        // const fetchLikePosts = async () => {
        //     try{
        //         const token = localStorage.getItem('token');
        //         const response = await axios.get('/users/me/likes',{
        //             headers:{Authorization: `Bearer ${token}`}
        //         });

        //         setLikedPosts(response.data);
        //         console.log('작성한 댓글 리스트 조회 성공');
        //     }catch(e){console.error('작성한 댓글 리스트 조회 실패: ', e);}
        // }

        // fetchWrittenPosts();
        // fetchWrittenComments();
        // fetchLikePosts();
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
                {/* <ActivityListLayout title='제목' comments='댓글 수' likes='좋아요 수' writer='작성자' date='작성날짜' /> */}
                {
                    writtenPosts.map((post) => 
                        <ActivityListLayout title={post.title} comments={post.comment_amount}
                        likes={post.like_amount} writer={post.writer}
                        date={post.date} />
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
                {/* <ActivityListLayout /> */}
                {
                    writtenComments.map((comment) => 
                        <ActivityListLayout title={comment.title} 
                        comments={comment.comment_amount}
                        likes={comment.like_amount} writer={comment.writer}
                        date={comment.date} />
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
                {/* <ActivityListLayout /> */}
                {
                    likedPosts.map((post) => 
                        <ActivityListLayout title={post.title} comments={post.comment_amount}
                        likes={post.like_amount} writer={post.writer}
                        date={post.date} />
                    )
                }
            </div>
        </div>
    </div>;
}
