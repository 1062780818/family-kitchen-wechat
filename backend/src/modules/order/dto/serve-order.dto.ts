import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ServeOrderDto {
  @ApiProperty({
    description: '成品图片稳定资源 key 列表，至少一张',
    type: [String],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageUrls!: string[];
}
