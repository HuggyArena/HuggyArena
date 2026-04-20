import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.enableShutdownHooks();
  app.use(helmet());
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HuggyArena Analytics Agent')
    .setDescription(
      'Automated purchase intelligence, market signals, customer analytics, and revenue tracking for the HuggyArena prediction market platform.',
    )
    .setVersion('1.0.0')
    .addTag('signals', 'Market and purchase signal endpoints')
    .addTag('revenue', 'Protocol revenue and fee analytics')
    .addTag('customers', 'Customer behavior and segmentation')
    .addTag('alerts', 'Automated alert configuration')
    .addTag('health', 'Service health checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || 3003);
  await app.listen(port);

  const logger = new Logger('bootstrap');
  logger.log(`Analytics Agent API listening on port ${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  const logger = new Logger('bootstrap');
  logger.error('Failed to start Analytics Agent', error);
  process.exit(1);
});
