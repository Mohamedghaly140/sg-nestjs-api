import { ApiProperty } from '@nestjs/swagger';
import { AdminUserResponseDto } from './admin-user-response.dto';
import { UserStatsDto } from './user-stats.dto';

export class AdminUserDetailResponseDto extends AdminUserResponseDto {
  @ApiProperty({ type: UserStatsDto })
  stats: UserStatsDto;
}
