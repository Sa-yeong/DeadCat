import { Injectable } from '@nestjs/common';
import { FurnituresRepository } from './furnitures.repository';
import { FurnitureInventoryResponseDto } from './dto/furniture-response.dto';

@Injectable()
export class FurnituresService {
    constructor(private readonly furnituresRepository: FurnituresRepository) {}

    async getFurnitureInventory(
        userIdStr: string,
    ): Promise<FurnitureInventoryResponseDto[]> {
        const userId = BigInt(userIdStr);
        const storages =
            await this.furnituresRepository.findRemainingFurnitures(userId);

        return storages.map((storage) => ({
            item_code: `FURNITURE_${storage.furniture_id}`,
            furniture_name: storage.furnitures.name,
            remaining_count: storage.quantity,
            item_img_url: `https://assets.deadcat.com/furnitures/${storage.furniture_id}.png`,
        }));
    }
}
