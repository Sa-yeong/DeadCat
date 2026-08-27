import './Community.css'
// import user_img from '../../assets/user1.png'
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/axios';
import { useParams } from 'react-router-dom';
import { LuSend } from 'react-icons/lu';
import { FaRegComment } from "react-icons/fa6";
import { IoHeartOutline, IoHeart } from 'react-icons/io5';
import { LoginModal } from '../../modal/LoginModal';

interface Writer{
    user_id: number;
    nickname: string;
    profile_img_url: string;
}
interface Post{
    post_id: number;
    writer: Writer;
    content: string;
    write_time: Date;
    like_count: number;
    comment_count: number;
    is_liked: boolean;
}
interface Comment {
    comment_id: number;
    content: string;
    write_time: string;
    writer: Writer;
}

export function Community(){
    const [posts, setPosts] = useState<Post[]>([]);
    const {stock_code} = useParams();

    useEffect(() => {
        const fetchPosts = async () => {
            try{
                const token = localStorage.getItem('token');
                let response;
                if(token){
                    response = await api.get(`/stocks/${stock_code}/posts`, {
                        headers: {Authorization: `Bearer ${token}`}
                    });
                }else{
                    response = await api.get(`/stocks/${stock_code}/posts`);
                }

                setPosts(response.data.data.posts);
                console.log('커뮤니티 게시글 리스트 조회 성공: ', response.data.data.posts);
            }catch(e){console.error('커뮤니티 게시글 리스트 조회 실패: ', e);}
            

        }
        
        fetchPosts();
    }, [stock_code])

    return <div className='community-container'>
        <button className='writing-button'>글쓰기</button>
        <div className='posts'>
            {
                posts.map((post) => 
                    <Post post={post} />
                )
            }
        </div>
    </div>;
}

function Post({post}){
    const [isCommentOpen, setIsCommentOpen] = useState<boolean>(false);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isLike, setIsLike] = useState<boolean>(post.is_liked);
    const [likeCount, setLikeCount] = useState<number>(post.like_count);
    const [commentCount, setCommentCount] = useState<number>(post.comment_count);
    const [comments, setComments] = useState<Comment[]>([]);

    const fetchComments = async (postId) => {
        try{
            const token = localStorage.getItem('token');
            let response;
            if(token){
                response = await api.get(`/posts/${postId}/comments`, {
                    headers:{Authorization: `Bearer ${token}`}
                });
            }else{
                response = await api.get(`/posts/${postId}/comments`);
            }

            setComments(response.data.data.comments);
            console.log('댓글 조회 성공 :', response.data.data);
        }catch(e){console.error('댓글 조회 실패 :', e);}
    }
    const toggleLike = async () => {
        const token = localStorage.getItem('token');

        if(token){ // 로그인 되어있을 경우
            try{
                const response = await api.post(`/posts/${post.post_id}/like`,{},{
                    headers: {Authorization: `Bearer ${token}`}
                });
                
                setIsLike(!isLike);
                setLikeCount(response.data.data.like_count);
                console.log('좋아요 등록/취소 성공: ', response.data.data);
            }catch(e){console.error('좋아요 등록/취소 실패: ', e);}
        }else{
            // 로그인 모달 창 열기
            setIsModalOpen(true);
        }
    }
    const postComment = async (content, postId, setContent) => {
        const token = localStorage.getItem('token');

        if(token){ // 로그인 되어있는 경우
            try{
                if(content != ""){
                    const response = await api.post(`/posts/${postId}/comments`,{content: content},{
                        headers: {Authorization: `Bearer ${token}`}
                    });

                    fetchComments(postId);
                    setContent("");
                    setCommentCount(response.data.data.comment_count);
                    console.log('댓글 전송 성공: ', response.data.data);
                }else{
                    // 적은 글이 없을 때
                    alert('내용을 작성하세요.');
                    return null;
                }
                
            }catch(e){console.error('댓글 전송 오류: ', e);}            
        }else{
            setIsModalOpen(true);
        }
    }

    return <>
        <div className='post'>
            <div className='post-header'>
                <img src={post.writer.profile_img_url} alt="사용자 프로필 이미지"/>
                <span className='name'>{post.writer.nickname}</span>
                <span>{formatDate(post.write_time)}</span>
            </div>
            <div className='content'>
                {post.content}
            </div>
            <div className='footer'>
                <div className='button'>
                    <button className={(isLike)?'active-button':''} onClick={toggleLike}>
                        {
                            (isLike)? <IoHeart /> : <IoHeartOutline />
                        }
                        {likeCount}
                    </button>
                    <button className={isCommentOpen?'active-comment':''}
                    onClick={() => {
                        if(isCommentOpen) {
                            setIsCommentOpen(false);
                        }else{
                            setIsCommentOpen(true);
                            fetchComments(post.post_id);
                        }
                    }}>
                        <FaRegComment />
                        {commentCount}
                    </button>
                </div>
                
                {isCommentOpen && (
                    <CommentList comments={comments} postId={post.post_id}
                    postComment={postComment} />
                )}
            </div>
        </div>
        <LoginModal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} current_page={window.location.pathname} />
    </>;
}

function CommentList({comments, postId, postComment}){
    const [content, setContent] = useState<string>("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    return <div className='comment-container'>
        {
            comments.map((comment) => (
                <Comment comment={comment} />
            ))
        }
        <div className='send'>
            <textarea placeholder=' 댓글 작성'
            ref={textareaRef}
            value={content} 
            onChange={(e) =>{ 
                setContent(e.target.value);
                if (textareaRef.current){
                    textareaRef.current.style.height  = 'auto';
                    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
                }
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey){
                    e.preventDefault(); // 기본 동작: 줄바꿈 -> 중단
                    postComment(content, postId, setContent);
                }
            }} />
            <button onClick={() => postComment(content, postId, setContent)}>
                <LuSend />
            </button>
        </div>
    </div>;
}

function Comment({comment}){
    return <div className='comment-box'>
        <div className='writer'>
            <span className='name'>{comment.writer.nickname}</span>
            <span><TimeAgo write_time={comment.write_time} /></span>
        </div>
        <div>
            {comment.content}
        </div>
    </div>;
}

// 댓글의 작성시간 포멧 및 실시간 반영
const formatDate = (write_time) => {
    const between_time = Date.now() - Date.parse(write_time);

    const ONE_MINUTE = 60 * 1000;
    const ONE_HOUR = 60 * ONE_MINUTE;
    const ONE_DAY = 24* ONE_HOUR;
    const ONE_MONTH = 30 * ONE_DAY;
    const ONE_YEAR = 12 * ONE_MONTH;

    if(between_time < ONE_MINUTE){
        return '방금 전';
    }else if(between_time < ONE_HOUR){
        return Math.floor(between_time / ONE_MINUTE) + '분 전';
    }else if(between_time < ONE_DAY){ //24시간 이하일 경우
        return Math.floor(between_time / ONE_HOUR) + '시간 전'
    }else if(between_time < ONE_MONTH){ // 1개월 이하인 경우
        return Math.floor(between_time / ONE_DAY) + '일 전';
    }else if(between_time < ONE_YEAR){
        return Math.floor(between_time / ONE_MONTH) + '개월 전';
    }else{
        return Math.floor(between_time / ONE_YEAR) + '년 전';
    }
}

function TimeAgo({write_time}){
    const [now, setNow] = useState<Date>(Date.now());

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 60000);

        return () => clearInterval(interval);
    }, []);

    return <span>
        {formatDate(write_time)}
    </span>;
}