import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiBadGatewayResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { PokemonService } from './pokemon.service';
import { TeamQueryDto } from './dto/team-query.dto';
import { TeamResponse } from './dto/team-response.dto';

@ApiTags('pokemon')
@Controller('pokemon')
export class PokemonController {
  constructor(private readonly pokemonService: PokemonService) {}

  /**
   * Builds a Pokémon team from a comma-separated list of names and returns
   * per-member data alongside aggregate team statistics.
   *
   * Parsing, trimming, lowercasing, and size validation are handled by
   * {@link TeamQueryDto} so this handler receives a clean `string[]`.
   *
   * @param query - Validated query params with the parsed `names` array.
   */
  @Get('team')
  @ApiOperation({
    summary: 'Build a Pokémon team',
    description:
      'Fetches data for each named Pokémon in parallel and returns per-member stats alongside aggregate team statistics. Results are cached in Redis',
  })
  @ApiOkResponse({ type: TeamResponse })
  @ApiBadRequestResponse({ description: 'Must supply between 1 and 6 names' })
  @ApiNotFoundResponse({ description: 'One or more Pokémon names not found' })
  @ApiBadGatewayResponse({ description: 'PokéAPI unavailable after retries' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit exceeded — retry after 60 s',
  })
  async getTeam(@Query() query: TeamQueryDto): Promise<TeamResponse> {
    return await this.pokemonService.buildTeam(query.names);
  }
}
