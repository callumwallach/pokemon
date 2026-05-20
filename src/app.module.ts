import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import KeyvRedis from '@keyv/redis';
import { PokemonModule } from './pokemon/pokemon.module';

@Module({
  imports: [
    // 60 requests per minute per IP — prevents single client from exhausting API rate limit
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        // Configure Redis from environment variables or defaults
        const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
        const ttl = parseInt(process.env.CACHE_TTL_MS ?? '3600000', 10);
        return {
          stores: [new KeyvRedis(redisUrl)],
          ttl,
        };
      },
    }),
    PokemonModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
