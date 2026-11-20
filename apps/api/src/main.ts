import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.ts';
import { CONFIG, type ApiConfig } from './config.ts';

/**
 * API entry point: NestJS app with CORS for the local Vite dev server,
 * global validation pipe, OpenAPI docs at /docs.
 *
 * Run with: npm run start -w apps/api   (uses tsx; see ADR-0002 build note)
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  const config = app.get<ApiConfig>(CONFIG);
  app.enableCors({ origin: config.corsOrigin, methods: ['GET', 'POST', 'OPTIONS'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Home Energy Consumption Simulator API')
    .setDescription(
      'P1: DPE XML import into the Building aggregate (PostgreSQL/PostGIS). P2: Open3CL energy simulation of a building (POST /buildings/:id/simulations), historized results, input-hash cache, queued jobs.'
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  await app.listen(config.port);
  new Logger('bootstrap').log(`API listening on http://localhost:${config.port} (OpenAPI at /docs)`);
}

void bootstrap();
