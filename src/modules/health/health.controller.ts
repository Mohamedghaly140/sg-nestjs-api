import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorStatus,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller({ path: 'health' })
@SkipThrottle()
@Public()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness/readiness check (DB ping)' })
  @ApiResponse({
    status: 200,
    description: 'Service healthy',
    type: HealthResponseDto,
  })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async check(): Promise<{
    app: 'up';
    database: HealthIndicatorStatus;
  }> {
    const result = await this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
    ]);

    return { app: 'up', database: result.details.database.status };
  }
}
