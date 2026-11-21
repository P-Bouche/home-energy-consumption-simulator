import { Module } from '@nestjs/common';
import { EnumsController } from './enums.controller.ts';

/**
 * Enums module: exposes the single additive read-only endpoint
 * GET /enums/:kind (DPE enum id -> French label tables vendored in
 * @hes/open3cl-adapter). No providers: the tables are static data.
 */
@Module({
  controllers: [EnumsController]
})
export class EnumsModule {}
