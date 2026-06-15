import { Injectable } from '@nestjs/common';
import { PostRepository } from './post.repository';
import { MyPostItemDto } from './dto/my-posts-response.dto';

@Injectable()
export class PostService {
    constructor(private readonly postRepository: PostRepository) {}

    async getMyPosts(userId: string): Promise<MyPostItemDto[]> {
        const posts = await this.postRepository.findUserPosts(userId);

        return posts.map((post) => {
            return new MyPostItemDto({
                post_id: String(post.id),
                title: post.title,
            });
        });
    }
}
