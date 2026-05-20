import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Add security-related HTTP headers to all responses
  app.use(helmet());

  // Enable global validation pipe with transformation and whitelisting
  app.useGlobalPipes(
    new ValidationPipe({
      // Coerces incoming query/body values to the types declared in DTOs
      transform: true,
      // Strips properties not declared in a DTO, preventing unexpected fields from reaching controllers
      whitelist: true,
    }),
  );

  // Set up Swagger API documentation at /api
  const config = new DocumentBuilder()
    .setTitle('Pokémon Team Builder')
    .setDescription(
      'Fetches Pokémon data from PokéAPI, caches results in Redis, and computes aggregate team statistics.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

  // Listen on the port specified by the PORT environment variable, or default to 3000
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
