import { ApiProperty } from '@nestjs/swagger';

/** 上传 / 删除的分类标签 */
export const StorageCategory = {
  RECIPE: 'recipe', // 菜谱图
  ORDER_SERVED: 'order-served', // 上菜图
  RATING: 'rating', // 评价图
  AVATAR: 'avatar', // 头像
  TIMELINE: 'timeline', // 手动补记
  OTHER: 'other',
} as const;
export type StorageCategory = (typeof StorageCategory)[keyof typeof StorageCategory];

export class UploadResultDto {
  @ApiProperty({ description: '短期有效的签名读取 URL，不应持久化' })
  url!: string;

  @ApiProperty({ description: '对象存储中的 key（path），存数据库时建议存这个' })
  key!: string;

  @ApiProperty()
  size!: number;

  @ApiProperty()
  mimeType!: string;
}

export class StorageAccessUrlDto {
  @ApiProperty({ description: '短期有效的签名读取 URL' })
  url!: string;

  @ApiProperty({ description: '有效期（秒）' })
  expiresIn!: number;
}
