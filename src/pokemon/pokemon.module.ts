import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PokemonController } from './pokemon.controller';
import { PokemonService } from './pokemon.service';

@Module({
  // Default timeout of 5 seconds for all outgoing HTTP requests to the PokéAPI
  imports: [HttpModule.register({ timeout: 5000 })],
  controllers: [PokemonController],
  providers: [PokemonService],
})
export class PokemonModule {}
