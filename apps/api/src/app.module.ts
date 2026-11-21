import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BuildingsModule } from './buildings/buildings.module.ts';
import { ImportsModule } from './imports/imports.module.ts';
import { ScenariosModule } from './scenarios/scenarios.module.ts';
import { SimulationsModule } from './simulations/simulations.module.ts';
import { HttpExceptionFilter } from './http/http-exception-filter.ts';
import { InfrastructureModule } from './infrastructure.module.ts';

/**
 * Root module. Hexagonal wiring: ports (application layer) are injected into
 * use cases; adapters implement the ports in the global InfrastructureModule;
 * controllers stay thin.
 */
@Module({
  imports: [InfrastructureModule, ImportsModule, BuildingsModule, SimulationsModule, ScenariosModule],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }]
})
export class AppModule {}
