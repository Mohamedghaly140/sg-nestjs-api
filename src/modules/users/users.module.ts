import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCustomersController } from './admin-customers.controller';
import { AdminCustomersService } from './admin-customers.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { ResetPasswordMailService } from './services/reset-password-mail.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [
    UsersController,
    AdminCustomersController,
    AdminUsersController,
  ],
  providers: [
    UsersService,
    AdminCustomersService,
    AdminUsersService,
    ResetPasswordMailService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
