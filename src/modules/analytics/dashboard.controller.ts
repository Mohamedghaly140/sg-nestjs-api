import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../generated/prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardMetricsResponseDto } from './dto/dashboard-metrics-response.dto';

@ApiTags('admin/dashboard')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get dashboard aggregate metrics' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard aggregate metrics',
    type: DashboardMetricsResponseDto,
  })
  getMetrics(): Promise<DashboardMetricsResponseDto> {
    return this.dashboardService.getMetrics();
  }
}
